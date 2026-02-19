#!/usr/bin/env python3
"""
Generate comparison results: PolicyEngine vs OBR salary sacrifice cap.
Outputs CSV files to public/data/ for the React dashboard.

Requires: policyengine_uk (pip install policyengine-uk)
Runtime: ~2-3 minutes (6 simulations x ~12s each)
"""

import os
import csv
import time
from pathlib import Path
import numpy as np
import pandas as pd
import h5py
from policyengine_uk import Microsimulation
from policyengine_uk.utils.scenario import Scenario
from microdf import MicroSeries

OUT_DIR = os.path.join(os.path.dirname(__file__), "public", "data")
os.makedirs(OUT_DIR, exist_ok=True)

CAP = 2000
YEAR = 2029
NEW_NI_RATE = 0.15

# ── OBR Reference Figures ──────────────────────────────────────────
OBR = {
    "ss_tax_base_bn": 14.3,
    "ss_ee_nics_rate": 0.027,
    "ss_er_nics_rate": 0.15,
    "ss_static_bn": 2.5,
    "bonus_tax_base_bn": 13.8,
    "bonus_ee_nics_rate": 0.02,
    "bonus_er_nics_rate": 0.15,
    "bonus_static_bn": 2.3,
    "revenue_static_bn": 4.9,
    "revenue_headline_bn": 4.7,
    "behav_employers_switching_bn": 0.5,
    "behav_ras_timing_bn": -1.6,
    "behav_pass_through_bn": 0.7,
    "behav_other_bn": 0.5,
    "etr_it": 0.438,
    "etr_ee_nics": 0.023,
    "etr_er_nics": 0.15,
    "etr_ct": 0.20,
    "wages_bn": 1410,
    "employment_m": 35.2,
    "total_ss_users": 7_700_000,
    "protected_below_2k": 4_300_000,
    "affected_above_2k": 3_300_000,
    "employer_ni_rate": 0.15,
    "employee_ni_basic": 0.08,
    "employee_ni_higher": 0.02,
}


# ── Reform Function ────────────────────────────────────────────────
def create_cap_reform(cap, year, employer_ni_rate, pass_through_rate,
                      redirect_to_pension=True):
    def modify(sim):
        ss = sim.calculate("pension_contributions_via_salary_sacrifice", period=year).values
        emp = sim.calculate("employment_income", period=year).values
        pens = sim.calculate("employee_pension_contributions", period=year).values
        excess = np.maximum(ss - cap, 0)
        pension_redirect = excess if redirect_to_pension else np.zeros_like(excess)
        if pass_through_rate > 0 and emp.sum() > 0:
            total_ni_increase = (excess * employer_ni_rate).sum()
            passed_cost = total_ni_increase * pass_through_rate
            haircut_rate = passed_cost / emp.sum()
            new_emp = emp * (1 - haircut_rate) + excess
        else:
            new_emp = emp + excess
        sim.set_input("employment_income", year, new_emp)
        sim.set_input("employee_pension_contributions", year, pens + pension_redirect)
        sim.set_input("pension_contributions_via_salary_sacrifice", year, np.minimum(ss, cap))
    return modify


