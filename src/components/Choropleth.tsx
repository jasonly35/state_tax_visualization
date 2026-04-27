import { useMemo, useRef, useState } from 'react';
import * as topojson from 'topojson-client';
// us-atlas ships TopoJSON for nation/states. The 10m file is the standard "states" shape.
import statesTopo from 'us-atlas/states-10m.json';
// Color ramp: pale orange → deep red. Avoids the washed-out yellow of YlOrRd
// at the low end while keeping the heat metaphor. To swap: replace the import
// with another d3 sequential interpolator (e.g. `interpolatePlasma`,
// `interpolateBlues`, `interpolateYlGnBu`) and rename below.
import { geoPath, geoAlbersUsa, scaleSequential, interpolateOrRd } from 'd3';
import type { Breakdown } from '../lib/types';
import type { StateCode } from '../lib/profile';
import { STATE_BY_CODE } from '../lib/load-data';
import { fmtPctShort, fmtUSD } from '../lib/format';

// us-atlas states have GEOID = 2-digit FIPS; we map FIPS -> postal code.
const FIPS_TO_CODE: Record<string, StateCode> = {
  '01':'AL','02':'AK','04':'AZ','05':'AR','06':'CA','08':'CO','09':'CT','10':'DE',
  '12':'FL','13':'GA','15':'HI','16':'ID','17':'IL','18':'IN','19':'IA','20':'KS',
  '21':'KY','22':'LA','23':'ME','24':'MD','25':'MA','26':'MI','27':'MN','28':'MS',
  '29':'MO','30':'MT','31':'NE','32':'NV','33':'NH','34':'NJ','35':'NM','36':'NY',
  '37':'NC','38':'ND','39':'OH','40':'OK','41':'OR','42':'PA','44':'RI','45':'SC',
  '46':'SD','47':'TN','48':'TX','49':'UT','50':'VT','51':'VA','53':'WA','54':'WV',
  '55':'WI','56':'WY',
};

interface Props {
  breakdowns: Breakdown[];
  selected: StateCode | null;
  onSelect: (code: StateCode | null) => void;
}

const WIDTH = 975;
const HEIGHT = 610;
const LEGEND_HEIGHT = 60;

