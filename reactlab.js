/* Virtual Urine Lab — Reaction simulator and Lab verification views */
(function () {
  'use strict';
  const views = window.LabViews = window.LabViews || {};
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));

  /* ------------------------------------------------------------ SVG line chart */
  function chart(spec, W, H) {
    W = W || 470; H = H || 250;
    const L = 52, Rm = 12, T = 30, B = 42, pw = W - L - Rm, ph = H - T - B;
    const all = spec.series.flatMap(s => s.pts).filter(p => isFinite(p[0]) && isFinite(p[1]));
    if (!all.length) return '';
    let x0 = Math.min(...all.map(p => p[0])), x1 = Math.max(...all.map(p => p[0]));
    let y0 = Math.min(0, ...all.map(p => p[1])), y1 = Math.max(...all.map(p => p[1]));
    if (spec.marks) spec.marks.forEach(m => { x0 = Math.min(x0, m[0]); x1 = Math.max(x1, m[0]); });
    if (x1 === x0) x1 = x0 + 1; if (y1 <= y0) y1 = y0 + 1; y1 *= 1.06;
    const X = v => L + (v - x0) / (x1 - x0) * pw, Y = v => T + ph - (v - y0) / (y1 - y0) * ph;
    const nice = (a, b) => { const st = Math.pow(10, Math.floor(Math.log10((b - a) / 4))); const m = [1, 2, 5, 10].find(k => (b - a) / (st * k) <= 6) * st; const out = []; for (let v = Math.ceil(a / m) * m; v <= b + 1e-9; v += m) out.push(+v.toPrecision(6)); return out; };
    let g = `<rect x="${L}" y="${T}" width="${pw}" height="${ph}" fill="#fbfaff" stroke="#e1dcea"/>`;
    nice(y0, y1).forEach(v => { g += `<line x1="${L}" x2="${L + pw}" y1="${Y(v)}" y2="${Y(v)}" stroke="#ece8f3"/><text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end" font-size="10" fill="#4f5b6e">${v}</text>`; });
    nice(x0, x1).forEach(v => { g += `<text x="${X(v)}" y="${T + ph + 14}" text-anchor="middle" font-size="10" fill="#4f5b6e">${v}</text>`; });
    (spec.marks || []).forEach(m => { g += `<line x1="${X(m[0])}" x2="${X(m[0])}" y1="${T}" y2="${T + ph}" stroke="#5b3f96" stroke-dasharray="4 3"/><text x="${X(m[0]) + 3}" y="${T + 11}" font-size="10" fill="#5b3f96">${esc(m[1])}</text>`; });
    spec.series.forEach(s => {
      const d = s.pts.filter(p => isFinite(p[1])).map((p, i) => (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1)).join(' ');
      g += `<path d="${d}" fill="none" stroke="${s.colour}" stroke-width="2.2" ${s.dash ? 'stroke-dasharray="5 4"' : ''}/>`;
    });
    let lx = L; const leg = spec.series.map(s => { const t = `<line x1="${lx}" x2="${lx + 16}" y1="${H - 8}" y2="${H - 8}" stroke="${s.colour}" stroke-width="2.5" ${s.dash ? 'stroke-dasharray="4 3"' : ''}/><text x="${lx + 20}" y="${H - 4}" font-size="10" fill="#1d2433">${esc(s.name)}</text>`; lx += 30 + s.name.length * 5.6; return t; }).join('');
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px" role="img" aria-label="${esc(spec.title)}">
      <text x="${L}" y="16" font-size="12" font-weight="700" fill="#1d2433">${esc(spec.title)}</text>${g}
      <text x="${L + pw / 2}" y="${T + ph + 28}" text-anchor="middle" font-size="10.5" fill="#4f5b6e">${esc(spec.x)}</text>
      <text transform="translate(12 ${T + ph / 2}) rotate(-90)" text-anchor="middle" font-size="10.5" fill="#4f5b6e">${esc(spec.y)}</text>${leg}</svg>`;
  }

  function spectrumChart(Rx, S) {
    const pts = Rx.WL.map((l, i) => [l, S[i]]);
    const strip = Rx.WL.map((l, i) => { const one = Rx.WL.map((_, j) => j === i ? 14 : 0); return `<rect x="${52 + i * (406 / Rx.WL.length)}" y="209" width="${406 / Rx.WL.length + 0.5}" height="5" fill="${Rx.spectrumToHex(one)}"/>`; }).join('');
    return chart({ title: 'Light leaving the tube (computed spectrum)', x: 'wavelength (nm)', y: 'relative intensity', series: [{ name: 'spectrum', colour: '#1d2433', pts }] }, 470, 250).replace('</svg>', strip + '</svg>');
  }

  /* ------------------------------------------------------------ REACTION SIMULATOR */
  const ORDER = ['benedict', 'heat', 'ssa', 'rothera', 'hay', 'fouchet', 'benzidine'];
  views.reactions = function (m, ctx) {
    const { state, E, save } = ctx;
    const Rx = E.Rx, s = ctx.A().sample, c = ctx.C();
    state.rxTest = state.rxTest || 'benedict';
    state.rxCtrl = state.rxCtrl || {};
    const key = state.rxTest, lab = Rx.LAB[key];
    const ctrl = state.rxCtrl[key] = state.rxCtrl[key] || {};
    lab.controls.forEach(k => { if (ctrl[k.id] == null) ctrl[k.id] = k.def; });
    const comp = [['Albumin', s.albumin, 'mg/dL'], ['RBC', s.rbc, '/µL'], ['Free Hb', s.freeHb, 'mg/dL'], ['Glucose', s.glucose, 'g/dL'], ['Acetoacetate', s.acac, 'mg/dL'], ['Acetone', s.acetone, 'mg/dL'], ['β-HB', s.bhb, 'mg/dL'], ['Bile salts', s.bileSalts, 'mg/dL'], ['Bilirubin', s.bilirubin, 'mg/dL'], ['pH', s.pH, '']];
    m.innerHTML = `
      <section class="card">
        <h2>Reaction simulator</h2>
        <p class="small">Each test is integrated from its chemistry: stoichiometry, rate laws with Arrhenius temperature dependence, acid–base equilibria, adsorption, diffusion and surface tension. Colours are rendered from the computed absorption spectrum (Beer–Lambert → CIE colour matching → screen colour). Change the conditions as you would on the bench and watch the outcome change. Every number can be checked in the wet lab on the <b>Verify in lab</b> tab.</p>
        <div class="small"><b>Sample:</b> ${esc(c.title)} · ${comp.filter(x => x[1]).map(x => `${x[0]} ${x[1]} ${x[2]}`).join(' · ') || 'normal urine'}</div>
        <div class="chips" style="margin-top:10px">${ORDER.map(k => `<button class="${k === key ? '' : 'ghost'}" data-rx="${k}">${esc(E.TESTS[k].name)}</button>`).join('')}</div>
      </section>
      <section class="card">
        <h2>${esc(lab.name)}</h2>
        <div class="grid2">
          <div>
            <h3>Reaction scheme</h3>
            <ul class="small">${lab.equations.map(e => `<li>${esc(e)}</li>`).join('')}</ul>
            ${lab.controls.length ? '<h3>Bench conditions</h3>' : ''}
            ${lab.controls.map(k => k.type === 'select'
              ? `<label class="f">${esc(k.label)}</label><select data-ctl="${k.id}">${k.options.map(o => `<option value="${o[0]}" ${ctrl[k.id] === o[0] ? 'selected' : ''}>${esc(o[1])}</option>`).join('')}</select>`
              : `<label class="f">${esc(k.label)}: <span data-val="${k.id}">${ctrl[k.id]}</span> ${esc(k.unit || '')}</label><input type="range" style="width:100%" min="${k.min}" max="${k.max}" step="${k.step}" value="${ctrl[k.id]}" data-ctl="${k.id}">`).join('')}
            ${lab.controls.length ? '<div class="flex" style="margin-top:8px"><button class="ghost small" id="rxReset">Manual’s conditions</button></div>' : ''}
          </div>
          <div id="rxOut"></div>
        </div>
        <div id="rxCharts" class="grid2" style="margin-top:12px"></div>
      </section>`;
    $$('[data-rx]', m).forEach(b => b.onclick = () => { state.rxTest = b.dataset.rx; save(); views.reactions(m, ctx); });
    const run = () => {
      const out = lab.run(s, Object.assign({}, ctrl));
      const g = out.result.grade;
      $('#rxOut', m).innerHTML = `
        <div class="flex" style="gap:14px;align-items:flex-start">${out.swatches.map(w => `<div style="text-align:center"><div style="width:84px;height:84px;border-radius:12px;border:1px solid #0002;background:${w[1]}"></div><div class="small">${esc(w[0])}</div><div class="small muted" style="font-family:Consolas,monospace">${w[1]}</div></div>`).join('')}</div>
        <table class="small" style="margin-top:10px">${out.numbers.map(n => `<tr><td>${esc(n[0])}</td><td><b>${esc(n[1])}</b> ${esc(n[2])}</td></tr>`).join('')}</table>
        <div class="fb ${g ? 'ok' : 'info'} small"><b>Observation:</b> ${esc(E.TESTS[key].obs[g])}<br><b>Inference:</b> ${esc(E.TESTS[key].inf[g])}</div>`;
      $('#rxCharts', m).innerHTML = out.charts.map(ch => `<div>${chart(ch)}</div>`).join('') + (out.spectrum ? `<div>${spectrumChart(Rx, out.spectrum)}</div>` : '');
    };
    $$('[data-ctl]', m).forEach(i => i.oninput = i.onchange = () => {
      const k = lab.controls.find(x => x.id === i.dataset.ctl);
      ctrl[k.id] = k.type === 'select' ? i.value : parseFloat(i.value);
      const v = $(`[data-val="${k.id}"]`, m); if (v) v.textContent = ctrl[k.id];
      save(); run();
    });
    const rr = $('#rxReset', m); if (rr) rr.onclick = () => { state.rxCtrl[key] = {}; save(); views.reactions(m, ctx); };
    run();
  };

  /* ------------------------------------------------------------ VERIFY IN LAB */
  views.verify = function (m, ctx) {
    const { state, E, save } = ctx;
    const Rx = E.Rx, a = ctx.A(), s = a.sample, c = ctx.C();
    state.measured = state.measured || {};
    const meas = state.measured[state.caseId] = state.measured[state.caseId] || {};
    const list = Rx.measurables(s);
    list.find(x => x.id === 'sgObs').pred = a.physical.sg.observed;
    const fmt = (x) => x.pred == null ? 'no reaction' : x.unit === 'hex' ? `<span style="display:inline-block;width:18px;height:14px;border-radius:3px;border:1px solid #0003;background:${x.pred};vertical-align:middle"></span> ${x.pred}` : Number(x.pred).toFixed(x.dp != null ? x.dp : 3) + ' ' + esc(x.unit);
    const calibOn = state.calib && Object.keys(state.calib).length;
    m.innerHTML = `
      <section class="card">
        <h2>Verify the simulation in the wet lab: ${esc(c.title)}</h2>
        <p class="small">Prepare the sample (Faculty tab recipe) or use the real specimen, do the test, and enter what you measure. Each line is scored against the model's prediction with a stated tolerance. Lines marked <b>Fit</b> can recalibrate the model from your measurement. Your bench then becomes the reference, and every other prediction updates.</p>
        <p class="small muted">Lab conditions: room ${state.env.troom} °C, urinometer calibrated at ${state.env.tcal} °C (change on the Physical exam tab).</p>
        <table class="small">
          <tr><th>Test</th><th>Quantity</th><th>How to measure</th><th>Predicted</th><th>Measured</th><th>Verdict</th><th></th></tr>
          ${list.map(x => `<tr><td>${esc(x.test)}</td><td>${esc(x.what)}</td><td>${esc(x.method)}</td><td>${fmt(x)}</td>
            <td><input type="text" data-meas="${x.id}" value="${esc(meas[x.id] || '')}" placeholder="${x.unit === 'hex' ? '#rrggbb' : 'value'}" style="width:100px"></td>
            <td data-verdict="${x.id}"></td><td>${x.calib ? `<button class="ghost small" data-fit="${x.id}">Fit</button>` : ''}</td></tr>`).join('')}
        </table>
        <div class="flex" style="margin-top:10px"><span id="vSum" class="small"></span>
          ${calibOn ? `<span class="tag peach">Calibrated model: ${esc(Object.entries(state.calib).map(([k, v]) => Object.entries(v).map(([n, val]) => k + '.' + n + ' = ' + val).join(', ')).join('; '))}</span><button class="ghost small" id="calReset">Reset calibration</button>` : '<span class="tag mint">Default literature parameters</span>'}
        </div>
      </section>
      <section class="card">
        <div class="flex" style="justify-content:space-between"><h2>Standards series: a verification practical</h2><button class="ghost small" id="vPrint">Print protocol</button></div>
        <p class="small">To check the model over its whole range, prepare these standards in pooled normal urine, run each test, and compare with the predicted outcome. The colour swatches are rendered by the simulator, so a photograph of each tube can be compared by ΔE.</p>
        ${Rx.standards().map(st => `<h3 style="margin-top:12px">${esc(st.test)}</h3><div class="small muted">${esc(st.prep)}</div>
          <table class="small"><tr><th>Standard</th><th>Predicted colour</th><th>Predicted measurable</th><th>Observed</th></tr>
          ${st.rows.map(r => `<tr><td>${esc(r[0])}</td><td>${r[1] ? `<span style="display:inline-block;width:46px;height:18px;border-radius:4px;border:1px solid #0003;background:${r[1]}"></span> <span class="muted">${r[1]}</span>` : '—'}</td><td>${esc(r[2])}</td><td style="border-bottom:1px solid #bbb;min-width:120px"></td></tr>`).join('')}</table>`).join('')}
      </section>
      <section class="card small">
        <h3>What "verified" means here</h3>
        <ul>
          <li><b>Qualitative results</b> (positive/negative, colour grade) should match at the manual's conditions for every case sample. They are the primary check.</li>
          <li><b>Quantitative predictions</b> (Cu₂O mass, A₆₀₀, drop count, seconds to colour) use literature constants. Reagent strength, drop size, flame and timing differ between benches, so expect agreement within the stated tolerance. After one <b>Fit</b> per test, agreement should be close.</li>
          <li><b>Photographed colours</b> depend on camera white balance. Use daylight and a white card, and treat ΔE ≤ 15 as a match.</li>
        </ul>
      </section>`;
    const verdict = () => {
      let ok = 0, n = 0;
      list.forEach(x => {
        const j = Rx.judge(x, meas[x.id]); const td = $(`[data-verdict="${x.id}"]`, m);
        if (!j) { td.innerHTML = ''; return; }
        n++; if (j.ok) ok++;
        td.innerHTML = `<span class="mark ${j.ok ? 'ok' : 'bad'}">${j.ok ? '✓ agrees' : '✗ differs'}</span><div class="muted">${esc(j.note)}</div>`;
      });
      $('#vSum', m).innerHTML = n ? `<b>${ok} / ${n}</b> measured values agree with the simulation.` : 'Enter measured values to score the simulation.';
    };
    $$('[data-meas]', m).forEach(i => i.oninput = () => { meas[i.dataset.meas] = i.value; save(); verdict(); });
    $$('[data-fit]', m).forEach(b => b.onclick = () => {
      const x = list.find(y => y.id === b.dataset.fit);
      const nc = Rx.calibrate(x.calib, s, meas[x.id], state.calib);
      if (!nc) { alert('Enter a positive measured value first (and the model must predict a reaction for this sample).'); return; }
      state.calib = nc; Rx.setParams(state.calib); save(); views.verify(m, ctx);
    });
    const cr = $('#calReset', m); if (cr) cr.onclick = () => { state.calib = {}; Rx.setParams(null); save(); views.verify(m, ctx); };
    $('#vPrint', m).onclick = () => window.print();
    verdict();
  };
})();
