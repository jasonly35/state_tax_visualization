import type { Breakdown } from '../lib/types';
import { STATE_BY_CODE } from '../lib/load-data';
import { fmtPctShort, fmtUSD } from '../lib/format';

interface Props {
  breakdown: Breakdown;
  onClose: () => void;
}

export function AssumptionsDrawer({ breakdown: b, onClose }: Props) {
  const s = STATE_BY_CODE[b.state];
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">{s.name} — assumptions</h2>
        <button onClick={onClose} className="text-xs text-slate-500 hover:text-slate-700">close ✕</button>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
        <Row label="Total state + local tax" value={fmtUSD(b.total)} bold />
        <Row label="Effective on gross" value={fmtPctShort(b.effectiveRate)} />
        <Row label="State income tax (incl. county)" value={fmtUSD(b.income)} />
        <Row label="Local income tax" value={fmtUSD(b.local)} />
        <Row label="Payroll (SDI/PFML/Cares)" value={fmtUSD(b.payroll)} />
        <Row label={`Property tax (${s.property.city}, ${(s.property.rate * 100).toFixed(2)}%)`} value={fmtUSD(b.property)} />
        <Row label="Vehicle property tax" value={fmtUSD(b.vehicle)} />
        <Row label="Sales tax" value={fmtUSD(b.sales)} />
        <Row label="Gas tax" value={fmtUSD(b.gas)} />
        <Row label="Federal (excluded from total)" value={fmtUSD(b.federal)} muted />
      </div>

      <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Inputs used</h3>
      <div className="mt-1 grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
        <Row label="Filing" value={b.inputs.filing.toUpperCase()} />
        <Row label={`Home value (${s.home.city})`} value={fmtUSD(b.inputs.homeValueUsd)} />
        <Row label="Annual taxable consumption" value={fmtUSD(b.inputs.consumptionUsd)} />
        <Row label="Vehicle value (assumed)" value={fmtUSD(b.inputs.vehicleValueUsd)} />
        <Row label="Annual miles" value={b.inputs.annualMiles.toLocaleString()} />
        <Row label="State AGI used" value={fmtUSD(b.inputs.stateAGI)} />
        <Row label="401(k) reduces wages?" value={b.inputs.appliedK401 ? 'yes' : 'no'} />
        <Row label="HSA reduces wages?" value={b.inputs.appliedHSA ? 'yes' : 'no'} />
        <Row label="City overlay applied" value={b.inputs.city} />
      </div>

      <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Per-state rules</h3>
      <ul className="mt-1 list-disc pl-5 text-xs text-slate-600">
        <li>401(k) pretax conformity: {s.rules.conforms401kPretax ? 'yes' : 'no'}</li>
        <li>HSA conformity: {s.rules.conformsHSA ? 'yes' : 'no'}</li>
        <li>LTCG taxed as ordinary: {s.rules.ltcgAsOrdinary ? 'yes' : 'no'}</li>
        <li>Interest/dividends taxed as ordinary: {s.rules.intDivAsOrdinary ? 'yes' : 'no'}</li>
        {s.rules.defaultCountyRate > 0 && (
          <li>Default county/local addon: {fmtPctShort(s.rules.defaultCountyRate)} of state taxable income</li>
        )}
        {s.rules.ltcgOverride && (
          <li>
            LTCG flat rate: {fmtPctShort(s.rules.ltcgOverride.rateAbove)} above {fmtUSD(s.rules.ltcgOverride.threshold)}
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
        {s.vehicle.rate > 0 && (
          <li>
            Vehicle property tax: {fmtPctShort(s.vehicle.rate)} on market value
            {s.vehicle.notes && <span className="text-slate-500"> — {s.vehicle.notes}</span>}
          </li>
        )}
        {s.rules.notes?.map((n, i) => <li key={i} className="text-slate-500">{n}</li>)}
      </ul>

      <p className="mt-4 text-[10px] text-slate-400">
        Sources tagged in `src/data/_meta` of each JSON file. See methodology page for the full source list and known caveats.
      </p>
    </div>
  );
}

function Row({ label, value, bold, muted }: { label: string; value: string; bold?: boolean; muted?: boolean }) {
  return (
    <>
      <dt className={`text-slate-500 ${muted ? 'opacity-60' : ''}`}>{label}</dt>
      <dd className={`tabular-nums text-right ${bold ? 'font-semibold' : ''} ${muted ? 'text-slate-400' : ''}`}>
        {value}
      </dd>
    </>
  );
}
