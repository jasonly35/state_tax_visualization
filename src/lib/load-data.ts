// Composes the seven per-state JSON files into the StateData[] the UI
// consumes. Runs once at module load — JSON imports are static.

import incomeBracketsRaw from '../data/income-brackets.json';
import propertyRatesRaw from '../data/property-rates.json';
import homeValuesRaw from '../data/home-values.json';
import salesRatesRaw from '../data/sales-rates.json';
import gasTaxesRaw from '../data/gas-taxes.json';
import milesRaw from '../data/miles-per-driver.json';
import consumptionRaw from '../data/consumption-quintiles.json';
import stateRulesRaw from '../data/state-rules.json';
import stateNamesRaw from '../data/state-names.json';
import overlaysRaw from '../data/local-overlays.json';
import payrollRaw from '../data/state-payroll.json';
import vehicleRatesRaw from '../data/vehicle-rates.json';
import stateDefaultsRaw from '../data/state-defaults.json';

import { STATES, type StateCode, type LocalCity } from './profile';
import type {
  StateData,
  StateRule,
  Bracket,
  LocalOverlay,
  PayrollComponent,
} from './types';

interface RawIncome {
  brackets: { mfj: Bracket[]; single: Bracket[]; hoh: Bracket[] };
  stdDeduction: { mfj: number; single: number; hoh: number };
  personalExemption: { mfj: number; single: number; hoh: number };
  dependentExemption: number;
}

const DEFAULT_RULE: StateRule = {
  conforms401kPretax: true,
  conformsHSA: true,
  ltcgAsOrdinary: true,
  ltcgExclusion: 0,
  intDivAsOrdinary: true,
  defaultCountyRate: 0,
};

function rulesFor(code: StateCode): StateRule {
  const raw = stateRulesRaw as Record<string, Partial<StateRule>>;
  if (raw[code]) {
    return { ...DEFAULT_RULE, ...raw[code] };
  }
  return DEFAULT_RULE;
}

const incomeMap = incomeBracketsRaw as unknown as Record<string, RawIncome>;
const propertyMap = propertyRatesRaw as unknown as Record<string, { rate: number; city: string; notes?: string; source?: string }>;
const homeMap = homeValuesRaw as unknown as Record<string, { p50: number; p70: number; p80: number; p90: number; p95: number; city: string }>;
const salesMap = salesRatesRaw as unknown as Record<string, { combined: number }>;
const gasMap = gasTaxesRaw as unknown as Record<string, { perGallon: number }>;
const milesMap = milesRaw as unknown as Record<string, { perDriver: number }>;
const consumptionMap = consumptionRaw as unknown as Record<string, { p50: number; p70: number; p80: number; p90: number; p95: number }>;
const namesMap = stateNamesRaw as Record<string, string>;
const payrollMap = payrollRaw as unknown as Record<string, { components: PayrollComponent[] }>;
const vehicleMap = vehicleRatesRaw as unknown as Record<string, { rate: number; notes?: string }>;
const stateDefaultsMap = stateDefaultsRaw as unknown as Record<string, { defaultCity: LocalCity }>;

function pick<T>(map: Record<string, unknown>, code: string, label: string): T {
  const v = map[code];
  if (!v || code.startsWith('_')) {
    throw new Error(`Missing ${label} entry for ${code}`);
  }
  return v as T;
}

const SOURCE_TAG = 'See data/_meta in respective JSON file.';

export const STATE_DATA: StateData[] = STATES.map((code) => {
  const inc = pick<RawIncome>(incomeMap, code, 'income brackets');
  return {
    code,
    name: namesMap[code] ?? code,
    income: {
      brackets: inc.brackets,
      stdDeduction: inc.stdDeduction,
      personalExemption: inc.personalExemption,
      dependentExemption: inc.dependentExemption,
      source: SOURCE_TAG,
      asOf: '2025',
    },
    rules: rulesFor(code),
    property: (() => {
      const p = pick<{ rate: number; city: string; notes?: string; source?: string }>(propertyMap, code, 'property rate');
      return { rate: p.rate, city: p.city, notes: p.notes, source: p.source ?? SOURCE_TAG };
    })(),
    home: (() => {
      const h = pick<{ p50: number; p70: number; p80: number; p90: number; p95: number; city: string }>(homeMap, code, 'home values');
      return { p50: h.p50, p70: h.p70, p80: h.p80, p90: h.p90, p95: h.p95, city: h.city, source: SOURCE_TAG };
    })(),
    sales: { combined: pick<{ combined: number }>(salesMap, code, 'sales rate').combined, source: SOURCE_TAG },
    consumption: { ...pick<{ p50: number; p70: number; p80: number; p90: number; p95: number }>(consumptionMap, code, 'consumption'), source: SOURCE_TAG },
    gas: { perGallon: pick<{ perGallon: number }>(gasMap, code, 'gas tax').perGallon, source: SOURCE_TAG },
    miles: { perDriver: pick<{ perDriver: number }>(milesMap, code, 'miles').perDriver, source: SOURCE_TAG },
    payroll: {
      components: payrollMap[code]?.components ?? [],
      source: SOURCE_TAG,
    },
    vehicle: {
      rate: vehicleMap[code]?.rate ?? 0,
      notes: vehicleMap[code]?.notes,
      source: SOURCE_TAG,
    },
    defaultCity: stateDefaultsMap[code]?.defaultCity ?? 'none',
  };
});

export const STATE_BY_CODE: Record<StateCode, StateData> = Object.fromEntries(
  STATE_DATA.map((s) => [s.code, s]),
) as Record<StateCode, StateData>;

interface RawOverlay {
  state: string;
  rateOnOrdinary: number;
  appliesToLtcg: boolean;
  notes?: string;
}

const overlaysMap = overlaysRaw as unknown as Record<string, RawOverlay>;

function overlayFromCityKey(city: LocalCity): LocalOverlay | null {
  if (city === 'none' || city === 'state_default') return null;
  const raw = overlaysMap[city];
  if (!raw || typeof raw !== 'object' || !('rateOnOrdinary' in raw)) return null;
  return {
    rateOnOrdinary: raw.rateOnOrdinary,
    appliesToLtcg: raw.appliesToLtcg,
    notes: raw.notes,
    source: SOURCE_TAG,
  };
}

/** Returns a per-state resolver: given a state, what city overlay applies?
 *
 *  - 'state_default'    → each state uses its own representative city
 *  - 'none'             → no city overlay anywhere
 *  - specific city      → that city applies to its parent state only;
 *                         other states fall back to their representative city.
 *                         (i.e. picking NYC doesn't strip Detroit from MI's row.)
 */
export function makeOverlayResolver(city: LocalCity) {
  if (city === 'none') {
    return (_s: StateData) => ({ city: 'none' as LocalCity, overlay: null });
  }
  if (city === 'state_default') {
    return (s: StateData) => ({ city: s.defaultCity, overlay: overlayFromCityKey(s.defaultCity) });
  }
  // Specific city pinned by user. Apply only to its parent state; others use their default.
  const raw = overlaysMap[city];
  const parentState = raw?.state as StateCode | undefined;
  return (s: StateData) => {
    if (s.code === parentState) {
      return { city, overlay: overlayFromCityKey(city) };
    }
    return { city: s.defaultCity, overlay: overlayFromCityKey(s.defaultCity) };
  };
}
