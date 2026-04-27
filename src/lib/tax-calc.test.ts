import { describe, it, expect } from 'vitest';

import {
  applyBrackets,
  interpPiecewise,
  computeStateIncomeTax,
  computePropertyTax,
  computeSalesTax,
  computeGasTax,
  computePayrollTax,
  computeVehicleTax,
  computeBreakdown,
  computeFederalTax,
  computeLocalTax,
  computeAllBreakdowns,
  resolveHomeValue,
} from './tax-calc';
import { DEFAULT_PROFILE, type Profile, serializeProfile, deserializeProfile, updateMix } from './profile';
import { STATE_BY_CODE, STATE_DATA, makeOverlayResolver } from './load-data';

const APPROX = 1.0; // dollars

function near(actual: number, expected: number, tol = APPROX) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tol);
}

// Many tests hand-calculate values for the $300K MFJ + 1 dep scenario; lock
// that profile here so the calc stays deterministic if DEFAULT_PROFILE shifts.
const P_300K_MFJ: Profile = { ...DEFAULT_PROFILE, grossIncome: 300_000 };

describe('applyBrackets', () => {
  const brackets = [
    { min: 0, rate: 0.10 },
    { min: 10_000, rate: 0.20 },
    { min: 50_000, rate: 0.30 },
  ];
  it('returns 0 for zero or negative', () => {
    expect(applyBrackets(0, brackets)).toBe(0);
    expect(applyBrackets(-1000, brackets)).toBe(0);
  });
  it('applies first bracket only when amount is small', () => {
    near(applyBrackets(5_000, brackets), 500);
  });
  it('applies multiple brackets correctly', () => {
    near(applyBrackets(100_000, brackets), 24_000);
  });
  it('handles empty bracket list', () => {
    expect(applyBrackets(100_000, [])).toBe(0);
  });
});

describe('interpPiecewise (used for recapture schedules)', () => {
  const pts = [
    { agi: 0, addOn: 0 },
    { agi: 100, addOn: 0 },
    { agi: 200, addOn: 50 },
    { agi: 300, addOn: 100 },
  ];
  it('returns 0 below the first non-zero breakpoint', () => {
    expect(interpPiecewise(50, pts)).toBe(0);
    expect(interpPiecewise(100, pts)).toBe(0);
  });
  it('linear interpolates between breakpoints', () => {
    near(interpPiecewise(150, pts), 25);
    near(interpPiecewise(250, pts), 75);
  });
  it('returns the last addOn for x past the schedule', () => {
    expect(interpPiecewise(10_000, pts)).toBe(100);
  });
});

