# Comparing PolicyEngine and OBR salary sacrifice cap estimates

Dashboard comparing PolicyEngine's microsimulation estimates with the OBR's supplementary forecast for the proposed £2,000 salary sacrifice pension contributions cap.

**Live dashboard**: [comparing-pe-obr-salary-sacrifice-cap.vercel.app](https://comparing-pe-obr-salary-sacrifice-cap.vercel.app)

## What's included

- Baseline comparison of PolicyEngine vs OBR salary sacrifice data
- Revenue estimates under five behavioural scenarios
- Revenue decomposition by tax component (income tax, employee NICs, employer NICs)
- Behavioural adjustment analysis
- Distributional impact by income decile
- Winners and losers analysis
- Interactive constituency-level impact map
- Worked household example
- Data construction methodology appendix

## Setup

### Dashboard (React + Vite)

```bash
npm install
npm run dev
```

### Data generation (Python)

Requires `policyengine-uk`, `h5py`, `pandas`, `microdf`:

```bash
conda activate python313
python generate_results.py
```

The script outputs CSV files to `public/data/` which the dashboard reads at runtime.

Note: Constituency impact calculation requires `data/parliamentary_constituency_weights.h5` (not included in repo due to size). Copy from another PolicyEngine project if needed.
