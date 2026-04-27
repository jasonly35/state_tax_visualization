// User profile + URL serialization. Pure, no React.

export type FilingStatus = 'mfj' | 'single' | 'hoh';

export const STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
] as const;

export type StateCode = typeof STATES[number];

export type LocalCity =
  | 'state_default' | 'none'
  | 'nyc' | 'yonkers'
  | 'detroit'
  | 'philadelphia' | 'pittsburgh'
  | 'cleveland' | 'columbus' | 'cincinnati'
  | 'portland_or'
  | 'birmingham_al'
  | 'louisville_ky'
  | 'kansas_city_mo'
  | 'wilmington_de';

export interface IncomeMix {
  w2: number;
  intDiv: number;
  ltcg: number;
}

export type ValueRef =
  | { kind: 'percentile'; pct: 50 | 70 | 80 | 90 | 95 }
  | { kind: 'amount'; usd: number };

export interface Profile {
  grossIncome: number;
  incomeMix: IncomeMix;
  filingStatus: FilingStatus;
  dependents: number;
  k401Contribution: number;
  hsaContribution: number;
  homeValue: ValueRef;
  consumption: ValueRef;
  /** Combined household vehicle market value (used for VA/CT/MO/etc. personal property tax). */
  vehicleValue: number;
  annualMiles: number;
  city: LocalCity;
}

export const DEFAULT_PROFILE: Profile = {
  grossIncome: 240_000,
  incomeMix: { w2: 0.8, intDiv: 0.1, ltcg: 0.1 },
  filingStatus: 'mfj',
  dependents: 1,
  k401Contribution: 23_500,
  hsaContribution: 8_550,
  homeValue: { kind: 'percentile', pct: 80 },
  consumption: { kind: 'percentile', pct: 80 },
  vehicleValue: 50_000,
  annualMiles: 24_000,
  city: 'state_default',
};

// ---------------------------------------------------------------------------
// URL serialization. Pipe-delimited fixed-order fields. v2 schema appends
// `vehicle` after `cons_val`:
//   v2 | gross | w2 | int | ltcg | filing | deps | k401 | hsa
//      | home_kind | home_val | cons_kind | cons_val | vehicle | miles | city
const N_FIELDS = 16;

const toB36 = (x: number) => Math.round(x).toString(36);
const fromB36 = (s: string) => parseInt(s, 36);

const isPctValid = (n: number): n is 50 | 70 | 80 | 90 | 95 =>
  n === 50 || n === 70 || n === 80 || n === 90 || n === 95;

export function serializeProfile(p: Profile): string {
  const parts = [
    'v2',
    toB36(p.grossIncome),
    toB36(p.incomeMix.w2 * 1000),
    toB36(p.incomeMix.intDiv * 1000),
    toB36(p.incomeMix.ltcg * 1000),
    p.filingStatus,
    String(p.dependents),
    toB36(p.k401Contribution),
    toB36(p.hsaContribution),
    p.homeValue.kind === 'percentile' ? 'p' : 'a',
    p.homeValue.kind === 'percentile' ? String(p.homeValue.pct) : toB36(p.homeValue.usd),
    p.consumption.kind === 'percentile' ? 'p' : 'a',
    p.consumption.kind === 'percentile' ? String(p.consumption.pct) : toB36(p.consumption.usd),
    toB36(p.vehicleValue),
    toB36(p.annualMiles),
    p.city,
  ];
  return parts.join('|');
}

export function deserializeProfile(s: string): Profile | null {
  const parts = s.split('|');
  if (parts[0] !== 'v2' || parts.length !== N_FIELDS) return null;

  const filing = parts[5];
  if (filing !== 'mfj' && filing !== 'single' && filing !== 'hoh') return null;

  const parseValueRef = (kind: string, val: string): ValueRef | null => {
    if (kind === 'p') {
      const pct = Number(val);
      if (!isPctValid(pct)) return null;
      return { kind: 'percentile', pct };
    }
    if (kind === 'a') {
      const usd = fromB36(val);
      if (!Number.isFinite(usd) || usd < 0) return null;
      return { kind: 'amount', usd };
    }
    return null;
  };

  const home = parseValueRef(parts[9], parts[10]);
  const cons = parseValueRef(parts[11], parts[12]);
  if (!home || !cons) return null;

  return {
    grossIncome: fromB36(parts[1]),
    incomeMix: {
      w2: fromB36(parts[2]) / 1000,
      intDiv: fromB36(parts[3]) / 1000,
      ltcg: fromB36(parts[4]) / 1000,
    },
    filingStatus: filing,
    dependents: Number(parts[6]),
    k401Contribution: fromB36(parts[7]),
    hsaContribution: fromB36(parts[8]),
    homeValue: home,
    consumption: cons,
    vehicleValue: fromB36(parts[13]),
    annualMiles: fromB36(parts[14]),
    city: parts[15] as LocalCity,
  };
}

export function clampMix(mix: IncomeMix): IncomeMix {
  const total = mix.w2 + mix.intDiv + mix.ltcg;
  if (total === 0) return { w2: 1, intDiv: 0, ltcg: 0 };
  return { w2: mix.w2 / total, intDiv: mix.intDiv / total, ltcg: mix.ltcg / total };
}

/** Update one component of the mix to a new value, redistributing the others
 *  proportionally so the three still sum to 1. Avoids the trap where dragging
 *  W-2 to 100% gets renormalized back down by clampMix. */
export function updateMix(
  current: IncomeMix,
  key: keyof IncomeMix,
  newValue: number,
): IncomeMix {
  const v = Math.max(0, Math.min(1, newValue));
  const remainder = 1 - v;
  const others: Array<keyof IncomeMix> = (['w2', 'intDiv', 'ltcg'] as const).filter(
    (k) => k !== key,
  );
  const othersSum = others.reduce((s, k) => s + current[k], 0);

  const result: IncomeMix = { ...current, [key]: v };
  if (othersSum === 0) {
    // Split the remainder equally if the other two were both zero.
    for (const k of others) result[k] = remainder / others.length;
  } else {
    for (const k of others) result[k] = (current[k] / othersSum) * remainder;
  }
  return result;
}
