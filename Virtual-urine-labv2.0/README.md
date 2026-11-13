# Virtual Urine Lab v2.0: Experiment 10, Qualitative Analysis of Abnormal Urine

**Open the lab:** https://chickerursr.github.io/virtual-urine-lab/Virtual-urine-labv2.0/
(or download this folder and double-click `index.html`; it works offline)

Version 2.0 applies the department's corrections to the v1 lab (kept unchanged in the repository root).

## Changes from v1

| Area | Change |
|---|---|
| Start | Instruction screen before the lab begins, read aloud (browser speech): two case scenarios; do Case I, then Case II; physical → chemical → dipstick; interpret and submit the report. Replay from **📋 Instructions**. |
| Voice guide | Every step has spoken instructions (on by default; **🔊 Voice guide** toggles it, **↻ Repeat** replays the last instruction). It reads the case report, prompts each physical-examination entry in turn, reads each chemical test's procedure and every bench step with its result, says whether a recorded observation and inference are correct and what to do next, announces the dipstick 40 s and 2 min marks, and guides the report. Uses the browser's built-in speech (prefers an Indian-English voice); use headphones in a shared lab. |
| Physical: colour | Only **Straw / amber yellow** kept among the yellows (pale and dark yellow removed). Applies to both cases; Case II answer is now straw / amber yellow. |
| Physical: odour | **Ammoniacal** removed. |
| Physical: pH | **Dip pH paper in urine and compare** button blinks until clicked. |
| Physical: SG | Room temperature fixed at **29 °C** (urinometer calibrated at 15 °C). Urinometer drawn with a 1.000 (top) to 1.040 (bottom) scale, plus a magnifier at the meniscus. Observed SG: **Case I 1.023**, **Case II 1.029** (corrected 1.028 and 1.034). |
| Physical → chemical | Blue **Proceed for chemical examination** button. |
| Test selection | Molisch's, Biuret, Seliwanoff's, Barfoed's and Ehrlich's aldehyde tests removed; only the abnormal-urine tests remain. |
| Heat coagulation | Observations: *No turbidity in the heated upper portion* / *White turbidity in the heated portion, persists / increases after acetic acid*. Inferences: *Protein absent* / *Protein present*. |
| Sulphosalicylic acid | Observations: *Solution remains clear* / *White turbidity*. Inferences: *Protein absent* / *Protein present*. |
| Benedict's | Inferences name the colour: ~0.5% (green), ~1% (yellow), ~1.5% (orange), ≥2% (brick red). |
| Rothera's | Observation *Faint pink-purple ring at the junction* removed. |
| Hay's, Fouchet's, dipstick | No change. |
| Benzidine | Observation *Faint green colour* and inference *Blood present (small amount)* removed. |
| Report | Student name and **roll number** (required). **Save report as PDF** downloads `Expt10_Urine_Report_<roll>.pdf` with both cases, every recorded finding with its mark, marks per case and the grand total, and the student's interpretation. |
| Removed | Reaction simulator, Verify in lab, and Faculty · Wet-lab match tabs. |

## Marks

1 mark per item, per case (29 per case, 58 in total):

- Physical (9): volume, colour, appearance, odour, pH, reaction, observed SG, temperature difference, corrected SG
- Chemical (14): observation and inference for each of the 7 tests
- Dipstick (6): one per pad

The interpretation is not machine-marked; it goes into the PDF for the faculty to assess.

## Tests

```bash
node tests/engine.test.cjs
```

```bash
node tests/reactions.test.cjs
```

## Files

| File | Contents |
|---|---|
| `index.html`, `app.js` | the virtual bench |
| `engine.js` | case data, option lists, grading, dipstick |
| `reactions.js` | reaction models and colour engine |
| `vendor/jspdf.umd.min.js` | jsPDF 2.5.1 (MIT, see `vendor/jspdf.LICENSE`), used for the PDF report |
| `tests/` | automated tests (Node.js) |

Licence: [PolyForm Noncommercial 1.0.0](../LICENSE.md), as for v1. For medical education; not for clinical decisions.