export function Choropleth({ breakdowns, selected, onSelect }: Props) {
  const [hovered, setHovered] = useState<StateCode | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const byCode = useMemo(() => {
    const m = new Map<StateCode, Breakdown>();
    for (const b of breakdowns) m.set(b.state, b);
    return m;
  }, [breakdowns]);

  const { scale, min, max, vals } = useMemo(() => {
    const v = breakdowns.map((b) => b.total);
    const lo = Math.min(...v);
    const hi = Math.max(...v);
    return {
      vals: v,
      min: lo,
      max: hi,
      scale: scaleSequential(interpolateOrRd).domain([lo * 0.7, hi * 1.05]),
    };
  }, [breakdowns]);

  // Median for the legend tick.
  const median = useMemo(() => {
    const sorted = [...vals].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }, [vals]);

  const featureCollection = useMemo(() => {
    const t = statesTopo as any;
    return topojson.feature(t, t.objects.states) as any;
  }, []);

  const projection = useMemo(
    () => geoAlbersUsa().scale(1280).translate([WIDTH / 2, HEIGHT / 2 - 5]),
    [],
  );
  const path = useMemo(() => geoPath(projection), [projection]);

  // DC is too geographically tiny to render as a polygon at this scale (us-atlas
  // doesn't include it as a separate feature), so we render a small square at
  // its projected coordinates with a short leader line + "DC" label. Same hover
  // / click affordance as other states.
  const dcCoords = useMemo(() => projection([-77.0369, 38.9072]), [projection]);

  const activeCode = hovered ?? selected;
  const activeBreakdown = activeCode ? byCode.get(activeCode) ?? null : null;

  // Decide which corner the tooltip pins to: if the active state's centroid is
  // in the right half of the map, render the tooltip on the LEFT so it doesn't
  // cover the state under the cursor. Centroid-based (not mouse-based) so the
  // tooltip doesn't jitter as the cursor moves within the state.
  const tooltipSide: 'left' | 'right' = useMemo(() => {
    if (!activeCode) return 'right';
    const f = (featureCollection.features as any[]).find(
      (feat) => FIPS_TO_CODE[String(feat.id).padStart(2, '0')] === activeCode,
    );
    if (!f) return 'right';
    const c = path.centroid(f);
    if (!Number.isFinite(c[0])) return 'right';
    return c[0] > WIDTH / 2 ? 'left' : 'right';
  }, [activeCode, featureCollection, path]);

  return (
    <div ref={wrapRef} className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-50 shadow-sm sm:rounded-xl">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT + LEGEND_HEIGHT}`}
        className="h-auto w-full"
        role="img"
        aria-label="US choropleth of total state and local tax burden"
      >
        <defs>
          {/* Drop shadow for the selected state */}
          <filter id="state-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="1.5" stdDeviation="2" floodColor="#0f172a" floodOpacity="0.35" />
          </filter>

          {/* Continuous gradient for the legend */}
          <linearGradient id="legend-gradient" x1="0" x2="1" y1="0" y2="0">
            {Array.from({ length: 21 }, (_, i) => {
              const t = i / 20;
              const value = (min * 0.7) + t * ((max * 1.05) - (min * 0.7));
              return <stop key={i} offset={`${t * 100}%`} stopColor={scale(value)} />;
            })}
          </linearGradient>
        </defs>

        {/* Map. Active state (hovered or selected) is rendered LAST so its full
            stroke sits on top of every neighbor's stroke — otherwise the
            neighbor's stroke would overdraw half of the active border on each
            shared edge, making the highlight look thinner there than on coasts. */}
        <g>
          {(() => {
            const features = featureCollection.features as any[];
            const isActive = (f: any) => {
              const code = FIPS_TO_CODE[String(f.id).padStart(2, '0')];
              return code === selected || code === hovered;
            };
            const ordered = [...features.filter((f) => !isActive(f)), ...features.filter(isActive)];

            return ordered.map((f) => {
              const fips = String(f.id).padStart(2, '0');
              const code = FIPS_TO_CODE[fips];
              if (!code) return null;
              const b = byCode.get(code);
              const fill = b ? scale(b.total) : '#f1f5f9';
              const isSel = code === selected;
              const isHover = code === hovered;
              return (
                <path
                  key={fips}
                  d={path(f) ?? undefined}
                  fill={fill}
                  stroke={isSel ? '#0f172a' : isHover ? '#1e293b' : '#ffffff'}
                  strokeWidth={isSel ? 2.5 : isHover ? 1.5 : 0.8}
                  filter={isSel ? 'url(#state-shadow)' : undefined}
                  onMouseEnter={() => setHovered(code)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => onSelect(isSel ? null : code)}
                  className="cursor-pointer transition-colors"
                >
                  <title>{STATE_BY_CODE[code].name}</title>
                </path>
              );
            });
          })()}
        </g>

        {/* DC marker — square + leader line + label, since DC isn't in us-atlas
            as a polygon. Positioned at DC's actual lat/lon via the same Albers
            projection so it stays geographically anchored if scale changes. */}
        {dcCoords && (() => {
          const [cx, cy] = dcCoords;
          const b = byCode.get('DC');
          const fill = b ? scale(b.total) : '#f1f5f9';
          const isSel = selected === 'DC';
          const isHover = hovered === 'DC';
          // Marker offset to the southeast so it doesn't sit on top of MD/VA.
          const offsetX = 30;
          const offsetY = 18;
          const mx = cx + offsetX;
          const my = cy + offsetY;
          const size = 12;
          return (
            <g>
              {/* Leader from DC's geographic position to the marker */}
              <line
                x1={cx}
                y1={cy}
                x2={mx}
                y2={my}
                stroke="#475569"
                strokeWidth={0.6}
                pointerEvents="none"
              />
              {/* Anchor dot at the geographic location */}
              <circle cx={cx} cy={cy} r={1.5} fill="#1e293b" pointerEvents="none" />
              {/* The clickable marker square */}
              <rect
                x={mx - size / 2}
                y={my - size / 2}
                width={size}
                height={size}
                fill={fill}
                stroke={isSel ? '#0f172a' : isHover ? '#1e293b' : '#ffffff'}
                strokeWidth={isSel ? 2 : isHover ? 1.5 : 0.8}
                filter={isSel ? 'url(#state-shadow)' : undefined}
                onMouseEnter={() => setHovered('DC')}
                onMouseLeave={() => setHovered(null)}
                onClick={() => onSelect(isSel ? null : 'DC')}
                className="cursor-pointer transition-colors"
              >
                <title>District of Columbia</title>
              </rect>
              {/* Small "DC" label next to the marker */}
              <text
                x={mx + size / 2 + 4}
                y={my + 3}
                style={{
                  fontFamily: 'ui-sans-serif, system-ui, sans-serif',
                  fontSize: 10,
                  fontWeight: 600,
                  fill: '#0f172a',
                }}
                pointerEvents="none"
              >
                DC
              </text>
            </g>
          );
        })()}

        {/* Legend — continuous gradient with min, median tick, max */}
        <g transform={`translate(0, ${HEIGHT})`}>
          {(() => {
            const lx = 60;
            const ly = 22;
            const lw = WIDTH - 120;
            const lh = 12;
            const span = (max * 1.05) - (min * 0.7);
            const tMedian = (median - min * 0.7) / span;
            const xMedian = lx + tMedian * lw;
            return (
              <>
                <text
                  x={lx}
                  y={ly - 6}
                  style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif', fontSize: 10, fontWeight: 600, fill: '#475569' }}
                >
                  Total state &amp; local tax
                </text>
                <rect x={lx} y={ly} width={lw} height={lh} fill="url(#legend-gradient)" stroke="#cbd5e1" strokeWidth={0.5} />
                <text x={lx} y={ly + lh + 12} style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif', fontSize: 10, fill: '#475569' }}>
                  {fmtUSD(min)} (lowest)
                </text>
                <text x={lx + lw} y={ly + lh + 12} textAnchor="end" style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif', fontSize: 10, fill: '#475569' }}>
                  {fmtUSD(max)} (highest)
                </text>
                <line x1={xMedian} x2={xMedian} y1={ly - 2} y2={ly + lh + 2} stroke="#0f172a" strokeWidth={1} />
                <text
                  x={xMedian}
                  y={ly - 6}
                  textAnchor="middle"
                  style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif', fontSize: 10, fontWeight: 600, fill: '#0f172a' }}
                >
                  median {fmtUSD(median)}
                </text>
              </>
            );
          })()}
        </g>
      </svg>

      {/* Floating tooltip — anchors to the side of the map opposite the active
          state's centroid, so it never covers the state being inspected. */}
      {activeBreakdown && (
        <div
          className={`pointer-events-none absolute top-2 w-[180px] max-w-[60%] rounded-lg border border-slate-200 bg-white/95 p-2 text-[11px] shadow-lg backdrop-blur-sm sm:top-3 sm:w-auto sm:max-w-xs sm:p-3 sm:text-xs ${
            tooltipSide === 'left' ? 'left-2 sm:left-3' : 'right-2 sm:right-3'
          }`}
        >
          <div className="text-xs font-semibold text-slate-900 sm:text-sm">
            {STATE_BY_CODE[activeBreakdown.state].name}
          </div>
          <dl className="mt-1.5 space-y-0.5">
            <Row label="Total" value={fmtUSD(activeBreakdown.total)} bold />
            <Row label="Effective" value={fmtPctShort(activeBreakdown.effectiveRate)} />
            <hr className="my-1 border-slate-200" />
            <Row label="State income" value={fmtUSD(activeBreakdown.income)} />
            {activeBreakdown.local > 0 && <Row label="Local income" value={fmtUSD(activeBreakdown.local)} />}
            {activeBreakdown.payroll > 0 && <Row label="Payroll (SDI/PFML)" value={fmtUSD(activeBreakdown.payroll)} />}
            {activeBreakdown.property > 0 && <Row label="Property" value={fmtUSD(activeBreakdown.property)} />}
            {activeBreakdown.rent > 0 && <Row label="Rent" value={fmtUSD(activeBreakdown.rent)} />}
            {activeBreakdown.vehicle > 0 && <Row label="Vehicle property" value={fmtUSD(activeBreakdown.vehicle)} />}
            <Row label="Sales" value={fmtUSD(activeBreakdown.sales)} />
            <Row label="Gas" value={fmtUSD(activeBreakdown.gas)} />
            <hr className="my-1 border-slate-200" />
            <Row label="Federal (context)" value={fmtUSD(activeBreakdown.federal)} muted />
          </dl>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, bold, muted }: { label: string; value: string; bold?: boolean; muted?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${bold ? 'font-semibold text-slate-900' : ''} ${muted ? 'text-slate-400' : 'text-slate-700'}`}>
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
