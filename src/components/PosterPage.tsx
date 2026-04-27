// Static poster layout. Designed for headless screenshot at 1600×2400 @ 2× DPI.
// No interactivity: no hover, no tooltip, no controls. Pure ink for r/dataisbeautiful.
//
// Renders when the URL has ?poster=1.

import { useMemo } from 'react';
import * as topojson from 'topojson-client';
import statesTopo from 'us-atlas/states-10m.json';
import { geoPath, geoAlbersUsa, scaleSequential, interpolateOrRd } from 'd3';
import type { Breakdown } from '../lib/types';
import type { StateCode, Profile } from '../lib/profile';
import { STATE_BY_CODE, STATE_DATA, makeOverlayResolver } from '../lib/load-data';
import { computeAllBreakdowns } from '../lib/tax-calc';
import { fmtUSD, fmtPctShort } from '../lib/format';

const FIPS_TO_CODE: Record<string, StateCode> = {
  '01':'AL','02':'AK','04':'AZ','05':'AR','06':'CA','08':'CO','09':'CT','10':'DE',
  '12':'FL','13':'GA','15':'HI','16':'ID','17':'IL','18':'IN','19':'IA','20':'KS',
  '21':'KY','22':'LA','23':'ME','24':'MD','25':'MA','26':'MI','27':'MN','28':'MS',
  '29':'MO','30':'MT','31':'NE','32':'NV','33':'NH','34':'NJ','35':'NM','36':'NY',
  '37':'NC','38':'ND','39':'OH','40':'OK','41':'OR','42':'PA','44':'RI','45':'SC',
  '46':'SD','47':'TN','48':'TX','49':'UT','50':'VT','51':'VA','53':'WA','54':'WV',
  '55':'WI','56':'WY',
};

const POSTER_W = 1600;
const POSTER_H = 2400;

// Component palette — Tailwind-friendly hexes, sequential and CB-safe.
const COMP_COLORS = {
  income:   '#1e3a8a', // blue-900
  local:    '#3b82f6', // blue-500
  payroll:  '#8b5cf6', // violet-500
  property: '#dc2626', // red-600
  vehicle:  '#f59e0b', // amber-500
  sales:    '#10b981', // emerald-500
  gas:      '#64748b', // slate-500
};

const COMP_ORDER: Array<{ key: keyof typeof COMP_COLORS; label: string }> = [
  { key: 'income',   label: 'State income' },
  { key: 'local',    label: 'Local income' },
  { key: 'payroll',  label: 'Payroll (SDI/PFML)' },
  { key: 'property', label: 'Property' },
  { key: 'vehicle',  label: 'Vehicle property' },
  { key: 'sales',    label: 'Sales' },
  { key: 'gas',      label: 'Gas' },
];

interface Props {
  profile: Profile;
}

export function PosterPage({ profile }: Props) {
  const breakdowns = useMemo(() => {
    const resolver = makeOverlayResolver(profile.city);
    return computeAllBreakdowns(profile, STATE_DATA, resolver);
  }, [profile]);

  const sortedAsc = useMemo(
    () => [...breakdowns].sort((a, b) => a.total - b.total),
    [breakdowns],
  );
  const sortedDesc = useMemo(
    () => [...breakdowns].sort((a, b) => b.total - a.total),
    [breakdowns],
  );

  return (
    <div
      style={{
        width: POSTER_W,
        height: POSTER_H,
        background: '#ffffff',
        fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        color: '#0f172a',
      }}
    >
      <Header profile={profile} />
      <ChoroplethPanel breakdowns={breakdowns} sortedAsc={sortedAsc} sortedDesc={sortedDesc} />
      <BarsPanel sortedDesc={sortedDesc} />
      <Footer />
    </div>
  );
}

