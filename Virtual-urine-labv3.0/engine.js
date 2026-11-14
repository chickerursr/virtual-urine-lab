/* =====================================================================
   Virtual Urine Lab — chemistry engine
   Experiment 10: Qualitative analysis of abnormal urine

   Every observation is COMPUTED from the composition of the sample
   (mg/dL, g/dL, cells/µL, pH ...) by the mechanistic reaction models in
   reactions.js (kinetics, equilibria, adsorption, diffusion, surface
   tension; colours rendered from absorption spectra). The same
   composition made up on the bench gives the same result, and the
   Verify tab compares predicted with measured values.

   Works in the browser (window.UrineEngine) and in Node (module.exports).
   ===================================================================== */
(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const api = factory(node ? require('./reactions.js') : root.UrineReactions);
  if (node) module.exports = api;
  else root.UrineEngine = api;
})(typeof self !== 'undefined' ? self : this, function (X) {
  'use strict';

  /* ---------- colour helpers ---------- */
  function hex2rgb(h) { h = h.replace('#', ''); return [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16)); }
  function rgb2hex(a) { return '#' + a.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join(''); }
  function mix(a, b, t) { t = Math.max(0, Math.min(1, t)); const A = hex2rgb(a), B = hex2rgb(b); return rgb2hex(A.map((v, i) => v + (B[i] - v) * t)); }
  const round3 = v => Math.round(v * 1000) / 1000;

  /* ---------- physical constants of the model ---------- */
  const HB_PER_RBC_MG_DL = 0.003;   // 1 RBC/µL ≈ 30 pg Hb → 0.003 mg/dL haemoglobin
  const SG_PER_G_GLUCOSE = 0.004;   // +0.004 SG per 1 g/dL glucose
  const SG_PER_G_PROTEIN = 0.003;   // +0.003 SG per 1 g/dL protein

  /* ---------- default (normal) urine ---------- */
  const NORMAL = {
    volume24h: 1400,      // mL / 24 h
    urochrome: 'straw',   // pale | straw | dark  (pigment concentration)
    pH: 6.0,
    sgBase: 1.018,        // SG from ionic solutes (urea, salts) at calibration temp
    albumin: 0,           // mg/dL
    rbc: 0,               // intact RBC / µL
    freeHb: 0,            // free haemoglobin, mg/dL
    glucose: 0,           // g/dL  (= %)
    acac: 0,              // acetoacetate, mg/dL
    acetone: 0,           // mg/dL
    bhb: 0,               // β-hydroxybutyrate, mg/dL (not detected by nitroprusside)
    bileSalts: 0,         // mg/dL
    bilirubin: 0,         // conjugated bilirubin, mg/dL
    pus: false,           // pus cells / bacteria
    chyle: false,         // fat droplets
    phosphates: false     // amorphous phosphates (alkaline urine)
  };

  /* ---------- the two case reports ---------- */
  const CASES = {
    case1: {
      id: 'case1',
      short: 'Case 1 · John, 8 y',
      title: 'Case Report 1',
      patient: { name: 'John', age: '8 years', gender: 'Male',
        complaints: 'Lethargy, fatigue, puffiness of the face, passing reddish-coloured urine. BP 140/90 mmHg (left arm, supine).' },
      vignette: 'John, an 8-year-old boy, was brought to the pediatric department with complaints of lethargy, fatigue, and puffiness of the face, and passing reddish-coloured urine. On examination, BP was 140/90 mmHg (left arm, supine). The pediatrician on duty asked for the following laboratory investigations:',
      investigations: ['Blood glucose', 'Renal profile', 'Liver profile', 'Urine examination'],
      collection: {
        correct: ['midstream', 'firstmorning'],
        why: 'An 8-year-old can co-operate, so a midstream clean-catch specimen (first-morning if possible, which concentrates protein and cells) is appropriate. A paediatric adhesive bag is for infants who cannot void on request. 24-h output is recorded from the ward intake/output chart.'
      },
      sample: Object.assign({}, NORMAL, {
        volume24h: 350, urochrome: 'dark', pH: 6.0, sgBase: 1.0255,
        albumin: 150, rbc: 10000
      }),
      ancillary: [
        ['Random blood glucose', '94 mg/dL', '70–140', ''],
        ['Blood urea', '62 mg/dL', '15–40', 'H'],
        ['Serum creatinine', '1.3 mg/dL', '0.3–0.7 (child)', 'H'],
        ['Serum sodium', '134 mmol/L', '135–145', 'L'],
        ['Serum potassium', '5.0 mmol/L', '3.5–5.0', ''],
        ['Total bilirubin', '0.6 mg/dL', '0.2–1.2', ''],
        ['ALT / AST', '22 / 30 U/L', '<40', ''],
        ['Serum albumin', '3.5 g/dL', '3.5–5.0', '']
      ],
      keyFindings: ['protein', 'blood'],
      interpretation:
        'Urine shows oliguria, smoky reddish-brown colour with smoky appearance, acidic pH and raised specific gravity. ' +
        'Heat coagulation and sulphosalicylic acid tests are positive (proteinuria, ++) and the benzidine test is positive (haematuria). ' +
        'Reducing sugars, ketone bodies, bile salts and bile pigments are absent; the dipstick agrees (protein ++, blood +++). ' +
        'With facial (periorbital) puffiness and hypertension in a child, the findings indicate ACUTE GLOMERULONEPHRITIS (nephritic syndrome), most commonly post-streptococcal. ' +
        'The raised blood urea/creatinine support reduced glomerular filtration. Suggested follow-up: urine microscopy for RBC casts, ASO titre and serum C3.'
    },
    case2: {
      id: 'case2',
      short: 'Case 2 · 50 y F, diabetic',
      title: 'Case Report 2',
      patient: { name: 'Mrs. X (unconscious; name from attendant)', age: '50 years', gender: 'Female',
        complaints: 'Known diabetic, brought unconscious to casualty. Cold, comatose, fruity odour of breath, Kussmaul breathing, low BP.' },
      vignette: 'A 50-year-old female known diabetic was brought to casualty in an unconscious state. On examination, she was cold, comatose, with a fruity odour in her breath. Kussmaul’s breathing pattern was noted. The blood pressure was on the lower side. The consultant on lab duty asked for the following laboratory investigations:',
      investigations: ['Blood glucose', 'Renal profile', 'Lipid profile', 'Urine examination'],
      collection: {
        correct: ['catheter'],
        why: 'The patient is unconscious and cannot void on request, so urine is collected from a Foley catheter with a syringe (from the sampling port, not the drainage bag) and transferred to a clean container. History from attendants gives the volume before admission; the catheter bag records the output afterwards.'
      },
      sample: Object.assign({}, NORMAL, {
        volume24h: 3200, urochrome: 'straw', pH: 5.0, sgBase: 1.020,
        glucose: 3.0, acac: 80, acetone: 30, bhb: 300
      }),
      ancillary: [
        ['Random blood glucose', '520 mg/dL', '70–140', 'H'],
        ['Blood urea', '68 mg/dL', '15–40', 'H'],
        ['Serum creatinine', '1.6 mg/dL', '0.6–1.1', 'H'],
        ['Serum sodium', '129 mmol/L', '135–145', 'L'],
        ['Serum potassium', '5.6 mmol/L', '3.5–5.0', 'H'],
        ['Total cholesterol', '262 mg/dL', '<200', 'H'],
        ['Triglycerides', '480 mg/dL', '<150', 'H'],
        ['HDL cholesterol', '31 mg/dL', '>50 (F)', 'L']
      ],
      keyFindings: ['glucose', 'ketones'],
      interpretation:
        'Urine volume indicates polyuria (osmotic diuresis). The urine is straw / amber yellow and has a HIGH specific gravity, because glucose adds to SG. ' +
        'It has a fruity odour and acidic pH. Benedict’s test gives a brick-red precipitate (≥2% glycosuria) and Rothera’s test gives a permanganate ring (ketonuria). ' +
        'Protein, blood, bile salts and bile pigments are absent; the dipstick agrees (glucose ++++, ketones large). ' +
        'In a known diabetic with coma, Kussmaul breathing, fruity breath and hypotension (dehydration), this indicates DIABETIC KETOACIDOSIS. ' +
        'Note: nitroprusside (Rothera’s, dipstick) detects acetoacetate and acetone but NOT β-hydroxybutyrate, the main ketone in DKA, so urine tests can under-estimate ketosis. Confirm with blood glucose, blood ketones and ABG (pH, bicarbonate, anion gap). The deranged lipid profile reflects insulin deficiency.'
    }
  };

  /* ---------- derived quantities ---------- */
  const hemeEq = s => s.freeHb + s.rbc * HB_PER_RBC_MG_DL;          // mg/dL haem protein
  const rbcEq = s => s.rbc + s.freeHb / HB_PER_RBC_MG_DL;            // RBC/µL equivalent
  const totalProtein = s => s.albumin + hemeEq(s);                   // heat / SSA precipitate all protein
  const dipKetoneEq = s => s.acac + s.acetone / 7;                   // strip: ~7× less sensitive to acetone
  const trueSG = s => round3(s.sgBase + SG_PER_G_GLUCOSE * s.glucose + SG_PER_G_PROTEIN * totalProtein(s) / 1000);

  /* urinometer: hydrometer reads LOW when urine is warmer than its calibration temperature */
  function urinometer(s, env) {
    const tdiff = env.troom - env.tcal;
    const observed = round3(trueSG(s) - 0.001 * tdiff / 3);
    const corrected = round3(observed + 0.001 * tdiff / 3);
    return { trueSG: trueSG(s), observed, tdiff, correction: 0.001 * tdiff / 3, corrected };
  }

  /* ---------- PHYSICAL EXAMINATION ---------- */
  const VOLUME_OPTS = ['Normal (800–2500 mL/24 h)', 'Polyuria (>2500 mL/24 h)', 'Oliguria (<500 mL/24 h)', 'Anuria (<100 mL/24 h)'];
  const COLOUR_OPTS = ['Straw / amber yellow', 'Smoky red / reddish-brown', 'Yellowish-brown / greenish', 'Dark brown / black', 'Milky white'];
  const APPEAR_OPTS = ['Clear', 'Turbid', 'Smoky', 'Milky'];
  const ODOUR_OPTS = ['Aromatic (normal)', 'Fruity', 'Mousy', 'Maple syrup'];
  const REACTION_OPTS = ['Acidic', 'Neutral', 'Alkaline'];

  function physical(s, env) {
    const v = s.volume24h;
    const volume = v < 100 ? 3 : v < 500 ? 2 : v > 2500 ? 1 : 0;

    let colour;
    const visibleBlood = rbcEq(s) >= 2500;      // gross haematuria ≈ 0.5 mL blood / L
    if (visibleBlood) colour = 1;
    else if (s.bilirubin >= 1) colour = 2;
    else if (s.chyle) colour = 4;
    else colour = 0;                            // pale, straw and dark yellow are all recorded as straw / amber yellow
    const liquid = X.urineHex(s);               // rendered from the absorption spectrum

    let appearance = 0, turbidity = 0;
    if (s.chyle) { appearance = 3; turbidity = 0.75; }
    else if (s.pus) { appearance = 1; turbidity = 0.55; }
    else if (s.rbc >= 2500) { appearance = 2; turbidity = 0.35; }
    else if (s.phosphates && s.pH >= 7) { appearance = 1; turbidity = 0.3; }

    let odour = 0;
    if (s.acetone + s.acac >= 20) odour = 1;

    const reaction = s.pH < 6.8 ? 0 : s.pH <= 7.2 ? 1 : 2;
    const sg = urinometer(s, env);
    const sgClass = sg.trueSG > 1.025 ? 'Increased (hypersthenuria)'
      : sg.trueSG < 1.005 ? 'Decreased (hyposthenuria)' : 'Normal (1.005–1.025)';
    return { volume, colour, liquid, appearance, turbidity, odour, reaction, pH: s.pH, sg, sgClass };
  }

  /* ---------- CHEMICAL TESTS ---------- */
  const TESTS = {
    heat: {
      name: 'Heat coagulation test', constituent: 'Protein',
      obs: ['No turbidity in the heated upper portion',
        'White turbidity in the heated portion, persists / increases after acetic acid'],
      inf: ['Protein absent', 'Protein present'],
      // simulated grade (0 none, 1 phosphates only, 2 trace, 3 +/++, 4 heavy) → option shown
      obsMap: [0, 0, 1, 1, 1], infMap: [0, 0, 1, 1, 1]
    },
    ssa: {
      name: 'Sulphosalicylic acid test', constituent: 'Protein',
      obs: ['Solution remains clear', 'White turbidity'],
      inf: ['Protein absent', 'Protein present'],
      obsMap: [0, 1, 1, 1], infMap: [0, 1, 1, 1]
    },
    benedict: {
      name: 'Benedict’s qualitative test', constituent: 'Reducing sugar (glucose)',
      obs: ['Solution remains blue, no precipitate', 'Green precipitate', 'Yellow precipitate', 'Orange precipitate', 'Brick-red precipitate'],
      inf: ['Reducing sugar absent', 'Reducing sugar present: ~0.5% (green colour)', 'Reducing sugar present: ~1% (yellow colour)',
        'Reducing sugar present: ~1.5% (orange colour)', 'Reducing sugar present: ≥2% (brick-red colour)']
    },
    rothera: {
      name: 'Rothera’s test', constituent: 'Ketone bodies (acetone, acetoacetate)',
      obs: ['No ring at the junction of the two layers', 'Deep permanganate (purple) ring at the junction'],
      inf: ['Ketone bodies absent', 'Ketone bodies present (large amount)'],
      obsMap: [0, 1, 1], infMap: [0, 1, 1]
    },
    hay: {
      name: 'Hay’s sulphur test', constituent: 'Bile salts',
      obs: ['Sulphur powder floats on the surface', 'Sulphur powder sinks to the bottom'],
      inf: ['Bile salts absent', 'Bile salts present']
    },
    fouchet: {
      name: 'Fouchet’s test', constituent: 'Bile pigments (bilirubin)',
      obs: ['No green / blue colour on the precipitate', 'Green / bluish-green colour on the precipitate'],
      inf: ['Bile pigments absent', 'Bile pigments (bilirubin) present']
    },
    benzidine: {
      name: 'Benzidine test', constituent: 'Blood (haemoglobin / RBCs)',
      obs: ['No colour change', 'Green / blue-green colour develops immediately'],
      inf: ['Blood absent', 'Blood present'],
      obsMap: [0, 1, 1], infMap: [0, 1, 1]
    }
  };

  const turbOpacity = A => Math.min(0.95, 1 - Math.exp(-5 * A));

  /* Every grade below comes from the mechanistic simulation in reactions.js */
  function chem(s, cond) {
    cond = cond || {};
    const r = {};
    const h = X.heat(s, cond.heat);
    r.heat = { grade: h.grade, value: h.P0, sim: h, visual: { heated: turbOpacity(h.A1), afterAcid: turbOpacity(h.A2), floc: h.A2 >= X.params().heat.heavy } };
    const q = X.ssa(s, cond.ssa);
    r.ssa = { grade: q.grade, value: q.Pfinal, sim: q, visual: { turbid: turbOpacity(q.A600), floc: q.grade === 3 } };
    const b = X.benedict(s, cond.benedict);
    r.benedict = { grade: b.grade, value: s.glucose, sim: b, visual: { colour: b.hex, pptHex: b.pptHex, reagent: b.reagentHex, ppt: b.grade > 0 } };
    const ro = X.rothera(s, cond.rothera);
    r.rothera = { grade: ro.grade, value: ro.ketMgdl, sim: ro, visual: { ring: ro.ringHex } };
    const hy = X.hay(s, cond.hay);
    r.hay = { grade: hy.grade, value: s.bileSalts, sim: hy, visual: { sink: !!hy.grade, sunk: hy.sunkFraction } };
    const fo = X.fouchet(s);
    r.fouchet = { grade: fo.grade, value: s.bilirubin, sim: fo, visual: { spot: fo.spotHex } };
    const bz = X.benzidine(s, cond.benzidine);
    r.benzidine = { grade: bz.grade, value: hemeEq(s), sim: bz, visual: { colour: bz.grade ? bz.hex : null } };

    Object.keys(r).forEach(k => {
      const T = TESTS[k];
      r[k].obsIdx = T.obsMap ? T.obsMap[r[k].grade] : r[k].grade;   // option index the student must pick
      r[k].infIdx = T.infMap ? T.infMap[r[k].grade] : r[k].grade;
      r[k].observation = T.obs[r[k].obsIdx];
      r[k].inference = T.inf[r[k].infIdx];
      r[k].positive = r[k].grade > 0 && !(k === 'heat' && r[k].grade === 1);
    });
    return r;
  }

  /* ---------- DIPSTICK (Multistix-type, read 40 s – 2 min) ---------- */
  const DIP = {
    pH: { label: 'pH', levels: ['5.0', '6.0', '6.5', '7.0', '7.5', '8.0', '8.5'],
      colours: ['#e9823a', '#e8a63c', '#d9b843', '#a9b84b', '#73a85a', '#4a9773', '#2f7d86'] },
    sg: { label: 'Specific gravity', levels: ['1.000', '1.005', '1.010', '1.015', '1.020', '1.025', '1.030'],
      colours: ['#1f5868', '#356a5c', '#53744a', '#757a3f', '#927f36', '#ab8734', '#c29638'] },
    protein: { label: 'Protein', levels: ['Negative', 'Trace', '30 (+)', '100 (++)', '300 (+++)', '≥2000 (++++)'],
      colours: ['#e3df78', '#cfda7a', '#b0cc7e', '#89b688', '#679f93', '#4b8b98'] },
    glucose: { label: 'Glucose', levels: ['Negative', '100 trace', '250 (+)', '500 (++)', '1000 (+++)', '≥2000 (++++)'],
      colours: ['#8ccfdc', '#8fc39c', '#91ad66', '#86874a', '#735c35', '#5a3b23'] },
    ketone: { label: 'Ketone', levels: ['Negative', 'Trace 5', 'Small 15', 'Moderate 40', 'Large 80', 'Large 160'],
      colours: ['#f1d6c3', '#e7b9b0', '#d692a1', '#b46a8b', '#8b3f6f', '#6a2558'] },
    blood: { label: 'Blood', levels: ['Negative', 'Trace', 'Small (+)', 'Moderate (++)', 'Large (+++)'],
      colours: ['#efc56a', '#cfc66d', '#a6b760', '#6e9d5a', '#2f6e4e'] }
  };
  const DIP_ORDER = ['pH', 'sg', 'protein', 'glucose', 'ketone', 'blood'];
  // reference quantity for each chart block; chart colours are rendered by the same pad chemistry
  const DIP_REF = { pH: [5, 6, 6.5, 7, 7.5, 8, 8.5], sg: [1.000, 1.005, 1.010, 1.015, 1.020, 1.025, 1.030],
    protein: [0, 15, 30, 100, 300, 2000], glucose: [0, 100, 250, 500, 1000, 2000], ketone: [0, 5, 15, 40, 80, 160], blood: [0, 10, 25, 80, 200] };
  DIP_ORDER.forEach(k => { DIP[k].colours = DIP_REF[k].map(q => X.padColourQ(k, q, 60)); });
  function padQuantity(pad, s) {
    if (pad === 'pH') return s.pH;
    if (pad === 'sg') return s.sgBase + (s.albumin >= 100 ? 0.003 : 0) - (s.pH >= 6.5 ? 0.005 : 0);
    if (pad === 'protein') return s.albumin;
    if (pad === 'glucose') return s.glucose * 1000;
    if (pad === 'ketone') return dipKetoneEq(s);
    return rbcEq(s);
  }

  function dipstick(s) {
    const out = {};
    const ph = [5, 6, 6.5, 7, 7.5, 8, 8.5];
    let pi = 0; ph.forEach((v, i) => { if (Math.abs(v - s.pH) < Math.abs(ph[pi] - s.pH)) pi = i; });
    out.pH = pi;

    // SG pad responds to IONIC solutes only: glucose is not seen; protein 100–750 mg/dL reads slightly high;
    // alkaline urine (pH ≥ 6.5) reads ~0.005 low.
    let sgPad = s.sgBase + (s.albumin >= 100 ? 0.003 : 0) - (s.pH >= 6.5 ? 0.005 : 0);
    out.sg = Math.max(0, Math.min(6, Math.round((sgPad - 1.000) / 0.005)));
    out.sgValue = round3(sgPad);

    const a = s.albumin; // pad is albumin-selective
    out.protein = a < 15 ? 0 : a < 30 ? 1 : a < 100 ? 2 : a < 300 ? 3 : a < 2000 ? 4 : 5;

    const gm = s.glucose * 1000; // mg/dL
    out.glucose = gm < 75 ? 0 : gm < 175 ? 1 : gm < 375 ? 2 : gm < 750 ? 3 : gm < 1500 ? 4 : 5;

    const k = dipKetoneEq(s);
    out.ketone = k < 3 ? 0 : k < 10 ? 1 : k < 28 ? 2 : k < 60 ? 3 : k < 120 ? 4 : 5;

    const rb = rbcEq(s);
    out.blood = rb < 5 ? 0 : rb < 18 ? 1 : rb < 50 ? 2 : rb < 150 ? 3 : 4;
    out.bloodSpeckled = s.rbc > 0 && s.rbc < 50 && s.freeHb < 0.15;
    return out;
  }

  /* colour of a pad t seconds after dipping, from the pad chemistry (sample given) or the chart reference */
  function padColour(pad, level, t, speckled, sample) {
    const q = sample ? padQuantity(pad, Object.assign({}, NORMAL, sample)) : DIP_REF[pad][level];
    return X.padColourQ(pad, q, t);
  }

  function dipReadingText(d) {
    return DIP_ORDER.map(k => DIP[k].label + ': ' + DIP[k].levels[d[k]]).join('; ');
  }

  /* ---------- clinical significance (MBBS Biochemistry Journal, Experiment 10) ---------- */
  const CLINICAL = [
    { title: 'Proteins',
      paras: ['The glomeruli of kidney are impermeable to proteins with MW of 70 kD. The plasma proteins of MW more than 70 kD are hence absent in the normal urine. The excretion of proteins in urine is called proteinuria.',
        'When glomeruli are damaged or diseased, they become more permeable and thus plasma proteins such as albumin pass through the damaged glomeruli, and this condition is called albuminuria. Physiological proteinuria is seen in severe exercise and during pregnancy.',
        'The causes for pathological proteinuria are mainly classified into:'],
      list: ['Pre renal: Intra-abdominal tumors', 'Renal: Glomerular nephritis, nephrotic syndrome etc.', 'Post renal: Inflammation in the lower urinary tract'] },
    { title: 'Reducing sugars',
      paras: ['Positive Benedict’s test indicates glycosuria. Usually it is taken for the presence of glucose. It occurs predominantly in uncontrolled diabetes mellitus. It is also seen in rare conditions such as renal glycosuria, in which reabsorption of glucose from the kidney tubules is defective.',
        'Colour of the precipitate indicates severity of glycosuria.'],
      table: { head: ['Colour of precipitate', 'Approximate glucose concentration'], rows: [['Green', '0.5%'], ['Yellow', '1%'], ['Orange', '1.5%'], ['Brick red', '2%']] },
      listTitle: 'Causes for glycosuria:',
      list: ['Diabetes mellitus', 'Hyperthyroidism', 'Hyperpituitarism', 'Hyperadrenalism', 'Diseases of pancreas', 'Renal glycosuria'] },
    { title: 'Blood',
      paras: ['Presence of erythrocytes in urine is called hematuria. It occurs due to bleeding in the urinary tract. It is seen in acute glomerular nephritis and trauma to the urinary tract.',
        'During excessive hemolysis, hemoglobin is found in urine. The condition is called hemoglobinuria (in both conditions the benzidine test is positive). Hemoglobinuria is seen in malaria, severe burns, hemolytic jaundice etc.'] },
    { title: 'Ketone bodies',
      paras: ['Excessive excretion of ketone bodies occurs in a state of ketosis, which is seen in diabetes mellitus, starvation and severe vomiting.'] },
    { title: 'Bile salts and bile pigments',
      paras: ['Bile salts are present in obstructive jaundice, and bile pigments are found in infective hepatitis and hemolytic jaundice.'] }
  ];

  /* ---------- whole-sample analysis ---------- */
  function analyse(sample, env) {
    const s = Object.assign({}, NORMAL, sample);
    env = Object.assign({ troom: 29, tcal: 20 }, env || {});
    return { sample: s, env, physical: physical(s, env), chem: chem(s, env.cond), dip: dipstick(s) };
  }

  /* ---------- wet-lab preparation (per 100 mL pooled normal urine) ---------- */
  const RECIPES = {
    case1: {
      base: 'Pooled fresh normal urine, first-morning (SG ≈ 1.026). If dilute, use first-morning urine or concentrate with a little NaCl/urea to SG 1.026 at 20 °C.',
      add: [
        ['Bovine serum albumin (or egg albumin)', '150 mg', 'albumin 150 mg/dL → heat/SSA ++, strip protein ++'],
        ['Fresh EDTA whole blood (Hb ≈ 15 g/dL)', '0.2 mL', '≈10 000 RBC/µL → smoky red, benzidine +, strip blood +++'],
        ['Adjust pH with 1% acetic acid / dilute NaOH', 'to pH 6.0', 'checked with pH paper']
      ],
      volumeNote: 'Ward chart value supplied to students: 350 mL / 24 h (oliguria).',
      sampleOverride: { volume24h: 350, urochrome: 'dark', pH: 6.0, sgBase: 1.0255, albumin: 150, rbc: 10000 },
      tips: ['Add blood on the day of the practical; intact RBCs give the smoky look. Freeze–thawed blood gives clear red (haemoglobinuria) instead.',
        'Do not boil the stock: albumin will coagulate.']
    },
    case2: {
      base: 'Pooled fresh normal urine diluted 1 + 1 with water, then made up as below (pale colour; ionic SG ≈ 1.020).',
      add: [
        ['Anhydrous D-glucose', '3.0 g', 'glucose 3% → Benedict’s brick red, strip ++++, SG +0.012'],
        ['Acetone (AR)', '0.04 mL', '≈30 mg/dL acetone → fruity odour'],
        ['Ethyl acetoacetate (or lithium acetoacetate)', '0.1 mL (≈80 mg/dL AcAc eq.)', 'Rothera’s deep ring; strip ketone large'],
        ['NaCl / urea to restore ionic SG', 'to SG ≈ 1.032 total', 'straw-yellow urine with high SG'],
        ['Adjust pH with 1% acetic acid', 'to pH 5.0', 'acidic (ketoacidosis)']
      ],
      volumeNote: 'History supplied to students: 3200 mL / 24 h before admission (polyuria).',
      sampleOverride: { volume24h: 3200, urochrome: 'straw', pH: 5.0, sgBase: 1.020, glucose: 3.0, acac: 80, acetone: 30, bhb: 300 },
      tips: ['If only acetone is available: 1.0 mL acetone per 100 mL (≈790 mg/dL) gives the same Rothera’s and strip "Large" result. Enter acetone 790, acetoacetate 0 in the Custom builder to confirm.',
        'Ketones evaporate: prepare within 2 h of the class and keep the bottle stoppered.']
    }
  };

  return {
    mix, NORMAL, CASES, TESTS, CLINICAL, DIP, DIP_ORDER, DIP_REF, RECIPES, Rx: X,
    VOLUME_OPTS, COLOUR_OPTS, APPEAR_OPTS, ODOUR_OPTS, REACTION_OPTS,
    analyse, physical, chem, dipstick, padColour, dipReadingText, urinometer, trueSG,
    totalProtein, hemeEq, rbcEq
  };
});
