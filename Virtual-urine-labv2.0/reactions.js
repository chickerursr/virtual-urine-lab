/* =====================================================================
   Virtual Urine Lab — REACTION SIMULATOR
   Mechanistic models of every test in Experiment 10. Nothing here is a
   look-up of the final answer: each test integrates its chemistry
   (stoichiometry, rate laws with Arrhenius temperature dependence,
   acid–base equilibria, adsorption, diffusion, surface tension) and the
   colour you see is rendered from the computed absorption spectrum
   (Beer–Lambert → CIE 1931 colour-matching functions → sRGB).

   Every model also predicts quantities that can be MEASURED in the wet
   lab (Cu2O mass, A600, stalagmometer drop count, seconds to colour …),
   so the simulation can be verified and calibrated against your bench.

   Parameters marked "fitted" are set so the model reproduces the
   published detection limits of the test. Change them in P, or use the
   calibration tools in the app.
   ===================================================================== */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.UrineReactions = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const RGAS = 8.314;
  const K0 = 273.15;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* ================================================================
     1. SPECTRAL COLOUR ENGINE
     ================================================================ */
  const WL = []; for (let l = 380; l <= 720; l += 5) WL.push(l);
  const g2 = (l, mu, s1, s2) => { const s = l < mu ? s1 : s2, t = (l - mu) / s; return Math.exp(-0.5 * t * t); };
  // CIE 1931 2° colour-matching functions — multi-lobe Gaussian fit (Wyman, Sloan & Shirley 2013)
  const CMF = WL.map(l => [
    1.056 * g2(l, 599.8, 37.9, 31.0) + 0.362 * g2(l, 442.0, 16.0, 26.7) - 0.065 * g2(l, 501.1, 20.4, 26.2),
    0.821 * g2(l, 568.8, 46.9, 40.5) + 0.286 * g2(l, 530.9, 16.3, 31.1),
    1.217 * g2(l, 437.0, 11.8, 36.0) + 0.681 * g2(l, 459.0, 26.0, 13.8)
  ]);
  const toXYZ = S => S.reduce((a, v, i) => [a[0] + v * CMF[i][0], a[1] + v * CMF[i][1], a[2] + v * CMF[i][2]], [0, 0, 0]);
  const toLin = ([X, Y, Z]) => [3.2406 * X - 1.5372 * Y - 0.4986 * Z, -0.9689 * X + 1.8758 * Y + 0.0415 * Z, 0.0557 * X - 0.2040 * Y + 1.0570 * Z];
  const WHITE = toLin(toXYZ(WL.map(() => 1)));
  const gam = c => { c = clamp(c, 0, 1); return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; };
  function spectrumToHex(S) {
    const lin = toLin(toXYZ(S)).map((v, i) => v / WHITE[i]);
    return '#' + lin.map(v => Math.round(gam(v) * 255).toString(16).padStart(2, '0')).join('');
  }
  function hexToLab(hex) {
    const c = hex.replace('#', ''); const rgb = [0, 2, 4].map(i => parseInt(c.substr(i, 2), 16) / 255)
      .map(v => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
    const X = (0.4124 * rgb[0] + 0.3576 * rgb[1] + 0.1805 * rgb[2]) / 0.95047, Y = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2], Z = (0.0193 * rgb[0] + 0.1192 * rgb[1] + 0.9505 * rgb[2]) / 1.08883;
    const f = t => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
    return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
  }
  const deltaE = (h1, h2) => { const a = hexToLab(h1), b = hexToLab(h2); return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); };
  function hueOf(hex) {
    const c = hex.replace('#', ''); const [r, g, b] = [0, 2, 4].map(i => parseInt(c.substr(i, 2), 16) / 255);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (d < 1e-6) return 0;
    let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; return h < 0 ? h + 360 : h;
  }

  // molar absorptivity spectra (M^-1 cm^-1) as Gaussian bands
  const gb = (l, mu, s) => Math.exp(-0.5 * ((l - mu) / s) * ((l - mu) / s));
  const bands = list => WL.map(l => list.reduce((a, [mu, s, e]) => a + e * gb(l, mu, s), 0));
  const EPS = {
    cuCitrate: bands([[780, 130, 52]]),                                    // Cu(II)-citrate, Benedict's reagent (blue)
    acidHaem: bands([[405, 20, 100000], [500, 60, 18000], [640, 30, 2000]]), // acid haematin / met-Hb, per haem (acid urine)
    oxyHb: bands([[415, 12, 125000], [541, 10, 14600], [577, 9, 15500]]),  // per haem
    bilirubin: bands([[453, 35, 60000]]),
    biliverdin: bands([[375, 25, 50000], [660, 45, 15000]]),
    ferric: bands([[360, 50, 9000]]),                                      // Fe(III) in Fouchet's reagent (yellow)
    nitroKetone: bands([[545, 45, 190]]),                                  // nitroprusside–ketone complex (fitted)
    benzBlue: bands([[600, 50, 30000]]),                                   // oxidised benzidine
    mrAcid: bands([[520, 40, 40000]]), mrBase: bands([[430, 35, 20000]]),  // methyl red
    btbAcid: bands([[430, 35, 20000]]), btbBase: bands([[617, 45, 40000]]),// bromothymol blue
    tbpbAcid: bands([[430, 35, 20000]]), tbpbBound: bands([[610, 45, 40000]]), // tetrabromophenol blue
    blueDye: bands([[620, 50, 30000]]),
    iodine: bands([[360, 60, 25000], [460, 50, 8000]]),
    buff: bands([[450, 50, 3000]]),
    orangeBase: bands([[455, 35, 25000]]),
    tmbBlue: bands([[652, 55, 39000]])
  };
  const UROCHROME = WL.map(l => Math.exp(-(l - 380) / 45));                // absorbance per unit pigment per cm
  const sumA = parts => WL.map((_, i) => parts.reduce((a, [arr, f]) => a + arr[i] * f, 0));

  // transmitted colour of a liquid in a tube; w = fraction of light scattered (turbidity)
  function liquidHex(A, w) {
    w = clamp(w || 0, 0, 1);
    return spectrumToHex(A.map(a => { const T = Math.pow(10, -a); return (1 - w) * T + w * 0.92 * Math.sqrt(T); }));
  }
  // reflected colour of a dye-loaded pad / paper (light passes the dye twice)
  const padHex = A => spectrumToHex(A.map(a => 0.03 + 0.9 * Math.pow(10, -2 * a)));
  const transmittance = A => A.map(a => Math.pow(10, -a));

  /* ================================================================
     2. PARAMETERS (literature values; "fitted" = set to the test's
        published detection limit). Calibration overrides these.
     ================================================================ */
  const DEFAULTS = {
    path: 1.4,                 // cm, inner diameter of a 15 mL test tube
    drop: 0.05,                // mL per drop
    benedict: { cu: 0.0690, reagentMl: 5, nu: 5.0, k100: 0.040, Ea: 80000, tauFlame: 15, tauBath: 40,
      coverMg: 6, edgeMg: 12, f: [0.03, 0.24, 0.40, 0.56] },
    heat: { Tm: 62, kTm: 0.01, Ea: 400000, kappa: 0.0021, tubeMl: 10, phosphate: 25, aceticM: 17.4, pKa: 4.72, pK1: 2.0, pK2: 6.88,
      vis: 0.02, trace: 0.06, heavy: 0.55 },
    ssa: { kappa: 0.004, urineMl: 3, reagentMl: 1, vis: 0.015, turbid: 0.09, heavy: 0.9 },
    rothera: { acetoneFactor: 0.2, Deff: 1.0e-3, nh3: 13, nh4: 8.2, pKa: 9.25, pHreact: 8.6, k: 0.1, vis: 0.04, strong: 0.41 },
    hay: { gamma0: 66, RTGamma: 6.2, K: 27, mw: 500, gammaC: 55, gammaWater: 72.0, sinkScale: 30, nWater: 50 },
    fouchet: { urineMl: 5, adsorb: 0.5, spotCm2: 0.5, vis: 0.1 },
    benzidine: { kEff: 2.0, Km: 5, h2o2M: 0.88, bzMgMl: 120, vis: 0.04, strong: 0.4 },
    urine: { pigment: { pale: 0.5, straw: 1.4, dark: 3.2 }, rbcScatter: 1.6e-5, pathGain: 2 },
    dip: { tau: { pH: 5, sg: 8, protein: 10, glucose: 25, ketone: 15, blood: 20 }, KdProt: 250, KmGlu: 700, Kket: 60, Kblood: 120, late: 0.15 }
  };
  let P = JSON.parse(JSON.stringify(DEFAULTS));
  function setParams(over) {
    P = JSON.parse(JSON.stringify(DEFAULTS));
    if (over) Object.keys(over).forEach(sec => { if (P[sec] && typeof over[sec] === 'object') Object.assign(P[sec], over[sec]); });
  }
  const params = () => P;

  /* derived sample quantities */
  const HB_PER_RBC = 0.003;                           // mg/dL Hb per RBC/µL
  const hemeMg = s => (s.freeHb || 0) + (s.rbc || 0) * HB_PER_RBC;
  const proteinMg = s => (s.albumin || 0) + hemeMg(s);

  /* ================================================================
     3. URINE COLOUR (physical examination)
     ================================================================ */
  function urineAbsorbance(s, path) {
    path = path || P.path;
    const U = P.urine.pigment[s.urochrome] != null ? P.urine.pigment[s.urochrome] : 0.9;
    const haemM = hemeMg(s) * 10 / 16125 / 1000;     // mol/L haem
    const bilM = (s.bilirubin || 0) * 10 / 585 / 1000;
    const acid = s.pH < 6.5 ? 0.8 : 0.3;              // acid urine converts Hb to acid haematin (brown)
    const gain = 1 + P.urine.pathGain * urineScatter(s); // multiple scattering by cells lengthens the light path
    return sumA([[UROCHROME, U * path], [EPS.acidHaem, haemM * acid * path * gain], [EPS.oxyHb, haemM * (1 - acid) * path * gain], [EPS.bilirubin, bilM * path]]);
  }
  function urineScatter(s) {
    let w = 1 - Math.exp(-(s.rbc || 0) * P.urine.rbcScatter * 3);
    if (s.pus) w = Math.max(w, 0.5); if (s.chyle) w = Math.max(w, 0.8); if (s.phosphates && s.pH >= 7) w = Math.max(w, 0.3);
    return w;
  }
  const urineHex = s => liquidHex(urineAbsorbance(s), urineScatter(s));

  /* ================================================================
     4. TEST MODELS
     ================================================================ */

  /* ---- BENEDICT'S: glucose → enediol (rate-limiting, Arrhenius) → 2Cu2+ → Cu2O ---- */
  function benedict(s, c) {
    c = Object.assign({ mode: 'flame', seconds: 120, drops: 8 }, c || {});
    const B = P.benedict;
    const urineMl = c.drops * P.drop, V = B.reagentMl + urineMl;
    const Cu0 = B.cu * B.reagentMl;                              // mmol Cu2+
    const G0 = (s.glucose || 0) * 10 * urineMl / 180.16;          // mmol glucose
    const Tset = { flame: 100, bath100: 100, bath80: 80, bath60: 60 }[c.mode] || 100;
    const tau = c.mode === 'flame' ? B.tauFlame : B.tauBath;
    let G = G0, red = 0, t = 0; const dt = 0.25, ser = [];
    const steps = Math.round(c.seconds / dt);
    for (let i = 0; i <= steps; i++) {
      const T = Tset - (Tset - 25) * Math.exp(-t / tau);
      const k = B.k100 * Math.exp(-B.Ea / RGAS * (1 / (T + K0) - 1 / (100 + K0)));
      if (i % 20 === 0) ser.push({ t, T, G: G0 ? G / G0 : 0, Cu: (Cu0 - red) / Cu0, cu2o: red / 2 * 143.09 });
      const dG = k * G * dt;
      G -= dG; red = Math.min(Cu0, red + B.nu * dG); t += dt;
    }
    const f = red / Cu0, cu2oMg = red / 2 * 143.09;
    const grade = f < B.f[0] ? 0 : f < B.f[1] ? 1 : f < B.f[2] ? 2 : f < B.f[3] ? 3 : 4;
    // colour: remaining Cu(II) absorbs red; Cu2O particles absorb below their band edge (grows with particle size)
    const cuM = (Cu0 - red) / V;                                  // mmol/mL = mol/L
    const Acu = EPS.cuCitrate.map(e => e * cuM * P.path);
    const phi = 1 - Math.exp(-cu2oMg / B.coverMg);
    const edge = 505 + 110 * (1 - Math.exp(-cu2oMg / B.edgeMg));
    const Rp = WL.map(l => 0.06 + 0.86 / (1 + Math.exp(-(l - edge) / 14)));
    // particles suspended in the blue solution: light is filtered by both (subtractive mixing → green, yellow, orange, red)
    const S = WL.map((l, i) => Math.pow(10, -Acu[i] * (1 - 0.6 * phi)) * Math.pow(Rp[i], 1.2 * phi));
    return { f, cu2oMg, glucoseLeft: G0 ? G / G0 : 0, Cu0, G0, grade, edge, phi,
      hex: spectrumToHex(S), pptHex: cu2oMg > 0.3 ? spectrumToHex(Rp) : null, reagentHex: liquidHex(EPS.cuCitrate.map(e => e * B.cu * P.path)), series: ser, spectrum: S };
  }

  /* ---- HEAT & ACETIC ACID: two-state denaturation (Arrhenius) + pH-dependent aggregation ---- */
  const aggFraction = pH => (1 / (1 + Math.exp((pH - 5.6) / 0.35))) * (1 / (1 + Math.exp(-(pH - 2.6) / 0.25)));
  /* pH after glacial acetic acid: charge balance over acetate + urinary phosphate (H2PO4-/HPO4 2-),
     strong-base excess fixed by the initial pH. Apparent pKa values (ionic strength ≈ 0.2) fitted to
     USGS PHREEQC: RMS error 0.016 pH units over pH 5–7 and 0–30 drops (Slides/build_src/phreeqc_check.py). */
  function pHafterAcid(pH, drops) {
    const H = P.heat; if (!drops) return pH;
    const Kw = 1e-14, Ka = Math.pow(10, -H.pKa), K1 = Math.pow(10, -H.pK1), K2 = Math.pow(10, -H.pK2), Pt = H.phosphate / 1000;
    const pch = h => Pt * (K1 * h + 2 * K1 * K2) / (h * h + K1 * h + K1 * K2);
    const h0 = Math.pow(10, -pH), Z = Kw / h0 + pch(h0) - h0;
    const V = H.tubeMl + drops * P.drop, f = H.tubeMl / V, Ca = drops * P.drop * H.aceticM / V;
    let lo = 0, hi = 14;
    for (let i = 0; i < 60; i++) {
      const m = (lo + hi) / 2, h = Math.pow(10, -m);
      if (Z * f + h - Kw / h - Ca * Ka / (Ka + h) - pch(h) * f > 0) lo = m; else hi = m;
    }
    return (lo + hi) / 2;
  }
  function heat(s, c) {
    c = Object.assign({ tempC: 100, seconds: 20, aceticDrops: 3 }, c || {});
    const H = P.heat, P0 = proteinMg(s);
    let D = 0, t = 0; const dt = 0.05, ser = [];
    const steps = Math.round(c.seconds / dt);
    for (let i = 0; i <= steps; i++) {
      const T = c.tempC - (c.tempC - 25) * Math.exp(-t / 8);
      const k = H.kTm * Math.exp(H.Ea / RGAS * (1 / (H.Tm + K0) - 1 / (T + K0)));
      if (i % 20 === 0) ser.push({ t, T, D });
      D += (1 - D) * (1 - Math.exp(-Math.min(k * dt, 50)));
      t += dt;
    }
    const pH1 = s.pH, pH2 = pHafterAcid(s.pH, c.aceticDrops);
    const phosHeated = s.phosphates && pH1 >= 6.8 && c.tempC >= 70 ? 0.15 : 0;
    const phosAcid = s.phosphates && pH2 >= 6.0 && c.tempC >= 70 ? 0.15 : 0;
    const A1 = H.kappa * P0 * D * aggFraction(pH1) + phosHeated;
    const A2 = H.kappa * P0 * D * aggFraction(pH2) + phosAcid;
    let grade;
    if (A2 < H.vis) grade = (A1 >= H.vis && phosHeated) ? 1 : 0;
    else grade = A2 < H.trace ? 2 : A2 < H.heavy ? 3 : 4;
    return { P0, D, pH1, pH2, A1, A2, phosHeated, grade, series: ser,
      aggCurve: Array.from({ length: 61 }, (_, i) => { const p = 2 + i * 0.1; return [p, aggFraction(p)]; }) };
  }

  /* ---- SULPHOSALICYLIC ACID: charge neutralisation, instantaneous precipitation (turbidimetry) ---- */
  function ssa(s, c) {
    c = Object.assign({ urineMl: P.ssa.urineMl, reagentMl: P.ssa.reagentMl }, c || {});
    const S = P.ssa, Pf = proteinMg(s) * c.urineMl / (c.urineMl + c.reagentMl);
    const A = S.kappa * Pf;
    const grade = A < S.vis ? 0 : A < S.turbid ? 1 : A < S.heavy ? 2 : 3;
    return { Pfinal: Pf, A600: A, A600_1cm: A / P.path, grade,
      curve: Array.from({ length: 51 }, (_, i) => { const p = i * 10; return [p, S.kappa * p * c.urineMl / (c.urineMl + c.reagentMl) / P.path]; }) };
  }

  /* ---- ROTHERA'S: NH3 diffuses into the (NH4)2SO4-saturated urine; nitroprusside + ketone react where pH > ~8.6 ---- */
  function erfc(x) {
    const z = Math.abs(x), t = 1 / (1 + 0.5 * z);
    const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
    return x >= 0 ? r : 2 - r;
  }
  function rothera(s, c) {
    c = Object.assign({ seconds: 60 }, c || {});
    const R = P.rothera;
    const ketMgdl = (s.acac || 0) + (s.acetone || 0) * R.acetoneFactor;   // β-HB has no ketone group → 0
    const ketM = ketMgdl * 10 / 102 / 1000;
    const at = (z, t) => {                                             // z cm below interface
      if (t <= 0) return { pH: s.pH, cpx: 0 };
      const nh3 = 0.5 * R.nh3 * erfc(z / (2 * Math.sqrt(R.Deff * t)));
      const pH = nh3 > 1e-6 ? R.pKa + Math.log10(nh3 / R.nh4) : s.pH;
      const alpha = 1 / (1 + Math.pow(10, R.pHreact - pH));
      return { pH, cpx: ketM * alpha * (1 - Math.exp(-R.k * t)) };
    };
    const ringA = t => { let m = 0; for (let z = 0; z <= 0.6; z += 0.01) m = Math.max(m, EPS.nitroKetone[33] * at(z, t).cpx * P.path); return m; };
    const series = []; let tRing = null;
    for (let t = 0; t <= Math.max(c.seconds, 120); t += 2) { const A = ringA(t); if (t <= c.seconds) series.push([t, A]); if (tRing == null && A >= R.vis) tRing = t; }
    const Aend = ringA(c.seconds);
    const profile = []; let thick = 0;
    for (let z = 0; z <= 1.0; z += 0.02) { const p = at(z, c.seconds); const A = EPS.nitroKetone[33] * p.cpx * P.path; profile.push([z * 10, A, p.pH]); if (A >= Math.max(R.vis, Aend / 2)) thick += 0.2; }
    const grade = Aend < R.vis ? 0 : Aend < R.strong ? 1 : 2;
    const ringHex = liquidHex(sumA([[EPS.nitroKetone, (Aend / EPS.nitroKetone[33])], [UROCHROME, 0.3]]));
    return { ketMgdl, Aring: Aend, tRing, thicknessMm: Math.round(thick * 10) / 10, grade, series, profile, ringHex: grade ? ringHex : null };
  }

  /* ---- HAY'S: Szyszkowski equation γ = γ0 − RTΓ∞·ln(1 + K·c); sulphur sinks when γ < γc ---- */
  function hay(s, c) {
    c = Object.assign({ seconds: 60, nWater: P.hay.nWater }, c || {});
    const H = P.hay, cm = (s.bileSalts || 0) * 10 / H.mw;               // mM
    const gamma = H.gamma0 - H.RTGamma * Math.log(1 + H.K * cm);
    const rate = gamma < H.gammaC ? (H.gammaC - gamma) / H.sinkScale : 0; // s^-1
    const sunk = t => 1 - Math.exp(-rate * t);
    const sg = s.sgBase || 1.018;
    const drops = c.nWater * (H.gammaWater / gamma) * sg;               // stalagmometer: n ∝ ρ/γ
    const series = Array.from({ length: 31 }, (_, i) => { const t = i * c.seconds / 30; return [t, sunk(t)]; });
    const curve = Array.from({ length: 41 }, (_, i) => { const mg = i * 2; return [mg, H.gamma0 - H.RTGamma * Math.log(1 + H.K * mg * 10 / H.mw)]; });
    return { gamma, sunkFraction: sunk(c.seconds), drops, grade: sunk(c.seconds) >= 0.5 ? 1 : 0, series, curve, gammaC: H.gammaC };
  }

  /* ---- FOUCHET'S: bilirubin adsorbed on BaSO4, oxidised by FeCl3 to biliverdin (green) ---- */
  function fouchet(s) {
    const F = P.fouchet;
    const ug = (s.bilirubin || 0) * 10 * F.urineMl / 1000 * 1000 * F.adsorb;  // µg retained on precipitate
    const sigma = ug * 1e-6 / 585 / F.spotCm2;                           // mol/cm²
    const A660 = EPS.biliverdin[56] * sigma * 1000;
    const Aspot = sumA([[EPS.biliverdin, sigma * 1000], [EPS.ferric, 1.2e-4]]);
    return { ugOnPaper: ug, A660, grade: A660 >= F.vis ? 1 : 0, spotHex: padHex(Aspot) };
  }

  /* ---- BENZIDINE: haem pseudo-peroxidase, Michaelis–Menten in H2O2 ---- */
  function benzidine(s, c) {
    c = Object.assign({ seconds: 60, h2o2Drops: 4, bzDrops: 2, urineMl: 3 }, c || {});
    const Z = P.benzidine;
    const V = c.urineMl + (c.h2o2Drops + c.bzDrops) * P.drop;
    const haemuM = hemeMg(s) * 10 / 16125 * 1000 * c.urineMl / V;      // µM
    const h2o2 = c.h2o2Drops * P.drop * Z.h2o2M / V * 1000;            // mM
    const bzuM = c.bzDrops * P.drop * Z.bzMgMl / 184.24 / V * 1e6;       // µM (mmol/mL → µM)
    const rate = Z.kEff * haemuM * h2o2 / (Z.Km + h2o2);               // µM/s
    const prod = t => Math.min(bzuM, rate * t);
    const A = t => EPS.benzBlue[44] * prod(t) * 1e-6 * P.path;
    const series = Array.from({ length: 31 }, (_, i) => { const t = i * c.seconds / 30; return [t, Math.min(A(t), 3)]; });
    const tVis = rate > 0 ? Z.vis / (EPS.benzBlue[44] * 1e-6 * P.path * rate) : null;
    const Aend = A(c.seconds);
    const grade = Aend < Z.vis ? 0 : Aend < Z.strong ? 1 : 2;
    const base = urineAbsorbance(s).map(a => a * c.urineMl / V);
    const shown = Math.min(prod(c.seconds), 1.6 / (EPS.benzBlue[44] * 1e-6 * P.path)); // oxidised benzidine precipitates beyond A≈1.6
    const hex = liquidHex(base.map((a, i) => a + EPS.benzBlue[i] * shown * 1e-6 * P.path), urineScatter(s) * 0.5);
    return { haemuM, rate, Aend, tVisible: tVis, grade, series, hex };
  }

  /* ================================================================
     5. DIPSTICK PADS — indicator chemistry rendered as reflectance
     ================================================================ */
  function padAbsorbance(pad, q, t) {
    const D = P.dip;
    const prog = t <= 0 ? 0 : 1 - Math.exp(-t / D.tau[pad]);
    const late = t > 120 ? D.late * Math.min(1, (t - 120) / 300) : 0;
    if (pad === 'pH') {
      const pH = t <= 0 ? 5.0 : 5.0 + (q - 5.0) * prog;
      const mr = 1 / (1 + Math.pow(10, 5.0 - pH)), btb = 1 / (1 + Math.pow(10, 7.1 - pH));
      return sumA([[EPS.mrAcid, 1.2e-5 * (1 - mr)], [EPS.mrBase, 1.2e-5 * mr], [EPS.btbAcid, 1.5e-5 * (1 - btb)], [EPS.btbBase, 1.5e-5 * btb]]);
    }
    if (pad === 'sg') {
      const pHpad = t <= 0 ? 7.5 : 7.5 - (q - 1.000) * 70 * prog;
      const btb = 1 / (1 + Math.pow(10, 7.1 - pHpad));
      return sumA([[EPS.btbAcid, 1.8e-5 * (1 - btb)], [EPS.btbBase, 1.8e-5 * btb]]);
    }
    if (pad === 'protein') {
      const th = q / (D.KdProt + q) * prog;
      return sumA([[EPS.tbpbAcid, 2e-5 * (1 - th)], [EPS.tbpbBound, 2e-5 * th]]);
    }
    if (pad === 'glucose') {
      const pr = Math.min(1, q / (D.KmGlu + q) * prog + late);
      return sumA([[EPS.blueDye, 0.6e-5], [EPS.iodine, 8e-5 * pr]]);
    }
    if (pad === 'ketone') {
      const pr = Math.min(1, q / (D.Kket + q) * prog + late * 0.6);
      return sumA([[EPS.buff, 2e-5], [EPS.nitroKetone, 2.5e-5 * pr * 150]]);
    }
    if (pad === 'blood') {
      const pr = Math.min(1, q / (D.Kblood + q) * prog + late);
      return sumA([[EPS.orangeBase, 2e-5], [EPS.tmbBlue, 2.5e-5 * pr]]);
    }
    return WL.map(() => 0);
  }
  const padColourQ = (pad, q, t) => padHex(padAbsorbance(pad, q, t));

  /* ================================================================
     6. REACTION-LAB DESCRIPTORS (controls, equations, plots, measurables)
     ================================================================ */
  const fmt = (v, d) => (v == null || !isFinite(v)) ? '—' : Number(v).toFixed(d == null ? 2 : d);
  const LAB = {
    benedict: {
      name: 'Benedict’s test: copper reduction',
      equations: ['Glucose ⇌ 1,2-enediol (OH⁻, heat), rate k(T) = k₁₀₀·exp[−Eₐ/R·(1/T − 1/373 K)]',
        'Enediol + Cu²⁺ (citrate) → CuOH → Cu₂O↓ + oxidation products (≈ ' + DEFAULTS.benedict.nu + ' Cu²⁺ per glucose)',
        'Colour = remaining Cu²⁺ (absorbs red) × Cu₂O particles (absorb below band edge; edge shifts red as particles grow)'],
      controls: [
        { id: 'mode', label: 'Heating', type: 'select', options: [['flame', 'Direct flame, boiling'], ['bath100', 'Boiling water bath'], ['bath80', 'Water bath 80 °C'], ['bath60', 'Water bath 60 °C']], def: 'flame' },
        { id: 'seconds', label: 'Heating time', min: 0, max: 300, step: 10, def: 120, unit: 's' },
        { id: 'drops', label: 'Urine added', min: 2, max: 20, step: 1, def: 8, unit: 'drops' }],
      run: (s, c) => {
        const r = benedict(s, c);
        return { result: r, swatches: [['Reagent before', r.reagentHex], ['Tube after heating', r.hex]].concat(r.pptHex ? [['Precipitate (settled)', r.pptHex]] : []),
          numbers: [['Glucose in tube', fmt(r.G0 * 1000, 1), 'µmol'], ['Cu²⁺ reduced', fmt(r.f * 100, 1), '%'], ['Cu₂O formed', fmt(r.cu2oMg, 2), 'mg'], ['Glucose unreacted', fmt(r.glucoseLeft * 100, 1), '%']],
          charts: [{ title: 'Reaction course in the tube', x: 'time (s)', y: 'fraction', series: [
            { name: 'glucose left', colour: '#c0603a', pts: r.series.map(p => [p.t, p.G]) },
            { name: 'Cu²⁺ left', colour: '#2f63b5', pts: r.series.map(p => [p.t, p.Cu]) },
            { name: 'temperature ÷ 100 °C', colour: '#8a8f99', pts: r.series.map(p => [p.t, p.T / 100]), dash: true }] }],
          spectrum: r.spectrum };
      }
    },
    heat: {
      name: 'Heat coagulation: denaturation + isoelectric aggregation',
      equations: ['Native ⇌ Denatured, first-order, k(T) = k_Tm·exp[Eₐ/R·(1/Tm − 1/T)], Tm(albumin) ≈ 62 °C, Eₐ ≈ 400 kJ/mol',
        'Aggregation fraction peaks near the isoelectric pH (albumin pI ≈ 4.7) and falls in neutral/alkaline urine',
        'pH after acid: charge balance over acetate + urinary phosphate (cross-checked with USGS PHREEQC, ±0.02 pH)', 'Turbidity A = κ × aggregated protein (mg/dL)'],
      controls: [
        { id: 'tempC', label: 'Heating temperature', min: 40, max: 100, step: 5, def: 100, unit: '°C' },
        { id: 'seconds', label: 'Heating time', min: 2, max: 60, step: 1, def: 20, unit: 's' },
        { id: 'aceticDrops', label: 'Glacial acetic acid', min: 0, max: 30, step: 1, def: 3, unit: 'drops' }],
      run: (s, c) => {
        const r = heat(s, c);
        return { result: r, swatches: [],
          numbers: [['Total protein (incl. Hb)', fmt(r.P0, 0), 'mg/dL'], ['Fraction denatured', fmt(r.D * 100, 1), '%'], ['pH before / after acid', fmt(r.pH1, 1) + ' / ' + fmt(r.pH2, 2), ''],
            ['Turbidity after heating (A₆₀₀, tube)', fmt(r.A1, 3), ''], ['Turbidity after acid (A₆₀₀, tube)', fmt(r.A2, 3), ''], ['Visible threshold', fmt(P.heat.vis, 3), '']],
          charts: [{ title: 'Denaturation during heating', x: 'time (s)', y: 'fraction denatured', series: [
            { name: 'denatured', colour: '#a4532a', pts: r.series.map(p => [p.t, p.D]) },
            { name: 'temperature ÷ 100 °C', colour: '#8a8f99', pts: r.series.map(p => [p.t, p.T / 100]), dash: true }] },
          { title: 'Why acetic acid is added: aggregation vs pH', x: 'pH', y: 'fraction aggregating', series: [{ name: 'aggregation', colour: '#5b3f96', pts: r.aggCurve }],
            marks: [[r.pH1, 'urine pH'], [r.pH2, 'after acid']] }] };
      }
    },
    ssa: {
      name: 'Sulphosalicylic acid: turbidimetric protein precipitation',
      equations: ['Protein–NH₃⁺ (acid medium) + sulphosalicylate⁻ → neutral, denatured precipitate', 'Turbidity A₆₀₀ = κ × protein (linear, as in the quantitative SSA method)'],
      controls: [{ id: 'urineMl', label: 'Urine', min: 1, max: 5, step: 0.5, def: 3, unit: 'mL' }, { id: 'reagentMl', label: 'SSA reagent', min: 0.5, max: 3, step: 0.5, def: 1, unit: 'mL' }],
      run: (s, c) => {
        const r = ssa(s, c);
        return { result: r, swatches: [], numbers: [['Protein in mixture', fmt(r.Pfinal, 1), 'mg/dL'], ['A₆₀₀ (1 cm cuvette)', fmt(r.A600_1cm, 3), ''], ['A₆₀₀ (in tube)', fmt(r.A600, 3), '']],
          charts: [{ title: 'Standard curve (1 cm cuvette)', x: 'urine protein (mg/dL)', y: 'A₆₀₀', series: [{ name: 'predicted', colour: '#2f7a5b', pts: r.curve }], marks: [[proteinMg(s), 'this sample']] }] };
      }
    },
    rothera: {
      name: 'Rothera’s test: diffusion-controlled ring formation',
      equations: ['NH₃ diffuses down from the liquor-ammonia layer: c(z,t) = ½c₀·erfc(z / 2√(D·t))',
        'Local pH = 9.25 + log([NH₃]/[NH₄⁺]); the saturated (NH₄)₂SO₄ buffers the column', 'Nitroprusside + CH₃COCH₂COO⁻ / acetone (alkaline) → violet complex (λmax ≈ 545 nm); β-hydroxybutyrate does not react'],
      controls: [{ id: 'seconds', label: 'Time after layering', min: 5, max: 180, step: 5, def: 60, unit: 's' }],
      run: (s, c) => {
        const r = rothera(s, c);
        return { result: r, swatches: r.ringHex ? [['Ring colour', r.ringHex]] : [],
          numbers: [['Ketone (nitroprusside-reactive)', fmt(r.ketMgdl, 1), 'mg/dL AcAc eq.'], ['Ring absorbance (545 nm)', fmt(r.Aring, 3), ''], ['Ring visible after', r.tRing == null ? 'never' : r.tRing, r.tRing == null ? '' : 's'], ['Ring thickness', fmt(r.thicknessMm, 1), 'mm']],
          charts: [{ title: 'Ring absorbance vs time', x: 'time (s)', y: 'A₅₄₅', series: [{ name: 'ring', colour: '#5e1f6e', pts: r.series }] },
          { title: 'Below the interface at the chosen time', x: 'depth (mm)', y: 'A₅₄₅  /  pH÷10', series: [{ name: 'violet complex', colour: '#5e1f6e', pts: r.profile.map(p => [p[0], p[1]]) }, { name: 'pH ÷ 10', colour: '#8a8f99', pts: r.profile.map(p => [p[0], p[2] / 10]), dash: true }] }] };
      }
    },
    hay: {
      name: 'Hay’s test: surface tension',
      equations: ['Szyszkowski: γ = γ₀ − RTΓ∞·ln(1 + K·c)  (γ₀ urine ≈ 66 mN/m)', 'Sulphur is wetted and sinks when γ < γc ≈ 55 mN/m', 'Stalagmometer: n_sample = n_water × (γ_water/γ_sample) × (ρ_sample/ρ_water)'],
      controls: [{ id: 'seconds', label: 'Observation time', min: 10, max: 180, step: 10, def: 60, unit: 's' }, { id: 'nWater', label: 'Stalagmometer drops for water', min: 20, max: 100, step: 1, def: 50, unit: 'drops' }],
      run: (s, c) => {
        const r = hay(s, c);
        return { result: r, swatches: [], numbers: [['Surface tension γ', fmt(r.gamma, 1), 'mN/m'], ['Critical γc', fmt(r.gammaC, 0), 'mN/m'], ['Sulphur sunk at end', fmt(r.sunkFraction * 100, 0), '%'], ['Predicted stalagmometer drops', fmt(r.drops, 1), 'drops']],
          charts: [{ title: 'Surface tension vs bile salts', x: 'bile salts (mg/dL)', y: 'γ (mN/m)', series: [{ name: 'γ', colour: '#255f95', pts: r.curve }, { name: 'γc (sinks below)', colour: '#a3313f', pts: [[0, r.gammaC], [80, r.gammaC]], dash: true }], marks: [[s.bileSalts || 0, 'this sample']] },
          { title: 'Sulphur particles sunk', x: 'time (s)', y: 'fraction', series: [{ name: 'sunk', colour: '#b39b10', pts: r.series }] }] };
      }
    },
    fouchet: {
      name: 'Fouchet’s test: adsorption + oxidation',
      equations: ['Ba²⁺ + SO₄²⁻ → BaSO₄↓ (MgSO₄ supplies extra sulphate); bilirubin adsorbs on the precipitate', 'Bilirubin (yellow, 453 nm) + Fe³⁺ (TCA) → biliverdin (green, ≈660 nm)'],
      controls: [],
      run: (s) => {
        const r = fouchet(s);
        return { result: r, swatches: [['Spot on filter paper', r.spotHex]], numbers: [['Bilirubin retained on paper', fmt(r.ugOnPaper, 2), 'µg'], ['Spot absorbance (660 nm)', fmt(r.A660, 3), ''], ['Visible threshold', fmt(P.fouchet.vis, 2), '']], charts: [] };
      }
    },
    benzidine: {
      name: 'Benzidine test: haem peroxidase kinetics',
      equations: ['Haem (Hb, RBC) + H₂O₂ → compound I; compound I + benzidine → benzidine blue (λmax ≈ 600 nm)', 'Rate v = k·[haem]·[H₂O₂]/(Km + [H₂O₂]), until the benzidine is used up'],
      controls: [{ id: 'seconds', label: 'Observation time', min: 5, max: 120, step: 5, def: 60, unit: 's' }, { id: 'h2o2Drops', label: 'H₂O₂ (3%)', min: 0, max: 8, step: 1, def: 4, unit: 'drops' }],
      run: (s, c) => {
        const r = benzidine(s, c);
        return { result: r, swatches: [['Tube', r.hex]], numbers: [['Haem in tube', fmt(r.haemuM, 3), 'µM'], ['Initial rate', fmt(r.rate, 3), 'µM/s'], ['Colour visible after', r.tVisible == null ? 'never' : fmt(r.tVisible, 1), r.tVisible == null ? '' : 's'], ['A₆₀₀ at end (tube)', fmt(r.Aend, 2), '']],
          charts: [{ title: 'Benzidine blue formation', x: 'time (s)', y: 'A₆₀₀ (tube)', series: [{ name: 'A₆₀₀', colour: '#1f7f74', pts: r.series }, { name: 'visible threshold', colour: '#a3313f', pts: [[0, P.benzidine.vis], [c && c.seconds || 60, P.benzidine.vis]], dash: true }] }] };
      }
    }
  };

  /* ================================================================
     7. PREDICTED MEASURABLES for lab verification
     ================================================================ */
  function measurables(s, env) {
    const b = benedict(s), h = heat(s), q = ssa(s), r = rothera(s), y = hay(s), z = benzidine(s), f = fouchet(s);
    const list = [
      { id: 'sgObs', test: 'Urinometer', what: 'Observed specific gravity', method: 'Urinometer at room temperature, lower meniscus', pred: null, unit: '', tol: { abs: 0.002 }, dp: 3 },
      { id: 'urineHex', test: 'Physical', what: 'Urine colour (photo)', method: 'Photograph the tube against a white card in daylight; pick the colour (hex)', pred: urineHex(s), unit: 'hex', tol: { dE: 15 } },
      { id: 'cu2o', test: 'Benedict’s', what: 'Cu₂O precipitate mass', method: 'Filter through pre-weighed paper, wash with water, dry at 105 °C, weigh', pred: b.cu2oMg, unit: 'mg', tol: { rel: 0.25, abs: 0.5 }, dp: 2, calib: 'benedict.nu' },
      { id: 'benHex', test: 'Benedict’s', what: 'Tube colour after boiling (photo)', method: 'Photograph against a white card; pick the colour (hex)', pred: b.hex, unit: 'hex', tol: { dE: 15 } },
      { id: 'heatA', test: 'Heat coagulation', what: 'A₆₀₀ of heated + acidified upper portion', method: 'Transfer to a 1 cm cuvette, read A at 600 nm against unheated urine', pred: h.A2 / P.path, unit: '', tol: { rel: 0.3, abs: 0.02 }, dp: 3, calib: 'heat.kappa' },
      { id: 'ssaA', test: 'SSA', what: 'A₆₀₀ after SSA', method: 'Mix 3 mL urine + 1 mL SSA; wait 10 min; read A at 600 nm (1 cm) against urine + water', pred: q.A600_1cm, unit: '', tol: { rel: 0.2, abs: 0.015 }, dp: 3, calib: 'ssa.kappa' },
      { id: 'rotT', test: 'Rothera’s', what: 'Time until the ring is visible', method: 'Stopwatch from layering the ammonia', pred: r.tRing, unit: 's', tol: { factor: 2 }, dp: 0 },
      { id: 'hayN', test: 'Hay’s', what: 'Stalagmometer drop count', method: 'Count drops of urine from the stalagmometer bulb (water = ' + P.hay.nWater + ' drops)', pred: y.drops, unit: 'drops', tol: { rel: 0.05 }, dp: 1, calib: 'hay.gamma0' },
      { id: 'fouHex', test: 'Fouchet’s', what: 'Spot colour (photo)', method: 'Photograph the filter paper spot; pick the colour (hex)', pred: f.spotHex, unit: 'hex', tol: { dE: 18 } },
      { id: 'bzT', test: 'Benzidine', what: 'Time until colour is visible', method: 'Stopwatch from adding H₂O₂', pred: z.tVisible, unit: 's', tol: { factor: 2 }, dp: 1, calib: 'benzidine.kEff' }
    ];
    return list;
  }

  function judge(m, measured) {
    if (measured == null || measured === '') return null;
    if (m.unit === 'hex') { const v = String(measured).trim(); if (!/^#?[0-9a-f]{6}$/i.test(v)) return { ok: false, note: 'enter a hex colour like #a0c050' }; const dE = deltaE(m.pred, v[0] === '#' ? v : '#' + v); return { ok: dE <= m.tol.dE, note: 'ΔE = ' + dE.toFixed(1) + ' (≤ ' + m.tol.dE + ' passes; phone cameras vary)' }; }
    const x = parseFloat(measured); if (isNaN(x)) return { ok: false, note: 'not a number' };
    if (m.pred == null) return { ok: !isFinite(x) || x <= 0, note: 'model predicts the reaction does not occur' };
    const p = m.pred;
    if (m.tol.factor) { const ok = x >= p / m.tol.factor && x <= p * m.tol.factor; return { ok, note: 'within ×' + m.tol.factor + ' of ' + p.toFixed(m.dp) }; }
    const allowed = Math.max(m.tol.abs || 0, (m.tol.rel || 0) * Math.abs(p));
    return { ok: Math.abs(x - p) <= allowed, note: 'difference ' + (x - p).toFixed(m.dp != null ? m.dp : 3) + ' (allowed ±' + allowed.toFixed(m.dp != null ? m.dp : 3) + ')' };
  }

  /* calibration: rescale one parameter so the model reproduces a measured value */
  function calibrate(key, s, measured, current) {
    const x = parseFloat(measured); if (isNaN(x) || x <= 0) return null;
    const [sec, name] = key.split('.');
    const cur = Object.assign({}, current || {});
    const pred = measurables(s).find(m => m.calib === key);
    if (!pred || !pred.pred) return null;
    let val = P[sec][name];
    if (key === 'hay.gamma0') {        // drops ∝ 1/γ → shift γ0 by the γ error
      const gNow = hay(s).gamma, gMeas = gNow * pred.pred / x; val = P.hay.gamma0 + (gMeas - gNow);
    } else if (key === 'benzidine.kEff') val = val * pred.pred / x;   // time ∝ 1/k
    else val = val * x / pred.pred;                                     // amount ∝ parameter
    cur[sec] = Object.assign({}, cur[sec] || {}, { [name]: Math.round(val * 1e6) / 1e6 });
    return cur;
  }

  /* standards series for a verification practical */
  function standards() {
    const N = { volume24h: 1400, urochrome: 'pale', pH: 6.0, sgBase: 1.015, albumin: 0, rbc: 0, freeHb: 0, glucose: 0, acac: 0, acetone: 0, bhb: 0, bileSalts: 0, bilirubin: 0 };
    const w = o => Object.assign({}, N, o);
    return [
      { test: 'Benedict’s', prep: 'D-glucose in water/normal urine; 8 drops into 5 mL reagent, boil 2 min', rows: [0, 0.25, 0.5, 1, 1.5, 2, 3].map(g => { const r = benedict(w({ glucose: g })); return [g + ' %', r.hex, 'Cu₂O ' + r.cu2oMg.toFixed(1) + ' mg · ' + (r.f * 100).toFixed(0) + '% Cu reduced']; }) },
      { test: 'SSA', prep: 'Bovine serum albumin in normal urine; 3 mL + 1 mL SSA; A₆₀₀ in 1 cm', rows: [0, 10, 30, 100, 300].map(p => { const r = ssa(w({ albumin: p })); return [p + ' mg/dL', null, 'A₆₀₀ = ' + r.A600_1cm.toFixed(3)]; }) },
      { test: 'Heat & acetic acid', prep: 'Same BSA standards; boil upper third 20 s, add 3 drops glacial acetic acid', rows: [0, 10, 30, 100, 300].map(p => { const r = heat(w({ albumin: p })); return [p + ' mg/dL', null, 'A(tube) ' + r.A1.toFixed(3) + ' → ' + r.A2.toFixed(3) + ' after acid']; }) },
      { test: 'Rothera’s', prep: 'Ethyl/lithium acetoacetate in normal urine', rows: [0, 2, 5, 20, 80].map(k => { const r = rothera(w({ acac: k })); return [k + ' mg/dL', r.ringHex, r.tRing == null ? 'no ring' : 'ring at ' + r.tRing + ' s, A ' + r.Aring.toFixed(2)]; }) },
      { test: 'Hay’s', prep: 'Sodium taurocholate/glycocholate in normal urine; stalagmometer (water 50 drops)', rows: [0, 5, 10, 15, 40].map(b => { const r = hay(w({ bileSalts: b })); return [b + ' mg/dL', null, 'γ ' + r.gamma.toFixed(1) + ' mN/m · ' + r.drops.toFixed(1) + ' drops · ' + (r.sunkFraction * 100).toFixed(0) + '% sunk at 60 s']; }) },
      { test: 'Benzidine', prep: 'Haemolysed blood serially diluted in normal urine (Hb 15 g/dL → mg/dL shown)', rows: [0, 0.01, 0.03, 0.3, 3, 30].map(hb => { const r = benzidine(w({ freeHb: hb })); return [hb + ' mg/dL Hb', r.hex, r.tVisible == null ? 'no colour' : 'visible at ' + r.tVisible.toFixed(1) + ' s']; }) },
      { test: 'Fouchet’s', prep: 'Bilirubin (or jaundiced urine) diluted in normal urine', rows: [0, 0.05, 0.1, 0.5, 2].map(bl => { const r = fouchet(w({ bilirubin: bl })); return [bl + ' mg/dL', r.spotHex, 'spot A₆₆₀ ' + r.A660.toFixed(3)]; }) }
    ];
  }

  return { WL, EPS, DEFAULTS, setParams, params, spectrumToHex, liquidHex, padHex, transmittance, deltaE, hueOf,
    urineHex, urineAbsorbance, benedict, heat, ssa, rothera, hay, fouchet, benzidine, padColourQ, padAbsorbance,
    pHafterAcid, aggFraction, LAB, measurables, judge, calibrate, standards, proteinMg, hemeMg };
});