describe('state income tax — $300K MFJ + 1 dep with defaults', () => {
  const p: Profile = P_300K_MFJ;

  it('CA matches hand-calc', () => {
    const r = computeStateIncomeTax(p, STATE_BY_CODE.CA);
    near(r.tax, 17_698, 5);
    near(r.stateAGI, 264_661, 1);
    expect(r.appliedK401).toBe(true);
    expect(r.appliedHSA).toBe(false); // CA does not conform HSA
  });

  it('NY: bracket walk + IT-201-I tax computation worksheet recapture', () => {
    const r = computeStateIncomeTax(p, STATE_BY_CODE.NY);
    near(r.stateAGI, 250_900, 1);
    // Bracket walk = $13,914. Recapture at NYTI $250,900 (between $161,550 → $200
    // and $323,200 → $1,700) interpolates to ~$1,029. Total ≈ $14,943.
    near(r.tax, 14_943, 50);
    expect(r.appliedHSA).toBe(true);
  });

  it('NJ matches hand-calc (no 401k or HSA conformity)', () => {
    const r = computeStateIncomeTax(p, STATE_BY_CODE.NJ);
    near(r.tax, 14_844, 5);
    near(r.stateAGI, 296_500, 1);
    expect(r.appliedK401).toBe(false);
    expect(r.appliedHSA).toBe(false);
  });

  it('TX is zero', () => {
    expect(computeStateIncomeTax(p, STATE_BY_CODE.TX).tax).toBe(0);
  });

  it('FL is zero', () => {
    expect(computeStateIncomeTax(p, STATE_BY_CODE.FL).tax).toBe(0);
  });

  it('WA: zero income tax with $30K LTCG (under $270K threshold)', () => {
    expect(computeStateIncomeTax(p, STATE_BY_CODE.WA).tax).toBe(0);
  });

  it('WA: 7% LTCG kicks in above threshold', () => {
    const heavyLtcg: Profile = {
      ...p,
      grossIncome: 1_000_000,
      incomeMix: { w2: 0.0, intDiv: 0.0, ltcg: 1.0 },
    };
    const r = computeStateIncomeTax(heavyLtcg, STATE_BY_CODE.WA);
    near(r.tax, 51_100, 5);
  });

  it('MD includes default county addon (3.20%) on top of state brackets', () => {
    const r = computeStateIncomeTax(p, STATE_BY_CODE.MD);
    // bracketed tax ≈ $12,515 + 3.20% × $253,500 ≈ $8,112 = $20,627
    near(r.tax, 20_627, 5);
    near(r.stateAGI, 253_500, 1);
  });

  it('IN flat 3.05% plus default county addon (2.02%) = ~5.07%', () => {
    const r = computeStateIncomeTax(p, STATE_BY_CODE.IN);
    // stateAGI ≈ 264,450 × (0.0305 + 0.0202) ≈ 13,407
    near(r.tax, 13_407, 5);
  });

  it('CT: PE fully phased out, brackets + recapture sum to ~$14K at $300K MFJ', () => {
    const r = computeStateIncomeTax(p, STATE_BY_CODE.CT);
    // Ordinary = $267,950 → past $48K phaseout start by far, so PE = $0.
    // stdDed = 0 (CT has none). stateAGI = $267,950.
    // Bracket walk: 400 + 3,600 + 5,500 + 4,077 = $13,577.
    // Recapture at AGI $267,950 ≈ $450.
    // Total ≈ $14,027.
    near(r.stateAGI, 267_950, 1);
    near(r.tax, 14_027, 50);
  });

  it('CT: PE not phased at low income', () => {
    const lowIncome: Profile = { ...p, grossIncome: 60_000, k401Contribution: 0, hsaContribution: 0 };
    const r = computeStateIncomeTax(lowIncome, STATE_BY_CODE.CT);
    // ordinary = 60000 (with intDiv 6000 + ltcg 6000 from default mix = 60000 total)
    // wait — default mix is 80/10/10 so for $60K: w2=48000, intDiv=6000, ltcg=6000
    // ordinary = 48000 + 6000 + 6000 = 60000
    // PE phaseout: ordinary 60000 > start 48000; reduction = 12000; PE = 24000-12000 = 12000
    // stateAGI = 60000 - 0 (std) - 12000 (PE) = 48000
    near(r.stateAGI, 48_000, 1);
  });

  it('HI: alt LTCG cap (7.25%) — taxpayer-friendly min', () => {
    // Heavy LTCG profile in HI: 100% LTCG of $500K. Top bracket would be 11%.
    // Without alt: stateAGI ≈ $500K - $11,872 (deductions) = $488,128, hits 11% top.
    // With alt cap: bracket walk on $0 + $500K × 7.25% = $36,250 → much lower.
    const heavy: Profile = {
      ...p,
      grossIncome: 500_000,
      incomeMix: { w2: 0, intDiv: 0, ltcg: 1.0 },
      k401Contribution: 0,
      hsaContribution: 0,
    };
    const ord = computeStateIncomeTax(
      { ...heavy, incomeMix: { w2: 1, intDiv: 0, ltcg: 0 } },
      STATE_BY_CODE.HI,
    );
    const alt = computeStateIncomeTax(heavy, STATE_BY_CODE.HI);
    // Alt should be lower than the all-W2 equivalent (which doesn't get the 7.25% cap).
    expect(alt.tax).toBeLessThan(ord.tax);
    // The alt result should be approximately $500K × 7.25% = $36,250 (plus tiny
    // bracket walk on the small remaining stateAGI from negative deductions).
    near(alt.tax, 500_000 * 0.0725, 100);
  });

  it('CA at $1.5M MFJ all-W2 includes the 1% MHSA surcharge', () => {
    // $500,000 of taxable income above $1M × 1% = $5,000 extra vs. no-MHSA baseline.
    const heavy: Profile = {
      ...p,
      grossIncome: 1_500_000,
      incomeMix: { w2: 1.0, intDiv: 0, ltcg: 0 },
      hsaContribution: 0, // simplify hand-calc
    };
    const r = computeStateIncomeTax(heavy, STATE_BY_CODE.CA);
    // stateAGI = 1,500,000 - 23,500 (401k) - 11,080 (std) - 298 (PE) - 461 (dep) = 1,464,661
    near(r.stateAGI, 1_464_661, 1);
    // Bracket walk through MFJ, with 1pt bumps over $1M; ends at the 13.3%
    // bracket for the slice above $1,442,628. Hand-calc total = $147,589.
    // Sanity check: MHSA contribution = 1% × ($1,464,661 − $1,000,000) = $4,646,
    // which equals (with-MHSA) − (without-MHSA) total.
    near(r.tax, 147_589, 5);
  });
});

