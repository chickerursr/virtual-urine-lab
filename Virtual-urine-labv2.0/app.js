/* Virtual Urine Lab — user interface. All results come from engine.js */
(function () {
  'use strict';
  const E = window.UrineEngine;
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const later = (instant, fn, ms) => instant ? fn() : setTimeout(fn, ms);

  /* ------------------------------------------------------------ state */
  const KEY = 'virtual-urine-lab-exp10-v2';
  // Room temperature is fixed at 29 °C for this practical; the urinometer is calibrated at 15 °C.
  const ENV = { troom: 29, tcal: 15 };
  const state = { caseId: 'case1', tab: 'case', env: Object.assign({}, ENV), rec: {}, student: { name: '', roll: '' } };
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s) Object.assign(state, s, { tab: s.tab || 'case' }); } catch (e) { /* storage unavailable */ }
  state.env = Object.assign({}, ENV);
  state.student = state.student || { name: '', roll: '' };
  if (!['case1', 'case2'].includes(state.caseId)) state.caseId = 'case1';
  if (!['case', 'physical', 'chemical', 'dipstick', 'report'].includes(state.tab)) state.tab = 'case';
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ } }

  const recOf = id => state.rec[id] || (state.rec[id] = { physical: {}, select: {}, chem: {}, bench: {}, dip: {}, meta: {} });
  const R = () => recOf(state.caseId);
  const C = () => E.CASES[state.caseId];
  const A = () => E.analyse(C().sample, state.env);

  const TABS = [
    ['case', '1 · Case & specimen'], ['physical', '2 · Physical exam'], ['chemical', '3 · Chemical tests'],
    ['dipstick', '4 · Dipstick'], ['report', '5 · Report']
  ];
  const TEST_ORDER = ['heat', 'ssa', 'benedict', 'rothera', 'hay', 'fouchet', 'benzidine'];

  function isDone(tab) {
    const r = R();
    if (tab === 'case') return !!r.collection;
    if (tab === 'physical') return !!r.physical.checked;
    if (tab === 'chemical') return TEST_ORDER.every(k => r.chem[k]);
    if (tab === 'dipstick') return !!r.dip.checked;
    return false;
  }

  /* ------------------------------------------------------------ shell */
  function render() {
    const cp = $('#casepick');
    const opts = [['case1', E.CASES.case1.short], ['case2', E.CASES.case2.short]];
    cp.innerHTML = opts.map(([id, l]) => `<button class="${state.caseId === id ? 'on' : ''}" data-case="${id}">${esc(l)}</button>`).join('') +
      `<button class="ghost" id="replayIntro" title="Read and listen to the instructions again">📋 Instructions</button>` +
      `<button class="ghost" id="voiceToggle" title="Spoken instructions for every step" aria-pressed="${voice.on}">${voice.on ? '🔊 Voice guide: on' : '🔇 Voice guide: off'}</button>` +
      `<button class="ghost" id="voiceRepeat" title="Repeat the last spoken instruction">↻ Repeat</button>`;
    $$('button[data-case]', cp).forEach(b => b.onclick = () => { stopDip(); state.caseId = b.dataset.case; save(); render(); });
    $('#replayIntro').onclick = showIntro;
    $('#voiceToggle').onclick = () => { voice.on = !voice.on; state.voiceOn = voice.on; save(); if (!voice.on) voice.stop(); else narrateTab(); render(); };
    $('#voiceRepeat').onclick = () => voice.repeat();

    $('#tabs').innerHTML = TABS.map(([id, l]) =>
      `<button class="${state.tab === id ? 'on' : ''}" data-tab="${id}">${l}${['case', 'physical', 'chemical', 'dipstick'].includes(id) ? `<span class="dot ${isDone(id) ? 'done' : ''}"></span>` : ''}</button>`).join('');
    $$('#tabs button').forEach(b => b.onclick = () => { stopDip(); state.tab = b.dataset.tab; save(); render(); window.scrollTo(0, 0); });

    const m = $('#main');
    ({ case: viewCase, physical: viewPhysical, chemical: viewChemical, dipstick: viewDipstick, report: viewReport })[state.tab](m);

    // speak the instructions for a step whenever the student arrives at a new tab or case
    const key = state.caseId + '|' + state.tab;
    if (narratedKey !== null && key !== narratedKey) narrateTab();
    if (narratedKey !== null) narratedKey = key;
  }

  /* ------------------------------------------------------------ voice guide (browser speech) */
  // Turns screen text into something a speech engine reads naturally.
  const SPOKEN = [[/°C/g, ' degrees Celsius'], [/≥/g, 'at least '], [/~/g, 'about '], [/→/g, ', then '], [/2\/3rd/g, 'two thirds'], [/¾/g, 'three quarters'],
    [/H₂O₂/g, 'hydrogen peroxide'], [/Cu²⁺/g, 'copper ions'], [/Cu₂O/g, 'cuprous oxide'], [/\bmL\b/g, 'millilitres'], [/mN\/m/g, 'millinewtons per metre'],
    [/\bSG\b/g, 'specific gravity'], [/\bCase I\b/g, 'Case one'], [/\bCase II\b/g, 'Case two'], [/\bpH\b/g, 'P H'], [/(\d)\s*[–-]\s*(\d)/g, '$1 to $2'], [/\bUPPER\b/g, 'upper'], [/\bBP\b/g, 'blood pressure'], [/mmHg/g, 'millimetres of mercury'], [/(\d+)\/(\d+)/g, '$1 over $2'], [/[·•]/g, ', '], [/[“”"]/g, ''], [/\s+/g, ' ']];
  const voice = {
    on: state.voiceOn !== false, last: '', voices: [],
    pick() {
      const vs = this.voices.length ? this.voices : (window.speechSynthesis ? speechSynthesis.getVoices() : []);
      return vs.find(x => /en[-_]IN/i.test(x.lang)) || vs.find(x => /en[-_]GB/i.test(x.lang)) || vs.find(x => /^en/i.test(x.lang)) || null;
    },
    // queue = true adds to what is being spoken; otherwise the new instruction replaces it.
    say(text, queue, force, onend) {
      const ss = window.speechSynthesis;
      if (!ss || !text || (!this.on && !force)) return false;
      if (!queue) { ss.cancel(); this.last = ''; }
      this.last = (this.last ? this.last + ' ' : '') + text;
      let spoken = String(text); SPOKEN.forEach(([re, to]) => { spoken = spoken.replace(re, to); });
      // short utterances: some browsers stop long ones after about 15 seconds
      const parts = spoken.split(/(?<=[.!?])\s+/), v = this.pick();
      parts.forEach((t, i) => {
        if (!t.trim()) return;
        const u = new SpeechSynthesisUtterance(t.trim());
        if (v) u.voice = v; u.lang = v ? v.lang : 'en-IN'; u.rate = 0.95;
        if (i === parts.length - 1 && onend) u.onend = onend;
        ss.speak(u);
      });
      return true;
    },
    stop() { if (window.speechSynthesis) speechSynthesis.cancel(); },
    repeat() { const t = this.last; if (t) this.say(t, false, true); }
  };
  if (window.speechSynthesis) {
    voice.voices = speechSynthesis.getVoices();
    speechSynthesis.onvoiceschanged = () => { voice.voices = speechSynthesis.getVoices(); };
  }
  let narratedKey = null;   // null until the student closes the instruction screen

  /* Spoken instruction for each tab (the first step of that stage). */
  function narrateTab(queue) {
    const c = C(), r = R(), label = CASE_LABEL[state.caseId];
    const t = {
      case: () => `${label}. Read the case report. ${c.vignette} ${c.investigations.join(', ')}. ` +
        (r.collection ? 'You have chosen the specimen. Click Proceed to physical examination.' : 'Step 1. Choose the urine specimen collection method you would use for this patient, and click Check choice.'),
      physical: () => `Physical examination of ${label}. ` + physNext(r.physical),
      chemical: () => `Chemical examination of ${label}. First, for each abnormal constituent, select the test you will perform, and click Check selection. ` +
        `Then perform the tests on the bench one step at a time, clicking each step in order. ` + chemNext(r),
      dipstick: () => `Dipstick test for ${label}. Click the three steps of the Multistix procedure in order. The timer starts when you hold the strip horizontally. ` +
        'Wait 40 seconds, then read each pad within 2 minutes by clicking the matching colour block on the chart. Then click Record and check readings.',
      report: () => `Report for ${label}. Enter your name and roll number. Write your interpretation of the case in the Interpretation box. ` +
        (state.caseId === 'case1' ? 'Then click Proceed to Case II, and analyse the second case in the same way.' : 'Then click Save report as PDF. The PDF contains both cases, your roll number and your marks.')
    }[state.tab];
    if (t) voice.say(t(), queue);
  }

  // next thing to do on the physical examination page
  function physNext(p) {
    const c = C();
    if (blank(p.volume)) return `The 24 hour urine output is ${c.sample.volume24h} millilitres. Select the volume.`;
    if (blank(p.colour)) return 'Look at the urine in the beaker against a white background, and select its colour.';
    if (blank(p.appearance)) return 'Now select the appearance of the urine.';
    if (!p.wafted) return 'Click Waft the vapour gently towards the nose, to note the odour.';
    if (blank(p.odour)) return 'Select the odour.';
    if (!p.dipped) return 'Now the pH. Click the blinking button: Dip pH paper in urine and compare.';
    if (blank(p.pH)) return 'Compare the colour of the pH paper with the colour chart, and select the pH read.';
    if (blank(p.reaction)) return 'Select the reaction: acidic, neutral or alkaline.';
    if (blank(p.sgObs)) return 'Now the specific gravity. Read the urinometer where the lower meniscus cuts the scale, and enter the observed specific gravity.';
    if (blank(p.sgTd)) return `Room temperature is ${state.env.troom} °C and the urinometer is calibrated at ${state.env.tcal} °C. Enter the temperature difference.`;
    if (blank(p.sgCor)) return 'Enter the corrected specific gravity: the observed value plus 0.001 times the temperature difference, divided by 3.';
    if (!p.checked) return 'Click Record and check physical findings.';
    return 'The physical examination is complete. Click Proceed for chemical examination.';
  }
  // next test to perform on the chemical examination page
  function chemNext(r) {
    const k = TEST_ORDER.find(x => !r.chem[x]);
    if (!k) return 'All the chemical tests are recorded. Click Proceed to dipstick analysis.';
    const step = r.bench[k] || 0, def = BENCH[k];
    return step >= def.steps.length ? `Select the observation and inference for the ${E.TESTS[k].name}, and click Record in notebook.`
      : `Next, the ${E.TESTS[k].name}. Click step ${step + 1}: ${def.steps[step][0]}.`;
  }

  /* ------------------------------------------------------------ instructions before the lab (read aloud) */
  const INTRO = [
    'Perform analysis of abnormal urine.',
    'There are two different case scenarios available in the lab.',
    'Read Case I and perform its urine analysis, then go for Case II.',
    'First perform the physical examination, then proceed for the chemical examination, followed by the dipstick test.',
    'At the end of the experiment, based on the results, interpret the given cases and submit the report.'
  ];
  function closeIntro() {
    const ov = $('#intro'); if (ov) ov.parentNode.removeChild(ov);
    document.removeEventListener('pointerdown', introKick, true); document.removeEventListener('keydown', introKick, true);
  }
  let introStarted = false;
  function introKick(e) {
    // Browsers allow speech only after a user action: start the voice on the first click or key press.
    if (e && e.target && (e.target.id === 'introVoice' || e.target.id === 'introStart')) return;
    startVoice();
    document.removeEventListener('pointerdown', introKick, true); document.removeEventListener('keydown', introKick, true);
  }
  function startVoice() {
    const b = $('#introVoice');
    introStarted = voice.say('Instructions. ' + INTRO.join(' '), false, true, () => { introStarted = false; const bb = $('#introVoice'); if (bb) bb.textContent = '🔊 Play instructions again'; });
    if (b) b.textContent = introStarted ? '⏹ Stop voice' : '🔇 Voice not available in this browser';
  }
  function showIntro() {
    closeIntro();
    const ov = document.createElement('div'); ov.id = 'intro'; ov.className = 'overlay';
    ov.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="introH">
      <h2 id="introH">Instructions before the virtual lab begins</h2>
      <ul class="intro-list">${INTRO.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
      <div class="flex" style="margin-top:14px">
        <button class="ghost" id="introVoice">🔊 Listen to instructions</button>
        <button class="go" id="introStart">Start the lab with Case I →</button>
      </div>
      <label class="small flex" style="margin-top:12px;gap:6px"><input type="checkbox" id="introGuide" ${voice.on ? 'checked' : ''}> Voice guide: speak the instructions for every step of the lab</label>
      <p class="small muted" style="margin-bottom:0">The instructions are read aloud in the background. Use <b>📋 Instructions</b>, <b>Voice guide</b> and <b>↻ Repeat</b> at the top at any time. Use headphones in a shared lab.</p>
    </div>`;
    document.body.appendChild(ov);
    document.addEventListener('pointerdown', introKick, true); document.addEventListener('keydown', introKick, true);
    if (navigator.userActivation && navigator.userActivation.isActive) startVoice();
    $('#introVoice').onclick = () => {
      if (introStarted) { voice.stop(); introStarted = false; $('#introVoice').textContent = '🔊 Listen to instructions'; }
      else startVoice();
    };
    $('#introGuide').onchange = e => { voice.on = e.target.checked; state.voiceOn = voice.on; save(); };
    $('#introStart').onclick = () => {
      const wasSpeaking = introStarted;
      closeIntro();
      if (!R().collection) { state.caseId = 'case1'; state.tab = 'case'; save(); }
      narratedKey = state.caseId + '|' + state.tab;
      render();
      narrateTab(wasSpeaking);   // after the general instructions, if they are still being read
    };
  }

  /* ============================================================ 1. CASE */
  const COLLECT = [
    ['random', 'Random specimen'], ['firstmorning', 'First morning (8-hour) specimen'], ['midstream', 'Midstream clean-catch specimen'],
    ['timed', 'Timed (24-h) collection'], ['catheter', 'Catheter (Foley) specimen via syringe'], ['suprapubic', 'Supra-pubic aspiration'],
    ['paedbag', 'Paediatric adhesive collection bag']
  ];

  function viewCase(m) {
    const c = C(), r = R();
    m.innerHTML = `
    <div class="grid2">
      <section class="card">
        <span class="tag">${esc(c.title)}</span>
        <h2 style="margin-top:8px">${esc(c.patient.name)} · ${esc(c.patient.age)} · ${esc(c.patient.gender)}</h2>
        <p>${esc(c.vignette)}</p>
        <div class="chips">${c.investigations.map(i => `<span class="tag ${i === 'Urine examination' ? 'peach' : 'mint'}">${esc(i)}</span>`).join('')}</div>
        <ul class="small" style="margin-top:14px">
          <li>Select appropriate tests to perform the analysis of abnormal urine.</li>
          <li>Write the analysis report.</li>
        </ul>
        ${c.ancillary ? `<details style="margin-top:10px"><summary>Other investigations ordered (illustrative values, for discussion)</summary>
          <table style="margin-top:8px"><tr><th>Test</th><th>Result</th><th>Reference</th></tr>
          ${c.ancillary.map(a => `<tr><td>${esc(a[0])}</td><td class="${a[3]}">${esc(a[1])} ${a[3] ? '(' + a[3] + ')' : ''}</td><td>${esc(a[2])}</td></tr>`).join('')}</table></details>` : ''}
      </section>
      <section class="card">
        <h2>Step 1 · Urine specimen collection</h2>
        <p class="small muted">Choose the collection method you would use for this patient.</p>
        <div id="coll">${COLLECT.map(([k, l]) => `<label class="flex small" style="margin:5px 0"><input type="radio" name="coll" value="${k}" ${r.collection === k ? 'checked' : ''}> ${esc(l)}</label>`).join('')}</div>
        <button id="collCheck" style="margin-top:8px">Check choice</button>
        <div id="collFb"></div>
        <div class="note" style="margin-top:14px"><b>Bench safety.</b> Treat all urine as potentially infectious: wear gloves and coat, and use a test-tube holder when heating. Point the tube mouth away from people. <b>Benzidine is a carcinogen</b>, so handle it only with gloves and in a fume hood, or use the substitute your department prescribes.</div>
      </section>
    </div>
    <section class="card">
      <h2>Objectives</h2>
      <ul class="small">
        <li>Perform urine analysis for the given case report.</li>
        <li>Describe the physical properties of urine (colour, odour, appearance, pH, specific gravity) in abnormal conditions.</li>
        <li>Detect abnormal constituents (protein, reducing substance, ketone bodies, blood, bile salts, bile pigments) by chemical tests.</li>
        <li>Describe the abnormal constituents of urine in different disease conditions.</li>
        <li>Observe dipstick analysis and interpret the result.</li>
      </ul>
      <div class="flex"><button class="go" id="goPhys">Proceed to physical examination →</button></div>
    </section>`;
    const fb = () => {
      const v = r.collection; if (!v) return;
      const ok = c.collection.correct.includes(v) || c.collection.correct.includes('*');
      $('#collFb').innerHTML = `<div class="fb ${ok ? 'ok' : 'bad'}"><b>${ok ? 'Appropriate.' : 'Not the best choice.'}</b> ${esc(c.collection.why)}</div>`;
    };
    $('#collCheck').onclick = () => {
      const v = $('input[name=coll]:checked'); if (!v) { voice.say('First select a collection method.'); return; }
      r.collection = v.value; save(); fb(); render();
      const ok = c.collection.correct.includes(v.value) || c.collection.correct.includes('*');
      voice.say((ok ? 'Appropriate. ' : 'Not the best choice. ') + c.collection.why + ' Now click Proceed to physical examination.');
    };
    fb();
    $('#goPhys').onclick = () => { state.tab = 'physical'; save(); render(); };
  }

  /* ============================================================ 2. PHYSICAL */
  const UI_COLOURS = { 4: '#e2513a', 5: '#ee8a2c', 6: '#f0c132', 7: '#7bb54a', 8: '#2f9c8a', 9: '#2f68b0' };
  function phColour(p) { const lo = Math.max(4, Math.min(8, Math.floor(p))); return E.mix(UI_COLOURS[lo], UI_COLOURS[lo + 1], p - lo); }
  const ODOUR_TEXT = ['A faint aromatic smell, as in normal fresh urine.', 'A sweet, fruity smell, like nail-polish remover or over-ripe apples.', 'A mousy (musty) smell.', 'A sweet smell of maple syrup or burnt sugar.'];
  const PH_OPTS = ['4.5', '5.0', '5.5', '6.0', '6.5', '7.0', '7.5', '8.0', '8.5'];

  function beakerSVG(a) {
    const p = a.physical; let dots = '';
    if (p.appearance === 2) for (let i = 0; i < 70; i++) dots += `<circle cx="${50 + Math.random() * 100}" cy="${95 + Math.random() * 95}" r="${0.8 + Math.random() * 1.2}" fill="#7a2a1c" opacity=".45"/>`;
    return `<svg viewBox="0 0 200 220" width="200" aria-label="urine sample in beaker">
      <defs><clipPath id="bk"><path d="M45 40 L45 190 Q45 200 55 200 L145 200 Q155 200 155 190 L155 40 Z"/></clipPath></defs>
      <g clip-path="url(#bk)"><rect x="40" y="88" width="120" height="120" fill="${p.liquid}"/>
      <rect x="40" y="88" width="120" height="120" fill="#f5f2ea" opacity="${p.turbidity}"/>${dots}
      <rect x="40" y="86" width="120" height="4" fill="#fff" opacity=".5"/></g>
      <path d="M40 36 L45 40 L45 190 Q45 200 55 200 L145 200 Q155 200 155 190 L155 40 L160 36" fill="none" stroke="#6b7385" stroke-width="3"/>
      ${[70, 100, 130, 160].map((y, i) => `<line x1="140" x2="155" y1="${y}" y2="${y}" stroke="#6b7385"/><text x="120" y="${y + 4}" font-size="9" fill="#4f5b6e">${(4 - i) * 25}</text>`).join('')}
      <text x="100" y="216" text-anchor="middle" font-size="11" fill="#4f5b6e">fresh specimen, viewed against white</text></svg>`;
  }

  function urinometerSVG(a) {
    const sg = a.physical.sg, obs = sg.observed, liq = a.physical.liquid;
    // Full stem scale, 1.000 (top) to 1.040 (bottom); the value INCREASES downward.
    const top = 26, step = 7.5, yv = v => top + Math.round((v - 1) * 1000) * step;
    const ym = yv(obs);
    let ticks = '';
    for (let i = 0; i <= 40; i++) {
      const v = 1 + i / 1000, y = top + i * step, major = i % 10 === 0, mid = i % 5 === 0;
      ticks += `<line x1="70" x2="${major ? 96 : mid ? 88 : 80}" y1="${y}" y2="${y}" stroke="#1d2433" stroke-width="${major ? 1.6 : 0.9}"/>`;
      if (major) ticks += `<line x1="58" x2="70" y1="${y}" y2="${y}" stroke="#1d2433" stroke-width="1.6"/><text x="100" y="${y + 4}" font-size="12" font-weight="700" fill="#1d2433">${v.toFixed(3)}</text>`;
    }
    const full = `<svg viewBox="0 0 190 376" width="180" aria-label="urinometer scale 1.000 to 1.040">
      <rect x="20" y="${ym}" width="150" height="${352 - ym}" fill="${liq}" opacity=".75"/>
      <path d="M20 ${ym} Q62 ${ym} 66 ${ym - 6} M136 ${ym - 6} Q140 ${ym} 170 ${ym}" stroke="#6b7385" fill="none"/>
      <path d="M18 6 L18 354 L172 354 L172 6" fill="none" stroke="#6b7385" stroke-width="2.5"/>
      <rect x="66" y="8" width="70" height="346" fill="#f7f8fc" opacity=".9" stroke="#6b7385"/>
      <line x1="62" x2="62" y1="${top}" y2="${top + 40 * step}" stroke="#1d2433" stroke-width="1.6"/>
      ${ticks}
      <rect x="66" y="${ym}" width="70" height="${354 - ym}" fill="${liq}" opacity=".22"/>
      <path d="M176 ${ym} l10 -5 v10 z" fill="#c0392b"/>
      <text x="95" y="370" text-anchor="middle" font-size="11" fill="#4f5b6e">read at the lower meniscus</text></svg>`;
    // magnified view around the meniscus
    const px = 22, cy = 140; let zt = '';
    for (let i = -6; i <= 6; i++) {
      const v = Math.round((obs + i * 0.001) * 1000) / 1000, y = cy + i * px;
      const major = Math.round(v * 1000) % 5 === 0;
      zt += `<line x1="70" x2="${major ? 112 : 96}" y1="${y}" y2="${y}" stroke="#1d2433" stroke-width="${major ? 1.6 : 1}"/>`;
      if (major) zt += `<text x="118" y="${y + 4}" font-size="13" font-weight="700" fill="#1d2433">${v.toFixed(3)}</text>`;
    }
    const zm = `<svg viewBox="0 0 230 280" width="200" aria-label="magnified urinometer stem at the meniscus">
      <defs><clipPath id="zc"><rect x="6" y="6" width="218" height="268" rx="12"/></clipPath></defs>
      <g clip-path="url(#zc)">
        <rect x="0" y="0" width="230" height="280" fill="#fbfaff"/>
        <path d="M0 ${cy} L60 ${cy} Q66 ${cy} 68 ${cy - 9} L68 ${cy - 9} L176 ${cy - 9} Q178 ${cy} 184 ${cy} L230 ${cy} L230 280 L0 280 Z" fill="${liq}" opacity=".85"/>
        <rect x="68" y="0" width="108" height="280" fill="#f4f6fb" opacity=".88" stroke="#6b7385"/>
        ${zt}
        <rect x="68" y="${cy}" width="108" height="${280 - cy}" fill="${liq}" opacity=".25"/>
        <text x="73" y="22" font-size="11" fill="#5b3f96" font-weight="700">magnified · calibrated ${state.env.tcal} °C</text>
      </g>
      <rect x="6" y="6" width="218" height="268" rx="12" fill="none" stroke="#5b3f96" stroke-width="2"/></svg>`;
    return `<div class="tube-wrap">${full}<div class="small muted">Urinometer reading</div></div><div class="tube-wrap">${zm}<div class="small muted">Magnifier at the meniscus</div></div>`;
  }

  function urinometerDiagram() {
    return `<svg viewBox="0 0 260 300" width="240" aria-label="labelled diagram of urinometer">
      <rect x="112" y="10" width="16" height="150" rx="6" fill="#fff" stroke="#1d2433"/>
      ${Array.from({ length: 13 }, (_, i) => `<line x1="112" x2="${i % 5 === 0 ? 124 : 119}" y1="${22 + i * 10}" y2="${22 + i * 10}" stroke="#1d2433"/>`).join('')}
      <ellipse cx="120" cy="200" rx="30" ry="45" fill="#fff" stroke="#1d2433"/>
      <path d="M104 238 Q120 285 136 238" fill="#cfd3da" stroke="#1d2433"/><circle cx="120" cy="262" r="9" fill="#555"/>
      <g font-size="11" fill="#1d2433">
        <line x1="128" y1="22" x2="170" y2="22" stroke="#5b3f96"/><text x="173" y="25">1.000 (top)</text>
        <line x1="128" y1="142" x2="170" y2="142" stroke="#5b3f96"/><text x="173" y="145">1.040 (bottom)</text>
        <line x1="112" y1="80" x2="60" y2="80" stroke="#5b3f96"/><text x="4" y="76">graduated</text><text x="4" y="89">stem</text>
        <line x1="90" y1="200" x2="40" y2="200" stroke="#5b3f96"/><text x="4" y="196">air-filled</text><text x="4" y="209">bulb</text>
        <line x1="111" y1="262" x2="50" y2="262" stroke="#5b3f96"/><text x="4" y="258">weighted</text><text x="4" y="271">base (lead shot)</text>
        <text x="150" y="190">calibration</text><text x="150" y="203">temp. marked</text><text x="150" y="216">on stem (e.g. 15 °C)</text>
      </g></svg>`;
  }

  function viewPhysical(m) {
    const c = C(), a = A(), r = R(), p = r.physical, ph = a.physical;
    const sel = (id, opts, v) => `<select id="${id}"><option value="">— select —</option>${opts.map((o, i) => `<option value="${i}" ${String(v) === String(i) ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
    m.innerHTML = `
    <div class="grid2">
      <section class="card">
        <h2>Volume, colour, appearance, odour</h2>
        <div class="flex" style="align-items:flex-start">
          <div>${beakerSVG(a)}</div>
          <div style="flex:1;min-width:220px">
            <div class="note"><b>24-h urine output</b> (${state.caseId === 'case2' ? 'history from attendant / catheter bag' : 'ward intake–output chart'}): <b>${c.sample.volume24h} mL</b></div>
            <label class="f">Volume</label>${sel('pVol', E.VOLUME_OPTS, p.volume)}
            <label class="f">Colour</label>${sel('pCol', E.COLOUR_OPTS, p.colour)}
            <label class="f">Appearance</label>${sel('pApp', E.APPEAR_OPTS, p.appearance)}
            <label class="f">Odour</label>
            <div class="flex"><button class="ghost" id="waft">Waft the vapour gently towards the nose</button></div>
            <div id="odourTxt" class="small muted" style="margin:6px 0">${p.wafted ? esc(ODOUR_TEXT[ph.odour]) : ''}</div>
            ${sel('pOd', E.ODOUR_OPTS, p.odour)}
          </div>
        </div>
      </section>
      <section class="card">
        <h2>pH (universal indicator paper)</h2>
        <div class="flex" style="align-items:flex-start">
          <svg viewBox="0 0 70 220" width="60" aria-label="pH paper"><rect x="20" y="10" width="26" height="200" rx="3" fill="#f3efe0" stroke="#9aa1ad"/>
            <rect id="phPad" x="20" y="150" width="26" height="60" rx="3" fill="${p.dipped ? phColour(a.sample.pH) : '#f1e6b8'}" style="transition:fill 1.5s"/></svg>
          <div style="flex:1;min-width:220px">
            <button id="dipPh" class="ghost ${p.dipped ? '' : 'blink'}">Dip pH paper in urine and compare</button>
            <div class="small muted" style="margin:8px 0 4px">Colour chart on the booklet:</div>
            <div class="swatches">${[4, 5, 6, 7, 8, 9].map(v => `<div class="sw"><i style="background:${UI_COLOURS[v]}"></i><span>pH ${v}</span></div>`).join('')}</div>
            <label class="f">pH read</label>${sel('pPh', PH_OPTS, p.pH)}
            <label class="f">Reaction</label>${sel('pReac', E.REACTION_OPTS, p.reaction)}
          </div>
        </div>
      </section>
    </div>
    <section class="card">
      <h2>Specific gravity: urinometer with temperature correction</h2>
      <div class="sggrid">
        <div>
          <div class="note small">Fill the cylinder ¾ with urine. Remove froth with filter paper. Float the urinometer with a gentle spin so it does not touch the sides. Read the scale at the <b>lower meniscus</b>, at eye level.</div>
          <div class="kv small" style="grid-template-columns:auto 1fr;margin-top:10px">
            <div><b>Room temperature</b></div><div>${state.env.troom} °C (thermometer)</div>
            <div><b>Calibration temperature</b></div><div>${state.env.tcal} °C (marked on the stem)</div>
          </div>
          <div class="small muted" style="margin-top:6px">The urinometer scale runs from 1.000 at the top to 1.040 at the bottom. Read the observed value where the lower meniscus cuts the scale.</div>
        </div>
        <div class="flex" style="justify-content:center;align-items:flex-start">${urinometerSVG(a)}</div>
        <div>
          <label class="f">Observed specific gravity</label><input type="text" id="sgObs" value="${esc(p.sgObs || '')}" placeholder="e.g. 1.0xx" style="width:130px">
          <label class="f">Temperature difference (°C)</label><input type="text" id="sgTd" value="${esc(p.sgTd || '')}" style="width:130px">
          <label class="f">Corrected specific gravity</label><input type="text" id="sgCor" value="${esc(p.sgCor || '')}" style="width:130px">
          <div class="small muted" style="margin-top:6px">Corrected SG = Observed SG + (0.001 × Temp. diff ÷ 3)</div>
        </div>
      </div>
      <details style="margin-top:10px"><summary>Diagram of urinometer</summary><div class="flex" style="justify-content:center">${urinometerDiagram()}</div></details>
    </section>
    <section class="card">
      <div class="flex"><button id="recPhys">Record & check physical findings</button><span class="small muted">You can change answers and re-check.</span></div>
      <div id="physFb"></div>
    </section>
    <section class="card"><div class="flex"><button class="go" id="goChem">Proceed for chemical examination →</button>
      ${p.checked ? '' : '<span class="small muted">Record and check your physical findings first.</span>'}</div></section>`;

    const next = () => voice.say(physNext(p));
    const bind = (id, key) => { $('#' + id).onchange = e => { p[key] = e.target.value; save(); next(); }; };
    bind('pVol', 'volume'); bind('pCol', 'colour'); bind('pApp', 'appearance'); bind('pOd', 'odour'); bind('pPh', 'pH'); bind('pReac', 'reaction');
    ['sgObs', 'sgTd', 'sgCor'].forEach(id => { const el = $('#' + id); el.oninput = e => { p[id] = e.target.value; save(); }; el.onchange = next; });
    $('#waft').onclick = () => { p.wafted = true; save(); $('#odourTxt').textContent = ODOUR_TEXT[ph.odour]; voice.say(ODOUR_TEXT[ph.odour] + ' ' + physNext(p)); };
    $('#dipPh').onclick = () => { p.dipped = true; save(); $('#dipPh').classList.remove('blink'); $('#phPad').setAttribute('fill', phColour(a.sample.pH)); voice.say('The pH paper changes colour. ' + physNext(p)); };
    $('#recPhys').onclick = () => {
      p.checked = true; save(); const sc = showPhysFb(); render();
      voice.say(`${sc.ok} of ${sc.tot} correct. ` + (sc.ok < sc.tot ? 'Check the rows marked with a cross, correct them and record again, or ' : '') + 'Click Proceed for chemical examination.');
    };
    $('#goChem').onclick = () => { state.tab = 'chemical'; save(); render(); window.scrollTo(0, 0); };
    if (p.checked) showPhysFb();

    function showPhysFb() {
      const a2 = A(), ph2 = a2.physical, sg = ph2.sg;
      const nearPh = PH_OPTS.reduce((bi, v, i) => Math.abs(parseFloat(v) - a2.sample.pH) < Math.abs(parseFloat(PH_OPTS[bi]) - a2.sample.pH) ? i : bi, 0);
      const num = v => parseFloat(String(v || '').replace(',', '.'));
      const rows = [
        ['Volume', p.volume, ph2.volume, E.VOLUME_OPTS, 'Polyuria >2500 mL/24 h (diabetes mellitus or insipidus, diuretics). Oliguria <500 mL/24 h (dehydration, haemorrhage, shock, acute glomerulonephritis, obstruction). Anuria <100 mL/day (shock, renal failure).'],
        ['Colour', p.colour, ph2.colour, E.COLOUR_OPTS, 'Straw / amber yellow: normal urochrome colour. Smoky red: RBCs. Yellowish-brown or greenish: bile pigments. Dark brown or black: haemoglobinuria or alkaptonuria. Milky white: chyluria.'],
        ['Appearance', p.appearance, ph2.appearance, E.APPEAR_OPTS, 'Smoky: RBCs (haematuria). Turbid: pus, bacteria or phosphates. Milky: chyluria.'],
        ['Odour', p.odour, ph2.odour, E.ODOUR_OPTS, 'Fruity: ketone bodies (ketoacidosis). Mousy: PKU. Maple syrup: MSUD.'],
        ['pH', p.pH, nearPh, PH_OPTS, 'Acidic: metabolic acidosis (starvation, diabetic ketosis) or respiratory acidosis. Alkaline: vomiting, hyperventilation, post-prandial alkaline tide.'],
        ['Reaction', p.reaction, ph2.reaction, E.REACTION_OPTS, '']
      ];
      let html = '<table style="margin-top:10px"><tr><th>Property</th><th>Your entry</th><th>Simulated / wet-lab result</th><th></th></tr>';
      let ok = 0, tot = 0;
      rows.forEach(([n, mine, truth, opts, why]) => {
        tot++; const good = mine !== undefined && mine !== '' && Number(mine) === truth; if (good) ok++;
        html += `<tr><td>${n}</td><td>${mine === undefined || mine === '' ? '<i class="muted">not recorded</i>' : esc(opts[mine])}</td><td>${esc(opts[truth])}</td><td class="mark ${good ? 'ok' : 'bad'}">${good ? '✓' : '✗'}</td></tr>`;
        if (!good && why) html += `<tr><td></td><td colspan="3" class="small muted">${esc(why)}</td></tr>`;
      });
      const o = num(p.sgObs), td = num(p.sgTd), co = num(p.sgCor);
      const sgRows = [['Observed SG', o, sg.observed, 0.0011, 3], ['Temperature difference', td, sg.tdiff, 0.5, 0], ['Corrected SG', co, sg.corrected, 0.0011, 3]];
      sgRows.forEach(([n, mine, truth, tol, dp]) => {
        tot++; const good = !isNaN(mine) && Math.abs(mine - truth) <= tol; if (good) ok++;
        html += `<tr><td>${n}</td><td>${isNaN(mine) ? '<i class="muted">not recorded</i>' : esc(mine)}</td><td>${truth.toFixed(dp)}</td><td class="mark ${good ? 'ok' : 'bad'}">${good ? '✓' : '✗'}</td></tr>`;
      });
      html += `<tr><td></td><td colspan="3" class="small muted">Corrected SG = ${sg.observed.toFixed(3)} + (0.001 × ${sg.tdiff} ÷ 3) = ${sg.corrected.toFixed(3)} → <b>${esc(ph2.sgClass)}</b>. Raised SG: glycosuria, proteinuria, dehydration. Low SG: diabetes insipidus. Fixed at 1.010: end-stage renal disease.</td></tr></table>`;
      $('#physFb').innerHTML = `<div class="fb ${ok === tot ? 'ok' : 'info'}"><b>${ok} / ${tot} correct.</b> The values in the middle column are what the prepared wet-lab sample shows.</div>` + html;
      return { ok, tot };
    }
  }

  /* ============================================================ test tube */
  let uid = 0;
  function Tube(host) {
    const id = 'tb' + (++uid);
    const blobs = Array.from({ length: 34 }, () => `<ellipse cx="${46 + Math.random() * 32}" cy="${30 + Math.random() * 258}" rx="${1.5 + Math.random() * 2.5}" ry="${1 + Math.random() * 1.8}" fill="#fffef8"/>`).join('');
    const cry = Array.from({ length: 22 }, () => { const x = 46 + Math.random() * 32, y = 270 + Math.random() * 16; return `<rect x="${x}" y="${y}" width="4" height="3" fill="#fbfbff" stroke="#c7cbd6" stroke-width=".4" transform="rotate(${Math.random() * 90} ${x} ${y})"/>`; }).join('');
    const sul = Array.from({ length: 18 }, () => `<circle r="${1.4 + Math.random() * 1.3}" cx="${46 + Math.random() * 32}" cy="0" fill="#e8cf1d" stroke="#b39b10" stroke-width=".4" class="t"/>`).join('');
    const bub = Array.from({ length: 10 }, (_, i) => `<circle cx="${48 + Math.random() * 28}" cy="${0}" r="${1 + Math.random() * 1.5}" fill="#fff" opacity=".8" style="animation-delay:${(i * 0.11).toFixed(2)}s"/>`).join('');
    host.innerHTML = `<svg viewBox="0 0 130 320" aria-label="test tube">
      <defs><clipPath id="${id}c"><path d="M42 22 L42 270 A20 20 0 0 0 82 270 L82 22 Z"/></clipPath></defs>
      <rect x="0" y="0" width="130" height="320" fill="transparent"/>
      <g clip-path="url(#${id}c)">
        <rect class="t" data-k="liq" x="40" width="44" y="292" height="0" fill="#ffffff"/>
        <rect class="t" data-k="top" x="40" width="44" y="292" height="0" fill="#f6f8fb" opacity="0"/>
        <rect class="t" data-k="tall" x="40" width="44" y="292" height="0" fill="#fbfbf6" opacity="0"/>
        <rect class="t" data-k="ttop" x="40" width="44" y="292" height="0" fill="#fbfbf6" opacity="0"/>
        <g class="t" data-k="floc" opacity="0">${blobs}</g>
        <g data-k="cry" opacity="0">${cry}</g>
        <rect class="t" data-k="ppt" x="40" width="44" y="270" height="22" fill="#b2422a" opacity="0"/>
        <rect class="t" data-k="ring" x="40" width="44" y="0" height="6" fill="#5e1f6e" opacity="0"/>
        <g data-k="bub" class="bub" opacity="0">${bub}</g>
      </g>
      <g data-k="sul" opacity="0">${sul}</g>
      <path d="M42 22 L42 270 A20 20 0 0 0 82 270 L82 22" fill="none" stroke="#6b7385" stroke-width="2.5"/>
      <path d="M37 22 h50" stroke="#6b7385" stroke-width="3" stroke-linecap="round"/>
      <rect x="47" y="30" width="4" height="228" fill="#fff" opacity=".5" rx="2"/>
      <g data-k="flame" opacity="0"><path class="flame" d="M104 0 C92 -18 100 -30 104 -40 C108 -30 116 -18 104 0 Z" fill="#f29a3a"/><path class="flame" d="M104 0 C98 -10 102 -18 104 -24 C106 -18 110 -10 104 0 Z" fill="#fde07a"/><rect x="96" y="0" width="16" height="30" fill="#9aa1ad" rx="2"/></g>
    </svg>`;
    const el = k => host.querySelector(`[data-k="${k}"]`);
    const yOf = l => 290 - l * 268;
    const T = { level: 0 };
    const span = (k, y1, y2) => { const e = el(k); e.setAttribute('y', y1); e.setAttribute('height', Math.max(0, y2 - y1)); return e; };
    T.fill = (level, colour) => { T.level = level; span('liq', yOf(level), 292).setAttribute('fill', colour); span('tall', yOf(level), 292); T.colour = colour; };
    T.tint = colour => { el('liq').setAttribute('fill', colour); T.colour = colour; };
    T.topLayer = (from, to, colour, op) => { const e = span('top', yOf(to), yOf(from)); e.setAttribute('fill', colour); e.style.opacity = op; };
    T.turbAll = (op, colour) => { const e = el('tall'); span('tall', yOf(T.level), 292); if (colour) e.setAttribute('fill', colour); e.style.opacity = op; };
    T.turbTop = op => { const y1 = yOf(T.level); span('ttop', y1, y1 + (290 - y1) * 0.42).style.opacity = op; };
    T.floc = (on, region) => { const g = el('floc'); g.style.opacity = on ? 0.95 : 0; const y1 = yOf(T.level), y2 = region === 'top' ? y1 + (290 - y1) * 0.42 : 290; $$('ellipse', g).forEach(b => { const cy = +b.getAttribute('cy'); b.style.display = cy >= y1 && cy <= y2 ? '' : 'none'; }); };
    T.ppt = (colour, op) => { const e = el('ppt'); e.setAttribute('fill', colour); e.style.opacity = op; };
    T.crystals = on => { el('cry').style.opacity = on ? 1 : 0; };
    T.ring = (colour, level) => { const e = el('ring'); if (level != null) e.setAttribute('y', yOf(level) - 3); if (colour) e.setAttribute('fill', colour); e.style.opacity = colour ? 0.95 : 0; };
    T.boil = on => { const g = el('bub'); g.style.opacity = on ? 1 : 0; $$('circle', g).forEach(c => c.setAttribute('cy', 280 - Math.random() * 40)); };
    T.flame = (on, level) => { const g = el('flame'); g.style.opacity = on ? 1 : 0; g.setAttribute('transform', `translate(0 ${yOf(level == null ? T.level : level) + 48})`); };
    T.sulphur = (mode, instant) => {
      const g = el('sul'); g.style.opacity = mode ? 1 : 0; const top = yOf(T.level);
      $$('circle', g).forEach((c, i) => {
        c.setAttribute('cy', top - 1 + Math.random() * 3);
        c.style.transitionDelay = (i * 0.12).toFixed(2) + 's';
        c.style.transitionDuration = instant ? '0s' : '2.6s';
        c.style.transform = mode === 'sink' ? `translateY(${284 - top - Math.random() * 10}px)` : 'translateY(0px)';
      });
    };
    return T;
  }

  function Paper(host) {
    host.innerHTML = `<svg viewBox="0 0 160 160" aria-label="filter paper"><circle cx="80" cy="80" r="70" fill="#fdfdfb" stroke="#c9ccd6"/>
      <ellipse data-k="pp" cx="80" cy="80" rx="34" ry="30" fill="#f2f1ea" stroke="#dedcd2" opacity="0" style="transition:opacity 1s"/>
      <circle data-k="spot" cx="80" cy="80" r="0" fill="#e9d98a" style="transition:r 1.4s, fill 2s"/>
      <text x="80" y="156" text-anchor="middle" font-size="10" fill="#4f5b6e">filter paper (BaSO₄ precipitate)</text></svg>`;
    const el = k => host.querySelector(`[data-k="${k}"]`);
    return {
      show: on => { host.style.display = on ? '' : 'none'; el('pp').style.opacity = on ? 1 : 0; },
      drop: (colour, instant) => { const s = el('spot'); s.setAttribute('fill', '#e9d98a'); s.setAttribute('r', 14); later(instant, () => s.setAttribute('fill', colour), 900); }
    };
  }

  /* ============================================================ benches */
  const URINE = a => a.physical.liquid;
  const BENCH = {
    heat: {
      proc: 'Take urine up to 2/3rd of the test tube and heat the upper portion. Add 2–3 drops of glacial acetic acid.',
      principle: 'Heat denatures the proteins. Acetic acid brings the pH to their isoelectric point, so the already-denatured albumin and globulins coagulate (irreversible). Phosphates also precipitate on heating, but acid dissolves them.',
      steps: [
        ['Fill the test tube to 2/3rd with urine', (T, a) => T.fill(0.66, URINE(a))],
        ['Hold the tube slanting and heat only the UPPER portion (the lower part is the control)', (T, a, res, i, say) => {
          T.flame(true); T.boil(true);
          later(i, () => { T.boil(false); T.flame(false); T.turbTop(res.visual.heated); say(res.visual.heated ? 'Heated upper portion has turned cloudy. The lower portion stays clear as the control.' : 'Upper portion boiled. No change compared with the clear lower portion.'); }, 2600);
        }],
        ['Add 2–3 drops of glacial acetic acid and observe', (T, a, res, i, say) => {
          later(i, () => { T.turbTop(res.visual.afterAcid); T.floc(res.visual.floc, 'top'); say('Compare the upper portion with the lower (control) portion.'); }, 700);
        }]
      ]
    },
    ssa: {
      proc: 'Take 3 mL of urine in a test tube, add 1 mL of sulphosalicylic acid and mix well.',
      principle: 'Proteins carry a net positive charge in acid medium. The negatively charged sulphosalicylate neutralises those charges and denatures the protein, which precipitates.',
      steps: [
        ['Take 3 mL of urine', (T, a) => T.fill(0.3, URINE(a))],
        ['Add 1 mL of sulphosalicylic acid and mix well', (T, a, res, i, say) => {
          T.fill(0.4, URINE(a)); later(i, () => { T.turbAll(res.visual.turbid); T.floc(res.visual.floc); say('Look against a dark background.'); }, 500);
        }]
      ]
    },
    benedict: {
      proc: 'Take 5 mL of Benedict’s qualitative reagent and boil for a few seconds to check its purity. Add 8 drops of urine and boil for 2 minutes.',
      principle: 'In hot alkaline medium, reducing sugars form enediols, which reduce Cu²⁺ to cuprous hydroxide (stabilised by citrate). On boiling this forms cuprous oxide. The colour goes green → yellow → orange → brick red as sugar concentration rises (semi-quantitative).',
      steps: [
        ['Take 5 mL of Benedict’s reagent', (T, a, res) => T.fill(0.45, res.visual.reagent)],
        ['Boil a few seconds to check purity of the reagent', (T, a, res, i, say) => {
          T.flame(true, 0.15); T.boil(true); later(i, () => { T.flame(false); T.boil(false); say('Reagent remains clear blue, so it is fit for use.'); }, 1800);
        }],
        ['Add 8 drops of urine', (T, a, res, i, say) => { T.fill(0.47, res.visual.reagent); say('8 drops of urine added; mix.'); }],
        ['Boil for 2 minutes (water bath / flame) and allow to cool', (T, a, res, i, say) => {
          const sim = res.sim, done = () => {
            T.flame(false); T.boil(false); T.tint(res.visual.colour); if (res.visual.pptHex) T.ppt(res.visual.pptHex, 1);
            say('2 minutes boiled. Simulated: ' + (sim.f * 100).toFixed(0) + '% of Cu²⁺ reduced, ' + sim.cu2oMg.toFixed(1) + ' mg Cu₂O. Note the colour.');
          };
          if (i) return done();
          T.flame(true, 0.15); T.boil(true);
          // each frame is the reaction simulated up to that time (colour from the computed spectrum)
          const times = [15, 30, 45, 60, 75, 90, 105, 120]; let k = 0;
          const tick = () => {
            const snap = E.Rx.benedict(a.sample, { seconds: times[k] });
            T.tint(snap.hex); say('Boiling… ' + times[k] + ' s · ' + (snap.f * 100).toFixed(0) + '% Cu²⁺ reduced', true);
            if (++k < times.length) setTimeout(tick, 450); else done();
          };
          tick();
        }]
      ]
    },
    rothera: {
      proc: 'Saturate 3 mL of urine with solid ammonium sulphate crystals and add 2–3 drops of sodium nitroprusside. Mix, then add 1 mL of liquor ammonia along the side of the test tube.',
      principle: 'Sodium nitroprusside reacts with the ketone group of acetone and acetoacetic acid in alkaline medium. A permanganate-coloured ring forms at the junction of the two layers. β-hydroxybutyrate has no ketone group and is NOT detected.',
      steps: [
        ['Take 3 mL of urine', (T, a) => T.fill(0.3, URINE(a))],
        ['Saturate with solid ammonium sulphate (excess crystals remain)', (T) => T.crystals(true)],
        ['Add 2–3 drops of sodium nitroprusside and mix', (T, a) => T.tint(E.mix(URINE(a), '#c8664a', 0.18))],
        ['Add 1 mL of liquor ammonia gently along the side (do not mix)', (T, a, res, i, say) => {
          T.fill(0.42, T.colour); T.topLayer(0.3, 0.42, '#f6f8fb', 0.92); T.ring(null, 0.3);
          later(i, () => { T.ring(res.visual.ring, 0.3); say(res.visual.ring ? 'A ring formed at the junction (simulated: visible after ' + res.sim.tRing + ' s, ' + res.sim.thicknessMm + ' mm thick).' : 'Observed for 1–2 minutes: no ring at the junction.'); }, 1800);
        }]
      ]
    },
    hay: {
      proc: 'Take 3 mL of urine in a test tube and sprinkle a little sulphur powder on the surface.',
      principle: 'Bile salts lower the surface tension of urine, so the sulphur powder sinks. In normal urine the surface tension holds the powder up and it floats.',
      steps: [
        ['Take 3 mL of urine', (T, a) => T.fill(0.3, URINE(a))],
        ['Gently sprinkle sulphur powder on the surface (do not shake)', (T, a, res, i, say) => {
          T.sulphur('float', true);
          later(i, () => { T.sulphur(res.visual.sink ? 'sink' : 'float', i); say('Surface tension ' + res.sim.gamma.toFixed(1) + ' mN/m (sinks below ' + res.sim.gammaC + '): ' + (res.sim.sunkFraction * 100).toFixed(0) + '% sunk at 60 s.'); }, 300);
        }]
      ]
    },
    fouchet: {
      proc: 'Take 5 mL of urine, add a pinch of magnesium sulphate and 1–2 mL of barium chloride. Mix and filter. Add a drop of Fouchet’s reagent to the precipitate on the filter paper.',
      principle: 'Bile pigments adsorb onto the barium sulphate precipitate. The FeCl₃ in Fouchet’s reagent (10% FeCl₃ in 25% TCA) oxidises bilirubin to biliverdin, giving a green colour.',
      paper: true,
      steps: [
        ['Take 5 mL of urine', (T, a) => T.fill(0.45, URINE(a))],
        ['Add a pinch of magnesium sulphate', (T) => T.crystals(true)],
        ['Add 1–2 mL of barium chloride and mix', (T, a, res, i, say) => { T.crystals(false); T.fill(0.6, T.colour); T.turbAll(0.85, '#fbfbf6'); say('A white precipitate of barium sulphate forms.'); }],
        ['Filter: collect the precipitate on filter paper', (T, a, res, i, say, P) => { T.turbAll(0); T.fill(0.5, T.colour); P.show(true); }],
        ['Add a drop of Fouchet’s reagent to the precipitate', (T, a, res, i, say, P) => { P.drop(res.visual.spot, i); say('Observe the spot where the drop fell.'); }]
      ]
    },
    benzidine: {
      proc: 'Take 3 mL of urine and add 1–2 drops of benzidine solution. Mix well and add 3–4 drops of H₂O₂.',
      principle: 'The haem part of haemoglobin has peroxidase-like activity. It releases nascent oxygen from H₂O₂, which oxidises benzidine (12% in glacial acetic acid) to a green or blue-green colour. Both haematuria and haemoglobinuria give a positive test.',
      steps: [
        ['Take 3 mL of urine', (T, a) => T.fill(0.3, URINE(a))],
        ['Add 1–2 drops of benzidine solution and mix', (T) => T.fill(0.31, T.colour)],
        ['Add 3–4 drops of hydrogen peroxide', (T, a, res, i, say) => {
          T.fill(0.33, T.colour); T.boil(!i && !!res.visual.colour);
          later(i, () => { T.boil(false); if (res.visual.colour) T.tint(res.visual.colour); say(res.sim.tVisible != null && res.sim.grade ? 'Colour visible after ' + res.sim.tVisible.toFixed(1) + ' s (simulated peroxidase kinetics).' : 'No colour within 60 s.'); }, 1200);
        }]
      ]
    }
  };

  const CONSTITUENTS = [
    ['protein', 'Protein', 'heat'], ['sugar', 'Reducing sugar', 'benedict'], ['ketone', 'Ketone bodies (acetone)', 'rothera'],
    ['bsalt', 'Bile salts', 'hay'], ['bpig', 'Bile pigments', 'fouchet'], ['blood', 'Blood', 'benzidine']
  ];
  const SELECT_OPTS = [
    ['heat', 'Heat coagulation & sulphosalicylic acid tests'], ['benedict', 'Benedict’s qualitative test'], ['rothera', 'Rothera’s test'],
    ['hay', 'Hay’s sulphur test'], ['fouchet', 'Fouchet’s test'], ['benzidine', 'Benzidine test']
  ];

  function viewChemical(m) {
    const a = A(), r = R();
    m.innerHTML = `
    <section class="card">
      <h2>Step 3a · Select the appropriate test for each abnormal constituent</h2>
      <table><tr><th>Abnormal constituent</th><th>Test you will perform</th><th></th></tr>
      ${CONSTITUENTS.map(([k, l]) => `<tr><td>${l}</td><td><select data-sel="${k}"><option value="">— select —</option>${SELECT_OPTS.map(([v, t]) => `<option value="${v}" ${r.select[k] === v ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></td><td class="mark" data-selm="${k}"></td></tr>`).join('')}
      </table>
      <div class="flex" style="margin-top:10px"><button id="selCheck">Check selection</button><span class="small muted">A complete abnormal-urine analysis runs all six tests. The case decides which ones turn positive.</span></div>
      <div id="selFb"></div>
    </section>
    <div id="benches"></div>
    <section class="card"><div class="flex"><button class="go" id="goDip">Proceed to dipstick analysis →</button></div></section>`;
    $$('select[data-sel]').forEach(s => s.onchange = () => { r.select[s.dataset.sel] = s.value; save(); });
    const selFb = () => {
      let ok = 0;
      CONSTITUENTS.forEach(([k, , right]) => { const g = r.select[k] === right; if (g) ok++; $(`[data-selm="${k}"]`).innerHTML = r.select[k] ? `<span class="mark ${g ? 'ok' : 'bad'}">${g ? '✓' : '✗ ' + esc(SELECT_OPTS.find(o => o[0] === right)[1])}</span>` : ''; });
      $('#selFb').innerHTML = `<div class="fb ${ok === 6 ? 'ok' : 'info'}">${ok} / 6 correct. The benches below follow the procedures in the lab manual.</div>`;
    };
    $('#selCheck').onclick = () => {
      r.selChecked = true; save(); selFb();
      const ok = CONSTITUENTS.filter(([kk, , right]) => r.select[kk] === right).length;
      voice.say(`${ok} of 6 correct. ` + chemNext(r));
    };
    if (r.selChecked) selFb();
    $('#goDip').onclick = () => { state.tab = 'dipstick'; save(); render(); window.scrollTo(0, 0); };

    const host = $('#benches');
    TEST_ORDER.forEach(k => host.appendChild(makeBench(k, a, r)));
  }

  function makeBench(k, a, r) {
    const def = BENCH[k], meta = E.TESTS[k], res = a.chem[k];
    const card = document.createElement('section'); card.className = 'card';
    card.innerHTML = `
      <div class="flex" style="justify-content:space-between"><h3>${esc(meta.name)} <span class="tag">${esc(meta.constituent)}</span></h3><button class="ghost small" data-reset>Reset tube</button></div>
      <div class="bench">
        <div>
          <p class="small" style="margin-top:0"><b>Procedure:</b> ${esc(def.proc)}</p>
          <div data-steps></div>
        </div>
        <div class="tube-wrap"><div data-tube></div><div class="paper" data-paper style="display:none"></div><div class="status" data-status></div></div>
        <div>
          <label class="f">Observation</label><select data-obs><option value="">— select —</option>${meta.obs.map((o, i) => `<option value="${i}">${esc(o)}</option>`).join('')}</select>
          <label class="f">Inference</label><select data-inf><option value="">— select —</option>${meta.inf.map((o, i) => `<option value="${i}">${esc(o)}</option>`).join('')}</select>
          <div class="flex" style="margin-top:10px"><button data-rec>Record in notebook</button></div>
          <div data-fb></div>
        </div>
      </div>`;
    const T = Tube($('[data-tube]', card));
    const P = def.paper ? Paper($('[data-paper]', card)) : null;
    if (P) P.show(false);
    let live = false, pendingNext = '', nextTimer = null;
    const flushNext = () => { clearTimeout(nextTimer); if (pendingNext) { voice.say(pendingNext, true); pendingNext = ''; } };
    // status text under the tube; spoken while the student is working (quiet = progress ticks that are not read out)
    const say = (t, quiet) => { $('[data-status]', card).textContent = t; if (live && !quiet) { voice.say(t, true); flushNext(); } };
    const stepsEl = $('[data-steps]', card);
    let done = r.bench[k] || 0;

    function drawSteps() {
      stepsEl.innerHTML = def.steps.map((s, i) => `<button class="step ${i < done ? 'done' : ''} ${i === done ? 'next' : ''}" data-i="${i}" ${i > done ? 'disabled' : ''}><span class="n">${i < done ? '✓' : i + 1}</span><span>${esc(s[0])}</span></button>`).join('');
      $$('button.step', stepsEl).forEach(b => b.onclick = () => {
        const i = +b.dataset.i; if (i !== done) return;
        voice.say((i === 0 ? `${meta.name}. Procedure: ${def.proc} ` : '') + `Step ${i + 1}. ${def.steps[i][0]}.`);
        pendingNext = i + 1 < def.steps.length ? `Next, click step ${i + 2}: ${def.steps[i + 1][0]}.` : 'Now select the observation and the inference, and click Record in notebook.';
        live = true;
        const fn = def.steps[i][1];
        fn(T, a, res, false, say, P); done = i + 1; r.bench[k] = done; save(); drawSteps(); syncRec();
        // steps that report a result later (heating, ring formation) speak it first; the others go straight on
        clearTimeout(nextTimer); nextTimer = setTimeout(flushNext, fn.length >= 5 ? 4500 : 0);
      });
    }
    function syncRec() {
      const complete = done >= def.steps.length;
      $('[data-rec]', card).disabled = !complete;
      if (!r.chem[k]) $('[data-fb]', card).innerHTML = complete ? '' : `<div class="fb info small">Complete all the steps, then record what you observe.</div>`;
    }
    // restore previous progress instantly
    for (let i = 0; i < done; i++) def.steps[i][1](T, a, res, true, say, P);
    drawSteps(); syncRec();

    const obsSel = $('[data-obs]', card), infSel = $('[data-inf]', card);
    if (r.chem[k]) { obsSel.value = r.chem[k].obs; infSel.value = r.chem[k].inf; showFb(); }
    $('[data-rec]', card).onclick = () => {
      if (obsSel.value === '' || infSel.value === '') { $('[data-fb]', card).innerHTML = '<div class="fb bad small">Select both an observation and an inference.</div>'; voice.say('Select both an observation and an inference.'); return; }
      r.chem[k] = { obs: +obsSel.value, inf: +infSel.value }; save(); showFb(); render0Dots();
      const rc = r.chem[k], go = rc.obs === res.obsIdx, gi = rc.inf === res.infIdx;
      voice.say((go ? 'Observation correct. ' : `Observation not correct. Expected: ${res.observation}. `) +
        (gi ? 'Inference correct. ' : `Inference not correct. Expected: ${res.inference}. `) + chemNext(r));
    };
    $('[data-reset]', card).onclick = () => { r.bench[k] = 0; delete r.chem[k]; save(); const fresh = makeBench(k, A(), r); card.replaceWith(fresh); render0Dots(); };

    function showFb() {
      const rc = r.chem[k], go = rc.obs === res.obsIdx, gi = rc.inf === res.infIdx;
      $('[data-fb]', card).innerHTML = `<div class="fb ${go && gi ? 'ok' : 'bad'} small">
        ${go ? '✓' : '✗'} Observation${go ? '' : ': expected <b>' + esc(res.observation) + '</b>'}<br>
        ${gi ? '✓' : '✗'} Inference${gi ? '' : ': expected <b>' + esc(res.inference) + '</b>'}
        <div style="margin-top:6px"><b>Principle.</b> ${esc(def.principle)}</div></div>`;
    }
    return card;
  }
  function render0Dots() { $$('#tabs button').forEach(b => { const d = $('.dot', b); if (d) d.classList.toggle('done', isDone(b.dataset.tab)); }); }

  /* ============================================================ 4. DIPSTICK */
  let dip = { t: -1, timer: null, speed: 1, last: 0 };
  function stopDip() { if (dip.timer) clearInterval(dip.timer); dip.timer = null; }

  function padSVG(colour, speckled) {
    let dots = '';
    if (speckled) for (let i = 0; i < 9; i++) dots += `<circle cx="${5 + Math.random() * 26}" cy="${5 + Math.random() * 20}" r="1.6" fill="#2f6e4e"/>`;
    return `<svg width="36" height="30" viewBox="0 0 36 30"><rect width="36" height="30" rx="4" fill="${colour}" stroke="#0003"/>${dots}</svg>`;
  }

  function viewDipstick(m) {
    stopDip();
    const a = A(), r = R(), d = r.dip; d.sel = d.sel || {};
    m.innerHTML = `
    <div class="grid2">
      <section class="card">
        <h2>Multistix procedure</h2>
        <div data-steps></div>
        <div class="flex" style="margin:10px 0"><label class="small"><input type="checkbox" id="fast" ${dip.speed > 1 ? 'checked' : ''}> Demo speed (×6). Leave unticked for a real-time practical.</label></div>
        <div class="flex" style="gap:18px;align-items:center">
          <div class="timer" id="clock">--</div>
          <div class="small" id="clockMsg" style="flex:1">Dip the strip to start.</div>
        </div>
        <div id="strip" style="margin-top:12px"></div>
        <p class="small muted">Read between 40 seconds and 2 minutes. Colour changes after 2 minutes have no diagnostic value.</p>
      </section>
      <section class="card">
        <h2>Colour chart on the bottle: click your reading</h2>
        <div id="chart"></div>
        <div class="flex" style="margin-top:10px"><button id="dipCheck">Record & check readings</button><button class="go" id="goRep">Proceed to report →</button></div>
        <div id="dipFb"></div>
      </section>
    </div>
    <section class="card small">
      <h3>Principle of colour development</h3>
      <ul>
        <li><b>pH:</b> a double indicator gives colours across the urinary pH range.</li>
        <li><b>Specific gravity:</b> the apparent pKa change of pre-treated polyelectrolytes with ionic concentration. Glucose is non-ionic, so <b>glucose does not raise the strip SG</b>, but it does raise the urinometer reading.</li>
        <li><b>Protein:</b> protein-error-of-indicator; green at constant pH means protein (mainly albumin).</li>
        <li><b>Glucose:</b> glucose oxidase → gluconic acid + H₂O₂. Peroxidase then oxidises the KI chromogen (green → brown).</li>
        <li><b>Ketone:</b> nitroprusside reacts with acetoacetate (and, less, acetone) to give shades of purple.</li>
        <li><b>Blood:</b> haem peroxidase activity on tetramethylbenzidine with buffered organic peroxide (orange → green). Intact RBCs at low counts give green speckles.</li>
      </ul>
    </section>`;

    const STEPS = ['Completely immerse all reagent areas in fresh, well-mixed urine and remove immediately',
      'Run the edge of the strip against the rim of the container to remove excess urine',
      'Hold the strip horizontally and start timing'];
    let sdone = dip.t >= 0 ? 3 : (d.stepsDone || 0);
    const stepsEl = $('[data-steps]', m);
    const drawSteps = () => {
      stepsEl.innerHTML = STEPS.map((s, i) => `<button class="step ${i < sdone ? 'done' : ''} ${i === sdone ? 'next' : ''}" data-i="${i}" ${i > sdone ? 'disabled' : ''}><span class="n">${i < sdone ? '✓' : i + 1}</span><span>${s}</span></button>`).join('') +
        `<button class="ghost small" id="newStrip" style="margin-top:6px">Use a fresh strip</button>`;
      $$('button.step', stepsEl).forEach(b => b.onclick = () => {
        if (+b.dataset.i !== sdone) return; sdone++; d.stepsDone = sdone; save();
        if (sdone === 3) { voice.say('Timer started. Wait 40 seconds for the colours to develop.'); startDip(); }
        else voice.say(`Next, click step ${sdone + 1}: ${STEPS[sdone]}.`);
        drawSteps();
      });
      $('#newStrip').onclick = () => { stopDip(); dip.t = -1; sdone = 0; d.stepsDone = 0; d.sel = {}; d.checked = false; d.readAt = null; save(); viewDipstick(m); render0Dots(); };
    };
    drawSteps();
    $('#fast').onchange = e => { dip.speed = e.target.checked ? 6 : 1; };

    const drawStrip = () => {
      const t = dip.t;
      $('#strip').innerHTML = E.DIP_ORDER.map(k => `<div class="dip-row"><div class="small"><b>${E.DIP[k].label}</b></div>${padSVG(E.padColour(k, a.dip[k], t, false, a.sample), k === 'blood' && a.dip.bloodSpeckled && t > 20)}<div class="small muted">${t < 0 ? '' : ''}</div></div>`).join('');
      const c = $('#clock'), msg = $('#clockMsg');
      if (t < 0) { c.textContent = '--'; c.className = 'timer'; msg.textContent = 'Dip the strip to start.'; return; }
      c.textContent = Math.floor(t) + ' s';
      const phase = t < 40 ? 0 : t <= 120 ? 1 : 2;
      if (phase !== dip.phase) {
        if (dip.phase != null && phase === 1) voice.say('40 seconds. Read now. Click the colour block on the chart that matches each pad, then click Record and check readings.');
        if (dip.phase != null && phase === 2) voice.say('Two minutes have passed. Colour changes now have no diagnostic value. Use a fresh strip if you have not read the pads.');
        dip.phase = phase;
      }
      if (t < 40) { c.className = 'timer'; msg.textContent = 'Wait. Reactions are still developing (read from 40 s).'; }
      else if (t <= 120) { c.className = 'timer ok'; msg.innerHTML = '<b>READ NOW</b>, within the 40 s – 2 min window.'; }
      else { c.className = 'timer late'; msg.textContent = 'Past 2 minutes: colour changes now have no diagnostic value. Use a fresh strip.'; }
    };
    function startDip() {
      stopDip(); dip.t = 0; dip.last = Date.now(); dip.phase = null; drawStrip(); dip.phase = 0;
      dip.timer = setInterval(() => { const now = Date.now(); dip.t += (now - dip.last) / 1000 * dip.speed; dip.last = now; drawStrip(); if (dip.t >= 400) stopDip(); }, 250);
    }
    drawStrip();

    $('#chart').innerHTML = E.DIP_ORDER.map(k => `<div style="margin-bottom:10px"><div class="small"><b>${E.DIP[k].label}</b></div><div class="swatches">
      ${E.DIP[k].levels.map((l, i) => `<button class="sw ${d.sel[k] === i ? 'sel' : ''}" data-pad="${k}" data-l="${i}"><i style="background:${E.DIP[k].colours[i]}"></i><span>${esc(l)}</span></button>`).join('')}</div></div>`).join('');
    $$('#chart .sw').forEach(b => b.onclick = () => {
      const k = b.dataset.pad; d.sel[k] = +b.dataset.l;
      if (dip.t >= 0) d.readAt = Math.round(dip.t);
      save(); $$(`#chart .sw[data-pad="${k}"]`).forEach(x => x.classList.toggle('sel', x === b));
    });
    $('#dipCheck').onclick = () => {
      d.checked = true; save(); showDipFb(); render0Dots();
      const ok = E.DIP_ORDER.filter(k => d.sel[k] === a.dip[k]).length;
      voice.say(`${ok} of 6 pads read correctly. The correct blocks are outlined in green. Click Proceed to report.`);
    };
    $('#goRep').onclick = () => { stopDip(); state.tab = 'report'; save(); render(); window.scrollTo(0, 0); };
    if (d.checked) showDipFb();

    function showDipFb() {
      let ok = 0;
      E.DIP_ORDER.forEach(k => {
        const truth = a.dip[k]; if (d.sel[k] === truth) ok++;
        $$(`#chart .sw[data-pad="${k}"]`).forEach(x => x.classList.toggle('correct', +x.dataset.l === truth));
      });
      let timing = '';
      if (d.readAt != null && d.readAt < 40) timing = '<div class="fb bad small">You read before 40 s. Reactions had not fully developed.</div>';
      else if (d.readAt != null && d.readAt > 120) timing = '<div class="fb bad small">You read after 2 minutes. Those colours have no diagnostic value.</div>';
      else if (d.readAt == null) timing = '<div class="fb info small">Tip: run the strip procedure and read inside the 40 s – 2 min window.</div>';
      const sgNote = a.sample.glucose >= 0.5 ? `<div class="fb info small"><b>Why the strip SG (${E.DIP.sg.levels[a.dip.sg]}) is lower than the urinometer (${a.physical.sg.corrected.toFixed(3)}):</b> the strip responds only to ionic solutes. Glucose is non-ionic and is missed by the pad. This is real wet-lab behaviour, not an error.</div>` : '';
      $('#dipFb').innerHTML = `<div class="fb ${ok === 6 ? 'ok' : 'info'}">${ok} / 6 pads read correctly. The correct chart blocks are outlined in green.<br><b>Result:</b> ${esc(E.dipReadingText(a.dip))}</div>${timing}${sgNote}`;
    }
  }

  /* ============================================================ 5. REPORT */
  const PH_LIST = ['4.5', '5.0', '5.5', '6.0', '6.5', '7.0', '7.5', '8.0', '8.5'];
  const CASE_LABEL = { case1: 'Case I', case2: 'Case II' };
  const blank = v => v === undefined || v === null || v === '';

  /* Marks for one case, from everything the student recorded (1 mark per item). */
  function marksFor(id) {
    const c = E.CASES[id], a = E.analyse(c.sample, state.env), r = recOf(id), p = r.physical, ph = a.physical, sg = ph.sg;
    const nearPh = PH_LIST.reduce((bi, v, i) => Math.abs(parseFloat(v) - a.sample.pH) < Math.abs(parseFloat(PH_LIST[bi]) - a.sample.pH) ? i : bi, 0);
    const num = v => parseFloat(String(v == null ? '' : v).replace(',', '.'));
    const rows = { physical: [], chemical: [], dipstick: [] };
    const opt = (sec, item, mine, truth, opts) => rows[sec].push({ item, mine: blank(mine) ? '' : opts[mine], expected: opts[truth], ok: !blank(mine) && Number(mine) === truth });
    opt('physical', 'Volume', p.volume, ph.volume, E.VOLUME_OPTS);
    opt('physical', 'Colour', p.colour, ph.colour, E.COLOUR_OPTS);
    opt('physical', 'Appearance', p.appearance, ph.appearance, E.APPEAR_OPTS);
    opt('physical', 'Odour', p.odour, ph.odour, E.ODOUR_OPTS);
    opt('physical', 'pH', p.pH, nearPh, PH_LIST);
    opt('physical', 'Reaction', p.reaction, ph.reaction, E.REACTION_OPTS);
    [['Observed specific gravity', p.sgObs, sg.observed, 0.0011, 3], ['Temperature difference (°C)', p.sgTd, sg.tdiff, 0.5, 0], ['Corrected specific gravity', p.sgCor, sg.corrected, 0.0011, 3]]
      .forEach(([item, mine, truth, tol, dp]) => { const v = num(mine); rows.physical.push({ item, mine: isNaN(v) ? '' : String(mine).trim(), expected: truth.toFixed(dp), ok: !isNaN(v) && Math.abs(v - truth) <= tol }); });
    TEST_ORDER.forEach(k => {
      const t = E.TESTS[k], res = a.chem[k], rc = r.chem[k];
      rows.chemical.push({ item: t.name + ': observation', mine: rc ? t.obs[rc.obs] : '', expected: res.observation, ok: !!rc && rc.obs === res.obsIdx });
      rows.chemical.push({ item: t.name + ': inference', mine: rc ? t.inf[rc.inf] : '', expected: res.inference, ok: !!rc && rc.inf === res.infIdx });
    });
    const d = r.dip || {}, sel = d.sel || {};
    E.DIP_ORDER.forEach(k => rows.dipstick.push({ item: E.DIP[k].label, mine: d.checked && sel[k] != null ? E.DIP[k].levels[sel[k]] : '', expected: E.DIP[k].levels[a.dip[k]], ok: !!d.checked && sel[k] === a.dip[k] }));
    const sum = list => ({ ok: list.filter(x => x.ok).length, tot: list.length });
    const sec = { physical: sum(rows.physical), chemical: sum(rows.chemical), dipstick: sum(rows.dipstick) };
    const ok = sec.physical.ok + sec.chemical.ok + sec.dipstick.ok, tot = sec.physical.tot + sec.chemical.tot + sec.dipstick.tot;
    return { id, c, a, r, rows, sec, ok, tot };
  }

  function viewReport(m) {
    const c = C(), a = A(), r = R(), p = r.physical, meta = r.meta, st = state.student;
    const f = (k, def) => meta[k] != null ? meta[k] : def;
    const pick = (opts, v) => blank(v) ? '' : opts[v];
    const tick = ok => `<span class="mark ${ok ? 'ok' : 'bad'}">${ok ? '✓' : '✗'}</span>`;
    const markP = (v, t) => blank(v) ? '' : tick(Number(v) === t);
    const nearPh = PH_LIST.reduce((bi, v, i) => Math.abs(parseFloat(v) - a.sample.pH) < Math.abs(parseFloat(PH_LIST[bi]) - a.sample.pH) ? i : bi, 0);
    const collLabel = (COLLECT.find(x => x[0] === r.collection) || [, ''])[1];
    const mk = marksFor(state.caseId), m1 = marksFor('case1'), m2 = marksFor('case2');
    const other = state.caseId === 'case1' ? 'case2' : 'case1';

    m.innerHTML = `
    <section class="card noprint">
      <h2>Submit your report</h2>
      <div class="grid2">
        <div><label class="f">Student name</label><input type="text" id="stName" value="${esc(st.name)}" style="width:100%" placeholder="Your full name"></div>
        <div><label class="f">Roll number <span style="color:var(--bad)">*</span></label><input type="text" id="stRoll" value="${esc(st.roll)}" style="width:100%" placeholder="e.g. 2026MBBS042"></div>
      </div>
      <table class="small" style="margin-top:12px"><tr><th>Marks</th><th>Physical</th><th>Chemical</th><th>Dipstick</th><th>Total</th></tr>
        ${[m1, m2].map(x => `<tr><td>${CASE_LABEL[x.id]} · ${esc(x.c.patient.name.split(' (')[0])}</td><td>${x.sec.physical.ok} / ${x.sec.physical.tot}</td><td>${x.sec.chemical.ok} / ${x.sec.chemical.tot}</td><td>${x.sec.dipstick.ok} / ${x.sec.dipstick.tot}</td><td><b>${x.ok} / ${x.tot}</b></td></tr>`).join('')}
        <tr><td><b>Grand total</b></td><td></td><td></td><td></td><td><b>${m1.ok + m2.ok} / ${m1.tot + m2.tot}</b></td></tr></table>
      <div class="flex" style="margin-top:12px">
        <button class="go" id="savePdf">Save report as PDF (Case I + Case II)</button>
        <button class="ghost" id="print">Print this page</button>
        <button class="ghost" id="model">${r.showModel ? 'Hide' : 'Show'} model (expected) report</button>
        ${state.caseId === 'case1' ? '<button class="go" id="goCase2">Proceed to Case II →</button>' : `<button class="ghost" id="goOther">Go to ${CASE_LABEL[other]}</button>`}
      </div>
      <div id="pdfMsg"></div>
      <p class="small muted" style="margin-bottom:0">The PDF contains your name, roll number, every recorded finding with its mark, the marks for each case and the grand total, and your interpretation of both cases. Write the interpretation of each case before saving.</p>
    </section>
    <div class="report">
      <div class="small muted" style="text-align:center">EXPERIMENT NUMBER: 10 · QUALITATIVE ANALYSIS OF ABNORMAL URINE · ${esc(c.title)}</div>
      <h2>Urine analysis report</h2>
      <div class="hd">
        <div><b>Name:</b> <input type="text" data-m="name" value="${esc(f('name', c.patient.name))}"></div>
        <div><b>Age:</b> <input type="text" data-m="age" value="${esc(f('age', c.patient.age))}" style="width:110px"></div>
        <div><b>Gender:</b> <input type="text" data-m="gender" value="${esc(f('gender', c.patient.gender))}" style="width:110px"></div>
        <div style="grid-column:1/-1"><b>Chief complaints:</b> <input type="text" data-m="complaints" value="${esc(f('complaints', c.patient.complaints))}" style="width:100%"></div>
        <div style="grid-column:1/-1"><b>Specimen:</b> ${esc(collLabel || '—')} &nbsp; <b>Date:</b> <input type="text" data-m="date" value="${esc(f('date', new Date().toLocaleDateString()))}" style="width:130px"></div>
        <div style="grid-column:1/-1"><b>Done by:</b> <span data-show="name">${esc(st.name || '—')}</span> &nbsp; <b>Roll number:</b> <span data-show="roll">${esc(st.roll || '—')}</span> &nbsp; <b>Marks (this case):</b> ${mk.ok} / ${mk.tot}</div>
      </div>
      <h3>Physical characteristics</h3>
      <div class="kv">
        <div>Volume</div><div>${esc(pick(E.VOLUME_OPTS, p.volume))} (${c.sample.volume24h} mL/24 h) ${markP(p.volume, a.physical.volume)}</div>
        <div>Colour</div><div>${esc(pick(E.COLOUR_OPTS, p.colour))} ${markP(p.colour, a.physical.colour)}</div>
        <div>Appearance</div><div>${esc(pick(E.APPEAR_OPTS, p.appearance))} ${markP(p.appearance, a.physical.appearance)}</div>
        <div>Odour</div><div>${esc(pick(E.ODOUR_OPTS, p.odour))} ${markP(p.odour, a.physical.odour)}</div>
        <div>pH</div><div>${esc(pick(PH_LIST, p.pH))} ${!blank(p.reaction) ? '(' + esc(E.REACTION_OPTS[p.reaction]) + ')' : ''} ${markP(p.pH, nearPh)}</div>
        <div>Corrected specific gravity</div><div>${p.sgCor ? esc(p.sgCor) + ' ' + tick(mk.rows.physical[8].ok) : ''} ${p.sgObs ? `<span class="small muted">(observed ${esc(p.sgObs)} at ${state.env.troom} °C; urinometer calibrated at ${state.env.tcal} °C)</span>` : ''}</div>
      </div>
      <h3 style="margin-top:16px">Chemical characteristics</h3>
      <table><tr><th>Test</th><th>Observation</th><th>Inference</th></tr>
      ${TEST_ORDER.map(k => { const rc = r.chem[k], t = E.TESTS[k], res = a.chem[k]; return `<tr><td>${esc(t.name)}</td><td>${rc ? esc(t.obs[rc.obs]) + ' ' + tick(rc.obs === res.obsIdx) : '<i class="muted">not performed</i>'}</td><td>${rc ? esc(t.inf[rc.inf]) + ' ' + tick(rc.inf === res.infIdx) : ''}</td></tr>`; }).join('')}
      </table>
      <h3 style="margin-top:16px">Dipstick (Multistix)</h3>
      <p class="small">${r.dip && r.dip.checked ? esc(E.DIP_ORDER.map(k => E.DIP[k].label + ': ' + (r.dip.sel[k] != null ? E.DIP[k].levels[r.dip.sel[k]] : '—')).join('; ')) + ` · <b>${mk.sec.dipstick.ok} / ${mk.sec.dipstick.tot}</b> pads correct` : '<i class="muted">not recorded</i>'}</p>
      <h3>Interpretation</h3>
      <textarea data-m="interp" rows="6" style="width:100%" placeholder="Write your interpretation: abnormal findings → likely condition → suggested correlation.">${esc(f('interp', ''))}</textarea>
    </div>
    ${r.showModel ? modelReport(c, a) : ''}`;
    $$('[data-m]', m).forEach(i => i.oninput = () => { meta[i.dataset.m] = i.value; save(); });
    $('#stName').oninput = e => { st.name = e.target.value; save(); $('[data-show="name"]', m).textContent = st.name || '—'; };
    $('#stRoll').oninput = e => { st.roll = e.target.value; save(); $('[data-show="roll"]', m).textContent = st.roll || '—'; };
    $('#print').onclick = () => window.print();
    $('#model').onclick = () => { r.showModel = !r.showModel; save(); render(); };
    $('#savePdf').onclick = savePdf;
    const g2 = $('#goCase2'); if (g2) g2.onclick = () => { stopDip(); state.caseId = 'case2'; state.tab = 'case'; save(); render(); window.scrollTo(0, 0); };
    const go = $('#goOther'); if (go) go.onclick = () => { stopDip(); state.caseId = other; save(); render(); window.scrollTo(0, 0); };
  }

  /* ---------- PDF (jsPDF, bundled in vendor/) ---------- */
  // The built-in PDF fonts use Windows-1252, so replace the few characters outside it.
  const PDF_CHARS = { '≥': '>=', '≤': '<=', '→': '->', '←': '<-', '✓': 'Yes', '✗': 'No', '≈': '~', '−': '-', '–': '-', 'β': 'beta-', '₂': '2', '₄': '4', '²': '2', '⁺': '+', '·': '-', '…': '...', '≫': '>>', '¾': '3/4' };
  const pdfText = v => String(v == null ? '' : v).replace(/[^\x00-\x7E]/g, ch => PDF_CHARS[ch] != null ? PDF_CHARS[ch] : ('°µ’‘“”—éü×±'.includes(ch) ? ch : '?'));

  function savePdf() {
    const msg = $('#pdfMsg'), st = state.student;
    const say = (cls, html) => { msg.innerHTML = `<div class="fb ${cls} small">${html}</div>`; };
    if (!st.roll || !st.roll.trim()) { say('bad', 'Enter your <b>roll number</b> before saving the report.'); voice.say('Enter your roll number before saving the report.'); $('#stRoll').focus(); return; }
    const lib = window.jspdf && window.jspdf.jsPDF;
    if (!lib) { say('bad', 'The PDF library did not load. Use <b>Print this page</b> and choose “Save as PDF” instead.'); return; }
    const doc = new lib({ unit: 'mm', format: 'a4' });
    const W = 210, M = 14, CW = W - 2 * M, BOTTOM = 284;
    let y = M;
    const need = h => { if (y + h > BOTTOM) { doc.addPage(); y = M; } };
    const text = (t, x, size, style, colour) => { doc.setFont('helvetica', style || 'normal'); doc.setFontSize(size || 10); doc.setTextColor.apply(doc, colour || [29, 36, 51]); doc.text(pdfText(t), x, y); };
    const para = (t, size, style) => {
      doc.setFont('helvetica', style || 'normal'); doc.setFontSize(size || 10); doc.setTextColor(29, 36, 51);
      doc.splitTextToSize(pdfText(t), CW).forEach(line => { need(5); doc.text(line, M, y); y += (size || 10) * 0.45; });
    };
    const heading = (t, size) => { need(12); y += 3; text(t, M, size || 12, 'bold', [91, 63, 150]); y += 2; doc.setDrawColor(225, 220, 234); doc.line(M, y, W - M, y); y += 5; };
    // simple wrapped table
    const table = (cols, widths, rows) => {
      const pad = 1.6, lh = 3.9;
      const draw = (cells, head, okFlag) => {
        doc.setFont('helvetica', head ? 'bold' : 'normal'); doc.setFontSize(head ? 8.5 : 9);
        const lines = cells.map((c, i) => doc.splitTextToSize(pdfText(c), widths[i] - 2 * pad));
        const h = Math.max.apply(null, lines.map(l => l.length)) * lh + 2 * pad;
        need(h);
        if (head) { doc.setFillColor(247, 244, 252); doc.rect(M, y, CW, h, 'F'); }
        let x = M;
        lines.forEach((l, i) => {
          const isMark = !head && i === cells.length - 1 && okFlag != null;
          doc.setTextColor.apply(doc, isMark ? (okFlag ? [47, 122, 91] : [163, 49, 63]) : head ? [79, 91, 110] : [29, 36, 51]);
          if (isMark) doc.setFont('helvetica', 'bold');
          doc.text(l, x + pad, y + pad + 3); x += widths[i];
          if (isMark) doc.setFont('helvetica', 'normal');
        });
        y += h; doc.setDrawColor(225, 220, 234); doc.line(M, y, W - M, y);
      };
      draw(cols, true);
      rows.forEach(rw => draw(rw.cells, false, rw.ok));
      y += 4;
    };

    const m1 = marksFor('case1'), m2 = marksFor('case2'), gOk = m1.ok + m2.ok, gTot = m1.tot + m2.tot;
    text('MBBS Biochemistry - Experiment 10', M, 10, 'bold', [79, 91, 110]); y += 6;
    text('Qualitative Analysis of Abnormal Urine: Virtual Lab Report', M, 15, 'bold'); y += 9;
    const kv = (k, v, x) => { doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(29, 36, 51); doc.text(pdfText(k), x, y); const w = doc.getTextWidth(pdfText(k)); doc.setFont('helvetica', 'normal'); doc.text(pdfText(v), x + w + 3, y); };
    kv('Student name:', st.name || '-', M); kv('Roll number:', st.roll.trim(), 120); y += 6;
    kv('Date:', new Date().toLocaleString(), M); y += 8;
    need(28); doc.setFillColor(227, 244, 236); doc.roundedRect(M, y - 5, CW, 22, 2, 2, 'F');
    text('Marks', M + 3, 11, 'bold', [47, 122, 91]);
    text(`Case I: ${m1.ok} / ${m1.tot}     Case II: ${m2.ok} / ${m2.tot}`, M + 30, 11, 'normal');
    y += 7;
    text(`Grand total: ${gOk} / ${gTot}  (${gTot ? Math.round(100 * gOk / gTot) : 0}%)`, M + 30, 12.5, 'bold', [47, 122, 91]);
    y += 6;
    text('1 mark per item: physical findings incl. specific gravity, each test observation and inference, each dipstick pad. Interpretation is assessed by the faculty.', M + 3, 7.5, 'normal', [79, 91, 110]);
    y += 10;

    [m1, m2].forEach(mk => {
      const c = mk.c, r = mk.r, meta = r.meta || {};
      if (mk.id === 'case2') { doc.addPage(); y = M; }
      heading(`${CASE_LABEL[mk.id]} (${c.title}): ${meta.name || c.patient.name}, ${meta.age || c.patient.age}, ${meta.gender || c.patient.gender}`, 12.5);
      para('Chief complaints: ' + (meta.complaints || c.patient.complaints), 9.5);
      const coll = (COLLECT.find(x => x[0] === r.collection) || [, 'not selected'])[1];
      para(`Specimen: ${coll}.  Room temperature ${state.env.troom} °C; urinometer calibrated at ${state.env.tcal} °C.  Marks for this case: ${mk.ok} / ${mk.tot}`, 9.5, 'bold');
      y += 2;
      const widths = [48, 58, 58, 18];
      const rowsOf = list => list.map(x => ({ cells: [x.item, x.mine || 'not recorded', x.expected, x.ok ? '1' : '0'], ok: x.ok }));
      heading(`Physical examination  (${mk.sec.physical.ok} / ${mk.sec.physical.tot})`, 11);
      table(['Property', 'Your entry', 'Expected', 'Mark'], widths, rowsOf(mk.rows.physical));
      heading(`Chemical examination  (${mk.sec.chemical.ok} / ${mk.sec.chemical.tot})`, 11);
      table(['Test', 'Your entry', 'Expected', 'Mark'], widths, rowsOf(mk.rows.chemical));
      heading(`Dipstick (Multistix)  (${mk.sec.dipstick.ok} / ${mk.sec.dipstick.tot})`, 11);
      table(['Pad', 'Your reading', 'Expected', 'Mark'], widths, rowsOf(mk.rows.dipstick));
      heading('Interpretation (student)', 11);
      para(meta.interp && meta.interp.trim() ? meta.interp : '(not written)', 10);
    });
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(79, 91, 110);
      doc.text(pdfText(`Roll no. ${st.roll.trim()} - ${st.name || ''}`), M, 292);
      doc.text(`Page ${i} of ${n}`, W - M, 292, { align: 'right' });
    }
    const safe = st.roll.trim().replace(/[^A-Za-z0-9_-]+/g, '_');
    doc.save(`Expt10_Urine_Report_${safe}.pdf`);
    say('ok', `Saved <b>Expt10_Urine_Report_${esc(safe)}.pdf</b> with roll number ${esc(st.roll.trim())} and marks ${gOk} / ${gTot}.`);
    voice.say(`Report saved as a PDF, with your roll number and marks: ${gOk} out of ${gTot}. Submit the PDF as instructed by your teacher.`);
  }

  function expectedRows(a) {
    const ph = a.physical;
    return `
      <tr><td>Volume</td><td colspan="2">${esc(E.VOLUME_OPTS[ph.volume])} — ${a.sample.volume24h} mL/24 h</td></tr>
      <tr><td>Colour</td><td colspan="2">${esc(E.COLOUR_OPTS[ph.colour])}</td></tr>
      <tr><td>Appearance</td><td colspan="2">${esc(E.APPEAR_OPTS[ph.appearance])}</td></tr>
      <tr><td>Odour</td><td colspan="2">${esc(E.ODOUR_OPTS[ph.odour])}</td></tr>
      <tr><td>pH</td><td colspan="2">${a.sample.pH.toFixed(1)} (${esc(E.REACTION_OPTS[ph.reaction])})</td></tr>
      <tr><td>Specific gravity</td><td colspan="2">observed ${ph.sg.observed.toFixed(3)} at ${a.env.troom} °C → corrected ${ph.sg.corrected.toFixed(3)} (${esc(ph.sgClass)})</td></tr>
      ${TEST_ORDER.map(k => `<tr><td>${esc(E.TESTS[k].name)}</td><td>${esc(a.chem[k].observation)}</td><td><b>${esc(a.chem[k].inference)}</b></td></tr>`).join('')}
      <tr><td>Dipstick</td><td colspan="2">${esc(E.dipReadingText(a.dip))}</td></tr>`;
  }

  function modelReport(c, a) {
    return `<div class="report" style="margin-top:16px;background:#fbfaff">
      <h2>Model report: expected results</h2>
      <p class="small muted" style="text-align:center">${esc(c.patient.name)} · ${esc(c.patient.age)} · ${esc(c.patient.gender)}. Results computed from the sample composition.</p>
      <table><tr><th>Parameter / test</th><th>Observation</th><th>Inference</th></tr>${expectedRows(a)}</table>
      <h3 style="margin-top:14px">Interpretation</h3><p>${esc(c.interpretation || '—')}</p></div>`;
  }

  render();
  showIntro();
})();
