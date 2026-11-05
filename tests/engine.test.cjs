// Run:  node tests/engine.test.cjs
// Checks the computed results against the expected wet-lab answer key for both case reports,
// and checks the model's behaviour at the test detection limits.
const assert = require('assert');
const E = require('../engine.js');
let pass = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ok  ' + name); } catch (e) { console.log('  FAIL ' + name + '\n       ' + e.message); process.exitCode = 1; } };
const env = { troom: 28, tcal: 15 };

console.log('Case 1 — acute glomerulonephritis');
const a1 = E.analyse(E.CASES.case1.sample, env);
t('oliguria', () => assert.strictEqual(E.VOLUME_OPTS[a1.physical.volume], 'Oliguria (<500 mL/24 h)'));
t('smoky red colour, smoky appearance', () => { assert.strictEqual(E.COLOUR_OPTS[a1.physical.colour], 'Smoky red / reddish-brown'); assert.strictEqual(E.APPEAR_OPTS[a1.physical.appearance], 'Smoky'); });
t('acidic pH 6', () => assert.strictEqual(a1.physical.reaction, 0));
t('SG corrected 1.026, observed 1.022 at 28 °C', () => { assert.strictEqual(a1.physical.sg.observed, 1.022); assert.strictEqual(a1.physical.sg.corrected, 1.026); });
t('heat coagulation +/++', () => assert.strictEqual(a1.chem.heat.grade, 3));
t('SSA turbidity', () => assert.strictEqual(a1.chem.ssa.grade, 2));
t('Benedict negative', () => assert.strictEqual(a1.chem.benedict.grade, 0));
t('Rothera negative', () => assert.strictEqual(a1.chem.rothera.grade, 0));
t('Hay negative / Fouchet negative', () => { assert.strictEqual(a1.chem.hay.grade, 0); assert.strictEqual(a1.chem.fouchet.grade, 0); });
t('Benzidine positive', () => assert.strictEqual(a1.chem.benzidine.grade, 2));
t('dipstick protein ++, blood large, glucose/ketone neg', () => { assert.strictEqual(a1.dip.protein, 3); assert.strictEqual(a1.dip.blood, 4); assert.strictEqual(a1.dip.glucose, 0); assert.strictEqual(a1.dip.ketone, 0); });

console.log('Case 2 — diabetic ketoacidosis');
const a2 = E.analyse(E.CASES.case2.sample, env);
t('polyuria, pale yellow, clear, fruity', () => { assert.strictEqual(a2.physical.volume, 1); assert.strictEqual(a2.physical.colour, 0); assert.strictEqual(a2.physical.appearance, 0); assert.strictEqual(E.ODOUR_OPTS[a2.physical.odour], 'Fruity'); });
t('pH 5 acidic', () => assert.strictEqual(a2.sample.pH, 5));
t('SG high (1.032) despite pale colour', () => assert.strictEqual(a2.physical.sg.corrected, 1.032));
t('Benedict brick red ≥2%', () => assert.strictEqual(a2.chem.benedict.grade, 4));
t('Rothera deep ring', () => assert.strictEqual(a2.chem.rothera.grade, 2));
t('protein, blood, bile salts, bile pigments absent', () => ['heat', 'ssa', 'benzidine', 'hay', 'fouchet'].forEach(k => assert.strictEqual(a2.chem[k].grade, 0, k)));
t('dipstick glucose ++++, ketone large, SG pad misses glucose (1.020)', () => { assert.strictEqual(a2.dip.glucose, 5); assert.ok(a2.dip.ketone >= 4); assert.strictEqual(E.DIP.sg.levels[a2.dip.sg], '1.020'); });

console.log('Detection limits / chemistry behaviour');
const run = s => E.analyse(s, env);
t('Benedict table: 0.5% green, 1% yellow, 1.5% orange, 2% brick red', () => [[0.5, 1], [1, 2], [1.5, 3], [2, 4], [0.05, 0]].forEach(([g, gr]) => assert.strictEqual(run({ glucose: g }).chem.benedict.grade, gr, g + '%')));
t('β-hydroxybutyrate alone is NOT detected by Rothera / strip', () => { const a = run({ bhb: 500 }); assert.strictEqual(a.chem.rothera.grade, 0); assert.strictEqual(a.dip.ketone, 0); });
t('acetone-only recipe (790 mg/dL) gives Rothera + and strip large', () => { const a = run({ acetone: 790 }); assert.strictEqual(a.chem.rothera.grade, 2); assert.ok(a.dip.ketone >= 4); });
t('phosphates: turbidity that clears with acid, no protein', () => { const a = run({ pH: 7.5, phosphates: true }); assert.strictEqual(a.chem.heat.grade, 1); assert.strictEqual(a.chem.heat.positive, false); });
t('free Hb (haemoglobinuria) → benzidine +', () => assert.strictEqual(run({ freeHb: 5 }).chem.benzidine.grade, 2));
t('5 RBC/µL is the benzidine threshold', () => { assert.strictEqual(run({ rbc: 4 }).chem.benzidine.grade, 0); assert.ok(run({ rbc: 6 }).chem.benzidine.grade > 0); });
t('obstructive jaundice: bile salts sink + bilirubin green', () => { const a = run({ bileSalts: 40, bilirubin: 2 }); assert.strictEqual(a.chem.hay.grade, 1); assert.strictEqual(a.chem.fouchet.grade, 1); });
t('temperature correction: at calibration temperature no correction', () => { const a = E.analyse({}, { troom: 15, tcal: 15 }); assert.strictEqual(a.physical.sg.observed, a.physical.sg.corrected); });
t('normal urine: all chemical tests negative', () => Object.values(run({}).chem).forEach(r => assert.strictEqual(r.grade, 0)));

console.log(`\n${pass} checks passed` + (process.exitCode ? ' — SOME FAILED' : ''));
