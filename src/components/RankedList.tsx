import { useMemo, useState } from 'react';
import type { Breakdown } from '../lib/types';
import type { StateCode } from '../lib/profile';
import { STATE_BY_CODE } from '../lib/load-data';
import { fmtPctShort, fmtUSD } from '../lib/format';

type SortKey = 'total' | 'effectiveRate' | 'income' | 'payroll' | 'property' | 'vehicle' | 'sales' | 'gas';

interface Props {
  breakdowns: Breakdown[];
  selected: StateCode | null;
  onSelect: (code: StateCode | null) => void;
}

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'total', label: 'Total $' },
  { key: 'effectiveRate', label: '% gross' },
  { key: 'income', label: 'Income' },
  { key: 'payroll', label: 'Payroll' },
  { key: 'property', label: 'Property' },
  { key: 'vehicle', label: 'Vehicle' },
  { key: 'sales', label: 'Sales' },
  { key: 'gas', label: 'Gas' },
];

export function RankedList({ breakdowns, selected, onSelect }: Props) {
  const [sortBy, setSortBy] = useState<SortKey>('total');
  const [asc, setAsc] = useState(false);

  const sorted = useMemo(() => {
    const arr = [...breakdowns];
    arr.sort((a, b) => (asc ? a[sortBy] - b[sortBy] : b[sortBy] - a[sortBy]));
    return arr;
  }, [breakdowns, sortBy, asc]);

  return (
    <div>
      <p className="pb-1 text-[10px] text-slate-400 sm:hidden">scroll horizontally to see all columns →</p>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full min-w-[640px] text-xs">
        <thead className="sticky top-0 bg-slate-100 text-slate-700">
          <tr>
            <th className="px-2 py-2 text-left">#</th>
            <th className="px-2 py-2 text-left">State</th>
            {COLUMNS.map((c) => (
              <th
                key={c.key}
                onClick={() => {
                  if (sortBy === c.key) setAsc(!asc);
                  else { setSortBy(c.key); setAsc(false); }
                }}
                className="cursor-pointer px-2 py-2 text-right hover:bg-slate-200"
              >
                {c.label} {sortBy === c.key && (asc ? '↑' : '↓')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((b, i) => {
            const isSelected = b.state === selected;
            return (
              <tr
                key={b.state}
                onClick={() => onSelect(isSelected ? null : b.state)}
                className={`cursor-pointer border-t border-slate-100 ${isSelected ? 'bg-sky-100' : 'hover:bg-slate-50'}`}
              >
                <td className="px-2 py-1 text-slate-500">{i + 1}</td>
                <td className="px-2 py-1 font-medium">{STATE_BY_CODE[b.state].name}</td>
                <td className="px-2 py-1 text-right tabular-nums">{fmtUSD(b.total)}</td>
                <td className="px-2 py-1 text-right tabular-nums">{fmtPctShort(b.effectiveRate)}</td>
                <td className="px-2 py-1 text-right tabular-nums text-slate-500">{fmtUSD(b.income + b.local)}</td>
                <td className="px-2 py-1 text-right tabular-nums text-slate-500">{fmtUSD(b.payroll)}</td>
                <td className="px-2 py-1 text-right tabular-nums text-slate-500">{fmtUSD(b.property)}</td>
                <td className="px-2 py-1 text-right tabular-nums text-slate-500">{fmtUSD(b.vehicle)}</td>
                <td className="px-2 py-1 text-right tabular-nums text-slate-500">{fmtUSD(b.sales)}</td>
                <td className="px-2 py-1 text-right tabular-nums text-slate-500">{fmtUSD(b.gas)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}
