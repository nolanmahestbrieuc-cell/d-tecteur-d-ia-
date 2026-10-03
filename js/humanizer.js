/* Humanisation par règles : réécritures lexicales, connecteurs, rythme des phrases, ton. */
(function () {
  const D = (window.DIA = window.DIA || {});

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const STRENGTH = {
    light: { rep: 0.6, trans: 0.45, split: 0.3, merge: 0.2, mergeMax: 9, trip: 0.3, voice: 0, rhythm: 0 },
    medium: { rep: 0.9, trans: 0.8, split: 0.7, merge: 0.5, mergeMax: 12, trip: 0.7, voice: 1, rhythm: 0.2 },
    strong: { rep: 1, trans: 0.95, split: 0.9, merge: 0.7, mergeMax: 15, trip: 1, voice: 2, rhythm: 0.35 }
  };

  const repCache = {};
  function repRegex(lang) {
    if (!repCache[lang]) repCache[lang] = D.phraseRegex(Object.keys(D.LEX[lang].replacements));
    return repCache[lang];
  }

  const isUpper = (c) => c && c !== c.toLowerCase() && c === c.toUpperCase();

  function capitalizeFirst(s) {
    const i = s.search(/\p{L}/u);
    if (i < 0) return s;
    return s.slice(0, i) + s[i].toUpperCase() + s.slice(i + 1);
  }

  const NO_VOICE = new Set(['mais', 'et', 'donc', 'pourtant', 'notons', 'puis', 'sans', 'ainsi', 'bref', 'perso',
    'franchement', 'honnêtement', 'but', 'and', 'so', 'still', 'yet', 'plus', 'also', 'note', 'all', 'honestly']);
  const lowerSets = {};
  function lowerFirstWord(s, lex) {
    const m = s.match(/^([\p{L}'’]+)/u);
    if (!m) return null;
    const set = (lowerSets[lex.name] ||= new Set([...lex.mergeable, ...lex.stopwords, ...lex.starters]));
    const w = D.normKey(m[1]);
    if (/^[\p{L}'’]+,/u.test(s) || /^\p{Lu}{2,}/u.test(m[1]) || (!set.has(w) && !/^(?:l|d|qu|c|s|n)'/.test(w))) return null;
    return s[0].toLowerCase() + s.slice(1);
  }

  function cleanup(s) {
    return s
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/ +([,.])/g, '$1')
      .replace(/,\s*,/g, ',')
      .replace(/,\s*\./g, '.')
      .replace(/^[\s,;:]+/, '')
      .trim();
  }

  function fixArticlesEN(s) {
    return s.replace(/(?<![\p{L}])([Aa])(n?) ([\p{L}][\p{L}-]*)/gu, (all, a, n, w) => {
      const lw = w.toLowerCase();
      if (isUpper(w[1] || '') && isUpper(w[0])) return all; // sigle
      if (/^(?:one|once|eu|ewe|uni|use|usu|uti|u[rt])/.test(lw)) return all;
      const vowel = /^[aeio]/.test(lw) || /^(?:hour|honest|honou?r|heir)/.test(lw);
      const consonant = /^[bcdfgjklmnpqrstvwxyz]/.test(lw) && !/^(?:hour|honest|honou?r|heir)/.test(lw);
      if (vowel && !n) return `${a}n ${w}`;
      if (consonant && n) return `${a} ${w}`;
      return all;
    });
  }

  function fixElisionFR(s) {
    return s
      .replace(/(?<![\p{L}])([dDlLjJnNsSmMtT])e ([aeiouyéèêëàâîïôûAEIOUYÉÈÊÀÂÎÔ])/gu, "$1'$2")
      .replace(/(?<![\p{L}])([qQ])ue ([aeiouyéèêàâîôûAEIOUYÉÈÊÀÂÎÔ])/gu, "$1u'$2")
      .replace(/(?<![\p{L}])([lL])a ([aeiouyéèêàâîôû])/gu, "$1'$2")
      .replace(/(?<![\p{L}])([dD])['’](?=[bcdfgjklmnpqrstvwxzç])/gu, '$1e ')
      .replace(/(?<![\p{L}])([qQ])u['’](?=[bcdfgjklmnpqrstvwxzç])/gu, '$1ue ');
  }

  function stripMarkdown(t) {
    return t
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/__(.+?)__/g, '$1')
      .replace(/^#{1,6}\s+/gm, '');
  }

  D.humanize = function (text, opts = {}) {
    const tone = opts.tone || 'neutral';
    const P = STRENGTH[opts.strength || 'medium'];
    const rand = rng(opts.seed || 1);
    const pick = (arr) => arr[Math.floor(rand() * arr.length)];
    const lang = opts.lang || D.detectLanguage(text) || 'other';
    const lex = D.LEX[lang];
    const C = lex ? D.compiled(lang) : null;
    let lastTrans = null;

    function processSentence(s) {
      let changed = false;

      // 1. Connecteurs mécaniques en début de phrase
      if (C) {
        const m = s.match(C.transStartRe);
        if (m && m[0].includes(',') && rand() < P.trans) {
          const cat = C.transCat[D.normKey(m[2])];
          const alts = (lex.transitionAlts[cat] || {})[tone] || [''];
          let alt = pick(alts);
          if (alt && alt === lastTrans && alts.length > 1) alt = alts.find((a) => a !== lastTrans);
          lastTrans = alt;
          let rest = s.slice(m[0].length);
          if (alt) rest = rest.replace(/^\p{Lu}(?=\p{Ll})/u, (c) => c.toLowerCase());
          s = m[1] + alt + rest;
          changed = true;
        }
      }

      // 2. Réécriture des expressions stéréotypées
      if (lex) {
        s = s.replace(repRegex(lang), (match) => {
          if (rand() > P.rep) return match;
          const entry = lex.replacements[D.normKey(match)];
          if (!entry) return match;
          let alt = pick((tone === 'casual' && entry.c) || entry.d);
          if (alt && isUpper(match[0])) alt = alt[0].toUpperCase() + alt.slice(1);
          changed = true;
          return alt;
        });
      }

      // 2b. Casser les énumérations en trois éléments
      if (lex && rand() < P.trip) {
        const re = new RegExp('^(.+?), ([^,;:!?]{1,40}?),? ' + lex.and + ' ([^,;:!?]+)$', 'u');
        const m = s.match(re);
        const wc = (x) => D.words(x).length;
        if (m && wc(m[1]) >= 3 && wc(m[2]) <= 5 && wc(m[3]) <= 8) {
          s = `${m[1]} ${lex.and} ${m[2]}${lex.tripletTail[tone]}${m[3]}`;
          changed = true;
        }
      }

      // 3. Tirets longs → virgules
      s = s.replace(/\s*—\s*(?=\S)/g, (m, off) => (off === 0 ? m : ', ')).replace(/(?<=\S) – (?=\S)/g, ', ');

      // 4. Ton
      if (lang === 'en') {
        const c = lex.contractions;
        let list = [];
        if (tone === 'casual') list = [...c.neg, ...c.other, ...c.casual];
        else if (tone === 'neutral') list = [...c.neg, ...c.other];
        else if (tone === 'pro') list = rand() < 0.5 ? c.neg : [];
        for (const [from, to] of list) {
          const re = new RegExp('(?<![\\p{L}])' + from + (from.endsWith('is') || from.endsWith('are') || from.endsWith('am') || from.endsWith('will') || from.endsWith('have') ? '(?= \\p{L})' : '(?![\\p{L}])'), 'giu');
          s = s.replace(re, (m) => (isUpper(m[0]) ? to[0].toUpperCase() + to.slice(1) : to));
        }
      } else if (lang === 'fr' && tone === 'casual') {
        for (const [re, to] of lex.casualSubs) s = s.replace(re, to);
      }

      s = cleanup(s);
      if (changed) s = lang === 'en' ? fixArticlesEN(s) : lang === 'fr' ? fixElisionFR(s) : s;
      return capitalizeFirst(s);
    }

    function splitLong(sents) {
      const out = [];
      for (const s of sents) {
        const wc = D.words(s).length;
        if (!lex || wc < 18 || rand() > P.split) { out.push(s); continue; }
        let best = null;
        for (const sp of lex.splitters) {
          const re = new RegExp(sp.re.source, 'g');
          let m;
          while ((m = re.exec(s))) {
            const left = D.words(s.slice(0, m.index)).length;
            const right = wc - left;
            if (left < 6 || right < 6) continue;
            const dist = Math.abs(left - wc / 2);
            if (!best || dist < best.dist) best = { m, sp, dist };
          }
        }
        if (!best) { out.push(s); continue; }
        const { m, sp } = best;
        const left = s.slice(0, m.index).replace(/[\s,;]+$/, '') + '.';
        let rest = s.slice(m.index + m[0].length);
        let lead = '';
        if (sp.kind === 'but' || sp.kind === 'so') lead = sp.word + ' ';
        else if (sp.kind === 'and') lead = tone === 'casual' ? sp.word + ' ' : '';
        else if (sp.kind === 'which') lead = (tone === 'casual' && sp.casual ? sp.casual : sp.word) + ' ';
        rest = capitalizeFirst(lead + rest);
        out.push(left, rest);
      }
      return out;
    }

    function mergeShort(sents) {
      if (!lex) return sents;
      const out = [];
      for (let i = 0; i < sents.length; i++) {
        const a = sents[i], b = sents[i + 1];
        if (b && /[^.]\.$/.test(a) && D.words(a).length <= P.mergeMax && D.words(b).length <= P.mergeMax && rand() < P.merge) {
          const lb = lowerFirstWord(b, lex);
          if (lb) {
            const join = /^(?:mais|et|donc|pourtant|but|and|so|yet|still|plus|also)(?![\p{L}])/u.test(lb) ? ', ' : lex.mergeJoin[tone];
            out.push(a.slice(0, -1) + join + lb);
            i++;
            continue;
          }
        }
        out.push(a);
      }
      return out;
    }

    // Ajoute une touche de voix personnelle (« Je pense que… ») à une phrase
    let voiceLeft = P.voice;
    function addVoice(sents) {
      const opts = lex && lex.opinions[tone];
      if (!opts || !opts.length || voiceLeft <= 0 || rand() < 0.35) return sents;
      const idx = sents.map((s, i) => i).filter((i) => D.words(sents[i]).length >= 6 && !/[?!]$/.test(sents[i]));
      if (!idx.length) return sents;
      const i = idx[Math.floor(rand() * idx.length)];
      // Pas de connecteur ni de formule d'ouverture avant l'opinion ajoutée
      const first = D.normKey((sents[i].match(/^[\p{L}'’]+/u) || [''])[0]);
      if (!/^[^,;:]{25,}/u.test(sents[i]) || NO_VOICE.has(first)) return sents;
      const lowered = lowerFirstWord(sents[i], lex);
      if (!lowered) return sents;
      let out = pick(opts) + lowered;
      out = lang === 'fr' ? fixElisionFR(out) : out;
      voiceLeft--;
      return sents.map((s, k) => (k === i ? out : s));
    }

    function processParagraph(p) {
      const lead = p.match(/^\s*(?:[-*•]\s+|\d+[.)]\s+)?/)[0];
      const body = p.slice(lead.length);
      const trail = body.match(/\s*$/)[0];
      const sents = D.splitSentences(body).map((s) => processSentence(s.text)).filter(Boolean);
      return { lead, trail, sents: mergeShort(splitLong(sents)) };
    }

    // Rythme : fusionne les phrases voisines qui augmentent le plus le contraste court / long
    function rhythm(paras) {
      if (!lex || !P.rhythm) return;
      const cv = () => {
        const l = paras.flatMap((p) => (p.sents || []).map((s) => D.words(s).length));
        const m = l.reduce((a, b) => a + b, 0) / l.length;
        return Math.sqrt(l.reduce((a, b) => a + (b - m) ** 2, 0) / l.length) / m;
      };
      const total = paras.reduce((n, p) => n + (p.sents ? p.sents.length : 0), 0);
      for (let left = Math.floor(total * P.rhythm); left > 0; left--) {
        const base = cv();
        let best = null;
        for (const p of paras) {
          if (!p.sents) continue;
          for (let i = 0; i + 1 < p.sents.length; i++) {
            const a = p.sents[i];
            if (!/[^.]\.$/.test(a) || D.words(a).length + D.words(p.sents[i + 1]).length > 40) continue;
            const lb = lowerFirstWord(p.sents[i + 1], lex);
            if (!lb) continue;
            const join = /^(?:mais|et|donc|pourtant|but|and|so|yet|still|plus|also)(?![\p{L}])/u.test(lb) ? ', ' : lex.mergeJoin[tone];
            const merged = a.slice(0, -1) + join + lb;
            const saved = p.sents;
            p.sents = [...saved.slice(0, i), merged, ...saved.slice(i + 2)];
            const gain = cv() - base + rand() * 0.02;
            p.sents = saved;
            if (gain > 0 && (!best || gain > best.gain)) best = { p, i, merged, gain };
          }
        }
        if (!best) break;
        best.p.sents.splice(best.i, 2, best.merged);
      }
    }

    const paras = stripMarkdown(text)
      .split(/(\n+)/)
      .map((p) => (/^\n*$/.test(p) || !p.trim() ? { raw: p } : processParagraph(p)));
    rhythm(paras);
    return paras
      .map((p) => (p.raw !== undefined ? p.raw : p.lead + addVoice(p.sents).join(' ') + p.trail))
      .join('');
  };

  /* Génère plusieurs variantes et garde celle qui paraît la plus humaine. */
  D.humanizeBest = function (text, opts = {}, tries = 24) {
    let best = null;
    for (let k = 0; k < tries; k++) {
      const out = D.humanize(text, { ...opts, seed: (opts.seed || 1) + k * 104729 });
      const r = D.analyze(out);
      const score = r ? r.score : 0;
      if (!best || score < best.score) best = { text: out, score, analysis: r };
    }
    return best;
  };
})();