describe('payroll / worker contributions', () => {
  const p = P_300K_MFJ;

  it('CA SDI: 1.1% on full $240K W-2 (no cap)', () => {
    near(computePayrollTax(p, STATE_BY_CODE.CA), 2_640, 1);
  });

  it('WA: PFML capped at SS wage base + WA Cares uncapped', () => {
    // 0.74% × min(240000, 176100) + 0.58% × 240000
    // = 0.0074 × 176100 + 0.0058 × 240000
    // = 1303.14 + 1392 = 2695.14
    near(computePayrollTax(p, STATE_BY_CODE.WA), 2_695, 1);
  });

  it('NY PFL + small SDI', () => {
    // 0.388% × 89343 + 0.05% × 240000 = 346.65 + 120 = 466.65
    near(computePayrollTax(p, STATE_BY_CODE.NY), 466, 5);
  });

  it('TX has zero payroll', () => {
    expect(computePayrollTax(p, STATE_BY_CODE.TX)).toBe(0);
  });
});

describe('vehicle property tax', () => {
  const p = DEFAULT_PROFILE;

  it('VA: vehicle tax = rate × vehicleValue (rate ≈ 4.13%)', () => {
    near(computeVehicleTax(p, STATE_BY_CODE.VA), 0.0413 * p.vehicleValue, 1);
  });

  it('TX has zero vehicle property tax', () => {
    expect(computeVehicleTax(p, STATE_BY_CODE.TX)).toBe(0);
  });

  it('scales with vehicleValue', () => {
    const luxe = { ...p, vehicleValue: 200_000 };
    near(computeVehicleTax(luxe, STATE_BY_CODE.VA), 0.0413 * 200_000, 1);
  });
});

describe('property, sales, gas', () => {
  const p = DEFAULT_PROFILE;

  it('property tax = home_value × rate (CA)', () => {
    const home = resolveHomeValue(p, STATE_BY_CODE.CA);
    near(computePropertyTax(p, STATE_BY_CODE.CA), home * STATE_BY_CODE.CA.property.rate);
  });

  it('TX property is non-trivial despite no income tax', () => {
    expect(computePropertyTax(p, STATE_BY_CODE.TX)).toBeGreaterThan(5_000);
  });

  it('OR has zero sales tax', () => {
    expect(computeSalesTax(p, STATE_BY_CODE.OR)).toBe(0);
  });

  it('TN has high sales tax', () => {
    expect(computeSalesTax(p, STATE_BY_CODE.TN)).toBeGreaterThan(3_000);
  });

  it('gas tax scales with miles and per-gallon rate', () => {
    near(computeGasTax(p, STATE_BY_CODE.CA), 736, 10);
  });
});

describe('local overlays', () => {
  it('NYC adds large overlay on $300K', () => {
    const p = P_300K_MFJ;
    const local = computeLocalTax(p, {
      rateOnOrdinary: 0.0388,
      appliesToLtcg: true,
      source: '',
    });
    // base = (240000 + 30000 + 30000) - 23500 = 276500; * 0.0388 ≈ 10728
    near(local, 10_728, 50);
  });

  it('no overlay yields zero', () => {
    expect(computeLocalTax(DEFAULT_PROFILE, null)).toBe(0);
  });
});

