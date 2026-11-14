"""Cross-check of the in-browser model against USGS PHREEQC (open source, via phreeqpython).
1) pH of urine after 2-3 drops of glacial acetic acid (heat coagulation test)
2) BaSO4 (barite) supersaturation in Fouchet's test
3) Ca-phosphate (hydroxyapatite) saturation on heating alkaline urine (phosphate turbidity)
Writes phreeqc_results.json for the slide deck."""
import json
from phreeqpython import PhreeqPython

pp = PhreeqPython()  # loads phreeqc.dat
ACET = """
SOLUTION_MASTER_SPECIES
Acet   Acet-   0  59.04  59.04
SOLUTION_SPECIES
Acet- = Acet-
  log_k 0
Acet- + H+ = HAcet
  log_k 4.757
  delta_h 0.4 kJ
"""
# typical 24-h urine composition (mmol/L); charge balanced on Cl
URINE = "units mmol/kgw\n temp 25\n pH {pH}\n Na 140\n K 50\n Ca 4\n Mg 3\n P {P}\n S(6) 18\n Cl 120 charge\n"

def run(block):
    pp.ip.run_string(block)
    out = pp.ip.get_selected_output_array()
    return dict(zip(out[0], out[-1]))

res = {}
# 1) acetic acid titration of urine (10 mL urine + n drops of 17.4 M glacial acetic acid, 0.05 mL/drop)
res['acid'] = []
for pH0 in (5.0, 6.0, 7.0):
    for drops in (0, 1, 2, 3, 5, 10, 20, 30):
        mmol_per_L = drops * 0.05 * 17.4 / (10 + drops * 0.05) * 1000  # mmol/L in the tube
        block = ACET + "SOLUTION 1\n" + URINE.format(pH=pH0, P=25) + \
            f"REACTION 1\n HAcet 1\n {mmol_per_L/1000:.6f} moles\nSELECTED_OUTPUT\n -reset false\n -pH true\nEND\n"
        r = run(block)
        res['acid'].append({'pH0': pH0, 'drops': drops, 'pH': r['pH']})
# 2) Fouchet: 5 mL urine + MgSO4 pinch (~1 mmol) + 1.5 mL 10% BaCl2 (0.48 M) -> barite SI before precipitation
block = "SOLUTION 1\n" + URINE.format(pH=6.0, P=25) + "REACTION 1\n BaCl2 1\n 0.11 moles\n MgSO4 1\n 0.15 moles\n" + \
        "SELECTED_OUTPUT\n -reset false\n -saturation_indices Barite\nEND\n"
r = run(block); res['barite_SI'] = r.get('si_Barite')
block = "SOLUTION 1\n" + URINE.format(pH=6.0, P=25) + "REACTION 1\n BaCl2 1\n 0.11 moles\n MgSO4 1\n 0.15 moles\nEQUILIBRIUM_PHASES 1\n Barite 0 0\n" + \
        "SELECTED_OUTPUT\n -reset false\n -equilibrium_phases Barite\nEND\n"
r = run(block); res['barite_mol_per_kgw'] = r.get('d_Barite')
# 3) phosphate: hydroxyapatite saturation index vs pH and temperature
res['hap'] = []
for pH0 in (5.5, 6.0, 6.5, 7.0, 7.5, 8.0):
    for T in (25, 90):
        block = "SOLUTION 1\n" + URINE.format(pH=pH0, P=25).replace('temp 25', f'temp {T}') + \
            "SELECTED_OUTPUT\n -reset false\n -saturation_indices Hydroxyapatite\nEND\n"
        r = run(block); res['hap'].append({'pH': pH0, 'T': T, 'SI': r['si_Hydroxyapatite']})
json.dump(res, open('phreeqc_results.json', 'w'), indent=1)
for a in res['acid']:
    if a['drops'] in (0, 3, 30): print('acid', a)
print('barite SI', res['barite_SI'], 'precipitated mol/kgw', res['barite_mol_per_kgw'])
for h in res['hap']: print('HAP', h)
