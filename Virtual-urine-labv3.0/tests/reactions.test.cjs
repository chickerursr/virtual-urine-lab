// Run:  node tests/reactions.test.cjs
// Checks that the mechanistic reaction models behave like the real chemistry.
const assert = require('assert');
const X = require('../reactions.js');
let pass = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ok  ' + name); } catch (e) { console.log('  FAIL ' + name + '\n       ' + e.message); process.exitCode = 1; } };
const N = { pH: 6, sgBase: 1.018, urochrome: 'straw', albumin: 0, rbc: 0, freeHb: 0, glucose: 0, acac: 0, acetone: 0, bhb: 0, bileSalts: 0, bilirubin: 0 };
const w = o => Object.assign({}, N, o);

console.log('Spectral colour engine');
t('white light renders white; no absorbance → #ffffff', () => assert.strictEqual(X.spectrumToHex(X.WL.map(() => 1)), '#ffffff'));
t('Benedict’s reagent renders blue (hue 190–240)', () => { const h = X.hueOf(X.benedict(w({})).reagentHex); assert.ok(h > 190 && h < 240, h); });
t('Benedict colour moves blue → green → yellow → orange → red as glucose rises', () => {
  const hues = [0, 0.5, 1, 1.5, 2].map(g => X.hueOf(X.benedict(w({ glucose: g })).hex));
  assert.ok(hues[0] > 190, 'blue ' + hues[0]); assert.ok(hues[1] > 100 && hues[1] < 190, 'green ' + hues[1]);
  assert.ok(hues[2] > 35 && hues[2] < 100, 'yellow ' + hues[2]); assert.ok(hues[3] > 15 && hues[3] < 40, 'orange ' + hues[3]); assert.ok(hues[4] < 25 || hues[4] > 340, 'red ' + hues[4]);
});
t('pH pad: orange at pH 5, green at 7, blue-green at 8.5', () => { const h = p => X.hueOf(X.padColourQ('pH', p, 60)); assert.ok(h(5) < 40); assert.ok(h(7) > 90 && h(7) < 160); assert.ok(h(8.5) > 160); });
t('protein pad turns from yellow to blue with albumin', () => assert.ok(X.hueOf(X.padColourQ('protein', 2000, 60)) > X.hueOf(X.padColourQ('protein', 0, 60)) + 100));

console.log('Kinetics and equilibria');
t('Benedict stoichiometry: Cu2O mass ∝ glucose (≈0.32 of Cu reduced per 1 %)', () => { const r = X.benedict(w({ glucose: 1 })); assert.ok(Math.abs(r.f - 0.32) < 0.03, r.f); });
t('Benedict in a 60 °C bath for 2 min under-reads 2 % glucose (Arrhenius)', () => assert.ok(X.benedict(w({ glucose: 2 }), { mode: 'bath60' }).grade < 4));
t('Benedict: no heating → no reduction', () => assert.strictEqual(X.benedict(w({ glucose: 2 }), { seconds: 0 }).grade, 0));
t('Albumin warmed to 55 °C does not coagulate; boiling does', () => { assert.strictEqual(X.heat(w({ albumin: 200 }), { tempC: 55 }).grade, 0); assert.ok(X.heat(w({ albumin: 200 })).grade >= 3); });
t('Acetic acid increases coagulation at pH 7 (isoelectric precipitation)', () => { const r = X.heat(w({ albumin: 100, pH: 7 })); assert.ok(r.A2 > 3 * r.A1, r.A1 + ' ' + r.A2); });
t('3 drops glacial acetic acid bring pH-6 urine to ≈3.1 (USGS PHREEQC: 3.09)', () => { const p = X.pHafterAcid(6, 3); assert.ok(Math.abs(p - 3.09) < 0.05, p); });
t('acid pH agrees with PHREEQC across pH 5–7 and 0–30 drops (RMS < 0.03)', () => {
  const ref = require('../opensource_sim/phreeqc_results.json').acid; let e = 0;
  ref.forEach(r => { e += (X.pHafterAcid(r.pH0, r.drops) - r.pH) ** 2; }); const rms = Math.sqrt(e / ref.length); assert.ok(rms < 0.03, rms);
});
t('Large excess of acid redissolves part of the coagulum', () => assert.ok(X.heat(w({ albumin: 200 }), { aceticDrops: 30 }).A2 < X.heat(w({ albumin: 200 })).A2));
t('SSA turbidity is linear in protein', () => { const a = X.ssa(w({ albumin: 50 })).A600, b = X.ssa(w({ albumin: 100 })).A600; assert.ok(Math.abs(b / a - 2) < 1e-6); });
t('Rothera ring forms faster with more ketone', () => assert.ok(X.rothera(w({ acac: 80 })).tRing < X.rothera(w({ acac: 3 })).tRing));
t('Rothera: β-hydroxybutyrate gives no ring', () => assert.strictEqual(X.rothera(w({ bhb: 1000 })).grade, 0));
t('Hay: γ falls with bile salts (Szyszkowski) and drop count rises', () => { const a = X.hay(w({})), b = X.hay(w({ bileSalts: 40 })); assert.ok(b.gamma < a.gamma && b.drops > a.drops); assert.ok(Math.abs(a.gamma - 66) < 0.01); });
t('Benzidine: colour time ∝ 1/haem', () => { const a = X.benzidine(w({ freeHb: 0.1 })).tVisible, b = X.benzidine(w({ freeHb: 0.2 })).tVisible; assert.ok(Math.abs(a / b - 2) < 0.01); });
t('Benzidine: no H2O2 → no colour', () => assert.strictEqual(X.benzidine(w({ freeHb: 30 }), { h2o2Drops: 0 }).grade, 0));
t('Fouchet spot is green with bilirubin', () => { const h = X.hueOf(X.fouchet(w({ bilirubin: 1 })).spotHex); assert.ok(h > 90 && h < 180, h); });

console.log('Verification and calibration');
t('judge: value within tolerance agrees, outside differs', () => { const m = X.measurables(w({ albumin: 150 })).find(x => x.id === 'ssaA'); assert.ok(X.judge(m, m.pred * 1.1).ok); assert.ok(!X.judge(m, m.pred * 1.6).ok); });
t('calibration: fitting SSA κ to a measurement reproduces it', () => {
  const s = w({ albumin: 150 }); const m = X.measurables(s).find(x => x.id === 'ssaA'); const measured = m.pred * 1.3;
  const cal = X.calibrate('ssa.kappa', s, measured, {}); X.setParams(cal);
  const m2 = X.measurables(s).find(x => x.id === 'ssaA'); X.setParams(null);
  assert.ok(Math.abs(m2.pred - measured) < 1e-4, m2.pred + ' vs ' + measured);
});
t('calibration: fitting benzidine k to a measured time reproduces it', () => {
  const s = w({ freeHb: 0.5 }); const m = X.measurables(s).find(x => x.id === 'bzT'); const measured = m.pred * 0.6;
  X.setParams(X.calibrate('benzidine.kEff', s, measured, {})); const m2 = X.measurables(s).find(x => x.id === 'bzT'); X.setParams(null);
  assert.ok(Math.abs(m2.pred - measured) < 1e-3);
});
t('standards protocol covers all 7 tests', () => assert.strictEqual(X.standards().length, 7));

console.log(`\n${pass} checks passed` + (process.exitCode ? ' — SOME FAILED' : ''));
