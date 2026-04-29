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

// Punchcard variant uses a mobile-portrait aspect ratio so it stays readable
// in the Reddit feed without horizontal scrolling.
const PUNCH_W = 1080;
const PUNCH_H = 2000;

// Component palette — Tailwind-friendly hexes, sequential and CB-safe.
const COMP_COLORS = {
  income:   '#1e3a8a', // blue-900
  local:    '#3b82f6', // blue-500
  payroll:  '#8b5cf6', // violet-500
  property: '#dc2626', // red-600 — also used for rent (only one is non-zero per profile)
  vehicle:  '#f59e0b', // amber-500
  sales:    '#10b981', // emerald-500
  gas:      '#64748b', // slate-500
};

type CompKey = keyof typeof COMP_COLORS;

// Build the legend / bar-segment order with a label that reflects the active
// housing mode (Property for owner; Rent for renter; the segment is hidden in
// nomad mode since both values are zero).
function buildCompOrder(housing: 'owner' | 'renter' | 'nomad'): Array<{ key: CompKey; label: string }> {
  const housingLabel =
    housing === 'renter' ? 'Rent' :
    housing === 'nomad'  ? 'Property / rent' /* legend hidden anyway */ :
    'Property';
  // Housing leftmost: it's the largest segment for almost every state and
  // anchors the left edge of every bar, which makes ranks easier to read.
  return [
    { key: 'property', label: housingLabel },
    { key: 'income',   label: 'State income' },
    { key: 'local',    label: 'Local income' },
    { key: 'sales',    label: 'Sales' },
    { key: 'payroll',  label: 'Payroll (SDI/PFML)' },
    { key: 'vehicle',  label: 'Vehicle property' },
    { key: 'gas',      label: 'Gas' },
  ];
}

interface Props {
  profile: Profile;
}