describe('overlay resolver', () => {
  it('state_default: NY uses NYC, CA uses none', () => {
    const r = makeOverlayResolver('state_default');
    const ny = r(STATE_BY_CODE.NY);
    expect(ny.city).toBe('nyc');
    expect(ny.overlay).not.toBeNull();
    const ca = r(STATE_BY_CODE.CA);
    expect(ca.city).toBe('none');
    expect(ca.overlay).toBeNull();
  });

  it('none: every state has no overlay', () => {
    const r = makeOverlayResolver('none');
    expect(r(STATE_BY_CODE.NY).overlay).toBeNull();
    expect(r(STATE_BY_CODE.CA).overlay).toBeNull();
  });

  it('specific city pin: applies only to its parent state, others use default', () => {
    // Pinning Yonkers — applies to NY, but not to CA. CA still uses its default (none).
    const r = makeOverlayResolver('yonkers');
    expect(r(STATE_BY_CODE.NY).city).toBe('yonkers');
    // OR's row should still get its default city (Portland), not 'none'.
    expect(r(STATE_BY_CODE.OR).city).toBe('portland_or');
  });

  it("state_default: PA uses Philadelphia, MI uses Detroit, OH uses Columbus", () => {
    const r = makeOverlayResolver('state_default');
    expect(r(STATE_BY_CODE.PA).city).toBe('philadelphia');
    expect(r(STATE_BY_CODE.MI).city).toBe('detroit');
    expect(r(STATE_BY_CODE.OH).city).toBe('columbus');
  });
});

describe('computeBreakdown', () => {
  it('CA total includes payroll + state income, no local for CA', () => {
    const resolver = makeOverlayResolver('state_default');
    const r = resolver(STATE_BY_CODE.CA);
    const b = computeBreakdown(P_300K_MFJ, STATE_BY_CODE.CA, r.overlay, r.city);
    expect(b.income).toBeGreaterThan(0);
    expect(b.payroll).toBeGreaterThan(2_500); // CA SDI ~$2,640
    expect(b.local).toBe(0);
    expect(b.vehicle).toBe(0);
    expect(b.total).toBe(b.income + b.local + b.payroll + b.property + b.vehicle + b.sales + b.gas);
  });

  it('NY default includes NYC overlay (since state_default → nyc for NY)', () => {
    const resolver = makeOverlayResolver('state_default');
    const r = resolver(STATE_BY_CODE.NY);
    const b = computeBreakdown(P_300K_MFJ, STATE_BY_CODE.NY, r.overlay, r.city);
    expect(b.local).toBeGreaterThan(10_000);
    expect(b.inputs.city).toBe('nyc');
  });

  it('VA includes vehicle property tax in total', () => {
    const resolver = makeOverlayResolver('state_default');
    const r = resolver(STATE_BY_CODE.VA);
    const b = computeBreakdown(DEFAULT_PROFILE, STATE_BY_CODE.VA, r.overlay, r.city);
    // Default vehicleValue × VA rate (4.13%) — derived so test stays valid if
    // the default shifts.
    near(b.vehicle, 0.0413 * DEFAULT_PROFILE.vehicleValue, 5);
    expect(b.total).toBeGreaterThan(b.income + b.property);
  });
});

describe('federal tax for context', () => {
  it('matches hand-calc at $300K MFJ', () => {
    near(computeFederalTax(P_300K_MFJ), 42_002, 50);
  });
});

