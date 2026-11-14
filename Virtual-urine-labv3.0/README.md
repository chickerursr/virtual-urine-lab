# Virtual Urine Lab v3.0: Experiment 10, Qualitative Analysis of Abnormal Urine

**Open the lab:** https://chickerursr.github.io/virtual-urine-lab/Virtual-urine-labv3.0/
(or download this folder and double-click `index.html`; it works offline)

Version 3.0 applies the department's second round of corrections to v2.0 (v2.0 is kept unchanged in `../Virtual-urine-labv2.0/`). Everything else, including the voice guide for every step, works as in v2.0.

## Changes from v2.0

| Area | Change |
|---|---|
| Physical: SG | Urinometer scale: each small division is **0.002** (five divisions between 1.010 and 1.020, instead of ten of 0.001), on the stem and in the magnifier. Calibration temperature changed from 15 °C to **20 °C** (room temperature stays 29 °C, so the temperature difference is 9 °C and the correction is +0.003). Observed SG is unchanged: **Case I 1.023 → corrected 1.026**, **Case II 1.029 → corrected 1.032**. |
| Rothera's | Inference *Ketone bodies present (small amount)* removed. |
| Report: interpretation | A clearly labelled **Interpretation of Case I / Case II** box now sits at the top of the Report tab, just below the roll number. The text also appears in the printed report and the PDF. The voice guide points students to it, and saving the PDF warns if a case has no interpretation. |
| Dipstick | **Removed**: no dipstick tab, readings, marks or voice prompts. The lab is now physical → chemical → report → clinical significance. |
| Marks | Total is **20**: 10 per case. See below. |
| Clinical significance | New last tab, **5 · Clinical significance**: proteins, reducing sugars (with the Benedict's colour table and causes of glycosuria), blood, ketone bodies, bile salts and bile pigments, as in the journal. **🔊 Read this section aloud** reads it, and the voice guide reads it when the tab opens. |

## Marks

Per case: 1 point per item, 23 points in total:

- Physical (9): volume, colour, appearance, odour, pH, reaction, observed SG, temperature difference, corrected SG
- Chemical (14): observation and inference for each of the 7 tests

The points are scaled to 10 marks per case, rounded to the nearest half mark, so Case I + Case II = 20. The interpretation is not machine-marked; it goes into the PDF for the faculty to assess.

## Tests

```bash
node tests/engine.test.cjs
node tests/reactions.test.cjs
```

## Files

| File | Contents |
|---|---|
| `index.html`, `app.js` | the virtual bench |
| `engine.js` | case data, option lists, clinical significance text, grading, dipstick |
| `reactions.js` | reaction models and colour engine |
| `vendor/jspdf.umd.min.js` | jsPDF 2.5.1 (MIT, see `vendor/jspdf.LICENSE`), used for the PDF report |
| `tests/` | automated tests (Node.js) |

Licence: [PolyForm Noncommercial 1.0.0](../LICENSE.md), as for v1. For medical education; not for clinical decisions.
