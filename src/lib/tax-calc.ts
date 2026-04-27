// Pure tax calculation. No IO, no React. Every function takes its data
// explicitly so it is trivially testable.

import type { Profile, FilingStatus, LocalCity } from './profile';
import type { Bracket, StateData, Breakdown, LocalOverlay } from './types';

// ---------------------------------------------------------------------------
// Bracket math.

/** Apply a marginal-rate schedule to a positive amount. Brackets must be
 *  sorted by `min` ascending, with the first having `min === 0`. */
export function applyBrackets(amount: number, brackets: Bracket[]): number {
  if (amount <= 0 || brackets.length === 0) return 0;
  let tax = 0;
  for (let i = 0; i < brackets.length; i++) {
    const lower = brackets[i].min;
    const upper = i + 1 < brackets.length ? brackets[i + 1].min : Infinity;
    if (amount <= lower) break;
    const slice = Math.min(amount, upper) - lower;
    tax += slice * brackets[i].rate;
  }
  return tax;
}

/** Piecewise-linear interpolation through (x, y) breakpoints. Used for CT/NY recapture. */
export function interpPiecewise(x: number, points: Array<{ agi: number; addOn: number }>): number {
  if (points.length === 0 || x <= points[0].agi) return 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (x >= a.agi && x <= b.agi) {
      if (b.agi === a.agi) return b.addOn;
      const t = (x - a.agi) / (b.agi - a.agi);
      return a.addOn + t * (b.addOn - a.addOn);
    }
  }
  return points[points.length - 1].addOn;
}

// ---------------------------------------------------------------------------
// Resolve home value and consumption from percentile or amount.

export function resolveHomeValue(profile: Profile, state: StateData): number {
  const v = profile.homeValue;
  if (v.kind === 'amount') return v.usd;
  return state.home[`p${v.pct}` as const];
}

export function resolveConsumption(profile: Profile, state: StateData): number {
  const v = profile.consumption;
  if (v.kind === 'amount') return v.usd;
  return state.consumption[`p${v.pct}` as const];
}

// ---------------------------------------------------------------------------
// State income tax. Returns dollars; assumes `profile.incomeMix` sums to 1.

export interface IncomeBreakdown {
  stateAGI: number;
  tax: number;
  appliedK401: boolean;
  appliedHSA: boolean;
}

export function computeStateIncomeTax(
  profile: Profile,
  state: StateData,
): IncomeBreakdown {
  const gross = profile.grossIncome;
  const w2 = gross * profile.incomeMix.w2;
  const intDiv = gross * profile.incomeMix.intDiv;
  const ltcg = gross * profile.incomeMix.ltcg;

  // Step 1: subtract 401(k) and HSA from W-2 wages where the state conforms.
  let wages = w2;
  const appliedK401 = state.rules.conforms401kPretax && profile.k401Contribution > 0;
  if (appliedK401) wages -= Math.min(profile.k401Contribution, wages);
  const appliedHSA = state.rules.conformsHSA && profile.hsaContribution > 0;

  // Step 2: assemble ordinary income for state purposes.
  let ordinary = wages;
  if (state.rules.intDivAsOrdinary) ordinary += intDiv;
  if (state.rules.ltcgAsOrdinary) {
    const exclusion = state.rules.ltcgExclusion ?? 0;
    ordinary += ltcg * (1 - exclusion);
  }

  // Step 3: subtract HSA from federal-AGI-equivalent base if state conforms.
  if (appliedHSA) ordinary -= Math.min(profile.hsaContribution, ordinary);

  // Step 4: subtract std deduction, personal exemption, and dependent exemption.
  const filing = profile.filingStatus;
  const std = state.income.stdDeduction[filing];
  let pe = state.income.personalExemption[filing];

  // Personal-exemption phase-out (e.g. CT §12-702). $1-per-$1 reduction above
  // the start threshold, floor at zero. Phase-out is computed against the
  // pre-deduction ordinary income, since CT applies it to CT-AGI.
  const phaseoutStart = state.rules.exemptionPhaseoutStart?.[filing];
  if (phaseoutStart !== undefined && ordinary > phaseoutStart) {
    const reduction = ordinary - phaseoutStart;
    pe = Math.max(0, pe - reduction);
  }

  const de = state.income.dependentExemption * profile.dependents;
  const stateAGI = Math.max(0, ordinary - std - pe - de);

  // Step 5: bracket the ordinary AGI.
  const brackets = state.income.brackets[filing];
  let tax = applyBrackets(stateAGI, brackets);

  // Step 5a: HI alternative LTCG cap. Take the LESSER of the ordinary calc and
  // (bracket walk on stateAGI excluding LTCG) + LTCG × ltcgAltRate. Applied only
  // when the state taxes LTCG as ordinary AND has an alt rate AND the user has
  // some LTCG. Computed BEFORE recapture and county addon, since the alt
  // worksheet replaces the ordinary bracket-walk result.
  if (
    state.rules.ltcgAsOrdinary &&
    state.rules.ltcgAltRate !== undefined &&
    ltcg > 0
  ) {
    const stateAGIWithoutLtcg = Math.max(0, stateAGI - ltcg);
    const altOrdinaryTax = applyBrackets(stateAGIWithoutLtcg, brackets);
    const altLtcgTax = ltcg * state.rules.ltcgAltRate;
    const altTotal = altOrdinaryTax + altLtcgTax;
    if (altTotal < tax) tax = altTotal;
  }

  // Step 5b: default county/local addon on state taxable income (MD, IN).
  if (state.rules.defaultCountyRate > 0) {
    tax += stateAGI * state.rules.defaultCountyRate;
  }

  // Step 5c: bracket-benefit recapture / phase-out (CT, NY).
  if (state.rules.recapture) {
    const schedule = state.rules.recapture[filing];
    if (schedule && schedule.length > 0) {
      tax += interpPiecewise(stateAGI, schedule);
    }
  }

  // Step 6: handle non-conforming LTCG (state has special treatment).
  if (!state.rules.ltcgAsOrdinary && state.rules.ltcgOverride && ltcg > 0) {
    // WA-style: flat rate on LTCG above a threshold. Threshold compares against
    // total LTCG (not gross income) per WA statute.
    const ovr = state.rules.ltcgOverride;
    const taxable = Math.max(0, ltcg - ovr.threshold);
    tax += taxable * ovr.rateAbove;
  }

  return { stateAGI, tax, appliedK401, appliedHSA };
}

