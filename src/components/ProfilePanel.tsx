import { useEffect, useState } from 'react';
import type { Profile, IncomeMix } from '../lib/profile';
import { updateMix } from '../lib/profile';

// Format a number as compact shorthand: 240000 → "240k", 1500000 → "1.5m".
function formatK(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '0';
  if (Math.abs(n) >= 1_000_000) {
    const v = n / 1_000_000;
    return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(2).replace(/\.?0+$/, '')}m`;
  }
  if (Math.abs(n) >= 1_000) {
    const v = n / 1_000;
    return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1).replace(/\.0$/, '')}k`;
  }
  return String(Math.round(n));
}

// Parse "240k", "1.5m", "240,000", "240000" → number. Returns null if unparseable.
function parseK(s: string): number | null {
  const cleaned = s.trim().replace(/[, _$]/g, '').toLowerCase();
  if (cleaned === '') return null;
  const m = cleaned.match(/^(-?[\d.]+)\s*([km])?$/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  const mult = m[2] === 'm' ? 1_000_000 : m[2] === 'k' ? 1_000 : 1;
  return Math.round(n * mult);
}

// Text input that accepts compact-shorthand numbers (e.g. "240k", "1.5m") and
// emits a numeric value. Reformats on blur / Enter to the canonical form.
interface KInputProps {
  value: number;
  min?: number;
  max?: number;
  onChange: (n: number) => void;
}

function KInput({ value, min, max, onChange }: KInputProps) {
  const [text, setText] = useState(formatK(value));
  // Re-sync when the upstream value changes (e.g. on reset).
  useEffect(() => setText(formatK(value)), [value]);

  const commit = () => {
    const parsed = parseK(text);
    if (parsed === null) {
      setText(formatK(value));
      return;
    }
    let clamped = parsed;
    if (typeof min === 'number') clamped = Math.max(min, clamped);
    if (typeof max === 'number') clamped = Math.min(max, clamped);
    if (clamped !== value) onChange(clamped);
    setText(formatK(clamped));
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
      }}
      className="w-full rounded border border-slate-300 px-2 py-1 font-mono"
      placeholder="e.g. 240k"
    />
  );
}

interface Props {
  profile: Profile;
  onChange: (next: Profile) => void;
  onReset: () => void;
}

const PCT_OPTIONS = [50, 70, 80, 90, 95] as const;

export function ProfilePanel({ profile, onChange, onReset }: Props) {
  const mix = profile.incomeMix;

  // Move one slider; redistribute the other two proportionally to keep total = 1.
  const setMixField = (key: keyof IncomeMix, value: number) => {
    onChange({ ...profile, incomeMix: updateMix(mix, key, value) });
  };

  return (
    <div className="space-y-5 text-sm">
      <Section title="Household income">
        <Field label="Gross income (e.g. 240k, 1.5m)">
          <KInput
            value={profile.grossIncome}
            min={50_000}
            max={5_000_000}
            onChange={(n) => onChange({ ...profile, grossIncome: n })}
          />
        </Field>
        <Field label="Filing status">
          <select
            value={profile.filingStatus}
            onChange={(e) => onChange({ ...profile, filingStatus: e.target.value as Profile['filingStatus'] })}
            className="w-full rounded border border-slate-300 px-2 py-1"
          >
            <option value="mfj">Married filing jointly</option>
            <option value="single">Single</option>
            <option value="hoh">Head of household</option>
          </select>
        </Field>
        <Field label="Dependents">
          <input
            type="number"
            min={0}
            max={6}
            value={profile.dependents}
            onChange={(e) => onChange({ ...profile, dependents: Number(e.target.value) })}
            className="w-full rounded border border-slate-300 px-2 py-1"
          />
        </Field>
      </Section>

      <Section title="Income mix (sums to 100%)">
        <MixSlider label="W-2 wages" value={mix.w2} onChange={(v) => setMixField('w2', v)} />
        <MixSlider label="Interest + dividends" value={mix.intDiv} onChange={(v) => setMixField('intDiv', v)} />
        <MixSlider label="Long-term capital gains" value={mix.ltcg} onChange={(v) => setMixField('ltcg', v)} />
        <p className="text-xs text-slate-500">
          {(mix.w2 * 100).toFixed(0)}% / {(mix.intDiv * 100).toFixed(0)}% / {(mix.ltcg * 100).toFixed(0)}%
        </p>
      </Section>

      <Section title="Pretax savings">
        <Toggle
          label={`Max 401(k) ($23,500)`}
          on={profile.k401Contribution > 0}
          onChange={(on) => onChange({ ...profile, k401Contribution: on ? 23_500 : 0 })}
        />
        <Toggle
          label={`Family HSA ($8,550)`}
          on={profile.hsaContribution > 0}
          onChange={(on) => onChange({ ...profile, hsaContribution: on ? 8_550 : 0 })}
        />
      </Section>

      <Section title="Home value">
        <Field label={`Percentile of state distribution`}>
          <select
            value={profile.homeValue.kind === 'percentile' ? profile.homeValue.pct : 'custom'}
            onChange={(e) =>
              onChange({
                ...profile,
                homeValue: { kind: 'percentile', pct: Number(e.target.value) as 50 | 70 | 80 | 90 | 95 },
              })
            }
            className="w-full rounded border border-slate-300 px-2 py-1"
          >
            {PCT_OPTIONS.map((p) => (
              <option key={p} value={p}>p{p}</option>
            ))}
          </select>
        </Field>
      </Section>

      <Section title="Annual consumption">
        <Field label={`Percentile of top-quintile spending`}>
          <select
            value={profile.consumption.kind === 'percentile' ? profile.consumption.pct : 'custom'}
            onChange={(e) =>
              onChange({
                ...profile,
                consumption: { kind: 'percentile', pct: Number(e.target.value) as 50 | 70 | 80 | 90 | 95 },
              })
            }
            className="w-full rounded border border-slate-300 px-2 py-1"
          >
            {PCT_OPTIONS.map((p) => (
              <option key={p} value={p}>p{p}</option>
            ))}
          </select>
        </Field>
      </Section>

      <Section title="Vehicles">
        <Field label="Combined household vehicle value (e.g. 50k)">
          <KInput
            value={profile.vehicleValue}
            min={0}
            max={500_000}
            onChange={(n) => onChange({ ...profile, vehicleValue: n })}
          />
        </Field>
        <Field label="Annual household miles (e.g. 24k)">
          <KInput
            value={profile.annualMiles}
            min={0}
            max={80_000}
            onChange={(n) => onChange({ ...profile, annualMiles: n })}
          />
        </Field>
      </Section>

      <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-500">
        Local income tax: each state uses its representative city by default — NYC for
        NY, Philadelphia for PA, Detroit for MI, Columbus for OH, Portland for OR,
        Louisville for KY, Birmingham for AL, Kansas City for MO, Wilmington for DE.
        See the per-state audit page for the exact rate applied.
      </p>

      <button
        onClick={onReset}
        className="w-full rounded bg-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-300"
      >
        Reset to default scenario
      </button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-slate-600">{label}</span>
      {children}
    </label>
  );
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-2 text-xs">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-slate-300"
      />
    </label>
  );
}

function MixSlider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block text-xs">
      <span className="mb-0.5 block text-slate-600">{label}</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />
    </label>
  );
}