describe('profile URL serialization (v2)', () => {
  it('round-trips the default profile', () => {
    const s = serializeProfile(DEFAULT_PROFILE);
    expect(s.startsWith('v2|')).toBe(true);
    const back = deserializeProfile(s);
    expect(back).not.toBeNull();
    expect(back!.grossIncome).toBe(DEFAULT_PROFILE.grossIncome);
    expect(back!.filingStatus).toBe('mfj');
    expect(back!.dependents).toBe(1);
    expect(back!.k401Contribution).toBe(23_500);
    expect(back!.hsaContribution).toBe(8_550);
    expect(back!.vehicleValue).toBe(DEFAULT_PROFILE.vehicleValue);
    expect(back!.city).toBe('state_default');
    expect(back!.homeValue).toEqual({ kind: 'percentile', pct: 80 });
    expect(back!.consumption).toEqual({ kind: 'percentile', pct: 80 });
  });

  it('round-trips a custom profile with amount-kind values', () => {
    const p: Profile = {
      ...DEFAULT_PROFILE,
      grossIncome: 850_000,
      incomeMix: { w2: 0.5, intDiv: 0.2, ltcg: 0.3 },
      filingStatus: 'single',
      dependents: 0,
      city: 'nyc',
      homeValue: { kind: 'amount', usd: 1_500_000 },
      consumption: { kind: 'amount', usd: 80_000 },
      vehicleValue: 150_000,
      annualMiles: 18_000,
    };
    const s = serializeProfile(p);
    const back = deserializeProfile(s)!;
    expect(back.grossIncome).toBe(850_000);
    expect(back.filingStatus).toBe('single');
    expect(back.city).toBe('nyc');
    expect(back.vehicleValue).toBe(150_000);
    expect(back.homeValue).toEqual({ kind: 'amount', usd: 1_500_000 });
    expect(back.consumption).toEqual({ kind: 'amount', usd: 80_000 });
    expect(Math.abs(back.incomeMix.w2 - 0.5)).toBeLessThan(0.001);
    expect(Math.abs(back.incomeMix.ltcg - 0.3)).toBeLessThan(0.001);
  });

  it('rejects malformed strings and old v1 strings', () => {
    expect(deserializeProfile('garbage')).toBeNull();
    expect(deserializeProfile('v2|too|few')).toBeNull();
    expect(deserializeProfile('v1|valid|but|old|schema|that|is|wrong')).toBeNull();
  });
});

describe('updateMix — slider redistribution', () => {
  const SUM_TOL = 1e-9;
  const sums1 = (m: { w2: number; intDiv: number; ltcg: number }) =>
    expect(Math.abs(m.w2 + m.intDiv + m.ltcg - 1)).toBeLessThan(SUM_TOL);

  it('moving W-2 to 100% zeroes out the others', () => {
    const m = updateMix({ w2: 0.8, intDiv: 0.1, ltcg: 0.1 }, 'w2', 1);
    expect(m.w2).toBe(1);
    expect(m.intDiv).toBe(0);
    expect(m.ltcg).toBe(0);
    sums1(m);
  });

  it('moving W-2 to 50% scales the others proportionally', () => {
    const m = updateMix({ w2: 0.8, intDiv: 0.1, ltcg: 0.1 }, 'w2', 0.5);
    expect(m.w2).toBe(0.5);
    expect(m.intDiv).toBeCloseTo(0.25);
    expect(m.ltcg).toBeCloseTo(0.25);
    sums1(m);
  });

  it('preserves the relative ratio of the other two when one is zero', () => {
    // Starting at all-W2, moving W-2 to 0.5 should split the remaining 0.5 evenly.
    const m = updateMix({ w2: 1, intDiv: 0, ltcg: 0 }, 'w2', 0.5);
    expect(m.w2).toBe(0.5);
    expect(m.intDiv).toBeCloseTo(0.25);
    expect(m.ltcg).toBeCloseTo(0.25);
    sums1(m);
  });

  it('clamps out-of-range input', () => {
    const above = updateMix({ w2: 0.8, intDiv: 0.1, ltcg: 0.1 }, 'w2', 1.5);
    expect(above.w2).toBe(1);
    const below = updateMix({ w2: 0.8, intDiv: 0.1, ltcg: 0.1 }, 'w2', -0.2);
    expect(below.w2).toBe(0);
  });
});

describe('all 50 states load and compute without throwing', () => {
  it('produces a finite total for every state via computeAllBreakdowns', () => {
    const resolver = makeOverlayResolver('state_default');
    const breakdowns = computeAllBreakdowns(DEFAULT_PROFILE, STATE_DATA, resolver);
    expect(breakdowns.length).toBe(50);
    for (const b of breakdowns) {
      expect(Number.isFinite(b.total)).toBe(true);
      expect(b.total).toBeGreaterThan(0);
    }
  });

  it("WA's payroll moves it up the rankings vs no payroll", () => {
    const resolver = makeOverlayResolver('state_default');
    const r = resolver(STATE_BY_CODE.WA);
    const b = computeBreakdown(DEFAULT_PROFILE, STATE_BY_CODE.WA, r.overlay, r.city);
    expect(b.payroll).toBeGreaterThan(2_000); // PFML+Cares ~$2,695
  });
});
