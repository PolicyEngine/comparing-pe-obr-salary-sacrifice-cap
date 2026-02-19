import { useState, useEffect, useRef } from "react";
import "./Dashboard.css";

const sections = [
  { id: "baseline", label: "Baseline" },
  { id: "revenue", label: "Revenue" },
  { id: "decomposition", label: "Decomp" },
  { id: "behavioural", label: "Behavioural" },
  { id: "distributional", label: "Distribution" },
  { id: "winners-losers", label: "Winners" },
  { id: "constituency", label: "Local impact" },
  { id: "conclusion", label: "Conclusion" },
];

/* ── CSV parser ─────────────────────────────────────────────────── */
function splitCSVLine(line) {
  const cols = [];
  let cur = "", inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === "," && !inQuotes) { cols.push(cur); cur = ""; }
    else { cur += ch; }
  }
  cols.push(cur);
  return cols;
}

function parseCSV(text) {
  const lines = text.trim().split("\n");
  const headers = splitCSVLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = splitCSVLine(line);
    const row = {};
    headers.forEach((h, i) => {
      const v = (values[i] || "").trim();
      row[h] = v !== "" && !isNaN(v) ? parseFloat(v) : v;
    });
    return row;
  });
}

/* ── Formatting helpers ─────────────────────────────────────────── */
function fmtError(ratio) {
  const pct = Math.round((ratio - 1) * 100);
  return `${pct > 0 ? "+" : ""}${pct}%`;
}

const ORDINAL = ["first","second","third","fourth","fifth","sixth","seventh","eighth","ninth","tenth"];

