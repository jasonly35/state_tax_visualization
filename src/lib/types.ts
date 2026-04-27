// Shapes for the JSON data files in src/data. Kept in one place so any
// schema change shows up at every call site.

import type { FilingStatus, StateCode, LocalCity } from './profile';

export interface Bracket {
  /** Inclusive lower bound. The implicit upper bound is the next bracket's `min`. */
  min: number;
  /** Marginal rate as a decimal (e.g. 0.093 for 9.3%). */
  rate: number;
}

export interface StateIncomeRules {
  /** If empty, treat state as no-income-tax. */
  brackets: { mfj: Bracket[]; single: Bracket[]; hoh: Bracket[] };
  /** Standard deduction by filing status. 0 if state has none / uses federal. */
  stdDeduction: { mfj: number; single: number; hoh: number };
  /** Per-dependent exemption credit/deduction. Modeled as a deduction from AGI in dollars. */
  dependentExemption: number;
  /** Personal exemption applied once (or twice for MFJ if applicable). */
  personalExemption: { mfj: number; single: number; hoh: number };
  /** Notes for methodology drawer. */
  source: string;
  asOf: string;
}

export interface StateRule {
  conforms401kPretax: boolean;
  conformsHSA: boolean;
  ltcgAsOrdinary: boolean;
  ltcgOverride?: { rateAbove: number; threshold: number };
  ltcgExclusion: number;
  intDivAsOrdinary: boolean;
  defaultCountyRate: number;

  /** Bracket-benefit recapture / phase-out schedule (CT §12-700b, NY IT-201-I tax computation worksheet).
   *  Modeled as a piecewise-linear add-on tax: given state taxable income (state-AGI),
   *  add the corresponding interpolated dollar amount on top of the bracketed result.
   *  Each entry's `agi` is the breakpoint; `addOn` is the recapture at that breakpoint. */
  recapture?: {
    mfj: Array<{ agi: number; addOn: number }>;
    single: Array<{ agi: number; addOn: number }>;
    hoh: Array<{ agi: number; addOn: number }>;
  };

  /** Hawaii alternative tax on capital gains (HRS §235-51(f)). When set, the calc
   *  takes the LESSER of (a) ordinary bracket walk including LTCG-as-ordinary and
   *  (b) bracket walk on (stateAGI − LTCG) + LTCG × ltcgAltRate. Taxpayer-friendly. */
  ltcgAltRate?: number;

  /** Personal-exemption phase-out start (CT §12-702): for state-AGI above the
   *  start, reduce the base personal exemption by $1 per $1 over, floor at $0.
   *  Only the start is encoded; the slope is assumed $1/$1. */
  exemptionPhaseoutStart?: { mfj: number; single: number; hoh: number };

  notes?: string[];
}

export interface PropertyRate {
  /** Effective annual property tax rate on market value at the representative city,
   *  including base ad valorem + voter-approved bonds + school district levies +
   *  special assessments typical for a NEW buyer. NOT the state-average tenure-
   *  weighted rate (which understates actual new-buyer bills due to Prop 13-style caps). */
  rate: number;
  /** Representative metro the rate is drawn from. */
  city: string;
  /** What's included in the rate (school bonds, Mello-Roos, etc.). */
  notes?: string;
  source: string;
}

export interface HomeValueRow {
  /** Percentile values for the representative metro, NOT the state. Designed
   *  to match a "new buyer in this metro" scenario. */
  p50: number;
  p70: number;
  p80: number;
  p90: number;
  p95: number;
  city: string;
  source: string;
}

export interface SalesRate {
  /** State + average local combined effective rate, applied to taxable consumption. */
  combined: number;
  source: string;
}

export interface ConsumptionRow {
  /** BLS CEX top-quintile annual taxable consumption. Pre-stripped of non-taxable categories. */
  p50: number;
  p70: number;
  p80: number;
  p90: number;
  p95: number;
  source: string;
}

export interface GasTaxRow {
  /** Per-gallon excise + average sales-tax-on-gas equivalent, in dollars. */
  perGallon: number;
  source: string;
}

export interface MilesRow {
  /** Annual VMT per licensed driver, FHWA. */
  perDriver: number;
  source: string;
}

export interface PayrollComponent {
  rate: number;
  /** Wage cap in USD. null means no cap. */
  cap: number | null;
  name: string;
}

export interface StatePayroll {
  components: PayrollComponent[];
  source: string;
}

export interface VehicleRate {
  rate: number;
  source: string;
  notes?: string;
}

export interface LocalOverlay {
  /** Flat additional tax rate on state-AGI-equivalent. Modeled as flat percent of W-2 + intDiv (NOT LTCG except where applicable). */
  rateOnOrdinary: number;
  /** Optional flat fee or extra logic key for special cases (PA wage tax flat etc.). */
  notes?: string;
  appliesToLtcg: boolean;
  source: string;
}

// ---------------------------------------------------------------------------
// Composite per-state record assembled at load time.

export interface StateData {
  code: StateCode;
  name: string;
  income: StateIncomeRules;
  rules: StateRule;
  property: PropertyRate;
  home: HomeValueRow;
  sales: SalesRate;
  consumption: ConsumptionRow;
  gas: GasTaxRow;
  miles: MilesRow;
  payroll: StatePayroll;
  vehicle: VehicleRate;
  /** Representative city used when profile.city = 'state_default'. */
  defaultCity: LocalCity;
}

// ---------------------------------------------------------------------------
// Output: per-state breakdown for a given profile.

export interface Breakdown {
  state: StateCode;
  total: number;
  /** State income tax including any default county tax baked in (MD, IN). */
  income: number;
  /** Local income tax overlay (city/town added on top of state). Already in `total`. */
  local: number;
  /** State payroll-style worker contributions (CA SDI, WA PFML+Cares, NY PFL, etc.). */
  payroll: number;
  property: number;
  /** Personal property tax on motor vehicles (VA, CT, MO, MS, etc.). */
  vehicle: number;
  sales: number;
  gas: number;
  federal: number;
  effectiveRate: number;
  inputs: {
    homeValueUsd: number;
    consumptionUsd: number;
    vehicleValueUsd: number;
    annualMiles: number;
    stateAGI: number;
    appliedK401: boolean;
    appliedHSA: boolean;
    /** Effective city used (state default if profile.city was 'state_default'). */
    city: LocalCity;
    filing: FilingStatus;
  };
}