// ---------------------------------------------------------------------------
function Header({ profile }: { profile: Profile }) {
  const { incomeMix } = profile;
  // Compact format: 240000 → "240k", 1500000 → "1.5m". Used in the title only.
  const incomeShort = profile.grossIncome >= 1_000_000
    ? `$${(profile.grossIncome / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`
    : `$${Math.round(profile.grossIncome / 1000)}k`;
  return (
    <div style={{ padding: '44px 60px 24px 60px', borderBottom: '1px solid #e2e8f0' }}>
      <h1 style={{ fontSize: 44, fontWeight: 700, color: '#0f172a', lineHeight: 1.15, letterSpacing: '-0.02em', margin: 0 }}>
        Total state tax for a couple making {incomeShort}
      </h1>
      <p style={{ fontSize: 14, color: '#94a3b8', marginTop: 18, lineHeight: 1.5 }}>
        Married filing jointly, one dependent, moving to a new state in 2025. Scenario
        assumes max 401(k) ($23,500) and family HSA ($8,550), 80th-percentile metro home,
        top-quintile consumption, $80K vehicle, 24K annual miles. Income mix:{' '}
        {(incomeMix.w2 * 100).toFixed(0)}% W-2 / {(incomeMix.intDiv * 100).toFixed(0)}% interest+div /
        {' '}{(incomeMix.ltcg * 100).toFixed(0)}% long-term cap gains. Each state uses its
        representative city for local taxes (NYC for NY, Philadelphia for PA, etc.).
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
function ChoroplethPanel({
  breakdowns,
  sortedAsc,
  sortedDesc,
}: {
  breakdowns: Breakdown[];
  sortedAsc: Breakdown[];
  sortedDesc: Breakdown[];
}) {
  const W = 1080;
  const H = 620;
  const LEGEND_H = 70;

  const byCode = useMemo(() => {
    const m = new Map<StateCode, Breakdown>();
    for (const b of breakdowns) m.set(b.state, b);
    return m;
  }, [breakdowns]);

  const featureCollection = useMemo(() => {
    const t = statesTopo as any;
    return topojson.feature(t, t.objects.states) as any;
  }, []);

  const projection = useMemo(
    () => geoAlbersUsa().scale(1300).translate([W / 2, H / 2]),
    [],
  );
  const path = useMemo(() => geoPath(projection), [projection]);

  const { scale, min, max, median } = useMemo(() => {
    const v = breakdowns.map((b) => b.total);
    const lo = Math.min(...v);
    const hi = Math.max(...v);
    const sortedV = [...v].sort((a, b) => a - b);
    const med = sortedV[Math.floor(sortedV.length / 2)];
    return {
      scale: scaleSequential(interpolateOrRd).domain([lo * 0.7, hi * 1.05]),
      min: lo,
      max: hi,
      median: med,
    };
  }, [breakdowns]);

  // Top 5 / bottom 5 callouts on the side rails.
  const top5 = sortedDesc.slice(0, 5);
  const bottom5 = sortedAsc.slice(0, 5);

  return (
    <div style={{ padding: '32px 60px 24px 60px', display: 'grid', gridTemplateColumns: '1fr 360px', gap: 32 }}>
      <div>
        {/* Map svg */}
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ height: 'auto', display: 'block' }}>
          {(featureCollection.features as any[]).map((f) => {
            const code = FIPS_TO_CODE[String(f.id).padStart(2, '0')];
            if (!code) return null;
            const b = byCode.get(code);
            const fill = b ? scale(b.total) : '#f1f5f9';
            return (
              <path
                key={code}
                d={path(f) ?? undefined}
                fill={fill}
                stroke="#ffffff"
                strokeWidth={0.7}
              />
            );
          })}
        </svg>

        {/* Legend — separate svg below the map so it never overlaps Hawaii / AK */}
        <svg
          viewBox={`0 0 ${W} ${LEGEND_H}`}
          width="100%"
          style={{ height: 'auto', display: 'block', marginTop: 24 }}
        >
          <defs>
            <linearGradient id="poster-legend" x1="0" x2="1" y1="0" y2="0">
              {Array.from({ length: 21 }, (_, i) => {
                const t = i / 20;
                const value = (min * 0.7) + t * ((max * 1.05) - (min * 0.7));
                return <stop key={i} offset={`${t * 100}%`} stopColor={scale(value)} />;
              })}
            </linearGradient>
          </defs>
          <g transform={`translate(60, 22)`}>
            <text x={0} y={-8} style={{ fontSize: 12, fontWeight: 600, fill: '#475569' }}>
              Total state &amp; local tax
            </text>
            <rect x={0} y={0} width={W - 120} height={14} fill="url(#poster-legend)" stroke="#cbd5e1" strokeWidth={0.5} />
            {(() => {
              const span = (max * 1.05) - (min * 0.7);
              const tMedian = (median - min * 0.7) / span;
              const xMedian = tMedian * (W - 120);
              return (
                <>
                  <line x1={xMedian} x2={xMedian} y1={-3} y2={17} stroke="#0f172a" strokeWidth={1} />
                  <text x={xMedian} y={-8} textAnchor="middle" style={{ fontSize: 11, fontWeight: 600, fill: '#0f172a' }}>
                    median {fmtUSD(median)}
                  </text>
                </>
              );
            })()}
            <text x={0} y={28} style={{ fontSize: 11, fill: '#475569' }}>
              {fmtUSD(min)} (lowest)
            </text>
            <text x={W - 120} y={28} textAnchor="end" style={{ fontSize: 11, fill: '#475569' }}>
              {fmtUSD(max)} (highest)
            </text>
          </g>
        </svg>
      </div>

      {/* Top 5 / Bottom 5 callout column */}
      <div>
        <Callout title="Most expensive" rows={top5} accent="#dc2626" />
        <div style={{ height: 24 }} />
        <Callout title="Least expensive" rows={bottom5} accent="#16a34a" />
      </div>
    </div>
  );
}