export function PosterPage({ profile: profileIn }: Props) {
  // Optional `?nohousing=1` switch — forces nomad housing so the poster
  // renders without property tax / rent. Used to A/B the visualization.
  const profile = useMemo<Profile>(() => {
    if (typeof window === 'undefined') return profileIn;
    const params = new URLSearchParams(window.location.search);
    if (params.has('nohousing')) {
      return { ...profileIn, housing: 'nomad' };
    }
    return profileIn;
  }, [profileIn]);

  // `?layout=punchcard` swaps the choropleth+bars layout for a dot-matrix grid
  // where each cell's square area is proportional to dollars paid in that
  // tax category. Prototype.
  const layout: 'default' | 'punchcard' = useMemo(() => {
    if (typeof window === 'undefined') return 'default';
    const params = new URLSearchParams(window.location.search);
    return params.get('layout') === 'punchcard' ? 'punchcard' : 'default';
  }, []);

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

  if (layout === 'punchcard') {
    return (
      <div
        style={{
          position: 'relative',
          width: PUNCH_W,
          height: PUNCH_H,
          background: '#ffffff',
          fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          color: '#0f172a',
        }}
      >
        <PunchcardHeader profile={profile} />
        <PunchcardPanel sortedDesc={sortedDesc} housing={profile.housing} />
        <PunchcardFooter />
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'relative',
        width: POSTER_W,
        height: POSTER_H,
        background: '#ffffff',
        fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        color: '#0f172a',
      }}
    >
      <Header profile={profile} />
      <ChoroplethPanel breakdowns={breakdowns} sortedAsc={sortedAsc} sortedDesc={sortedDesc} />
      <BarsPanel sortedDesc={sortedDesc} housing={profile.housing} />
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
        Married filing jointly, one dependent, moving in 2025 — all 50 US states + DC.
        Scenario assumes max 401(k) ($23,500) and family HSA ($8,550), 80th-percentile
        metro home, top-quintile consumption, $50K vehicle, 24K annual miles. Income
        mix: {(incomeMix.w2 * 100).toFixed(0)}% W-2 / {(incomeMix.intDiv * 100).toFixed(0)}%
        {' '}interest+div / {(incomeMix.ltcg * 100).toFixed(0)}% long-term cap gains. Each
        jurisdiction uses its representative city for local taxes (NYC for NY,
        Philadelphia for PA, etc.).
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
  const dcCoords = useMemo(() => projection([-77.0369, 38.9072]), [projection]);

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

          {/* DC marker — square + leader line + label, since DC isn't in
              us-atlas. Positioned at its actual lat/lon. */}
          {dcCoords && (() => {
            const [cx, cy] = dcCoords;
            const b = byCode.get('DC');
            const fill = b ? scale(b.total) : '#f1f5f9';
            const offX = 36;
            const offY = 22;
            const mx = cx + offX;
            const my = cy + offY;
            const size = 14;
            return (
              <g>
                <line x1={cx} y1={cy} x2={mx} y2={my} stroke="#475569" strokeWidth={0.7} />
                <circle cx={cx} cy={cy} r={2} fill="#1e293b" />
                <rect
                  x={mx - size / 2}
                  y={my - size / 2}
                  width={size}
                  height={size}
                  fill={fill}
                  stroke="#ffffff"
                  strokeWidth={0.8}
                />
                <text
                  x={mx + size / 2 + 4}
                  y={my + 4}
                  style={{
                    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
                    fontSize: 11,
                    fontWeight: 600,
                    fill: '#0f172a',
                  }}
                >
                  DC
                </text>
              </g>
            );
          })()}
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
function BarsPanel({ sortedDesc, housing }: { sortedDesc: Breakdown[]; housing: 'owner' | 'renter' | 'nomad' }) {
  const ROW_H = 24;
  const PAD_X = 60;
  const LEFT_LABEL_W = 140;
  // Trailing room reserved for the dollar total that follows each bar tip.
  const TRAIL_W = 96;
  const BAR_AREA_W = POSTER_W - 2 * PAD_X - LEFT_LABEL_W - 12 - TRAIL_W;
  const VIEWBOX_W = POSTER_W - 2 * PAD_X;
  const maxTotal = sortedDesc[0]?.total ?? 1;
  const compOrder = buildCompOrder(housing);

  return (
    <div style={{ padding: '8px 60px 24px 60px', borderTop: '1px solid #e2e8f0', marginTop: 8 }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, margin: '20px 0 4px 0' }}>
        Where the dollars actually go, state by state
      </h2>
      <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 8px 0' }}>
        Sorted high to low. Stack shows component breakdown. Total tax follows each bar.
      </p>

      <Legend compOrder={compOrder} />

      <svg viewBox={`0 0 ${VIEWBOX_W} ${sortedDesc.length * ROW_H + 6}`} width="100%">
        {sortedDesc.map((b, i) => {
          const y = i * ROW_H;
          let x = LEFT_LABEL_W + 12;
          const widthFor = (v: number) => (v / maxTotal) * BAR_AREA_W;
          const barW = widthFor(b.total);
          const isStripe = i % 2 === 1;
          return (
            <g key={b.state} transform={`translate(0, ${y})`}>
              {/* Zebra stripe — full-row band so the eye can ride a row from
                  state name to total without losing track. */}
              {isStripe && (
                <rect x={0} y={0} width={VIEWBOX_W} height={ROW_H} fill="#f1f5f9" />
              )}
              {/* State label */}
              <text
                x={LEFT_LABEL_W}
                y={ROW_H - 8}
                textAnchor="end"
                style={{ fontSize: 13, fontWeight: 500, fill: '#0f172a' }}
              >
                {STATE_BY_CODE[b.state].name}
              </text>
              {/* Stack — 'property' segment merges property + rent so the segment
                  represents 'housing cost' regardless of owner/renter mode. */}
              {compOrder.map((c) => {
                const v = c.key === 'property' ? b.property + b.rent : b[c.key];
                if (v <= 0) return null;
                const w = widthFor(v);
                const segX = x;
                x += w;
                return (
                  <rect
                    key={c.key}
                    x={segX}
                    y={4}
                    width={w}
                    height={ROW_H - 8}
                    fill={COMP_COLORS[c.key]}
                  />
                );
              })}
              {/* Total $ — anchored to the bar tip so the eye reads
                  state-name → bar → total without traversing the page. */}
              <text
                x={LEFT_LABEL_W + 12 + barW + 8}
                y={ROW_H - 8}
                style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', fontWeight: 600, fill: '#0f172a' }}
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

function Legend({ compOrder }: { compOrder: Array<{ key: CompKey; label: string }> }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px 18px', margin: '8px 0 12px 0' }}>
      {compOrder.map((c) => (
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
function PunchcardHeader({ profile }: { profile: Profile }) {
  const incomeShort = profile.grossIncome >= 1_000_000
    ? `$${(profile.grossIncome / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`
    : `$${Math.round(profile.grossIncome / 1000)}k`;
  return (
    <div style={{ padding: '32px 30px 16px 30px' }}>
      <h1 style={{ fontSize: 38, fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.02em', margin: 0 }}>
        Total state tax for a couple making {incomeShort}
      </h1>
      <p style={{ fontSize: 16, color: '#475569', margin: '10px 0 0 0', lineHeight: 1.4 }}>
        All 50 US states + DC · 2025 · married filing jointly · square area = dollars paid in each tax category.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
function PunchcardFooter() {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: '12px 30px',
        borderTop: '1px solid #e2e8f0',
        background: '#f8fafc',
        fontSize: 13,
        color: '#475569',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: 16,
      }}
    >
      <div>2025 state DOR worksheets · Tax Foundation · Zillow ZHVI · BLS CES.</div>
      <div style={{ fontWeight: 600, color: '#0f172a' }}>jasonly35.github.io/state_tax_visualization</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function PunchcardPanel({
  sortedDesc,
  housing,
}: {
  sortedDesc: Breakdown[];
  housing: 'owner' | 'renter' | 'nomad';
}) {
  const PAD_X = 30;
  const VIEWBOX_W = PUNCH_W - 2 * PAD_X;
  const ROW_H = 28;
  const HEADER_H = 44;
  const LEFT_LABEL_W = 110;
  const TOTAL_COL_W = 96;
  const LABEL_GAP = 8;

  const housingLabel =
    housing === 'renter' ? 'Rent' :
    housing === 'nomad'  ? 'Housing' :
    'Property';

  type Col = { key: CompKey; label: string };
  // 5 columns. Gas + Payroll are <$1k for almost every state and don't
  // contribute to the visual story — dropped to give the remaining columns
  // more breathing room on a mobile-portrait poster.
  const dataCols: Col[] = [
    { key: 'property', label: housingLabel },
    { key: 'income',   label: 'State inc.' },
    { key: 'local',    label: 'Local inc.' },
    { key: 'sales',    label: 'Sales' },
    { key: 'vehicle',  label: 'Vehicle' },
  ];

  const dataAreaW = VIEWBOX_W - LEFT_LABEL_W - LABEL_GAP - TOTAL_COL_W - 12;
  const colW = dataAreaW / dataCols.length;

  const valueAt = (b: Breakdown, key: CompKey) =>
    key === 'property' ? b.property + b.rent : b[key];

  const maxVal = Math.max(
    1,
    ...sortedDesc.flatMap((b) => dataCols.map((c) => valueAt(b, c.key))),
  );
  const maxSide = Math.min(ROW_H - 4, colW - 6);
  const sideFor = (v: number) => {
    if (v <= 0) return 0;
    const s = maxSide * Math.sqrt(v / maxVal);
    // Larger floor than the print version — small values still need to read at
    // mobile-feed scale.
    return Math.max(s, 3.5);
  };

  const legendValues = [1000, 5000, 10000, 15000].filter((v) => v <= maxVal);

  const totalH = HEADER_H + sortedDesc.length * ROW_H + 6;

  return (
    <div style={{ padding: '0 30px 16px 30px' }}>
      {/* Reference legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '0 0 12px 0', fontSize: 13, color: '#475569' }}>
        <span style={{ fontWeight: 600, color: '#0f172a' }}>Scale:</span>
        {legendValues.map((v) => {
          const s = sideFor(v);
          return (
            <div key={v} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{
                display: 'inline-block', width: maxSide, height: maxSide,
                position: 'relative',
              }}>
                <span style={{
                  position: 'absolute',
                  left: (maxSide - s) / 2,
                  top: (maxSide - s) / 2,
                  width: s,
                  height: s,
                  background: '#475569',
                  borderRadius: 1.5,
                }} />
              </span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>${v.toLocaleString()}</span>
            </div>
          );
        })}
      </div>

      <svg viewBox={`0 0 ${VIEWBOX_W} ${totalH}`} width="100%">
        {/* Column headers */}
        {dataCols.map((c, ci) => {
          const cx = LEFT_LABEL_W + LABEL_GAP + (ci + 0.5) * colW;
          return (
            <g key={c.key}>
              <rect
                x={cx - colW / 2}
                y={0}
                width={colW}
                height={HEADER_H - 6}
                fill={COMP_COLORS[c.key]}
                opacity={0.08}
              />
              <text
                x={cx}
                y={HEADER_H - 14}
                textAnchor="middle"
                style={{ fontSize: 13, fontWeight: 700, fill: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.04em' }}
              >
                {c.label}
              </text>
            </g>
          );
        })}
        <text
          x={LEFT_LABEL_W + LABEL_GAP + dataAreaW + 12 + TOTAL_COL_W - 6}
          y={HEADER_H - 14}
          textAnchor="end"
          style={{ fontSize: 13, fontWeight: 700, fill: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.04em' }}
        >
          Total
        </text>
        <line x1={0} x2={VIEWBOX_W} y1={HEADER_H - 4} y2={HEADER_H - 4} stroke="#cbd5e1" strokeWidth={1} />

        {/* Rows */}
        {sortedDesc.map((b, i) => {
          const y = HEADER_H + i * ROW_H;
          const isStripe = i % 2 === 1;
          return (
            <g key={b.state} transform={`translate(0, ${y})`}>
              {isStripe && (
                <rect x={0} y={0} width={VIEWBOX_W} height={ROW_H} fill="#f8fafc" />
              )}
              <text
                x={LEFT_LABEL_W}
                y={ROW_H - 9}
                textAnchor="end"
                style={{ fontSize: 14, fontWeight: 500, fill: '#0f172a' }}
              >
                {b.state === 'DC' ? 'Washington D.C.' : STATE_BY_CODE[b.state].name}
              </text>
              {dataCols.map((c, ci) => {
                const v = valueAt(b, c.key);
                const side = sideFor(v);
                if (side === 0) return null;
                const cx = LEFT_LABEL_W + LABEL_GAP + (ci + 0.5) * colW;
                const cy = ROW_H / 2;
                return (
                  <rect
                    key={c.key}
                    x={cx - side / 2}
                    y={cy - side / 2}
                    width={side}
                    height={side}
                    fill={COMP_COLORS[c.key]}
                    rx={1.5}
                  />
                );
              })}
              <text
                x={LEFT_LABEL_W + LABEL_GAP + dataAreaW + 12 + TOTAL_COL_W - 6}
                y={ROW_H - 9}
                textAnchor="end"
                style={{ fontSize: 14, fontVariantNumeric: 'tabular-nums', fontWeight: 600, fill: '#0f172a' }}
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