def write_csv(filename, rows, headers):
    path = os.path.join(OUT_DIR, filename)
    with open(path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(headers)
        writer.writerows(rows)
    print(f"  Wrote {path}")


def main():
    t_start = time.time()

    # ── 1. Baseline ────────────────────────────────────────────────
    print("Running baseline simulation...")
    baseline = Microsimulation()
    baseline_balance = baseline.calculate("gov_balance", period=YEAR).sum()

    ss = baseline.calculate("pension_contributions_via_salary_sacrifice", period=YEAR).values
    emp = baseline.calculate("employment_income", period=YEAR).values
    weights = baseline.calculate("person_weight", period=YEAR).values

    has_ss = ss > 0
    above_cap = ss > CAP
    has_employment = emp > 0

    pe_total_ss = weights[has_ss].sum()
    pe_above_cap = weights[above_cap].sum()
    pe_below_cap = pe_total_ss - pe_above_cap
    pe_total_workers = weights[has_employment].sum()
    pe_total_wages = (emp * weights).sum()
    pe_total_excess = (np.maximum(ss - CAP, 0) * weights).sum()
    pe_avg_excess = (
        (np.maximum(ss - CAP, 0)[above_cap] * weights[above_cap]).sum()
        / weights[above_cap].sum()
    )

    obr_avg_excess = OBR["ss_tax_base_bn"] * 1e9 / OBR["affected_above_2k"]

    print(f"Baseline ready ({time.time() - t_start:.1f}s)")

    # ── 2. Tax Base CSV ────────────────────────────────────────────
    pe_mech_er = pe_total_excess * OBR["ss_er_nics_rate"] / 1e9
    pe_mech_ee = pe_total_excess * OBR["ss_ee_nics_rate"] / 1e9
    write_csv("tax_base.csv",
        [
            ["SS tax base above £2k cap", f"{pe_total_excess/1e9:.2f}", f"{OBR['ss_tax_base_bn']}", "£bn", f"{pe_total_excess/1e9/OBR['ss_tax_base_bn']:.3f}"],
            ["Workers above cap", f"{pe_above_cap:.0f}", f"{OBR['affected_above_2k']}", "count", f"{pe_above_cap/OBR['affected_above_2k']:.3f}"],
            ["Avg excess per worker", f"{pe_avg_excess:.0f}", f"{obr_avg_excess:.0f}", "£", f"{pe_avg_excess/obr_avg_excess:.3f}"],
            ["Mechanical ER NICs", f"{pe_mech_er:.2f}", f"{OBR['ss_tax_base_bn']*OBR['ss_er_nics_rate']:.2f}", "£bn", f"{pe_mech_er/(OBR['ss_tax_base_bn']*OBR['ss_er_nics_rate']):.3f}"],
            ["Mechanical EE NICs", f"{pe_mech_ee:.2f}", f"{OBR['ss_tax_base_bn']*OBR['ss_ee_nics_rate']:.2f}", "£bn", f"{pe_mech_ee/(OBR['ss_tax_base_bn']*OBR['ss_ee_nics_rate']):.3f}"],
            ["Mechanical total NICs", f"{pe_mech_er+pe_mech_ee:.2f}", f"{OBR['ss_static_bn']}", "£bn", f"{(pe_mech_er+pe_mech_ee)/OBR['ss_static_bn']:.3f}"],
        ],
        ["metric", "pe", "obr", "unit", "ratio"],
    )

    # ── 3. Population CSV ──────────────────────────────────────────
    write_csv("population.csv",
        [
            ["Total SS contributors", f"{pe_total_ss:.0f}", f"{OBR['total_ss_users']}", f"{pe_total_ss/OBR['total_ss_users']:.3f}"],
            ["Workers above £2000 cap", f"{pe_above_cap:.0f}", f"{OBR['affected_above_2k']}", f"{pe_above_cap/OBR['affected_above_2k']:.3f}"],
            ["Workers below £2000 cap", f"{pe_below_cap:.0f}", f"{OBR['protected_below_2k']}", f"{pe_below_cap/OBR['protected_below_2k']:.3f}"],
            ["Total employed", f"{pe_total_workers:.0f}", f"{OBR['employment_m']*1e6:.0f}", f"{pe_total_workers/(OBR['employment_m']*1e6):.3f}"],
        ],
        ["metric", "pe", "obr", "ratio"],
    )

    # ── 4. Wages & Employment CSV ──────────────────────────────────
    write_csv("wages_employment.csv",
        [
            ["Total wages and salaries", f"{pe_total_wages/1e9:.0f}", f"{OBR['wages_bn']}", "£bn", f"{pe_total_wages/1e9/OBR['wages_bn']:.3f}"],
            ["Employment", f"{pe_total_workers/1e6:.1f}", f"{OBR['employment_m']}", "millions", f"{pe_total_workers/1e6/OBR['employment_m']:.3f}"],
        ],
        ["metric", "pe", "obr", "unit", "ratio"],
    )

    # ── 5. NICs Rates CSV ──────────────────────────────────────────
    taxable_income = baseline.calculate("adjusted_net_income", period=YEAR).values
    basic_above = above_cap & (taxable_income <= 50270)
    higher_above = above_cap & (taxable_income > 50270)
    pct_basic = weights[basic_above].sum() / weights[above_cap].sum()
    pct_higher = weights[higher_above].sum() / weights[above_cap].sum()
    pe_implied_ee = pct_basic * 0.08 + pct_higher * 0.02
    write_csv("nics_rates.csv",
        [
            [f"Basic rate (8% NICs; <=£50270)", f"{pct_basic:.3f}", "0.08"],
            [f"Higher rate (2% NICs; >£50270)", f"{pct_higher:.3f}", "0.02"],
            ["PE implied average", "", f"{pe_implied_ee:.3f}"],
            ["OBR average", "", f"{OBR['ss_ee_nics_rate']:.3f}"],
        ],
        ["band", "pct_workers", "nics_rate"],
    )

    # ── 6. Run Scenarios ───────────────────────────────────────────
    scenario_defs = [
        {"name": "Absorb cost + Maintain pension",          "pass_through": 0.0,  "redirect": True},
        {"name": "Spread cost + Maintain pension",          "pass_through": 1.0,  "redirect": True},
        {"name": "Absorb cost + Take cash",                 "pass_through": 0.0,  "redirect": False},
        {"name": "Spread cost + Take cash",                 "pass_through": 1.0,  "redirect": False},
        {"name": "OBR 76% pass-through + Maintain pension", "pass_through": 0.76, "redirect": True},
    ]

    results = {}
    scenario_rows = []
    for s in scenario_defs:
        t0 = time.time()
        modifier = create_cap_reform(
            cap=CAP, year=YEAR, employer_ni_rate=NEW_NI_RATE,
            pass_through_rate=s["pass_through"], redirect_to_pension=s["redirect"],
        )
        reformed = Microsimulation(scenario=Scenario(simulation_modifier=modifier))
        reformed_balance = reformed.calculate("gov_balance", period=YEAR).sum()
        revenue_bn = (reformed_balance - baseline_balance) / 1e9
        results[s["name"]] = revenue_bn
        scenario_rows.append([
            s["name"],
            f"{int(s['pass_through']*100)}",
            str(s["redirect"]).lower(),
            f"{revenue_bn:.2f}",
        ])
        print(f"  {s['name']}: £{revenue_bn:.2f}bn ({time.time()-t0:.1f}s)")

    write_csv("scenarios.csv", scenario_rows,
              ["name", "pass_through_pct", "redirect_to_pension", "revenue_bn"])

    # ── 7. Revenue Decomposition ───────────────────────────────────
    modifier = create_cap_reform(cap=CAP, year=YEAR, employer_ni_rate=NEW_NI_RATE,
                                 pass_through_rate=0.0, redirect_to_pension=True)
    reformed_decomp = Microsimulation(scenario=Scenario(simulation_modifier=modifier))
    rw = reformed_decomp.calculate("person_weight", period=YEAR).values

    b_it = (baseline.calculate("income_tax", period=YEAR).values * weights).sum()
    r_it = (reformed_decomp.calculate("income_tax", period=YEAR).values * rw).sum()
    d_it = (r_it - b_it) / 1e9

    b_ee = (baseline.calculate("national_insurance", period=YEAR).values * weights).sum()
    r_ee = (reformed_decomp.calculate("national_insurance", period=YEAR).values * rw).sum()
    d_ee = (r_ee - b_ee) / 1e9

    b_er = (baseline.calculate("ni_employer", period=YEAR).values * weights).sum()
    r_er = (reformed_decomp.calculate("ni_employer", period=YEAR).values * rw).sum()
    d_er = (r_er - b_er) / 1e9

    write_csv("revenue_decomposition.csv",
        [
            ["Income tax", f"{d_it:.2f}", "0.00"],
            ["Employee NICs", f"{d_ee:.2f}", f"{OBR['ss_tax_base_bn']*OBR['ss_ee_nics_rate']:.2f}"],
            ["Employer NICs", f"{d_er:.2f}", f"{OBR['ss_tax_base_bn']*OBR['ss_er_nics_rate']:.2f}"],
            ["NICs subtotal", f"{d_ee+d_er:.2f}", f"{OBR['ss_static_bn']:.2f}"],
            ["Total", f"{results['Absorb cost + Maintain pension']:.2f}", f"{OBR['ss_static_bn']:.2f}"],
        ],
        ["component", "pe_change_bn", "obr_ss_equiv_bn"],
    )

    # ── 8. IT Leakage ─────────────────────────────────────────────
    b_pptax = (baseline.calculate("personal_pension_contributions_tax", period=YEAR).values * weights).sum()
    r_pptax = (reformed_decomp.calculate("personal_pension_contributions_tax", period=YEAR).values * rw).sum()
    d_pptax = (r_pptax - b_pptax) / 1e9

    b_relief = (baseline.calculate("pension_contributions_relief", period=YEAR).values * weights).sum()
    r_relief = (reformed_decomp.calculate("pension_contributions_relief", period=YEAR).values * rw).sum()
    d_relief = (r_relief - b_relief) / 1e9

    write_csv("it_leakage.csv",
        [
            ["AA tax charge increase", f"{d_pptax:.2f}"],
            ["Incomplete relief offset", f"{d_it - d_pptax:.2f}"],
            ["Total IT change", f"{d_it:.2f}"],
            ["Pension relief change", f"{d_relief:.2f}"],
            ["Employment income change", f"{pe_total_excess/1e9:.2f}"],
            ["Relief shortfall", f"{pe_total_excess/1e9 - d_relief:.2f}"],
        ],
        ["component", "change_bn"],
    )

    # ── 9. Behavioural CSV (static OBR reference) ─────────────────
    write_csv("behavioural.csv",
        [
            ["Static yield (SS + bonus)", "-4.9", "Partial"],
            ["SS only", "-2.5", "Yes"],
            ["Bonus only", "-2.3", "No"],
            ["Employers switching to ordinary contribs", "+0.5", "No"],
            ["Employees switching to RAS schemes", "-1.6", "No"],
            ["Pass-through to lower wages/profits", "+0.7", "Yes"],
            ["Other (DC reduction; forestalling)", "+0.5", "No"],
            ["Post-behavioural (headline)", "-4.7", ""],
        ],
        ["component", "obr_bn", "pe_models"],
    )

    # ── 10. Distributional Impact ──────────────────────────────────
    baseline_hh_income = baseline.calculate("household_net_income", period=YEAR).values
    reformed_hh_income = reformed_decomp.calculate("household_net_income", period=YEAR).values
    hh_decile = baseline.calculate("household_income_decile", period=YEAR).values
    hh_weight = baseline.calculate("household_weight", period=YEAR).values

    dist_rows = []
    for d in range(1, 11):
        mask = hh_decile == d
        w = hh_weight[mask]
        total_w = w.sum()
        if total_w == 0:
            continue
        avg_baseline_val = (baseline_hh_income[mask] * w).sum() / total_w
        avg_reformed_val = (reformed_hh_income[mask] * w).sum() / total_w
        avg_change = avg_reformed_val - avg_baseline_val
        pct_change = 100 * avg_change / avg_baseline_val if avg_baseline_val != 0 else 0
        dist_rows.append([d, f"{avg_baseline_val:.0f}", f"{avg_reformed_val:.0f}",
                          f"{avg_change:.0f}", f"{pct_change:.2f}"])

    write_csv("distributional.csv", dist_rows,
              ["decile", "avg_baseline", "avg_reformed", "avg_change_gbp", "pct_change"])

    # ── 11. Winners & Losers ───────────────────────────────────────
    income_change = reformed_hh_income - baseline_hh_income
    capped_baseline = np.maximum(baseline_hh_income, 1)
    pct_change_hh = (income_change / capped_baseline) * 100
    hh_count_people = baseline.calculate("household_count_people", period=YEAR).values
    valid_mask = hh_decile >= 1
    threshold = 0.01

    wl_rows = []
    for d in range(1, 11):
        decile_mask = valid_mask & (hh_decile == d)
        total_people = (hh_count_people[decile_mask] * hh_weight[decile_mask]).sum()
        if total_people == 0:
            continue
        losers = (hh_count_people[decile_mask & (pct_change_hh < -threshold)] *
                  hh_weight[decile_mask & (pct_change_hh < -threshold)]).sum()
        winners = (hh_count_people[decile_mask & (pct_change_hh > threshold)] *
                   hh_weight[decile_mask & (pct_change_hh > threshold)]).sum()
        no_change = total_people - losers - winners
        wl_rows.append([
            d,
            f"{100*losers/total_people:.1f}",
            f"{100*winners/total_people:.1f}",
            f"{100*no_change/total_people:.1f}",
        ])

    write_csv("winners_losers.csv", wl_rows,
              ["decile", "pct_losers", "pct_winners", "pct_no_change"])

    # ── 12. Constituency Impact ────────────────────────────────────
    print("\nCalculating constituency impacts...")
    weights_path = Path("data/parliamentary_constituency_weights.h5")
    constituencies_path = Path("data_inputs/constituencies_2024.csv")

    if weights_path.exists() and constituencies_path.exists():
        with h5py.File(weights_path, "r") as f:
            constituency_weights = f["2025"][...]

        constituency_df = pd.read_csv(constituencies_path)

        baseline_income = baseline.calculate(
            "household_net_income", period=YEAR, map_to="household"
        ).values
        reform_income = reformed_decomp.calculate(
            "household_net_income", period=YEAR, map_to="household"
        ).values

        constituency_results = []
        for i in range(len(constituency_df)):
            name = constituency_df.iloc[i]["name"]
            code = constituency_df.iloc[i]["code"]
            weight = constituency_weights[i]

            baseline_ms = MicroSeries(baseline_income, weights=weight)
            reform_ms = MicroSeries(reform_income, weights=weight)

            avg_change = (
                reform_ms.sum() - baseline_ms.sum()
            ) / baseline_ms.count()

            constituency_results.append([
                f"{YEAR}-{str(YEAR+1)[-2:]}",
                code,
                name,
                f"{avg_change:.2f}",
            ])

        write_csv("constituency.csv", constituency_results,
                  ["year", "constituency_code", "constituency_name", "avg_change"])
    else:
        print("  Constituency data not found, skipping.")

    print(f"\nAll CSVs written to {OUT_DIR}/ in {time.time()-t_start:.0f}s")


if __name__ == "__main__":
    main()