// ---------------------------------------------------------------------------
// State payroll / worker contributions (CA SDI, WA PFML+Cares, etc.).

export function computePayrollTax(profile: Profile, state: StateData): number {
  const w2 = profile.grossIncome * profile.incomeMix.w2;
  let total = 0;
  for (const c of state.payroll.components) {
    const base = c.cap === null ? w2 : Math.min(w2, c.cap);
    total += base * c.rate;
  }
  return total;
}

// ---------------------------------------------------------------------------
// Personal property tax on motor vehicles (VA, CT, MO, MS, etc.).

export function computeVehicleTax(profile: Profile, state: StateData): number {
  return profile.vehicleValue * state.vehicle.rate;
}

// ---------------------------------------------------------------------------
// Local overlay. Flat percent of ordinary income (W-2 + intDiv typically).
// LTCG inclusion controlled by overlay.appliesToLtcg.

export function computeLocalTax(
  profile: Profile,
  overlay: LocalOverlay | null,
): number {
  if (!overlay) return 0;
  const gross = profile.grossIncome;
  let base = gross * profile.incomeMix.w2 + gross * profile.incomeMix.intDiv;
  if (overlay.appliesToLtcg) base += gross * profile.incomeMix.ltcg;
  // 401(k) is generally also excluded for local in NYC etc.; we model that.
  if (profile.k401Contribution > 0) base = Math.max(0, base - profile.k401Contribution);
  return base * overlay.rateOnOrdinary;
}

// ---------------------------------------------------------------------------
// Property, sales, gas — straightforward.

export function computePropertyTax(profile: Profile, state: StateData): number {
  return resolveHomeValue(profile, state) * state.property.rate;
}

export function computeSalesTax(profile: Profile, state: StateData): number {
  return resolveConsumption(profile, state) * state.sales.combined;
}

export function computeGasTax(profile: Profile, state: StateData): number {
  // Assume household-average MPG of 25.4 (2024 light-duty fleet, EPA).
  const HOUSEHOLD_MPG = 25.4;
  const gallons = profile.annualMiles / HOUSEHOLD_MPG;
  return gallons * state.gas.perGallon;
}

// ---------------------------------------------------------------------------
// Federal income tax (TCJA-era brackets through 2025). Computed for context
// only — not part of `total` since it doesn't vary by state.

const FED_BRACKETS_2025: Record<FilingStatus, Bracket[]> = {
  mfj: [
    { min: 0, rate: 0.10 },
    { min: 23_850, rate: 0.12 },
    { min: 96_950, rate: 0.22 },
    { min: 206_700, rate: 0.24 },
    { min: 394_600, rate: 0.32 },
    { min: 501_050, rate: 0.35 },
    { min: 751_600, rate: 0.37 },
  ],
  single: [
    { min: 0, rate: 0.10 },
    { min: 11_925, rate: 0.12 },
    { min: 48_475, rate: 0.22 },
    { min: 103_350, rate: 0.24 },
    { min: 197_300, rate: 0.32 },
    { min: 250_525, rate: 0.35 },
    { min: 626_350, rate: 0.37 },
  ],
  hoh: [
    { min: 0, rate: 0.10 },
    { min: 17_000, rate: 0.12 },
    { min: 64_850, rate: 0.22 },
    { min: 103_350, rate: 0.24 },
    { min: 197_300, rate: 0.32 },
    { min: 250_500, rate: 0.35 },
    { min: 626_350, rate: 0.37 },
  ],
};

