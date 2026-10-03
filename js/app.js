(function () {
  const D = window.DIA;
  const $ = (id) => document.getElementById(id);
  const ed = $('editor'), backdrop = $('backdrop'), tip = $('tip');
  const GAUGE_LEN = 2 * Math.PI * 52;
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* stockage indisponible */ } }
  };

  let result = null;
  let seed = 1;
  let lastBefore = '';

  const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const plural = (n, w) => `${n.toLocaleString('fr-FR')} ${w}${n > 1 ? 's' : ''}`;

  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => t.classList.remove('show'), 2200);
  }

  function autosize() {
    ed.style.height = 'auto';
    ed.style.height = Math.max(ed.scrollHeight, 360) + 'px';
  }

  /* Surlignage : copie du texte en arrière-plan, avec les phrases suspectes encadrées. */
  function renderHighlights() {
    const text = ed.value;
    if (!result) { backdrop.innerHTML = escapeHtml(text) + ' '; return; }
    let html = '', pos = 0;
    result.sentences.forEach((s, i) => {
      html += escapeHtml(text.slice(pos, s.start));
      let inner = '', p = s.start;
      for (const m of s.markers) {
        if (m.start < p) continue;
        inner += escapeHtml(text.slice(p, m.start)) + `<span class="mk">${escapeHtml(text.slice(m.start, m.end))}</span>`;
        p = m.end;
      }
      inner += escapeHtml(text.slice(p, s.end));
      html += s.level === 'low' ? `<span class="s" data-i="${i}">${inner}</span>` : `<span class="s ${s.level}" data-i="${i}">${inner}</span>`;
      pos = s.end;
    });
    html += escapeHtml(text.slice(pos)) + ' ';
    backdrop.innerHTML = html;
  }

  function setGauge(score, tone) {
    const bar = $('gauge-bar');
    bar.style.strokeDasharray = GAUGE_LEN;
    bar.style.strokeDashoffset = score == null ? GAUGE_LEN : GAUGE_LEN * (1 - score / 100);
    bar.dataset.tone = tone || '';
    $('score').textContent = score == null ? '–' : score;
  }

  function renderPanel() {
    const sig = $('signals'), flags = $('flags');
    const badge = $('lang-badge');
    if (!result) {
      setGauge(null);
      $('verdict').textContent = 'En attente de texte';
      $('confidence').textContent = "Collez un texte d'au moins quelques phrases pour lancer l'analyse.";
      sig.innerHTML = '<li class="empty">Aucun signal pour l\'instant.</li>';
      flags.innerHTML = '<li class="empty">Les phrases suspectes apparaîtront ici.</li>';
      $('flag-count').textContent = '';
      badge.hidden = true;
      $('btn-humanize').disabled = true;
      $('stats').textContent = '0 mot';
      return;
    }
    const r = result;
    setGauge(r.score, r.tone);
    $('verdict').textContent = r.verdict;
    $('verdict').dataset.tone = r.tone;
    $('confidence').textContent = `Fiabilité de l'estimation : ${r.confidence}.`;

    badge.hidden = false;
    badge.textContent = r.lang === 'fr' ? '🇫🇷 Français' : r.lang === 'en' ? '🇬🇧 Anglais' : '🌐 Langue non prise en charge';
    badge.title = r.lang === 'other' ? 'Analyse partielle : seuls les signaux de style indépendants de la langue sont utilisés.' : 'Langue détectée automatiquement';

    sig.innerHTML = '';
    for (const s of r.signals) {
      const li = document.createElement('li');
      const tone = s.pct >= 60 ? 'high' : s.pct >= 35 ? 'mid' : 'low';
      li.innerHTML = `<div class="sig-top"><span class="sig-name"></span><span class="sig-val" data-tone="${tone}">${s.pct}</span></div>
        <div class="meter"><span data-tone="${tone}" style="width:${s.pct}%"></span></div>
        <div class="sig-detail"></div>`;
      li.querySelector('.sig-name').textContent = s.label;
      li.querySelector('.sig-detail').textContent = s.detail;
      li.title = s.desc;
      sig.appendChild(li);
    }

    const flagged = r.sentences.map((s, i) => ({ ...s, i })).filter((s) => s.level !== 'low').sort((a, b) => b.score - a.score);
    $('flag-count').textContent = flagged.length ? flagged.length : '';
    flags.innerHTML = '';
    if (!flagged.length) flags.innerHTML = '<li class="empty">Aucune phrase particulièrement suspecte. 👍</li>';
    for (const s of flagged.slice(0, 8)) {
      const li = document.createElement('li');
      li.className = 'flag ' + s.level;
      li.tabIndex = 0;
      li.innerHTML = `<div class="flag-text"></div><div class="flag-why"></div>`;
      li.querySelector('.flag-text').textContent = s.text.length > 140 ? s.text.slice(0, 140) + '…' : s.text;
      li.querySelector('.flag-why').textContent = s.reasons.filter((x) => !x.startsWith('✓'))[0] || '';
      const go = () => focusSentence(s.i);
      li.addEventListener('click', go);
      li.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
      flags.appendChild(li);
    }

    $('btn-humanize').disabled = r.words < 3;
    const sentences = r.sentences.length;
    const minutes = Math.max(1, Math.round(r.words / 230));
    $('stats').textContent = `${plural(r.words, 'mot')} · ${plural(r.chars, 'caractère')} · ${plural(sentences, 'phrase')} · ${minutes} min de lecture`;
  }

  function focusSentence(i) {
    const s = result && result.sentences[i];
    if (!s) return;
    ed.focus({ preventScroll: true });
    ed.setSelectionRange(s.start, s.end);
    const span = backdrop.querySelector(`.s[data-i="${i}"]`);
    if (span) {
      const top = span.getBoundingClientRect().top + window.scrollY - 120;
      window.scrollTo({ top, behavior: 'smooth' });
      span.classList.remove('flash');
      void span.offsetWidth;
      span.classList.add('flash');
    }
  }

  function analyze() {
    const text = ed.value;
    result = text.trim() ? D.analyze(text) : null;
    renderHighlights();
    renderPanel();
    store.set('dia-text', text);
  }

  let timer;
  ed.addEventListener('input', () => {
    autosize();
    renderHighlights();
    clearTimeout(timer);
    timer = setTimeout(analyze, 300);
  });
  window.addEventListener('resize', autosize);

  /* Infobulle au survol des phrases surlignées (le surlignage est sous la zone de saisie). */
  let raf = 0;
  ed.addEventListener('mousemove', (e) => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const el = document.elementsFromPoint(e.clientX, e.clientY).find((n) => n.classList && n.classList.contains('s'));
      const s = el && result && result.sentences[+el.dataset.i];
      if (!s || s.level === 'low') { tip.hidden = true; return; }
      tip.innerHTML = '';
      const h = document.createElement('strong');
      h.textContent = s.level === 'high' ? `Très probablement IA · ${Math.round(s.score * 100)} %` : `Suspect · ${Math.round(s.score * 100)} %`;
      h.dataset.tone = s.level;
      tip.appendChild(h);
      const ul = document.createElement('ul');
      for (const r of s.reasons) {
        const li = document.createElement('li');
        li.textContent = r;
        if (r.startsWith('✓')) li.className = 'ok';
        ul.appendChild(li);
      }
      tip.appendChild(ul);
      tip.hidden = false;
      const x = Math.min(e.clientX + 14, window.innerWidth - tip.offsetWidth - 12);
      const y = e.clientY + 18 + tip.offsetHeight > window.innerHeight ? e.clientY - tip.offsetHeight - 12 : e.clientY + 18;
      tip.style.left = Math.max(12, x) + 'px';
      tip.style.top = y + 'px';
    });
  });
  ed.addEventListener('mouseleave', () => (tip.hidden = true));
  window.addEventListener('scroll', () => (tip.hidden = true), { passive: true });

  /* Choix du ton / de l'intensité */
  function radioGroup(id, key) {
    const g = $(id);
    const saved = store.get(key);
    g.querySelectorAll('button').forEach((b) => {
      if (saved) b.setAttribute('aria-checked', String(b.dataset.v === saved));
      else if (!b.hasAttribute('aria-checked')) b.setAttribute('aria-checked', 'false');
      b.addEventListener('click', () => {
        g.querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
        store.set(key, b.dataset.v);
      });
    });
    return () => g.querySelector('[aria-checked="true"]').dataset.v;
  }
  const getTone = radioGroup('tone', 'dia-tone');
  const getStrength = radioGroup('strength', 'dia-strength');

  /* Humanisation + vue comparative */
  function renderCompare(before, after) {
    const ops = D.diff(before, after);
    const b = $('before'), a = $('after');
    if (!ops) { b.textContent = before; a.textContent = after; return; }
    let hb = '', ha = '';
    for (const [op, t] of ops) {
      const e = escapeHtml(t);
      if (op === '=') { hb += e; ha += e; }
      else if (op === '-') hb += /^\s+$/.test(t) ? e : `<del>${e}</del>`;
      else ha += /^\s+$/.test(t) ? e : `<ins>${e}</ins>`;
    }
    b.innerHTML = hb;
    a.innerHTML = ha;
  }

  function scorePill(el, score) {
    el.textContent = `${score} % IA`;
    el.dataset.tone = score >= 65 ? 'high' : score >= 35 ? 'mid' : 'low';
  }

  function humanize() {
    if (!result) return;
    lastBefore = ed.value;
    const best = D.humanizeBest(lastBefore, { tone: getTone(), strength: getStrength(), seed, lang: result.lang });
    const out = best.text;
    scorePill($('before-score'), result.score);
    scorePill($('after-score'), best.score);
    renderCompare(lastBefore, out);
    const modal = $('modal');
    if (modal.hidden) {
      modal.hidden = false;
      document.body.classList.add('no-scroll');
      $('btn-close').focus();
    }
  }

  function closeModal() {
    $('modal').hidden = true;
    document.body.classList.remove('no-scroll');
  }

  $('btn-humanize').addEventListener('click', () => { seed = (Date.now() % 100000) + 1; humanize(); });
  $('btn-regen').addEventListener('click', () => { seed += 7919; humanize(); });
  $('after').addEventListener('input', () => {
    const r = D.analyze($('after').innerText);
    if (r) scorePill($('after-score'), r.score);
  });
  $('btn-close').addEventListener('click', closeModal);
  $('modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('modal').hidden) closeModal(); });

  $('btn-copy').addEventListener('click', async () => {
    const text = $('after').innerText;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const t = document.createElement('textarea');
      t.value = text;
      document.body.appendChild(t);
      t.select();
      document.execCommand('copy');
      t.remove();
    }
    toast('Texte copié dans le presse-papiers');
  });

  $('btn-apply').addEventListener('click', () => {
    const text = $('after').innerText.replace(/\n$/, '');
    closeModal();
    ed.focus();
    ed.select();
    // insertText conserve l'historique d'annulation du navigateur
    if (!document.execCommand('insertText', false, text) || ed.value !== text) ed.value = text;
    autosize();
    analyze();
    toast("Texte remplacé — vous pouvez l'annuler avec Ctrl+Z");
  });

  /* Barre du haut */
  $('samples').addEventListener('change', (e) => {
    const v = e.target.value;
    if (!v) return;
    ed.value = D.SAMPLES[v];
    e.target.value = '';
    autosize();
    analyze();
  });
  $('btn-clear').addEventListener('click', () => {
    ed.value = '';
    autosize();
    analyze();
    ed.focus();
  });

  const title = $('doc-title');
  title.value = store.get('dia-title') || title.value;
  title.addEventListener('input', () => store.set('dia-title', title.value));

  ed.value = store.get('dia-text') || '';
  autosize();
  analyze();
})();
