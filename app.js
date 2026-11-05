/* Virtual Urine Lab — user interface. All results come from engine.js */
(function () {
  'use strict';
  const E = window.UrineEngine;
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const later = (instant, fn, ms) => instant ? fn() : setTimeout(fn, ms);

  /* ------------------------------------------------------------ state */
  const KEY = 'virtual-urine-lab-exp10-v1';
  const state = { caseId: 'case1', tab: 'case', env: { troom: 28, tcal: 15 }, custom: null, rec: {} };
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s) Object.assign(state, s, { tab: s.tab || 'case' }); } catch (e) { /* storage unavailable */ }
  if (state.caseId === 'custom' && !state.custom) state.caseId = 'case1';
  if (state.calib && Object.keys(state.calib).length) E.Rx.setParams(state.calib);
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ } }

  const R = () => state.rec[state.caseId] || (state.rec[state.caseId] = { physical: {}, select: {}, chem: {}, bench: {}, dip: {}, meta: {} });
  const C = () => state.caseId === 'custom' ? state.custom : E.CASES[state.caseId];
  const A = () => E.analyse(C().sample, state.env);

  const TABS = [
    ['case', '1 · Case & specimen'], ['physical', '2 · Physical exam'], ['chemical', '3 · Chemical tests'],
    ['dipstick', '4 · Dipstick'], ['report', '5 · Report'], ['reactions', 'Reaction simulator'], ['verify', 'Verify in lab'], ['faculty', 'Faculty · Wet-lab match']
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
    if (state.custom) opts.push(['custom', 'Custom sample']);
    cp.innerHTML = opts.map(([id, l]) => `<button class="${state.caseId === id ? 'on' : ''}" data-case="${id}">${esc(l)}</button>`).join('');
    $$('button', cp).forEach(b => b.onclick = () => { stopDip(); state.caseId = b.dataset.case; save(); render(); });

    $('#tabs').innerHTML = TABS.map(([id, l]) =>
      `<button class="${state.tab === id ? 'on' : ''}" data-tab="${id}">${l}${['case', 'physical', 'chemical', 'dipstick'].includes(id) ? `<span class="dot ${isDone(id) ? 'done' : ''}"></span>` : ''}</button>`).join('');
    $$('#tabs button').forEach(b => b.onclick = () => { stopDip(); state.tab = b.dataset.tab; save(); render(); window.scrollTo(0, 0); });

    const m = $('#main');
    const ctx = { state, E, save, render, A, C };
    const ext = window.LabViews || {};
    ({ case: viewCase, physical: viewPhysical, chemical: viewChemical, dipstick: viewDipstick, report: viewReport, faculty: viewFaculty,
      reactions: mm => ext.reactions(mm, ctx), verify: mm => ext.verify(mm, ctx) })[state.tab](m);
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
      <div class="flex"><button id="goPhys">Proceed to physical examination →</button></div>
    </section>`;
    const fb = () => {
      const v = r.collection; if (!v) return;
      const ok = c.collection.correct.includes(v) || c.collection.correct.includes('*');
      $('#collFb').innerHTML = `<div class="fb ${ok ? 'ok' : 'bad'}"><b>${ok ? 'Appropriate.' : 'Not the best choice.'}</b> ${esc(c.collection.why)}</div>`;
    };
    $('#collCheck').onclick = () => { const v = $('input[name=coll]:checked'); if (!v) return; r.collection = v.value; save(); fb(); render(); };
    fb();
    $('#goPhys').onclick = () => { state.tab = 'physical'; save(); render(); };
  }

  /* ============================================================ 2. PHYSICAL */
  const UI_COLOURS = { 4: '#e2513a', 5: '#ee8a2c', 6: '#f0c132', 7: '#7bb54a', 8: '#2f9c8a', 9: '#2f68b0' };
  function phColour(p) { const lo = Math.max(4, Math.min(8, Math.floor(p))); return E.mix(UI_COLOURS[lo], UI_COLOURS[lo + 1], p - lo); }
  const ODOUR_TEXT = ['A faint aromatic smell, as in normal fresh urine.', 'A sweet, fruity smell, like nail-polish remover or over-ripe apples.', 'A pungent smell of ammonia.'];
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
    // overview: cylinder + float
    let ov = `<svg viewBox="0 0 170 300" width="160" aria-label="urinometer in cylinder">
      <rect x="40" y="70" width="80" height="215" fill="${liq}" opacity=".9"/>
      <path d="M38 20 L38 287 L122 287 L122 20" fill="none" stroke="#6b7385" stroke-width="3"/>
      <rect x="74" y="18" width="12" height="120" rx="5" fill="#f7f7fb" stroke="#6b7385"/>
      ${Array.from({ length: 12 }, (_, i) => `<line x1="74" x2="80" y1="${30 + i * 9}" y2="${30 + i * 9}" stroke="#4f5b6e" stroke-width=".8"/>`).join('')}
      <ellipse cx="80" cy="185" rx="22" ry="45" fill="#f7f7fb" stroke="#6b7385"/>
      <path d="M68 228 Q80 262 92 228 Z" fill="#9aa1ad" stroke="#6b7385"/>
      <circle cx="80" cy="244" r="7" fill="#5d6470"/>
      <line x1="122" y1="70" x2="150" y2="60" stroke="#5b3f96" stroke-dasharray="3 3"/>
      <text x="128" y="52" font-size="10" fill="#5b3f96">zoom</text>
      <text x="80" y="300" text-anchor="middle" font-size="10" fill="#4f5b6e">urinometer cylinder</text></svg>`;
    // zoom of stem around the meniscus; scale values INCREASE downward
    const px = 22, cy = 140; let ticks = '';
    for (let i = -6; i <= 6; i++) {
      const v = Math.round((obs + i * 0.001) * 1000) / 1000, y = cy + i * px;
      const major = Math.round(v * 1000) % 5 === 0;
      ticks += `<line x1="70" x2="${major ? 112 : 96}" y1="${y}" y2="${y}" stroke="#1d2433" stroke-width="${major ? 1.6 : 1}"/>`;
      if (major) ticks += `<text x="118" y="${y + 4}" font-size="13" font-weight="700" fill="#1d2433">${v.toFixed(3)}</text>`;
    }
    const zm = `<svg viewBox="0 0 230 280" width="230" aria-label="zoomed urinometer stem">
      <defs><clipPath id="zc"><rect x="6" y="6" width="218" height="268" rx="12"/></clipPath></defs>
      <g clip-path="url(#zc)">
        <rect x="0" y="0" width="230" height="280" fill="#fbfaff"/>
        <path d="M0 ${cy} L60 ${cy} Q66 ${cy} 68 ${cy - 9} L68 ${cy - 9} L176 ${cy - 9} Q178 ${cy} 184 ${cy} L230 ${cy} L230 280 L0 280 Z" fill="${liq}" opacity=".85"/>
        <rect x="68" y="0" width="108" height="280" fill="#f4f6fb" opacity=".88" stroke="#6b7385"/>
        ${ticks}
        <rect x="68" y="${cy}" width="108" height="${280 - cy}" fill="${liq}" opacity=".25"/>
        <text x="73" y="22" font-size="11" fill="#5b3f96" font-weight="700">calibrated ${state.env.tcal} °C</text>
      </g>
      <rect x="6" y="6" width="218" height="268" rx="12" fill="none" stroke="#5b3f96" stroke-width="2"/></svg>`;
    return ov + zm;
  }

  function urinometerDiagram() {
    return `<svg viewBox="0 0 260 300" width="240" aria-label="labelled diagram of urinometer">
      <rect x="112" y="10" width="16" height="150" rx="6" fill="#fff" stroke="#1d2433"/>
      ${Array.from({ length: 13 }, (_, i) => `<line x1="112" x2="${i % 5 === 0 ? 124 : 119}" y1="${22 + i * 10}" y2="${22 + i * 10}" stroke="#1d2433"/>`).join('')}
      <ellipse cx="120" cy="200" rx="30" ry="45" fill="#fff" stroke="#1d2433"/>
      <path d="M104 238 Q120 285 136 238" fill="#cfd3da" stroke="#1d2433"/><circle cx="120" cy="262" r="9" fill="#555"/>
      <g font-size="11" fill="#1d2433">
        <line x1="128" y1="22" x2="170" y2="22" stroke="#5b3f96"/><text x="173" y="25">1.000 (top)</text>
        <line x1="128" y1="142" x2="170" y2="142" stroke="#5b3f96"/><text x="173" y="145">1.060 (bottom)</text>
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
            <button id="dipPh" class="ghost">Dip pH paper in urine and compare</button>
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
      <div class="grid3">
        <div>
          <div class="note small">Fill the cylinder ¾ with urine. Remove froth with filter paper. Float the urinometer with a gentle spin so it does not touch the sides. Read the scale at the <b>lower meniscus</b>, at eye level.</div>
          <label class="f">Room temperature (thermometer), °C</label>
          <input type="number" id="troom" value="${state.env.troom}" step="1" min="10" max="45" style="width:110px">
          <div class="small muted">Set this to your lab's actual thermometer reading today. The observed reading changes with it, as it does on the bench.</div>
          <label class="f">Calibration temperature (marked on stem), °C</label>
          <input type="number" id="tcal" value="${state.env.tcal}" step="1" min="4" max="30" style="width:110px">
        </div>
        <div class="flex" style="justify-content:center">${urinometerSVG(a)}</div>
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
    </section>`;

    const bind = (id, key) => { $('#' + id).onchange = e => { p[key] = e.target.value; save(); }; };
    bind('pVol', 'volume'); bind('pCol', 'colour'); bind('pApp', 'appearance'); bind('pOd', 'odour'); bind('pPh', 'pH'); bind('pReac', 'reaction');
    ['sgObs', 'sgTd', 'sgCor'].forEach(id => $('#' + id).oninput = e => { p[id] = e.target.value; save(); });
    $('#waft').onclick = () => { p.wafted = true; save(); $('#odourTxt').textContent = ODOUR_TEXT[ph.odour]; };
    $('#dipPh').onclick = () => { p.dipped = true; save(); $('#phPad').setAttribute('fill', phColour(a.sample.pH)); };
    const envChange = () => {
      const tr = parseFloat($('#troom').value), tc = parseFloat($('#tcal').value);
      if (!isNaN(tr)) state.env.troom = tr; if (!isNaN(tc)) state.env.tcal = tc;
      p.checked = false; save(); render();
    };
    $('#troom').onchange = envChange; $('#tcal').onchange = envChange;
    $('#recPhys').onclick = () => { p.checked = true; save(); showPhysFb(); render(); };
    if (p.checked) showPhysFb();

    function showPhysFb() {
      const a2 = A(), ph2 = a2.physical, sg = ph2.sg;
      const nearPh = PH_OPTS.reduce((bi, v, i) => Math.abs(parseFloat(v) - a2.sample.pH) < Math.abs(parseFloat(PH_OPTS[bi]) - a2.sample.pH) ? i : bi, 0);
      const num = v => parseFloat(String(v || '').replace(',', '.'));
      const rows = [
        ['Volume', p.volume, ph2.volume, E.VOLUME_OPTS, 'Polyuria >2500 mL/24 h (diabetes mellitus or insipidus, diuretics). Oliguria <500 mL/24 h (dehydration, haemorrhage, shock, acute glomerulonephritis, obstruction). Anuria <100 mL/day (shock, renal failure).'],
        ['Colour', p.colour, ph2.colour, E.COLOUR_OPTS, 'Smoky red: RBCs. Yellowish-brown or greenish: bile pigments. Dark brown or black: haemoglobinuria or alkaptonuria. Dark yellow: concentrated urine or jaundice. Pale: dilute urine (polyuria).'],
        ['Appearance', p.appearance, ph2.appearance, E.APPEAR_OPTS, 'Smoky: RBCs (haematuria). Turbid: pus, bacteria or phosphates. Milky: chyluria.'],
        ['Odour', p.odour, ph2.odour, E.ODOUR_OPTS, 'Fruity: ketone bodies (ketoacidosis). Ammoniacal: urea-splitting organisms on standing. Mousy: PKU. Maple syrup: MSUD.'],
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
            T.tint(snap.hex); say('Boiling… ' + times[k] + ' s · ' + (snap.f * 100).toFixed(0) + '% Cu²⁺ reduced');
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
    ['hay', 'Hay’s sulphur test'], ['fouchet', 'Fouchet’s test'], ['benzidine', 'Benzidine test'],
    ['molisch', 'Molisch’s test'], ['biuret', 'Biuret test'], ['seliwanoff', 'Seliwanoff’s test'], ['barfoed', 'Barfoed’s test'], ['ehrlich', 'Ehrlich’s aldehyde test']
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
    <section class="card"><div class="flex"><button id="goDip">Proceed to dipstick analysis →</button></div></section>`;
    $$('select[data-sel]').forEach(s => s.onchange = () => { r.select[s.dataset.sel] = s.value; save(); });
    const selFb = () => {
      let ok = 0;
      CONSTITUENTS.forEach(([k, , right]) => { const g = r.select[k] === right; if (g) ok++; $(`[data-selm="${k}"]`).innerHTML = r.select[k] ? `<span class="mark ${g ? 'ok' : 'bad'}">${g ? '✓' : '✗ ' + esc(SELECT_OPTS.find(o => o[0] === right)[1])}</span>` : ''; });
      $('#selFb').innerHTML = `<div class="fb ${ok === 6 ? 'ok' : 'info'}">${ok} / 6 correct. The benches below follow the procedures in the lab manual.</div>`;
    };
    $('#selCheck').onclick = () => { r.selChecked = true; save(); selFb(); };
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
    const say = t => { $('[data-status]', card).textContent = t; };
    const stepsEl = $('[data-steps]', card);
    let done = r.bench[k] || 0;

    function drawSteps() {
      stepsEl.innerHTML = def.steps.map((s, i) => `<button class="step ${i < done ? 'done' : ''} ${i === done ? 'next' : ''}" data-i="${i}" ${i > done ? 'disabled' : ''}><span class="n">${i < done ? '✓' : i + 1}</span><span>${esc(s[0])}</span></button>`).join('');
      $$('button.step', stepsEl).forEach(b => b.onclick = () => {
        const i = +b.dataset.i; if (i !== done) return;
        def.steps[i][1](T, a, res, false, say, P); done = i + 1; r.bench[k] = done; save(); drawSteps(); syncRec();
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
      if (obsSel.value === '' || infSel.value === '') { $('[data-fb]', card).innerHTML = '<div class="fb bad small">Select both an observation and an inference.</div>'; return; }
      r.chem[k] = { obs: +obsSel.value, inf: +infSel.value }; save(); showFb(); render0Dots();
    };
    $('[data-reset]', card).onclick = () => { r.bench[k] = 0; delete r.chem[k]; save(); const fresh = makeBench(k, A(), r); card.replaceWith(fresh); render0Dots(); };

    function showFb() {
      const rc = r.chem[k], go = rc.obs === res.grade, gi = rc.inf === res.grade;
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
        <div class="flex" style="margin-top:10px"><button id="dipCheck">Record & check readings</button></div>
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
      $$('button.step', stepsEl).forEach(b => b.onclick = () => { if (+b.dataset.i !== sdone) return; sdone++; d.stepsDone = sdone; save(); if (sdone === 3) startDip(); drawSteps(); });
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
      if (t < 40) { c.className = 'timer'; msg.textContent = 'Wait. Reactions are still developing (read from 40 s).'; }
      else if (t <= 120) { c.className = 'timer ok'; msg.innerHTML = '<b>READ NOW</b>, within the 40 s – 2 min window.'; }
      else { c.className = 'timer late'; msg.textContent = 'Past 2 minutes: colour changes now have no diagnostic value. Use a fresh strip.'; }
    };
    function startDip() {
      stopDip(); dip.t = 0; dip.last = Date.now(); drawStrip();
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
    $('#dipCheck').onclick = () => { d.checked = true; save(); showDipFb(); render0Dots(); };
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
  function viewReport(m) {
    const c = C(), a = A(), r = R(), p = r.physical, meta = r.meta;
    const f = (k, def) => meta[k] != null ? meta[k] : def;
    const pick = (opts, v) => v === undefined || v === '' ? '' : opts[v];
    const markP = (v, t) => v === undefined || v === '' ? '' : `<span class="mark ${Number(v) === t ? 'ok' : 'bad'}">${Number(v) === t ? '✓' : '✗'}</span>`;
    const PH = ['4.5', '5.0', '5.5', '6.0', '6.5', '7.0', '7.5', '8.0', '8.5'];
    const nearPh = PH.reduce((bi, v, i) => Math.abs(parseFloat(v) - a.sample.pH) < Math.abs(parseFloat(PH[bi]) - a.sample.pH) ? i : bi, 0);
    const collLabel = (COLLECT.find(x => x[0] === r.collection) || [, ''])[1];
    let score = 0, total = 0;
    const tally = (v, t) => { total++; if (v !== undefined && v !== '' && Number(v) === t) score++; };
    tally(p.volume, a.physical.volume); tally(p.colour, a.physical.colour); tally(p.appearance, a.physical.appearance); tally(p.odour, a.physical.odour); tally(p.pH, nearPh);
    TEST_ORDER.forEach(k => { const rc = r.chem[k]; total += 2; if (rc) { if (rc.obs === a.chem[k].grade) score++; if (rc.inf === a.chem[k].grade) score++; } });

    m.innerHTML = `
    <div class="flex noprint" style="margin-bottom:12px">
      <button id="print">Print / save as PDF</button>
      <button class="ghost" id="model">${r.showModel ? 'Hide' : 'Show'} model (expected) report</button>
      <span class="small muted">Your score from recorded findings: <b>${score} / ${total}</b></span>
    </div>
    <div class="report">
      <div class="small muted" style="text-align:center">EXPERIMENT NUMBER: 10 · QUALITATIVE ANALYSIS OF ABNORMAL URINE · ${esc(c.title)}</div>
      <h2>Urine analysis report</h2>
      <div class="hd">
        <div><b>Name:</b> <input type="text" data-m="name" value="${esc(f('name', c.patient.name))}"></div>
        <div><b>Age:</b> <input type="text" data-m="age" value="${esc(f('age', c.patient.age))}" style="width:110px"></div>
        <div><b>Gender:</b> <input type="text" data-m="gender" value="${esc(f('gender', c.patient.gender))}" style="width:110px"></div>
        <div style="grid-column:1/-1"><b>Chief complaints:</b> <input type="text" data-m="complaints" value="${esc(f('complaints', c.patient.complaints))}" style="width:100%"></div>
        <div style="grid-column:1/-1"><b>Specimen:</b> ${esc(collLabel || '—')} &nbsp; <b>Date:</b> <input type="text" data-m="date" value="${esc(f('date', new Date().toLocaleDateString()))}" style="width:130px"> &nbsp; <b>Done by:</b> <input type="text" data-m="student" value="${esc(f('student', ''))}" placeholder="student name / roll no."></div>
      </div>
      <h3>Physical characteristics</h3>
      <div class="kv">
        <div>Volume</div><div>${esc(pick(E.VOLUME_OPTS, p.volume))} (${c.sample.volume24h} mL/24 h) ${markP(p.volume, a.physical.volume)}</div>
        <div>Colour</div><div>${esc(pick(E.COLOUR_OPTS, p.colour))} ${markP(p.colour, a.physical.colour)}</div>
        <div>Appearance</div><div>${esc(pick(E.APPEAR_OPTS, p.appearance))} ${markP(p.appearance, a.physical.appearance)}</div>
        <div>Odour</div><div>${esc(pick(E.ODOUR_OPTS, p.odour))} ${markP(p.odour, a.physical.odour)}</div>
        <div>pH</div><div>${esc(pick(PH, p.pH))} ${p.reaction !== undefined && p.reaction !== '' ? '(' + esc(E.REACTION_OPTS[p.reaction]) + ')' : ''} ${markP(p.pH, nearPh)}</div>
        <div>Corrected specific gravity</div><div>${p.sgCor ? esc(p.sgCor) : ''} ${p.sgObs ? `<span class="small muted">(observed ${esc(p.sgObs)} at ${state.env.troom} °C; urinometer calibrated at ${state.env.tcal} °C)</span>` : ''}</div>
      </div>
      <h3 style="margin-top:16px">Chemical characteristics</h3>
      <table><tr><th>Test</th><th>Observation</th><th>Inference</th></tr>
      ${TEST_ORDER.map(k => { const rc = r.chem[k], t = E.TESTS[k]; return `<tr><td>${esc(t.name)}</td><td>${rc ? esc(t.obs[rc.obs]) + ' ' + `<span class="mark ${rc.obs === a.chem[k].grade ? 'ok' : 'bad'}">${rc.obs === a.chem[k].grade ? '✓' : '✗'}</span>` : '<i class="muted">not performed</i>'}</td><td>${rc ? esc(t.inf[rc.inf]) + ' ' + `<span class="mark ${rc.inf === a.chem[k].grade ? 'ok' : 'bad'}">${rc.inf === a.chem[k].grade ? '✓' : '✗'}</span>` : ''}</td></tr>`; }).join('')}
      </table>
      <h3 style="margin-top:16px">Dipstick (Multistix)</h3>
      <p class="small">${r.dip && r.dip.checked ? esc(E.DIP_ORDER.map(k => E.DIP[k].label + ': ' + (r.dip.sel[k] != null ? E.DIP[k].levels[r.dip.sel[k]] : '—')).join('; ')) : '<i class="muted">not recorded</i>'}</p>
      <h3>Interpretation</h3>
      <textarea data-m="interp" rows="6" style="width:100%" placeholder="Write your interpretation: abnormal findings → likely condition → suggested correlation.">${esc(f('interp', ''))}</textarea>
    </div>
    ${r.showModel ? modelReport(c, a) : ''}`;
    $$('[data-m]', m).forEach(i => i.oninput = () => { meta[i.dataset.m] = i.value; save(); });
    $('#print').onclick = () => window.print();
    $('#model').onclick = () => { r.showModel = !r.showModel; save(); render(); };
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
      <p class="small muted" style="text-align:center">${esc(c.patient.name)} · ${esc(c.patient.age)} · ${esc(c.patient.gender)}. Results computed from the sample composition and identical to the prepared wet-lab sample.</p>
      <table><tr><th>Parameter / test</th><th>Observation</th><th>Inference</th></tr>${expectedRows(a)}</table>
      <h3 style="margin-top:14px">Interpretation</h3><p>${esc(c.interpretation || '—')}</p></div>`;
  }

  /* ============================================================ FACULTY */
  const FIELDS = [
    ['volume24h', '24-h volume (mL)', 1], ['pH', 'pH', 0.5], ['sgBase', 'Ionic SG (no glucose/protein)', 0.001],
    ['albumin', 'Albumin (mg/dL)', 10], ['rbc', 'Intact RBC (/µL)', 10], ['freeHb', 'Free haemoglobin (mg/dL)', 0.1],
    ['glucose', 'Glucose (g/dL = %)', 0.1], ['acac', 'Acetoacetate (mg/dL)', 1], ['acetone', 'Acetone (mg/dL)', 1], ['bhb', 'β-hydroxybutyrate (mg/dL)', 10],
    ['bileSalts', 'Bile salts (mg/dL)', 1], ['bilirubin', 'Bilirubin (mg/dL)', 0.1]
  ];

  function viewFaculty(m) {
    const draft = state.facDraft || (state.facDraft = Object.assign({ name: 'Unknown sample A', age: '', gender: '', complaints: '' }, E.NORMAL));
    m.innerHTML = `
    <section class="card">
      <h2>How the simulation matches the wet lab</h2>
      <p class="small">No test result is hard-coded. Each case is defined by the <b>composition</b> of its urine (albumin mg/dL, RBC/µL, glucose g/dL, acetoacetate mg/dL …). Every tube, strip pad and urinometer reading is computed from that composition using the detection limit and grading bands of the real test. Prepare the sample below on the bench and the tubes behave the same way. The room-temperature setting (currently <b>${state.env.troom} °C</b>, urinometer calibrated at <b>${state.env.tcal} °C</b>) moves the observed SG exactly as the real urinometer does.</p>
      <div class="flex"><label class="small">Lab room temperature °C <input type="number" id="fTroom" value="${state.env.troom}" style="width:80px"></label>
      <label class="small">Urinometer calibration °C <input type="number" id="fTcal" value="${state.env.tcal}" style="width:80px"></label></div>
    </section>
    ${['case1', 'case2'].map(id => recipeCard(id)).join('')}
    <section class="card">
      <h2>Detection limits and grading used by the model</h2>
      <table class="small">
        <tr><th>Test</th><th>Responds to</th><th>Approx. detection limit</th><th>Grading</th></tr>
        <tr><td>Heat coagulation</td><td>All proteins incl. Hb (phosphates clear with acid)</td><td>≈10 mg/dL</td><td>&lt;30 trace · 30–300 +/++ · &gt;300 heavy</td></tr>
        <tr><td>Sulphosalicylic acid</td><td>All proteins</td><td>≈5 mg/dL</td><td>&lt;30 opalescent · 30–300 turbid · &gt;300 flocculent</td></tr>
        <tr><td>Benedict's</td><td>Reducing sugars</td><td>≈0.1 g/dL</td><td>green 0.5% · yellow 1% · orange 1.5% · brick red ≥2% (manual table)</td></tr>
        <tr><td>Rothera's</td><td>Acetoacetate ≫ acetone; not β-HB</td><td>AcAc ≈2 mg/dL; acetone ≈10 mg/dL</td><td>&lt;20 eq. faint ring · ≥20 deep permanganate ring</td></tr>
        <tr><td>Hay's</td><td>Bile salts (surface tension)</td><td>≈10 mg/dL (0.01%)</td><td>sinks / floats</td></tr>
        <tr><td>Fouchet's</td><td>Conjugated bilirubin</td><td>≈0.1 mg/dL</td><td>green spot, deeper with more</td></tr>
        <tr><td>Benzidine</td><td>Haem peroxidase (RBC or free Hb)</td><td>≈0.015 mg/dL Hb ≈ 5 RBC/µL</td><td>faint / strong blue-green</td></tr>
        <tr><td>Dipstick</td><td colspan="3">Protein (albumin) neg/trace 15/30/100/300/≥2000 mg/dL · glucose 100/250/500/1000/≥2000 mg/dL · ketone (AcAc) 5/15/40/80/160 mg/dL · blood trace→large ≈ 10/25/80/200 RBC/µL · SG from ionic solutes only (−0.005 if pH ≥ 6.5; +0.003 if albumin ≥ 100 mg/dL)</td></tr>
      </table>
      <p class="small muted">The limits are typical literature and package-insert values. Borderline results depend on reagent age, heating time and technique, so run each prepared sample once before the class. If a borderline reading differs on your bench, adjust the composition to match, then use the Custom builder to confirm the prediction.</p>
    </section>
    <section class="card">
      <h2>Custom / unknown sample builder</h2>
      <p class="small">Enter the composition of any sample you prepare. The predicted wet-lab result for every test updates live. "Run on virtual bench" lets students work it up like a case.</p>
      <div class="grid3">${FIELDS.map(([k, l, st]) => `<div><label class="f">${l}</label><input type="number" step="${st}" data-cf="${k}" value="${draft[k]}" style="width:100%"></div>`).join('')}
        <div><label class="f">Urine pigment</label><select data-cs="urochrome">${['pale', 'straw', 'dark'].map(v => `<option ${draft.urochrome === v ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        <div><label class="f">Pus / bacteria</label><select data-cs="pus"><option value="false">no</option><option value="true" ${draft.pus ? 'selected' : ''}>yes</option></select></div>
        <div><label class="f">Phosphates (alkaline urine)</label><select data-cs="phosphates"><option value="false">no</option><option value="true" ${draft.phosphates ? 'selected' : ''}>yes</option></select></div>
        <div><label class="f">Sample label</label><input type="text" data-ct="name" value="${esc(draft.name)}" style="width:100%"></div>
      </div>
      <div id="custPred" style="margin-top:12px"></div>
      <div class="flex" style="margin-top:10px"><button id="runCustom">Run on virtual bench →</button><button class="ghost" id="resetCustom">Reset to normal urine</button></div>
    </section>`;
    const envSet = () => { state.env.troom = parseFloat($('#fTroom').value) || state.env.troom; state.env.tcal = parseFloat($('#fTcal').value) || state.env.tcal; save(); render(); };
    $('#fTroom').onchange = envSet; $('#fTcal').onchange = envSet;
    const pred = () => {
      const a = E.analyse(draftSample(draft), state.env);
      $('#custPred').innerHTML = `<table class="small"><tr><th>Predicted (wet-lab) result</th><th>Observation</th><th>Inference</th></tr>${expectedRows(a)}</table>`;
    };
    $$('[data-cf]', m).forEach(i => i.oninput = () => { draft[i.dataset.cf] = parseFloat(i.value) || 0; save(); pred(); });
    $$('[data-cs]', m).forEach(i => i.onchange = () => { const v = i.value; draft[i.dataset.cs] = v === 'true' ? true : v === 'false' ? false : v; save(); pred(); });
    $$('[data-ct]', m).forEach(i => i.oninput = () => { draft[i.dataset.ct] = i.value; save(); });
    $('#runCustom').onclick = () => {
      state.custom = {
        id: 'custom', short: 'Custom', title: 'Custom / unknown sample',
        patient: { name: draft.name || 'Unknown sample', age: draft.age || '—', gender: draft.gender || '—', complaints: draft.complaints || 'Unknown sample for practice' },
        vignette: 'Unknown urine sample prepared by the faculty. Perform a complete abnormal-urine analysis and identify the abnormal constituents.',
        investigations: ['Urine examination'], collection: { correct: ['*'], why: 'Any properly collected, fresh specimen is acceptable for an unknown sample.' },
        sample: draftSample(draft), ancillary: null, interpretation: 'Interpret from the abnormal constituents found (see the expected-results table).'
      };
      state.rec.custom = null; delete state.rec.custom; state.caseId = 'custom'; state.tab = 'case'; save(); render(); window.scrollTo(0, 0);
    };
    $('#resetCustom').onclick = () => { state.facDraft = null; save(); render(); };
    pred();
  }
  function draftSample(d) { const s = {}; Object.keys(E.NORMAL).forEach(k => { s[k] = d[k]; }); return s; }

  function recipeCard(id) {
    const c = E.CASES[id], rc = E.RECIPES[id], a = E.analyse(rc.sampleOverride, state.env);
    return `<section class="card">
      <h2>${esc(c.title)}: wet-lab preparation <span class="tag mint">per 100 mL</span></h2>
      <p class="small"><b>Base:</b> ${esc(rc.base)}</p>
      <table class="small"><tr><th>Add</th><th>Amount / 100 mL</th><th>Gives</th></tr>${rc.add.map(x => `<tr><td>${esc(x[0])}</td><td>${esc(x[1])}</td><td>${esc(x[2])}</td></tr>`).join('')}</table>
      <p class="small"><b>Volume:</b> ${esc(rc.volumeNote)}</p>
      <ul class="small">${rc.tips.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
      <details><summary>Expected results (answer key at ${state.env.troom} °C)</summary>
        <table class="small" style="margin-top:8px"><tr><th>Parameter / test</th><th>Observation</th><th>Inference</th></tr>${expectedRows(a)}</table></details>
    </section>`;
  }

  render();
})();