const FED_LTCG_BRACKETS_2025: Record<FilingStatus, Bracket[]> = {
  mfj: [
    { min: 0, rate: 0 },
    { min: 96_700, rate: 0.15 },
    { min: 600_050, rate: 0.20 },
  ],
  single: [
    { min: 0, rate: 0 },
    { min: 48_350, rate: 0.15 },
    { min: 533_400, rate: 0.20 },
  ],
  hoh: [
    { min: 0, rate: 0 },
    { min: 64_750, rate: 0.15 },
    { min: 566_700, rate: 0.20 },
  ],
};

const FED_STD_DED_2025: Record<FilingStatus, number> = {
  mfj: 30_000,
  single: 15_000,
  hoh: 22_500,
};

export function computeFederalTax(profile: Profile): number {
  const gross = profile.grossIncome;
  const w2 = gross * profile.incomeMix.w2;
  const intDiv = gross * profile.incomeMix.intDiv;
  const ltcg = gross * profile.incomeMix.ltcg;

  const wages = Math.max(0, w2 - profile.k401Contribution);
  const ordinary = wages + intDiv;
  // HSA reduces federal AGI.
  const ordinaryAfterHSA = Math.max(0, ordinary - profile.hsaContribution);
  const std = FED_STD_DED_2025[profile.filingStatus];
  const taxableOrdinary = Math.max(0, ordinaryAfterHSA - std);

  const ordTax = applyBrackets(taxableOrdinary, FED_BRACKETS_2025[profile.filingStatus]);

  // LTCG stacks on top of ordinary taxable income for bracket placement.
  const ltcgBrackets = FED_LTCG_BRACKETS_2025[profile.filingStatus];
  // Compute LTCG tax by stacking: tax on (ord + ltcg) at LTCG schedule minus
  // tax on (ord) at LTCG schedule.
  const totalAtLtcg = applyBrackets(taxableOrdinary + ltcg, ltcgBrackets);
  const ordAtLtcg = applyBrackets(taxableOrdinary, ltcgBrackets);
  const ltcgTax = Math.max(0, totalAtLtcg - ordAtLtcg);

  // Net Investment Income Tax (3.8% above $250K MFJ / $200K single).
  const niitThreshold = profile.filingStatus === 'mfj' ? 250_000 : 200_000;
  const investmentIncome = intDiv + ltcg;
  const niitBase = Math.max(0, Math.min(investmentIncome, gross - niitThreshold));
  const niit = niitBase * 0.038;

  return ordTax + ltcgTax + niit;
}

// ---------------------------------------------------------------------------
// Top-level compute: produces a Breakdown for one state, given the profile.

export function computeBreakdown(
  profile: Profile,
  state: StateData,
  overlay: LocalOverlay | null,
  resolvedCity: LocalCity,
): Breakdown {
  const income = computeStateIncomeTax(profile, state);
  const property = computePropertyTax(profile, state);
  const sales = computeSalesTax(profile, state);
  const gas = computeGasTax(profile, state);
  const local = computeLocalTax(profile, overlay);
  const payroll = computePayrollTax(profile, state);
  const vehicle = computeVehicleTax(profile, state);
  const total = income.tax + property + sales + gas + local + payroll + vehicle;
  const federal = computeFederalTax(profile);
  return {
    state: state.code,
    total,
    income: income.tax,
    local,
    payroll,
    property,
    vehicle,
    sales,
    gas,
    federal,
    effectiveRate: profile.grossIncome > 0 ? total / profile.grossIncome : 0,
    inputs: {
      homeValueUsd: resolveHomeValue(profile, state),
      consumptionUsd: resolveConsumption(profile, state),
      vehicleValueUsd: profile.vehicleValue,
      annualMiles: profile.annualMiles,
      stateAGI: income.stateAGI,
      appliedK401: income.appliedK401,
      appliedHSA: income.appliedHSA,
      city: resolvedCity,
      filing: profile.filingStatus,
    },
  };
}

/** Caller passes a resolver that, given a state, returns the overlay+city actually
 *  applicable. This lets the App swap in 'state_default' (each state uses own default)
 *  vs. a globally pinned city. */
export function computeAllBreakdowns(
  profile: Profile,
  states: StateData[],
  resolveOverlay: (s: StateData) => { city: LocalCity; overlay: LocalOverlay | null },
): Breakdown[] {
  return states.map((s) => {
    const r = resolveOverlay(s);
    return computeBreakdown(profile, s, r.overlay, r.city);
  });
}

export const _internal = { applyBrackets };

export type { LocalCity };
