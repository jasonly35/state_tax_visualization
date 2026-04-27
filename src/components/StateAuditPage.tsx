import { useMemo, useState } from 'react';
import { STATE_DATA } from '../lib/load-data';
import type { StateData } from '../lib/types';
import { fmtPct, fmtPctShort, fmtUSD } from '../lib/format';

interface Props {
  onBack: () => void;
}

type SortKey =
  | 'name' | 'topIncome' | 'county' | 'cityRate'
  | 'property' | 'sales' | 'gas' | 'vehicle' | 'payroll';

interface Row {
  s: StateData;
  topIncomeRate: number;       // 0 if no tax
  topIncomeMin: number | null; // null = flat or none
  county: number;
  cityRate: number;            // 0 if 'none'
  property: number;
  sales: number;
  gas: number;
  vehicle: number;
  payrollSummed: number;       // sum of rates × W-2 200k (for sort only)
}

function buildRow(s: StateData): Row {
  const mfj = s.income.brackets.mfj;
  const top = mfj.length > 0 ? mfj[mfj.length - 1] : null;
  const cityRate = (() => {
    if (s.defaultCity === 'none') return 0;
    // We don't import overlays here to keep this page self-contained;
    // instead surface the rate via a simple lookup table built once.
    return CITY_RATES[s.defaultCity] ?? 0;
  })();
  // For sortable payroll, use full-rate sum at $200K W-2 (rough sort proxy).
  const payrollSummed = s.payroll.components.reduce((acc, c) => {
    const w2 = 200_000;
    const base = c.cap === null ? w2 : Math.min(w2, c.cap);
    return acc + base * c.rate;
  }, 0);
  return {
    s,
    topIncomeRate: top?.rate ?? 0,
    topIncomeMin: mfj.length > 1 ? top!.min : null,
    county: s.rules.defaultCountyRate,
    cityRate,
    property: s.property.rate,
    sales: s.sales.combined,
    gas: s.gas.perGallon,
    vehicle: s.vehicle.rate,
    payrollSummed,
  };
}

// Mirror of local-overlays.json rates, used for the audit display only.
// Source of truth lives in data/local-overlays.json.
const CITY_RATES: Record<string, number> = {
  nyc: 0.0388,
  yonkers: 0.0165,
  detroit: 0.024,
  philadelphia: 0.0375,
  pittsburgh: 0.030,
  cleveland: 0.025,
  columbus: 0.025,
  cincinnati: 0.018,
  portland_or: 0.024,
  birmingham_al: 0.010,
  louisville_ky: 0.0145,
  kansas_city_mo: 0.010,
  wilmington_de: 0.0125,
};

const CITY_LABELS: Record<string, string> = {
  none: '—',
  nyc: 'New York City',
  yonkers: 'Yonkers',
  detroit: 'Detroit',
  philadelphia: 'Philadelphia',
  pittsburgh: 'Pittsburgh',
  cleveland: 'Cleveland',
  columbus: 'Columbus',
  cincinnati: 'Cincinnati',
  portland_or: 'Portland',
  birmingham_al: 'Birmingham',
  louisville_ky: 'Louisville',
  kansas_city_mo: 'Kansas City',
  wilmington_de: 'Wilmington',
};

