/* Détection heuristique de texte généré par IA — fonctionne entièrement dans le navigateur. */
(function () {
  const D = (window.DIA = window.DIA || {});

  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
  const std = (a) => {
    const m = avg(a);
    return a.length ? Math.sqrt(avg(a.map((x) => (x - m) ** 2))) : 0;
  };
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  D.clamp = clamp;

  D.words = (t) => t.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || [];
  D.normKey = (s) => s.toLowerCase().replace(/’/g, "'");

  /* Construit une regex qui reconnaît une liste d'expressions (la plus longue d'abord). */
  D.phraseRegex = function (list) {
    const sorted = [...new Set(list)].sort((a, b) => b.length - a.length);
    const parts = sorted.map((p) => {
      let s = esc(p).replace(/'/g, "['’]");
      if (/[\p{L}\p{N}]$/u.test(p)) s += '(?![\\p{L}\\p{N}])';
      return s;
    });
    return new RegExp('(?<![\\p{L}\\p{N}])(?:' + parts.join('|') + ')', 'giu');
  };

  const cache = {};
  function compiled(lang) {
    if (cache[lang]) return cache[lang];
    const lex = D.LEX[lang];
    const weights = {};
    lex.weak.forEach((p) => (weights[D.normKey(p)] = 0.4));
    lex.strong.forEach((p) => (weights[D.normKey(p)] = 1));
    const allTrans = Object.values(lex.transitions).flat();
    const transCat = {};
    for (const [cat, list] of Object.entries(lex.transitions)) list.forEach((w) => (transCat[D.normKey(w)] = cat));
    const transBody = [...allTrans].sort((a, b) => b.length - a.length).map((p) => esc(p).replace(/'/g, "['’]")).join('|');
    cache[lang] = {
      lex,
      weights,
      markerRe: D.phraseRegex([...lex.strong, ...lex.weak]),
      transStartRe: new RegExp('^([«"“(\\s]*)(' + transBody + ')(?![\\p{L}])\\s*,?\\s*', 'iu'),
      transCat,
      stop: new Set(lex.stopwords)
    };
    return cache[lang];
  }
  D.compiled = compiled;

  D.detectLanguage = function (text) {
    const ws = D.words(text.toLowerCase());
    if (ws.length < 3) return null;
    let fr = 0, en = 0;
    const frS = compiled('fr').stop, enS = compiled('en').stop;
    for (const w of ws) {
      if (frS.has(w)) fr++;
      if (enS.has(w)) en++;
      if (/^(?:l|d|j|qu|n|s|c|m|t)['’]\p{L}/u.test(w)) fr++;
    }
    if (Math.max(fr, en) / ws.length < 0.18) return 'other';
    return fr >= en ? 'fr' : 'en';
  };

  const ABBR = /(?:(?:^|[^\p{L}])(?:M|Mme|Mlle|Dr|Pr|St|Mr|Mrs|Ms|Prof|etc|cf|ex|vs|e\.g|i\.e|p|Jr|Sr|av|apr|J\.-C|\p{Lu}))$/u;

  /* Découpe le texte en phrases en conservant leurs positions. */
  D.splitSentences = function (text) {
    const out = [];
    const n = text.length;
    let start = 0;
    const push = (s, e) => {
      while (s < e && /\s/.test(text[s])) s++;
      while (e > s && /\s/.test(text[e - 1])) e--;
      if (e > s) out.push({ start: s, end: e, text: text.slice(s, e) });
    };
    for (let i = 0; i < n; i++) {
      const c = text[i];
      if (c === '\n') { push(start, i); start = i + 1; continue; }
      if ('.!?…'.includes(c)) {
        let j = i + 1;
        while (j < n && '.!?…'.includes(text[j])) j++;
        while (j < n && '"\'»”’)]'.includes(text[j])) j++;
        if (/[ \u00a0\u202f]/.test(text[j] || '') && text[j + 1] === '»') j += 2;
        if (j >= n || /\s/.test(text[j])) {
          if (c === '.' && j === i + 1 && ABBR.test(text.slice(Math.max(start, i - 6), i))) continue;
          push(start, j);
          start = j;
          i = j - 1;
        }
      }
    }
    push(start, n);
    return out;
  };

  const countRe = (re, s) => {
    re.lastIndex = 0;
    const m = s.match(re);
    return m ? m.length : 0;
  };

  /* Analyse complète : score global, signaux, et score par phrase. */
  D.analyze = function (text) {
    const words = D.words(text);
    const W = words.length;
    if (!W) return null;
    const lang = D.detectLanguage(text) || 'other';
    const C = D.LEX[lang] ? compiled(lang) : null;

    const sents = D.splitSentences(text).filter((s) => D.words(s.text).length > 0);
    const lens = sents.map((s) => D.words(s.text).length);
    const multi = lens.filter((l) => l >= 3);
    const mean = avg(multi.length ? multi : lens);
    const cv = mean ? std(multi.length ? multi : lens) / mean : 0;

    let markerW = 0, transCount = 0, personal = 0, tripCount = 0, punct = 0;
    const markerHits = {};

    const info = sents.map((s, i) => {
      const it = { ...s, words: lens[i], markers: [], reasons: [], local: 0 };
      const t = s.text;
      let mw = 0;
      if (C) {
        C.markerRe.lastIndex = 0;
        let m;
        while ((m = C.markerRe.exec(t))) {
          const key = D.normKey(m[0]);
          const w = C.weights[key] ?? 0.5;
          mw += w;
          markerHits[key] = (markerHits[key] || 0) + 1;
          it.markers.push({ start: s.start + m.index, end: s.start + m.index + m[0].length, phrase: m[0], w });
        }
        markerW += mw;
        if (C.transStartRe.test(t)) { it.trans = true; transCount++; }
        it.personal = countRe(C.lex.personal, t);
        personal += it.personal;
        if (C.lex.triplet.test(t)) { it.triplet = true; tripCount++; }
      }
      const q = countRe(/[?!]/g, t);
      personal += q * 0.5;
      it.personal = (it.personal || 0) + q;
      const p = countRe(/—|\s–\s|:(?!\d)|\*\*|^#{1,6}\s/g, t);
      punct += p;
      it.punct = p;
      it.markerW = mw;
      return it;
    });

    const S = Math.max(1, sents.length);
    const per100 = (x) => (x / W) * 100;

    const feats = [];
    if (C) {
      feats.push({ key: 'markers', label: "Expressions typiques de l'IA", w: 0.3,
        v: clamp(per100(markerW) / 3),
        detail: Object.keys(markerHits).length
          ? Object.entries(markerHits).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k]) => `« ${k} »`).join(', ')
          : 'Aucune expression stéréotypée repérée.',
        desc: 'Formules toutes faites que les modèles de langage utilisent beaucoup.' });
    }
    feats.push({ key: 'burst', label: 'Uniformité des phrases', w: 0.24,
      v: sents.length >= 3 ? clamp((0.62 - cv) / 0.4) : 0.5,
      detail: `Longueur moyenne ${mean.toFixed(1)} mots · variation ${(cv * 100).toFixed(0)} %`,
      desc: 'Les humains alternent phrases courtes et longues ; les IA produisent des phrases de longueur régulière.' });
    if (C) {
      feats.push({ key: 'trans', label: 'Connecteurs logiques en début de phrase', w: 0.16,
        v: clamp(transCount / S / 0.3),
        detail: `${transCount} phrase(s) sur ${sents.length}`,
        desc: '« De plus », « Cependant », « En conclusion »… enchaînés mécaniquement.' });
      feats.push({ key: 'personal', label: 'Absence de voix personnelle', w: 0.12,
        v: clamp(1 - per100(personal) / 2),
        detail: `${Math.round(personal)} marque(s) personnelle(s) (je, questions, exclamations…)`,
        desc: 'Un texte humain contient souvent des opinions, du « je », des questions.' });
      feats.push({ key: 'triplet', label: 'Énumérations en trois éléments', w: 0.06,
        v: clamp(tripCount / S / 0.35),
        detail: `${tripCount} énumération(s)`,
        desc: '« X, Y et Z » : une structure très fréquente chez les IA.' });
    }
    feats.push({ key: 'punct', label: 'Ponctuation & mise en forme', w: 0.09,
      v: clamp(punct / S / 0.35),
      detail: `${punct} tiret(s) long(s), deux-points ou balises Markdown`,
      desc: 'Tirets cadratins, deux-points et gras Markdown sont typiques des réponses de chatbot.' });

    const wsum = feats.reduce((s, f) => s + f.w, 0);
    const raw = feats.reduce((s, f) => s + f.v * f.w, 0) / wsum;
    const score = Math.round(100 / (1 + Math.exp(-(raw - 0.45) * 8)));

    // Score par phrase
    for (const it of info) {
      let local = 0;
      if (it.markers.length) {
        local += Math.min(0.55, it.markerW * 0.3);
        it.reasons.push('Expressions typiques : ' + [...new Set(it.markers.map((m) => `« ${m.phrase} »`))].join(', '));
      }
      if (it.trans) { local += 0.2; it.reasons.push('Commence par un connecteur logique mécanique'); }
      if (it.triplet) { local += 0.12; it.reasons.push('Énumération en trois éléments'); }
      if (it.punct) { local += 0.1; it.reasons.push('Tiret long, deux-points ou mise en forme Markdown'); }
      if (sents.length >= 3 && cv < 0.45 && it.words >= 12 && Math.abs(it.words - mean) / mean < 0.25) {
        local += 0.12;
        it.reasons.push('Longueur de phrase très « standard »');
      }
      if (it.personal) { local -= 0.25; it.reasons.push('✓ Ton personnel (je, question, exclamation…)'); }
      it.score = it.words < 4 ? 0 : clamp(raw * 0.5 + local);
      it.level = it.score >= 0.6 ? 'high' : it.score >= 0.4 ? 'mid' : 'low';
    }

    let verdict, tone;
    if (score >= 65) { verdict = 'Probablement généré par IA'; tone = 'high'; }
    else if (score >= 35) { verdict = 'Mixte ou incertain'; tone = 'mid'; }
    else { verdict = 'Probablement écrit par un humain'; tone = 'low'; }

    const confidence = W < 50 ? 'faible (texte court)' : W < 150 ? 'moyenne' : 'bonne';

    return {
      lang, words: W, chars: text.length, sentences: info, score, raw, verdict, tone, confidence,
      signals: feats.map((f) => ({ ...f, pct: Math.round(f.v * 100) }))
    };
  };
})();