/* ── Component ──────────────────────────────────────────────────── */
export default function Dashboard() {
  const [activeSection, setActiveSection] = useState("baseline");
  const [data, setData] = useState(null);
  const sectionRefs = {};
  sections.forEach((s) => { sectionRefs[s.id] = useRef(null); });

  useEffect(() => {
    async function fetchAll() {
      const urls = {
        taxBase: "/data/tax_base.csv",
        population: "/data/population.csv",
        wagesEmployment: "/data/wages_employment.csv",
        scenarios: "/data/scenarios.csv",
        revenueDecomp: "/data/revenue_decomposition.csv",
        itLeakage: "/data/it_leakage.csv",
        distributional: "/data/distributional.csv",
        winnersLosers: "/data/winners_losers.csv",
        constituency: "/data/constituency.csv",
      };
      const results = {};
      await Promise.all(
        Object.entries(urls).map(async ([key, url]) => {
          try {
            const resp = await fetch(url);
            if (resp.ok) results[key] = parseCSV(await resp.text());
          } catch (e) {
            console.error(`Failed to load ${key}:`, e);
          }
        })
      );
      setData(results);
    }
    fetchAll();
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveSection(entry.target.id);
        });
      },
      { root: null, rootMargin: "-20% 0px -60% 0px", threshold: 0 }
    );
    Object.values(sectionRefs).forEach((ref) => {
      if (ref.current) observer.observe(ref.current);
    });
    return () => observer.disconnect();
  }, [data]);

  /* ── Loading ─────────────────────────────────────────────────── */
  if (!data) {
    return (
      <div className="narrative-container">
        <header className="narrative-hero">
          <h1>Comparing PolicyEngine and OBR salary sacrifice cap estimates</h1>
        </header>
        <p className="api-loading">Loading data…</p>
      </div>
    );
  }

  /* ── Derived data ────────────────────────────────────────────── */
  const {
    taxBase, population, wagesEmployment, scenarios,
    revenueDecomp, itLeakage, distributional, winnersLosers,
    constituency,
  } = data;

  const tb = (metric) => taxBase?.find((r) => r.metric === metric);
  const pop = (metric) => population?.find((r) => r.metric === metric);
  const we = (metric) => wagesEmployment?.find((r) => r.metric === metric);
  const sc = (name) => scenarios?.find((r) => r.name === name);
  const rd = (comp) => revenueDecomp?.find((r) => r.component === comp);
  const il = (comp) => itLeakage?.find((r) => r.component === comp);

  // Baseline table
  const ssContrib = pop("Total SS contributors");
  const aboveCap = pop("Workers above £2000 cap");
  const taxBaseRow = tb("SS tax base above £2k cap");
  const avgExcess = tb("Avg excess per worker");
  const wagesRow = we("Total wages and salaries");

  const baselineRows = [
    ssContrib && {
      metric: "Salary sacrifice contributors",
      pe: `${(ssContrib.pe / 1e6).toFixed(1)} million`,
      obr: `${(ssContrib.obr / 1e6).toFixed(1)} million`,
      error: fmtError(ssContrib.ratio),
    },
    aboveCap && {
      metric: "Workers above £2,000 cap",
      pe: `${(aboveCap.pe / 1e6).toFixed(1)} million`,
      obr: `${(aboveCap.obr / 1e6).toFixed(1)} million`,
      error: fmtError(aboveCap.ratio),
    },
    taxBaseRow && {
      metric: "Total excess above cap",
      pe: `£${taxBaseRow.pe?.toFixed(1)} billion`,
      obr: `£${taxBaseRow.obr?.toFixed(1)} billion`,
      error: fmtError(taxBaseRow.ratio),
    },
    avgExcess && {
      metric: "Average excess per affected worker",
      pe: `£${avgExcess.pe?.toLocaleString()}`,
      obr: `£${avgExcess.obr?.toLocaleString()}`,
      error: fmtError(avgExcess.ratio),
    },
    wagesRow && {
      metric: "Total wages and salaries",
      pe: `£${wagesRow.pe?.toLocaleString()} billion`,
      obr: `£${wagesRow.obr?.toLocaleString()} billion`,
      error: fmtError(wagesRow.ratio),
    },
  ].filter(Boolean);

  // Dynamic baseline percentages
  const ssMorePct = ssContrib ? Math.abs(Math.round((ssContrib.ratio - 1) * 100)) : 9;
  const taxBaseLowerPct = taxBaseRow ? Math.abs(Math.round((1 - taxBaseRow.ratio) * 100)) : 28;
  const avgExcessLowerPct = avgExcess ? Math.abs(Math.round((1 - avgExcess.ratio) * 100)) : 35;
  const wagesAlignPct = wagesRow ? Math.abs(((wagesRow.ratio - 1) * 100)).toFixed(1) : "2.5";

  // Scenarios (blog ordering)
  const scenarioOrder = [
    "Absorb cost + Maintain pension",
    "OBR 76% pass-through + Maintain pension",
    "Spread cost + Maintain pension",
    "Absorb cost + Take cash",
    "Spread cost + Take cash",
  ];
  const scenarioDisplayNames = {
    "Absorb cost + Maintain pension": "Absorb cost + maintain pension",
    "OBR 76% pass-through + Maintain pension": "OBR 76% pass-through + maintain pension",
    "Spread cost + Maintain pension": "Spread cost (100% pass-through) + maintain pension",
    "Absorb cost + Take cash": "Absorb cost + take cash",
    "Spread cost + Take cash": "Spread cost + take cash",
  };
  const orderedScenarios = scenarioOrder
    .map((name) => scenarios?.find((r) => r.name === name))
    .filter(Boolean);

  const absorbPension = sc("Absorb cost + Maintain pension");
  const obr76 = sc("OBR 76% pass-through + Maintain pension");
  const ptOffset = absorbPension && obr76
    ? (absorbPension.revenue_bn - obr76.revenue_bn).toFixed(2)
    : "0.53";

  // Decomposition dynamic percentages
  const nicsSubtotal = rd("NICs subtotal");
  const nicsRatioPct = nicsSubtotal && nicsSubtotal.obr_ss_equiv_bn
    ? Math.round((nicsSubtotal.pe_change_bn / nicsSubtotal.obr_ss_equiv_bn) * 100)
    : 72;
  const nicsGapPct = 100 - nicsRatioPct;
  const taxBaseRatioPct = taxBaseRow ? Math.round(taxBaseRow.ratio * 100) : 72;

  // Distributional
  const topDecile = distributional?.[9];
  const bottomDecile = distributional?.[0];

  // Constituency — top 5 most affected (largest negative avg_change)
  const topConstituencies = constituency
    ? [...constituency]
        .filter((r) => r.avg_change < 0)
        .sort((a, b) => a.avg_change - b.avg_change)
        .slice(0, 5)
    : [];

  // Winners/losers
  const totalLosersPct = winnersLosers
    ? (winnersLosers.reduce((sum, r) => sum + r.pct_losers, 0) / winnersLosers.length).toFixed(1)
    : "11.2";
  const maxLoserDecile = winnersLosers
    ? winnersLosers.reduce((max, r) => r.pct_losers > (max?.pct_losers ?? 0) ? r : max, null)
    : null;
  const maxLoserDecileLabel = maxLoserDecile ? ORDINAL[maxLoserDecile.decile - 1] : "eighth";

  /* ── Render ──────────────────────────────────────────────────── */
  return (
    <div className="narrative-container">
      {/* Hero */}
      <header className="narrative-hero">
        <h1>Comparing PolicyEngine and OBR salary sacrifice cap estimates</h1>
      </header>

      {/* ── Introduction ───────────────────────────────────────── */}
      <section className="narrative-section">
        <h2>Introduction</h2>
        <p>
          PolicyEngine models the government's proposed £2,000 salary sacrifice
          pension contributions cap using a full microsimulation of the UK
          tax-benefit system, built on the enhanced Family Resources Survey (FRS)
          with salary sacrifice values estimated from survey and administrative
          data. This post builds on our{" "}
          <a href="https://www.policyengine.org/uk/research/uk-salary-sacrifice-cap">
            earlier analysis of the salary sacrifice cap
          </a>{" "}
          and presents a comparison with the OBR's{" "}
          <a href="https://obr.uk/supplementary-forecast-information-salary-sacrifice-costing/">
            supplementary forecast
          </a>.
        </p>
        <p>
          Note: PolicyEngine does not model bonus sacrifice, as there is no
          bonus sacrifice variable in policyengine-uk. The OBR's headline £4.9
          billion static yield includes both salary sacrifice (£2.5 billion) and
          bonus sacrifice (£2.3 billion). All comparisons in this analysis use
          the salary-sacrifice-only component.
        </p>
      </section>

      {/* ── What is salary sacrifice? ──────────────────────────── */}
      <section className="narrative-section">
        <h2>What is salary sacrifice?</h2>
        <p>
          Salary sacrifice is an arrangement where an employee gives up part of
          their cash pay in exchange for a non-cash benefit, most commonly an
          employer pension contribution. Because the sacrificed amount is paid by
          the employer rather than the employee, both parties save on National
          Insurance: the employee avoids employee NICs (8% basic rate, 2% higher
          rate) and the employer avoids employer NICs (15%). Income tax relief is
          also preserved, since the contribution goes directly into the pension.
          HMRC's guidance defines the mechanism, and their research shows it is
          widely used: in 2019, 30% of private-sector employees and 9% of
          public-sector employees in organisations offering salary sacrifice
          contributed to pensions through these arrangements.
        </p>
        <p>
          The government's proposed cap would limit tax-advantaged salary
          sacrifice pension contributions to £2,000 per year. Above this
          threshold, standard NI rates would apply.
        </p>
      </section>

      {/* ── How PolicyEngine models the cap + Assumptions ──────── */}
      <section className="narrative-section">
        <h2>How PolicyEngine models the cap</h2>
        <p>
          The cap is implemented as a modification to PolicyEngine's baseline
          microsimulation. For each individual in the dataset:
        </p>
        <ol>
          <li>Cap salary sacrifice at £2,000 per year</li>
          <li>
            Reclassify the excess as ordinary employment income (increasing the
            individual's taxable pay)
          </li>
          <li>
            Redirect the excess to employee pension contributions
          </li>
          <li>
            Optionally model pass-through, where employers reduce wages across
            the workforce to offset their increased National Insurance costs
          </li>
        </ol>
        <p>
          Because PolicyEngine computes the full tax-benefit system
          simultaneously, interactions between income tax, National Insurance,
          pension relief, the Annual Allowance, and means-tested benefits are
          captured endogenously, rather than calculating each tax component
          separately using average effective rates.
        </p>

        <h3>Assumptions</h3>
        <p>
          This analysis models the cap's effects under the following
          assumptions:
        </p>
        <ol>
          <li>
            <strong>Continued pension saving:</strong> Employees currently
            using salary sacrifice maintain their desire to contribute the same
            total amount to pensions.
          </li>
          <li>
            <strong>Contribution redirection:</strong> Contributions exceeding
            the £2,000 cap shift from salary sacrifice to regular employee
            pension contributions (which receive income tax relief but not
            National Insurance relief).
          </li>
          <li>
            <strong>Employer response varies by scenario:</strong> We model
            cases where employers absorb their increased NI costs, spread them
            across all workers, or pass through at the OBR's 76% rate.
          </li>
          <li>
            <strong>No changes to other benefits:</strong> Employer pension
            matching rates and other employment benefits remain unchanged.
          </li>
        </ol>
      </section>

      {/* ── Worked example ──────────────────────────────────────── */}
      <section className="narrative-section">
        <h2>Household impact example</h2>
        <p>
          Consider an employee earning £50,000 who contributes £5,000 to their
          pension through salary sacrifice. Under the current system, the full
          £5,000 is exempt from National Insurance:
        </p>
        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Component</th>
                <th>Amount</th>
                <th>Calculation</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>Gross salary</td><td>£50,000</td><td></td></tr>
              <tr><td>Salary sacrifice</td><td>£5,000</td><td></td></tr>
              <tr><td>Taxable salary</td><td>£45,000</td><td>£50,000 − £5,000</td></tr>
              <tr><td>Employee NI (8%)</td><td>£2,594</td><td>8% × (£45,000 − £12,570)</td></tr>
              <tr><td>Income tax (20%)</td><td>£6,486</td><td>20% × (£45,000 − £12,570)</td></tr>
              <tr className="active-row"><td>Take-home pay</td><td style={{ fontWeight: 600 }}>£35,920</td><td>£45,000 − £2,594 − £6,486</td></tr>
            </tbody>
          </table>
        </div>

        <p>
          With the £2,000 cap, the £3,000 excess becomes taxable income. The
          employee redirects it to a regular pension contribution, preserving
          their total pension saving. Under the "absorb cost" scenario:
        </p>
        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Component</th>
                <th>Amount</th>
                <th>Calculation</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>Gross salary</td><td>£50,000</td><td></td></tr>
              <tr><td>Salary sacrifice (capped)</td><td>£2,000</td><td>Capped at £2,000</td></tr>
              <tr><td>Taxable salary</td><td>£48,000</td><td>£50,000 − £2,000</td></tr>
              <tr><td>Employee pension contribution</td><td>£3,000</td><td>Excess redirected</td></tr>
              <tr><td>Taxable income (for IT)</td><td>£45,000</td><td>£48,000 − £3,000</td></tr>
              <tr><td>Employee NI (8% on £48,000)</td><td>£2,834</td><td>8% × (£48,000 − £12,570)</td></tr>
              <tr><td>Income tax (20%)</td><td>£6,486</td><td>20% × (£45,000 − £12,570)</td></tr>
              <tr className="active-row"><td>Take-home pay</td><td style={{ fontWeight: 600 }}>£35,680</td><td>£48,000 − £3,000 − £2,834 − £6,486</td></tr>
              <tr><td>Total pension contribution</td><td>£5,000</td><td>£2,000 + £3,000</td></tr>
            </tbody>
          </table>
        </div>
        <p>
          The employee maintains their full £5,000 pension contribution but
          pays £240 more in employee NI on the excess, reducing take-home pay
          from £35,920 to £35,680.
        </p>
      </section>

      {/* ── Baseline ───────────────────────────────────────────── */}
      <section
        id="baseline"
        ref={sectionRefs.baseline}
        className="narrative-section"
      >
        <h2>Baseline: salary sacrifice in 2029-30</h2>
        <p>
          Before applying the cap, PolicyEngine's baseline simulation for
          2029-30 identifies:
        </p>
        {baselineRows.length > 0 && (
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>PolicyEngine</th>
                  <th>OBR (ASHE)</th>
                  <th>Relative error</th>
                </tr>
              </thead>
              <tbody>
                {baselineRows.map((r, i) => (
                  <tr key={i}>
                    <td>{r.metric}</td>
                    <td>{r.pe}</td>
                    <td>{r.obr}</td>
                    <td>{r.error}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p>
          PolicyEngine has {ssMorePct}% more salary sacrifice users than the
          OBR but a {taxBaseLowerPct}% lower tax base. The gap is driven by
          lower average excess per worker (-{avgExcessLowerPct}%):
          PolicyEngine's FRS-based data underestimates the right tail of the
          salary sacrifice distribution, likely because high earners with large
          contributions (£10,000+) are either under-represented in the FRS or
          their salary sacrifice values are under-imputed.
        </p>
        <p>
          Economy-wide wages are well aligned (within {wagesAlignPct}%),
          confirming that the difference is in the distribution of salary
          sacrifice, not the overall scale of the economy.
        </p>
      </section>

      {/* ── Revenue estimates ──────────────────────────────────── */}
      <section
        id="revenue"
        ref={sectionRefs.revenue}
        className="narrative-section"
      >
        <h2>Revenue estimates under different assumptions</h2>
        <p>
          The cap's revenue impact depends on two key behavioural assumptions.
          First, <strong>pass-through</strong>: when an employer's NI bill rises,
          do they absorb the extra cost themselves, or spread it across the
          workforce by reducing everyone's wages slightly? Second,{" "}
          <strong>pension redirection</strong>: does the affected employee
          redirect their excess salary sacrifice into a regular pension
          contribution (maintaining their pension saving), or take it as
          taxable cash? PolicyEngine models five scenarios combining these
          choices:
        </p>
        {orderedScenarios.length > 0 && (
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Scenario</th>
                  <th>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {orderedScenarios.map((r, i) => (
                  <tr key={i}>
                    <td>{scenarioDisplayNames[r.name] || r.name}</td>
                    <td style={{ fontWeight: 600 }}>
                      £{r.revenue_bn?.toFixed(2)} billion
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p>
          PolicyEngine's "absorb cost + maintain pension" scenario (£
          {absorbPension?.revenue_bn?.toFixed(2)} billion) is the closest
          analogue to a static yield (the revenue before any behavioural
          responses). The "76% pass-through + maintain pension"
          scenario (£{obr76?.revenue_bn?.toFixed(2)} billion) uses the
          pass-through rate the OBR derived from elasticities in the economic
          literature.
        </p>
      </section>

      {/* ── Revenue decomposition ──────────────────────────────── */}
      <section
        id="decomposition"
        ref={sectionRefs.decomposition}
        className="narrative-section"
      >
        <h2>Revenue decomposition</h2>
        <p>
          Breaking down PolicyEngine's £
          {absorbPension?.revenue_bn?.toFixed(2)} billion static estimate by tax
          component:
        </p>
        {revenueDecomp && (
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Component</th>
                  <th>PolicyEngine</th>
                  <th>OBR (salary sacrifice only)</th>
                </tr>
              </thead>
              <tbody>
                {revenueDecomp.map((r, i) => {
                  const isBold =
                    r.component === "NICs subtotal" ||
                    r.component === "Total";
                  return (
                    <tr key={i} className={isBold ? "active-row" : ""}>
                      <td>{r.component}</td>
                      <td style={{ fontWeight: isBold ? 600 : 400 }}>
                        +£{r.pe_change_bn?.toFixed(2)} billion
                      </td>
                      <td>
                        {r.obr_ss_equiv_bn === 0
                          ? "£0 (relief assumed)"
                          : `+£${r.obr_ss_equiv_bn?.toFixed(2)} billion`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <h3>NICs comparison</h3>
        <p>
          On a NICs-only basis, PolicyEngine's £
          {nicsSubtotal?.pe_change_bn?.toFixed(2)} billion is {nicsRatioPct}%
          of the OBR's £{nicsSubtotal?.obr_ss_equiv_bn?.toFixed(2)} billion.
          This ratio matches the tax base ratio (also {taxBaseRatioPct}%),
          confirming that the NICs gap is driven by the smaller tax base in
          PolicyEngine's FRS data, not by differences in NICs rates or
          calculations.
        </p>

        <h3>Income tax: a finding unique to PolicyEngine</h3>
        <p>
          PolicyEngine produces +£
          {rd("Income tax")?.pe_change_bn?.toFixed(2)} billion in income tax
          revenue, where the OBR records zero (assuming pension relief fully
          offsets the reclassified income). PolicyEngine models the pension tax
          system mechanically and finds that relief does not fully offset, for
          two reasons related to the pension Annual Allowance (AA) — the
          £40,000 annual limit on tax-advantaged pension contributions:
        </p>
        <ul>
          <li>
            <strong>
              Annual Allowance constraints (+£
              {il("AA tax charge increase")?.change_bn?.toFixed(2)} billion):
            </strong>{" "}
            Under salary sacrifice, contributions are classified as employer
            contributions, which are exempt from the pension Annual Allowance (AA)
            tax charge. When reclassified as employee contributions, they push some
            workers over the £40,000 AA limit, triggering additional tax.
          </li>
          <li>
            <strong>
              Incomplete pension relief (+£
              {il("Incomplete relief offset")?.change_bn?.toFixed(2)} billion):
            </strong>{" "}
            Employment income rises by £
            {il("Employment income change")?.change_bn?.toFixed(2)} billion (the
            excess), but pension contributions relief only rises by £
            {il("Pension relief change")?.change_bn?.toFixed(2)} billion. The £
            {il("Relief shortfall")?.change_bn?.toFixed(2)} billion shortfall
            occurs because relief is capped at the Annual Allowance: workers
            already near the limit cannot claim full relief on the redirected
            amount.
          </li>
        </ul>
        <p>
          This finding suggests that assuming full income tax neutrality may
          overstate the effectiveness of pension relief. Whether this income tax
          effect materialises in practice depends on how the policy is
          implemented, for example whether HMRC provides specific Annual
          Allowance exemptions for redirected contributions.
        </p>
      </section>

      {/* ── Behavioural adjustments ────────────────────────────── */}
      <section
        id="behavioural"
        ref={sectionRefs.behavioural}
        className="narrative-section"
      >
        <h2>Behavioural adjustments</h2>
        <p>
          PolicyEngine models pass-through directly: at a 76% pass-through rate,
          revenue falls from £{absorbPension?.revenue_bn?.toFixed(2)} billion to
          £{obr76?.revenue_bn?.toFixed(2)} billion, a £{ptOffset} billion
          offset. The remaining behavioural responses require off-model analysis:
        </p>
        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Adjustment</th>
                <th>OBR estimate</th>
                <th>PolicyEngine coverage</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Pass-through to lower wages and profits</td>
                <td>-£0.7 billion</td>
                <td>Modelled directly (£{ptOffset} billion at 76%)</td>
              </tr>
              <tr>
                <td>Employers switching to ordinary pension contributions</td>
                <td>-£0.5 billion</td>
                <td>Not modelled</td>
              </tr>
              <tr>
                <td>Employees switching to relief-at-source schemes</td>
                <td>+£1.6 billion</td>
                <td>Not modelled</td>
              </tr>
              <tr>
                <td>Other (reduced DC contributions, forestalling)</td>
                <td>-£0.5 billion</td>
                <td>Not modelled</td>
              </tr>
              <tr className="active-row">
                <td>Net behavioural</td>
                <td style={{ fontWeight: 600 }}>-£0.1 billion</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          PolicyEngine's pass-through offset (£{ptOffset} billion) is lower than
          the OBR's (£0.7 billion) because the OBR's elasticity-based
          calculations also account for profit pass-through (reducing corporation
          tax), which PolicyEngine does not model.
        </p>
      </section>

      {/* ── Distributional impact ──────────────────────────────── */}
      <section
        id="distributional"
        ref={sectionRefs.distributional}
        className="narrative-section"
      >
        <h2>Distributional impact</h2>
        <p>
          PolicyEngine's microsimulation provides household-level distributional
          detail. We find the salary sacrifice cap is progressive: lower-income
          households see minimal impact while higher earners bear the cost.
          Figure 1 shows the average change in household net income by income
          decile (decile 1 = the lowest-income tenth of households, decile 10
          = the highest) under the "absorb cost + maintain pension" scenario.
          Toggle between absolute (£/year) and relative (%) views.
        </p>

        <p className="figure-caption">
          Figure 1: Average change in household net income by income decile (absorb cost + maintain pension scenario)
        </p>
        <iframe
          src="/distributional-impact.html"
          width="100%"
          height="530"
          frameBorder="0"
          style={{ border: "none" }}
          title="Distributional impact chart"
        />

        <p>
          The top decile loses an average of £
          {topDecile ? Math.abs(topDecile.avg_change_gbp) : 503} per year (
          {topDecile ? Math.abs(topDecile.pct_change).toFixed(2) : "0.36"}% of
          net income), while the bottom decile loses just £
          {bottomDecile ? Math.abs(bottomDecile.avg_change_gbp) : 2}.
        </p>
      </section>

      {/* ── Winners and losers ─────────────────────────────────── */}
      <section
        id="winners-losers"
        ref={sectionRefs["winners-losers"]}
        className="narrative-section"
      >
        <h2>Winners and losers</h2>
        <p>
          Figure 2 shows the share of people in each decile who lose income
          under the cap, using the absorb cost + maintain pension scenario.
          Overall, {totalLosersPct}% of the population experiences a measurable
          income reduction.
        </p>

        <p className="figure-caption">
          Figure 2: Share of people losing income (absorb cost + maintain pension scenario)
        </p>
        <iframe
          src="/winners-losers.html"
          width="100%"
          height="530"
          frameBorder="0"
          style={{ border: "none" }}
          title="Winners and losers chart"
        />

        <p>
          In the bottom decile, {winnersLosers?.[0]?.pct_losers?.toFixed(1) ?? "0.6"}%
          of people are affected. The {maxLoserDecileLabel} decile has the
          highest share of losers at{" "}
          {maxLoserDecile?.pct_losers?.toFixed(1) ?? "24.9"}%. No decile has
          winners; the cap only reduces net income for affected households.
        </p>
      </section>

      {/* ── Constituency impact ────────────────────────────────── */}
      <section
        id="constituency"
        ref={sectionRefs.constituency}
        className="narrative-section"
      >
        <h2>Local area impact</h2>
        <p>
          Using parliamentary constituency weights, we estimate the average
          change in household income for each constituency in the UK under the
          absorb cost + maintain pension scenario. The map below shows how the
          salary sacrifice cap affects different areas. Use search or hover
          over a constituency to see its estimated impact.
        </p>

        <p className="figure-caption">
          Figure 3: Average change in household income by constituency (absorb cost + maintain pension scenario)
        </p>
        <iframe
          src="/constituency_map.html"
          width="100%"
          height="600"
          frameBorder="0"
          style={{ border: "none" }}
          title="Constituency impact map"
        />

        {topConstituencies.length > 0 && (
          <p>
            The five most affected constituencies are{" "}
            {topConstituencies.map((r, i) => {
              const entry = `${r.constituency_name} (£${Math.abs(r.avg_change).toFixed(0)})`;
              if (i < topConstituencies.length - 1) return entry + ", ";
              return "and " + entry + ".";
            })}
          </p>
        )}
      </section>

      {/* ── Conclusion ─────────────────────────────────────────── */}
      <section
        id="conclusion"
        ref={sectionRefs.conclusion}
        className="narrative-section"
      >
        <h2>Conclusion</h2>
        <p>
          PolicyEngine estimates the £2,000 salary sacrifice cap would raise £
          {absorbPension?.revenue_bn?.toFixed(2)} billion in 2029-30 under
          static assumptions. The key finding is a £
          {rd("Income tax")?.pe_change_bn?.toFixed(2)} billion income tax effect
          from Annual Allowance constraints that does not appear in the OBR's
          costing. NICs revenue (£
          {nicsSubtotal?.pe_change_bn?.toFixed(2)} billion) is {nicsGapPct}%
          below the OBR's, reflecting a smaller tax base in the FRS data. The
          cap is progressive, with {totalLosersPct}% of the population affected
          and losses concentrated in upper income deciles.
        </p>
      </section>

      {/* ── Methodology appendix (expandable) ────────────────── */}
      <section className="narrative-section">
        <details className="expandable-table">
          <summary>Data construction methodology</summary>
          <div style={{ padding: "16px 0" }}>
            <h3>Imputation approach</h3>
            <p>
              The Family Resources Survey (FRS) asks a subset of respondents
              whether their pension contributions are made through salary
              sacrifice. In FRS 2023-24, approximately 4,000 respondents were
              asked this question, while around 13,000 were not asked. To
              construct a complete picture of salary sacrifice usage:
            </p>
            <ol>
              <li>
                <strong>Training data:</strong> We use the ~4,000 FRS
                respondents who were asked about salary sacrifice as training
                data, including both participants (with reported contribution
                amounts) and non-participants (with zero contributions).
              </li>
              <li>
                <strong>Predict salary sacrifice amounts:</strong> Using this
                training set, we fit a quantile random forest model to predict
                salary sacrifice pension contribution amounts based on age and
                employment income.
              </li>
              <li>
                <strong>Impute for non-respondents:</strong> We apply this
                model to impute salary sacrifice amounts for respondents who
                were not asked the question, generating a complete picture of
                salary sacrifice usage across the population.
              </li>
            </ol>

            <h3>Calibration</h3>
            <p>
              After imputation, we calibrate the dataset using PolicyEngine's
              standard reweighting methodology to match administrative totals.
              This salary sacrifice-enhanced dataset is available alongside
              PolicyEngine's standard UK datasets for researchers who wish to
              analyse salary sacrifice reforms.
            </p>

            <h3>Limitations</h3>
            <p>
              The imputation approach assumes that salary sacrifice usage
              patterns among non-respondents are similar to those among
              respondents with similar characteristics. If employers
              systematically offer salary sacrifice to workers with
              unobservable characteristics that differ from our predictors, our
              estimates may be biased. The difference between PolicyEngine's
              estimates and OBR figures likely reflects both data differences
              (FRS vs ASHE) and differences in behavioural assumptions about
              employer and employee responses to the cap.
            </p>
          </div>
        </details>
      </section>

      {/* Scroll Spy */}
      <nav className="scroll-spy">
        {sections.map((section) => (
          <button
            key={section.id}
            className={`scroll-spy-item ${activeSection === section.id ? "active" : ""}`}
            onClick={() =>
              document
                .getElementById(section.id)
                ?.scrollIntoView({ behavior: "smooth" })
            }
            aria-label={`Go to ${section.label}`}
          >
            <span className="scroll-spy-label">{section.label}</span>
            <span className="scroll-spy-dot" />
          </button>
        ))}
      </nav>
    </div>
  );
}