function Callout({
  title,
  rows,
  accent,
}: {
  title: string;
  rows: Breakdown[];
  accent: string;
}) {
  const headerCell: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: '#94a3b8',
    paddingTop: 8,
    paddingBottom: 6,
    borderBottom: '1px solid #e2e8f0',
  };

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: accent }}>
        {title}
      </div>
      <table style={{ width: '100%', marginTop: 8, fontSize: 14, borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...headerCell, textAlign: 'left', width: 24 }}></th>
            <th style={{ ...headerCell, textAlign: 'left' }}>State</th>
            <th style={{ ...headerCell, textAlign: 'right' }}>Total tax</th>
            <th style={{ ...headerCell, textAlign: 'right', paddingLeft: 8 }}>% of gross</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.state}>
              <td style={{ color: '#94a3b8', paddingRight: 8, paddingTop: 5, paddingBottom: 5, width: 24 }}>{i + 1}</td>
              <td style={{ paddingTop: 5, paddingBottom: 5, fontWeight: 500 }}>{STATE_BY_CODE[r.state].name}</td>
              <td style={{ textAlign: 'right', paddingTop: 5, paddingBottom: 5, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                {fmtUSD(r.total)}
              </td>
              <td style={{ textAlign: 'right', paddingLeft: 8, paddingTop: 5, paddingBottom: 5, fontVariantNumeric: 'tabular-nums', color: '#64748b', fontSize: 12 }}>
                {fmtPctShort(r.effectiveRate)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
function BarsPanel({ sortedDesc }: { sortedDesc: Breakdown[] }) {
  const ROW_H = 22;
  const PAD_X = 60;
  const LEFT_LABEL_W = 140;
  const RIGHT_TOTAL_W = 110;
  const BAR_AREA_W = POSTER_W - 2 * PAD_X - LEFT_LABEL_W - RIGHT_TOTAL_W - 24;
  const maxTotal = sortedDesc[0]?.total ?? 1;

  return (
    <div style={{ padding: '8px 60px 24px 60px', borderTop: '1px solid #e2e8f0', marginTop: 8 }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, margin: '20px 0 4px 0' }}>
        Where the dollars actually go, state by state
      </h2>
      <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 8px 0' }}>
        Sorted high to low. Stack shows component breakdown.
      </p>

      <Legend />

      <svg viewBox={`0 0 ${POSTER_W - 2 * PAD_X} ${sortedDesc.length * ROW_H + 6}`} width="100%">
        {sortedDesc.map((b, i) => {
          const y = i * ROW_H;
          let x = LEFT_LABEL_W + 12;
          const widthFor = (v: number) => (v / maxTotal) * BAR_AREA_W;
          return (
            <g key={b.state} transform={`translate(0, ${y})`}>
              {/* State label */}
              <text
                x={LEFT_LABEL_W}
                y={ROW_H - 7}
                textAnchor="end"
                style={{ fontSize: 12, fontWeight: 500, fill: '#0f172a' }}
              >
                {STATE_BY_CODE[b.state].name}
              </text>
              {/* Stack */}
              {COMP_ORDER.map((c) => {
                const v = b[c.key];
                if (v <= 0) return null;
                const w = widthFor(v);
                const segX = x;
                x += w;
                return (
                  <rect
                    key={c.key}
                    x={segX}
                    y={3}
                    width={w}
                    height={ROW_H - 6}
                    fill={COMP_COLORS[c.key]}
                  />
                );
              })}
              {/* Total $ on the right */}
              <text
                x={LEFT_LABEL_W + 12 + BAR_AREA_W + 12}
                y={ROW_H - 7}
                style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', fontWeight: 600, fill: '#0f172a' }}
              >
                {fmtUSD(b.total)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function Legend() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px 18px', margin: '8px 0 12px 0' }}>
      {COMP_ORDER.map((c) => (
        <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#334155' }}>
          <span
            style={{
              display: 'inline-block',
              width: 12,
              height: 12,
              background: COMP_COLORS[c.key],
              borderRadius: 2,
            }}
          />
          {c.label}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
function Footer() {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: '16px 60px',
        borderTop: '1px solid #e2e8f0',
        background: '#f8fafc',
        fontSize: 11,
        color: '#475569',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: 24,
      }}
    >
      <div style={{ maxWidth: 900, lineHeight: 1.5 }}>
        <strong>Sources:</strong> 2025 state DOR worksheets · Tax Foundation 2025 individual income tax matrix ·
        Zillow ZHVI Q4 2024 (metro level) · per-county assessor publications · BLS Consumer Expenditure Survey (top quintile) ·
        FHWA Highway Statistics 2022 · API motor fuel report Q1 2025 · state labor department PFML/SDI rate publications.
        Modeled: state income (with 401(k)/HSA conformity, MD/IN county, CT/NY recapture, CA MHSA, HI alt LTCG),
        local income, payroll worker contributions, property at metro new-buyer rate, vehicle property, sales, gas.
        Excluded: federal (doesn't vary by state); Prop 13 / SOH / TX 10% caps (relocation scenario).
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0, lineHeight: 1.6 }}>
        <div style={{ fontWeight: 600, color: '#0f172a' }}>Interactive version + full methodology</div>
        <div>jasonly35.github.io/state_tax_visualization</div>
      </div>
    </div>
  );
}