export function StateAuditPage({ onBack }: Props) {
  const [sortBy, setSortBy] = useState<SortKey>('name');
  const [asc, setAsc] = useState(true);

  const rows = useMemo(() => {
    const arr: Row[] = STATE_DATA.map(buildRow);
    const cmpNum = (a: number, b: number) => (asc ? a - b : b - a);
    const cmpStr = (a: string, b: string) => (asc ? a.localeCompare(b) : b.localeCompare(a));
    arr.sort((a, b) => {
      switch (sortBy) {
        case 'name': return cmpStr(a.s.name, b.s.name);
        case 'topIncome': return cmpNum(a.topIncomeRate, b.topIncomeRate);
        case 'county': return cmpNum(a.county, b.county);
        case 'cityRate': return cmpNum(a.cityRate, b.cityRate);
        case 'property': return cmpNum(a.property, b.property);
        case 'sales': return cmpNum(a.sales, b.sales);
        case 'gas': return cmpNum(a.gas, b.gas);
        case 'vehicle': return cmpNum(a.vehicle, b.vehicle);
        case 'payroll': return cmpNum(a.payrollSummed, b.payrollSummed);
      }
    });
    return arr;
  }, [sortBy, asc]);

  const handleSort = (key: SortKey) => {
    if (sortBy === key) setAsc(!asc);
    else { setSortBy(key); setAsc(key === 'name'); }
  };

  return (
    <div className="min-h-full bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6">
          <button onClick={onBack} className="text-xs text-sky-700 hover:underline">
            ← back to map
          </button>
        </div>
      </header>

      <article className="mx-auto max-w-7xl px-4 py-6 text-slate-700 sm:px-6 sm:py-10">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Per-state data audit
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Every rate used by the calculator, by state. Income figures are MFJ. Click a
          column header to sort. The same values are stored verbatim in the JSON files
          under <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.85em]">src/data/</code>.
        </p>

        <p className="mt-6 pb-1 text-[10px] text-slate-400 sm:hidden">scroll horizontally to see all columns →</p>
        <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm sm:mt-6">
          <table className="w-full min-w-[1080px] text-xs">
            <thead className="sticky top-0 bg-slate-100 text-slate-700">
              <tr>
                <Th label="State" sortKey="name" sortBy={sortBy} asc={asc} onClick={handleSort} align="left" />
                <Th label="Top inc. rate (MFJ)" sortKey="topIncome" sortBy={sortBy} asc={asc} onClick={handleSort} />
                <th className="px-2 py-2 text-right">Top bracket min</th>
                <Th label="Default county" sortKey="county" sortBy={sortBy} asc={asc} onClick={handleSort} />
                <th className="px-2 py-2 text-left">Default city</th>
                <Th label="City rate" sortKey="cityRate" sortBy={sortBy} asc={asc} onClick={handleSort} />
                <Th label="Property (metro)" sortKey="property" sortBy={sortBy} asc={asc} onClick={handleSort} />
                <Th label="Sales (comb.)" sortKey="sales" sortBy={sortBy} asc={asc} onClick={handleSort} />
                <Th label="Gas $/gal" sortKey="gas" sortBy={sortBy} asc={asc} onClick={handleSort} />
                <Th label="Vehicle" sortKey="vehicle" sortBy={sortBy} asc={asc} onClick={handleSort} />
                <Th label="Payroll (worker)" sortKey="payroll" sortBy={sortBy} asc={asc} onClick={handleSort} align="left" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.s.code} className="border-t border-slate-100 align-top hover:bg-slate-50">
                  <td className="px-2 py-1.5">
                    <span className="font-medium">{r.s.name}</span>{' '}
                    <span className="text-slate-400">({r.s.code})</span>
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {r.topIncomeRate === 0 ? <span className="text-slate-400">—</span> : fmtPctShort(r.topIncomeRate)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">
                    {r.topIncomeMin === null
                      ? r.topIncomeRate === 0 ? <span className="text-slate-400">—</span> : <span className="text-slate-400">flat</span>
                      : fmtUSD(r.topIncomeMin)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {r.county === 0 ? <span className="text-slate-400">—</span> : fmtPctShort(r.county)}
                  </td>
                  <td className="px-2 py-1.5 text-slate-500">{CITY_LABELS[r.s.defaultCity]}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {r.cityRate === 0 ? <span className="text-slate-400">—</span> : fmtPctShort(r.cityRate)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {fmtPct(r.property)}
                    <div className="text-[10px] font-normal text-slate-400">{r.s.property.city}</div>
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmtPctShort(r.sales)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">${r.gas.toFixed(2)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {r.vehicle === 0 ? <span className="text-slate-400">—</span> : fmtPctShort(r.vehicle)}
                  </td>
                  <td className="px-2 py-1.5 text-slate-500">
                    {r.s.payroll.components.length === 0 ? (
                      <span className="text-slate-400">—</span>
                    ) : (
                      <span className="text-[11px] leading-4">
                        {r.s.payroll.components.map((c, i) => (
                          <span key={i} className="block">
                            {c.name}: {fmtPctShort(c.rate)}
                            {c.cap === null ? ' (no cap)' : ` (cap ${fmtUSD(c.cap)})`}
                          </span>
                        ))}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2 className="mt-10 border-b border-slate-200 pb-2 text-xl font-semibold text-slate-900">
          Per-state notes & non-default rules
        </h2>
        <p className="mt-2 text-xs text-slate-500">
          Only states that deviate from the defaults below are listed. Defaults: 401(k)
          pretax conformity = yes; HSA conformity = yes; LTCG taxed as ordinary = yes;
          interest/dividends as ordinary = yes; default county rate = 0; vehicle rate = 0;
          worker payroll = none.
        </p>
        <ul className="mt-3 space-y-2 text-sm leading-6">
          {STATE_DATA
            .filter((s) =>
              !s.rules.conforms401kPretax ||
              !s.rules.conformsHSA ||
              !s.rules.ltcgAsOrdinary ||
              !s.rules.intDivAsOrdinary ||
              s.rules.defaultCountyRate > 0 ||
              s.rules.recapture !== undefined ||
              s.rules.ltcgAltRate !== undefined ||
              s.rules.exemptionPhaseoutStart !== undefined ||
              s.vehicle.rate > 0 ||
              s.payroll.components.length > 0 ||
              (s.rules.notes && s.rules.notes.length > 0))
            .map((s) => (
              <li key={s.code} className="rounded border border-slate-200 bg-white p-3">
                <div className="font-semibold text-slate-900">
                  {s.name} <span className="text-xs font-normal text-slate-400">({s.code})</span>
                </div>
                <ul className="mt-1 list-disc pl-5 text-xs leading-5 text-slate-600 marker:text-slate-300">
                  {!s.rules.conforms401kPretax && (
                    <li>Does <strong>not</strong> conform to federal 401(k) pretax exclusion.</li>
                  )}
                  {!s.rules.conformsHSA && (
                    <li>Does <strong>not</strong> conform to federal HSA deduction.</li>
                  )}
                  {!s.rules.ltcgAsOrdinary && (
                    <li>
                      LTCG is <strong>not</strong> taxed as ordinary income.
                      {s.rules.ltcgOverride && (
                        <> Special rate: {fmtPctShort(s.rules.ltcgOverride.rateAbove)} above {fmtUSD(s.rules.ltcgOverride.threshold)}.</>
                      )}
                    </li>
                  )}
                  {!s.rules.intDivAsOrdinary && (
                    <li>Interest and dividends are <strong>not</strong> taxed as ordinary income.</li>
                  )}
                  {s.rules.defaultCountyRate > 0 && (
                    <li>Default county tax: {fmtPctShort(s.rules.defaultCountyRate)} of state taxable income.</li>
                  )}
                  {s.rules.exemptionPhaseoutStart && (
                    <li>
                      Personal exemption phases out at $1/$1 above MFJ {fmtUSD(s.rules.exemptionPhaseoutStart.mfj)} /
                      single {fmtUSD(s.rules.exemptionPhaseoutStart.single)} /
                      HoH {fmtUSD(s.rules.exemptionPhaseoutStart.hoh)}.
                    </li>
                  )}
                  {s.rules.recapture && (
                    <li>
                      Bracket-benefit recapture: piecewise-linear add-on to bracket walk.
                      MFJ schedule maxes at {fmtUSD(s.rules.recapture.mfj[s.rules.recapture.mfj.length - 1].addOn)} above{' '}
                      {fmtUSD(s.rules.recapture.mfj[s.rules.recapture.mfj.length - 2].agi)}.
                    </li>
                  )}
                  {s.rules.ltcgAltRate !== undefined && (
                    <li>
                      Alternative LTCG rate: {fmtPctShort(s.rules.ltcgAltRate)} (taxpayer-friendly min vs ordinary).
                    </li>
                  )}
                  {s.vehicle.rate > 0 && (
                    <li>
                      Vehicle property tax: {fmtPctShort(s.vehicle.rate)} on market value.
                      {s.vehicle.notes && <span className="text-slate-500"> {s.vehicle.notes}</span>}
                    </li>
                  )}
                  {s.payroll.components.length > 0 && (
                    <li>
                      Worker payroll contributions:{' '}
                      {s.payroll.components.map((c, i) => (
                        <span key={i}>
                          {i > 0 && '; '}
                          {c.name} {fmtPctShort(c.rate)}
                          {c.cap !== null && ` (cap ${fmtUSD(c.cap)})`}
                        </span>
                      ))}
                    </li>
                  )}
                  {s.rules.notes?.map((n, i) => <li key={`n${i}`} className="text-slate-500">{n}</li>)}
                </ul>
              </li>
            ))}
        </ul>

        <h2 className="mt-10 border-b border-slate-200 pb-2 text-xl font-semibold text-slate-900">
          Source pointers (file → URL)
        </h2>
        <p className="mt-2 text-xs text-slate-500">
          See the methodology page for the longer-form citations and per-state DOR links
          for non-default rules.
        </p>
        <ul className="mt-3 space-y-1 text-xs leading-5">
          <SrcLine file="income-brackets.json" url="https://taxfoundation.org/data/all/state/state-income-tax-rates-2025/" label="Tax Foundation 2025 brackets matrix (cross-check vs each state DOR)" />
          <SrcLine file="state-rules.json" url="https://taxfoundation.org/data/all/state/state-tax-conformity/" label="Tax Foundation conformity matrix" />
          <SrcLine file="state-payroll.json" url="https://www.ssa.gov/oact/cola/cbb.html" label="SSA wage base 2025 = $176,100; per-state labor dept. URLs in methodology" />
          <SrcLine file="property-rates.json" url="https://taxfoundation.org/data/all/state/property-taxes-by-state-county/" label="Tax Foundation property taxes by state and county (FY2022)" />
          <SrcLine file="home-values.json" url="https://www.zillow.com/research/data/" label="Zillow ZHVI Q4 2024 + ACS B25075 percentile shape" />
          <SrcLine file="vehicle-rates.json" url="" label="State personal-property tax statutes; per-state DOR links in methodology" />
          <SrcLine file="sales-rates.json" url="https://taxfoundation.org/data/all/state/2025-sales-taxes/" label="Tax Foundation State and Local Sales Tax Rates, 2025" />
          <SrcLine file="consumption-quintiles.json" url="https://www.bls.gov/cex/tables/calendar-year/mean.htm" label="BLS CEX 2022–2023, fifth income quintile" />
          <SrcLine file="gas-taxes.json" url="https://www.api.org/oil-and-natural-gas/consumer-information/motor-fuel-taxes" label="API state motor fuel tax report Q1 2025" />
          <SrcLine file="miles-per-driver.json" url="https://www.fhwa.dot.gov/policyinformation/statistics/2022/" label="FHWA Highway Statistics 2022 (VM-2 / DL-22)" />
          <SrcLine file="local-overlays.json" url="" label="City finance department / DOR publications; per-city URLs in methodology" />
        </ul>
      </article>
    </div>
  );
}

function Th({
  label, sortKey, sortBy, asc, onClick, align = 'right',
}: {
  label: string;
  sortKey: SortKey;
  sortBy: SortKey;
  asc: boolean;
  onClick: (k: SortKey) => void;
  align?: 'left' | 'right';
}) {
  return (
    <th
      onClick={() => onClick(sortKey)}
      className={`cursor-pointer px-2 py-2 hover:bg-slate-200 ${align === 'right' ? 'text-right' : 'text-left'}`}
    >
      {label}{' '}
      {sortBy === sortKey && <span className="text-slate-400">{asc ? '↑' : '↓'}</span>}
    </th>
  );
}

function SrcLine({ file, url, label }: { file: string; url: string; label: string }) {
  return (
    <li className="flex items-baseline gap-3">
      <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-800">{file}</code>
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-sky-700 hover:underline">
          {label}
        </a>
      ) : (
        <span className="text-slate-600">{label}</span>
      )}
    </li>
  );
}
