interface Props {
  onBack: () => void;
}

export function MethodologyPage({ onBack }: Props) {
  return (
    <div className="min-h-full bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-3xl px-4 py-3 sm:px-6">
          <button
            onClick={onBack}
            className="text-xs text-sky-700 hover:underline"
          >
            ← back to map
          </button>
        </div>
      </header>

      <article className="mx-auto max-w-3xl px-4 py-6 text-slate-700 sm:px-6 sm:py-10">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Methodology
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          How this tool calculates state + local tax burden, what's included, what's
          excluded, and where the data comes from. Every line of computation is in{' '}
          <Code>src/lib/tax-calc.ts</Code>; every input value is in a JSON file
          under <Code>src/data/</Code> with a <Code>_meta</Code> field documenting
          its source. Links below point to the canonical primary source for each
          file.
        </p>

        <Section title="What this tool computes">
          <P>
            For each of the 50 states, given your household profile, the tool computes
            seven tax components and sums them. The default scenario is a $240K MFJ
            couple with one dependent, maxing 401(k) and HSA, owning an 80th-percentile
            home, with top-quintile consumption, and one representative residence per
            state (NYC for NY, Philadelphia for PA, Detroit for MI, etc.).
          </P>
          <UL>
            <LI>
              <B>State income tax</B> — full bracket math, with per-state 401(k) and HSA
              conformity, LTCG treatment, and standard deduction / personal exemption /
              dependent exemption applied.
            </LI>
            <LI>
              <B>Default county addon</B> — for MD (3.20%, Montgomery County) and IN
              (2.02%, Marion County) the local county tax is folded into the state
              income line by default, since every resident pays it.
            </LI>
            <LI>
              <B>Local income tax</B> — flat city/wage tax overlay on top of state.
              Default per state: NYC, Philadelphia, Detroit, Columbus, Portland-OR,
              Louisville, Birmingham, Kansas City MO, Wilmington DE.
            </LI>
            <LI>
              <B>Payroll-style worker contributions</B> — CA SDI (1.1%, no cap), WA PFML
              + WA Cares LTSS, NY PFL, NJ FLI, OR PFMLI, CO FAMLI, MA PFML, CT Paid Leave,
              RI TDI, HI TDI. Each component capped at its own wage base where
              applicable.
            </LI>
            <LI>
              <B>Property tax</B> — new-buyer effective rate at the representative metro
              (LA for CA, Chicago for IL, Houston for TX, Seattle for WA, NYC for NY,
              etc.) times home value at the chosen percentile of THAT metro's
              distribution. Includes base ad-valorem + voter-approved bonds + school
              district levies + typical special assessments. Long-tenured-owner
              assessment caps (Prop 13, SOH, TX 10%) are explicitly NOT applied — the
              tool is for relocation scenarios.
            </LI>
            <LI>
              <B>Vehicle property tax</B> — VA, CT, MO, MS, ME, WV, RI, KY, NC, SC, AL,
              AR, OK, AK levy ad-valorem motor vehicle taxes; default vehicle value
              $50,000 (two cars).
            </LI>
            <LI>
              <B>Sales tax</B> — combined state + average local rate × top-quintile
              taxable consumption.
            </LI>
            <LI>
              <B>Gas tax</B> — state + average local cents/gallon × annual miles ÷ 25.4
              MPG (2024 light-duty fleet average).
            </LI>
          </UL>
        </Section>

        <Section title="What's excluded">
          <UL>
            <LI>
              <B>Federal income tax</B> — shown in the per-state drawer for context, but
              excluded from the comparison since it doesn't vary by state.
            </LI>
            <LI>
              <B>Property assessment caps</B> — Prop 13 (CA), Save Our Homes (FL), 10%
              caps (TX) — model is for new buyers; long-tenured owners experience
              materially lower effective rates than shown.
            </LI>
            <LI>
              <B>Renter scenario</B> — out of scope for v1; renters' incidence of
              property tax is a research question, not a lookup.
            </LI>
            <LI>
              <B>Estate / inheritance tax</B> — not relevant for working-age earners.
            </LI>
            <LI>
              <B>One-time real estate transactions</B> — transfer tax, mortgage recording
              tax, mansion tax — significant on a move but amortizing over a hold period
              adds methodology surface this tool doesn't yet take on.
            </LI>
            <LI>
              <B>Vehicle registration fees / hotel / sin / utility taxes</B> — typically
              under a few hundred per year and below the noise floor.
            </LI>
            <LI>
              <B>OH school district / IN sub-county / KY occupational</B> — these can
              materially shift specific localities; only the representative city per
              state is modeled.
            </LI>
          </UL>
        </Section>

        <Section title="Sources, by data file">
          <P className="text-xs text-slate-500">
            Each JSON file under <Code>src/data/</Code> carries a <Code>_meta</Code>{' '}
            field with the source and as-of date. URLs below are the canonical primary
            source (or the publication that compiles the primary sources).
          </P>

          <SourceBlock
            file="income-brackets.json"
            primary="2025 state DOR publications, cross-checked against the Tax Foundation 2025 matrix."
            urls={[
              ['Tax Foundation — State Individual Income Tax Rates and Brackets, 2025', 'https://taxfoundation.org/data/all/state/state-income-tax-rates-2025/'],
              ['CA — FTB tax rate schedules', 'https://www.ftb.ca.gov/file/personal/tax-calculator-tables-rates.html'],
              ['NY — DTF tax tables (IT-201-I)', 'https://www.tax.ny.gov/forms/income_cur_forms.htm'],
              ['NJ — Division of Taxation', 'https://www.nj.gov/treasury/taxation/taxtables.shtml'],
              ['MA — DOR personal income tax', 'https://www.mass.gov/personal-income-tax'],
              ['IL — IDOR Form IL-1040 instructions', 'https://tax.illinois.gov/forms/incometax/individual.html'],
              ['Other states — search "<state> Department of Revenue 2025 individual income tax instructions"'],
            ]}
          />

          <SourceBlock
            file="state-rules.json"
            primary="State DOR conformity guidance for 401(k) pretax exclusion, HSA above-the-line deduction, capital gains treatment, MD/IN default county rate."
            urls={[
              ['Tax Foundation — State conformity to federal AGI', 'https://taxfoundation.org/data/all/state/state-tax-conformity/'],
              ['CA HSA non-conformity (FTB Pub 1001)', 'https://www.ftb.ca.gov/forms/2024/2024-1001-publication.pdf'],
              ['NJ 401(k) treatment (NJ-WT, GIT-2)', 'https://www.state.nj.us/treasury/taxation/njit5.shtml'],
              ['PA pretax vs Roth 401(k) (REV-419 / PIT guides)', 'https://www.revenue.pa.gov/FormsandPublications/'],
              ['WA capital gains tax (RCW 82.87)', 'https://dor.wa.gov/taxes-rates/other-taxes/capital-gains-tax'],
              ['MD county tax rates (Comptroller)', 'https://www.marylandtaxes.gov/individual/income/tax-info/tax-rates.php'],
              ['IN county tax rates (Departmental Notice #1)', 'https://www.in.gov/dor/files/dn01.pdf'],
            ]}
          />

          <SourceBlock
            file="state-payroll.json"
            primary="State labor department / DOR worker-contribution rate publications, effective Jan 1, 2025. SS wage base 2025 = $176,100 (SSA)."
            urls={[
              ['CA SDI rate (EDD)', 'https://edd.ca.gov/en/payroll_taxes/rates_and_withholding/'],
              ['WA Paid Family & Medical Leave', 'https://paidleave.wa.gov/rates-and-thresholds/'],
              ['WA Cares Fund (LTSS)', 'https://wacaresfund.wa.gov/'],
              ['NY Paid Family Leave', 'https://paidfamilyleave.ny.gov/cost'],
              ['NJ Family Leave Insurance', 'https://www.nj.gov/labor/myleavebenefits/labor/fli/'],
              ['Paid Leave Oregon', 'https://paidleave.oregon.gov/employers/Pages/contributions.aspx'],
              ['Colorado FAMLI', 'https://famli.colorado.gov/'],
              ['Massachusetts PFML', 'https://www.mass.gov/info-details/family-and-medical-leave-contribution-rates-for-employers'],
              ['CT Paid Leave', 'https://ctpaidleave.org/'],
              ['Rhode Island TDI / TCI', 'https://dlt.ri.gov/individuals/temporary-disability-caregiver-insurance'],
              ['Hawaii TDI (DLIR)', 'https://labor.hawaii.gov/dcd/home/about-tdi/'],
            ]}
          />

          <SourceBlock
            file="property-rates.json"
            primary="Per-county / per-city assessor publications, NOT state-average. Each rate is the EFFECTIVE NEW-BUYER rate at the representative metro for that state — base ad valorem + voter-approved bonds + school district levies + typical special assessments. State-average effective rates (Tax Foundation FY) are tenure-weighted and understate new-buyer bills in jurisdictions with assessment caps (CA Prop 13, FL SOH, TX 10% caps); using them would mislead the 'moving here today' framing."
            urls={[
              ['LA County Auditor-Controller — tax rates', 'https://assessor.lacounty.gov/tax-rates/'],
              ['Cook County Assessor (Chicago)', 'https://www.cookcountyassessor.com/'],
              ['Harris County Appraisal District (Houston)', 'https://www.hcad.org/'],
              ['NYC Department of Finance — class rates', 'https://www.nyc.gov/site/finance/property/property-tax-rates.page'],
              ['King County Assessor (Seattle)', 'https://kingcounty.gov/depts/assessor.aspx'],
              ['NJ Division of Taxation — General Tax Rates by County and Municipality', 'https://www.nj.gov/treasury/taxation/lpt/'],
              ['Per-state assessor URLs are listed inside the JSON file _meta and per-state source field; full list also surfaced on the per-state data audit page.'],
            ]}
          />

          <SourceBlock
            file="home-values.json"
            primary="Zillow ZHVI metro-level series (Q4 2024) for the representative metro per state. Percentile shape derived from each metro's distribution (p50≈1.0×median, p70≈1.25×, p80≈1.4×, p90≈1.7×, p95≈2.1×). Designed to match a 'new buyer in this metro' scenario, NOT state-median which underweights urban tech hubs."
            urls={[
              ['Zillow Research — ZHVI metro-level series', 'https://www.zillow.com/research/data/'],
              ['ACS B25075 — Value of owner-occupied housing units (cross-check)', 'https://data.census.gov/table?q=B25075'],
            ]}
          />

          <SourceBlock
            file="vehicle-rates.json"
            primary="State personal-property / motor-vehicle tax statutes, weighted by county where applicable. Notes per state in the JSON file."
            urls={[
              ['VA personal property tax (state statute reference)', 'https://www.tax.virginia.gov/personal-property-tax'],
              ['CT motor vehicle property tax', 'https://portal.ct.gov/-/media/DRS/Publications/pubsps/PS-2017-1.pdf'],
              ['MO personal property tax', 'https://dor.mo.gov/taxation/individual/tax-types/personal-property/'],
              ['MS Tax Commission MV ad valorem', 'https://www.dor.ms.gov/'],
              ['ME excise tax schedule (MRS Bulletin 13)', 'https://www.maine.gov/revenue/taxes/property-tax/excise-tax'],
              ['WV motor vehicle tax credit / personal property', 'https://tax.wv.gov/'],
              ['RI motor vehicle tax (phaseout history)', 'https://tax.ri.gov/'],
              ['KY motor vehicle usage tax', 'https://revenue.ky.gov/Business/Motor-Vehicle-Usage-Tax/Pages/default.aspx'],
              ['NC vehicle property tax (Tag & Tax Together)', 'https://www.ncdor.gov/taxes-forms/property-tax'],
              ['Alabama motor vehicle ad valorem (DOR)', 'https://www.revenue.alabama.gov/property-tax/'],
            ]}
          />

          <SourceBlock
            file="sales-rates.json"
            primary="Tax Foundation, 'State and Local Sales Tax Rates, 2025' — combined state + population-weighted average local rate."
            urls={[
              ['Tax Foundation sales tax explorer', 'https://taxfoundation.org/data/all/state/2025-sales-taxes/'],
            ]}
          />

          <SourceBlock
            file="consumption-quintiles.json"
            primary="BLS Consumer Expenditure Survey, fifth income quintile (income before taxes ≥ $240K), 2022–2023 release. Taxable share approximated 0.45×–0.55× of total expenditure depending on whether the state exempts groceries."
            urls={[
              ['BLS Consumer Expenditure Survey — quintile tables', 'https://www.bls.gov/cex/tables/calendar-year/mean.htm'],
              ['BLS CEX detailed tables (income before taxes)', 'https://www.bls.gov/cex/tables.htm'],
            ]}
          />

          <SourceBlock
            file="gas-taxes.json"
            primary="American Petroleum Institute, 'State Motor Fuel Excise and Other Taxes' Q1 2025 report — combined state excise + average other state taxes/fees per gallon for gasoline. Federal 18.4¢/gal not included."
            urls={[
              ['API motor fuel tax summary', 'https://www.api.org/oil-and-natural-gas/consumer-information/motor-fuel-taxes'],
              ['FTA motor fuel tax rates (cross-check)', 'https://taxadmin.org/motor-fuel-tax-rates/'],
            ]}
          />

          <SourceBlock
            file="miles-per-driver.json"
            primary="FHWA Highway Statistics 2022, Table VM-2 (annual VMT by state) divided by Table DL-22 (licensed drivers by state). Default profile uses 2× this value to model a two-driver household."
            urls={[
              ['FHWA Highway Statistics 2022', 'https://www.fhwa.dot.gov/policyinformation/statistics/2022/'],
              ['Table VM-2 — Functional system travel', 'https://www.fhwa.dot.gov/policyinformation/statistics/2022/vm2.cfm'],
              ['Table DL-22 — Licensed drivers', 'https://www.fhwa.dot.gov/policyinformation/statistics/2022/dl22.cfm'],
            ]}
          />

          <SourceBlock
            file="local-overlays.json"
            primary="City finance department / DOR publications. Each entry maps a city key to the parent state and a flat overlay rate."
            urls={[
              ['NYC Personal Income Tax (DOF)', 'https://www.nyc.gov/site/finance/taxes/business-nys-pit.page'],
              ['Philadelphia Wage Tax (Revenue Department)', 'https://www.phila.gov/services/payments-assistance-taxes/business-taxes/wage-tax/'],
              ['Detroit Income Tax (City of Detroit)', 'https://detroitmi.gov/departments/office-chief-financial-officer/income-tax-division'],
              ['Columbus / Cleveland / Cincinnati earnings tax (RITA / CCA)', 'https://www.ritaohio.com/'],
              ['Portland Multnomah PFA + Metro SHS', 'https://www.portland.gov/revenue/pfa'],
              ['Louisville Metro occupational license tax', 'https://louisvilleky.gov/government/revenue-commission/occupational-tax-information'],
              ['Birmingham occupational tax', 'https://www.birminghamal.gov/finance/'],
              ['Kansas City MO earnings tax', 'https://www.kcmo.gov/city-hall/departments/finance/earnings-tax'],
              ['Wilmington DE wage tax', 'https://www.wilmingtonde.gov/government/city-departments/finance/wage-and-net-profits-tax'],
            ]}
          />

          <SourceBlock
            file="federal (computed in tax-calc.ts)"
            primary="Federal 2025 ordinary brackets, LTCG brackets, standard deduction (Rev. Proc. 2024-40). NIIT 3.8% per IRC §1411."
            urls={[
              ['IRS Rev. Proc. 2024-40 (2025 inflation adjustments)', 'https://www.irs.gov/pub/irs-drop/rp-24-40.pdf'],
              ['IRS Topic 559 — Net Investment Income Tax', 'https://www.irs.gov/taxtopics/tc559'],
            ]}
          />
        </Section>

        <Section title="Per-state rules worth flagging">
          <UL>
            <LI>
              <B>CA</B> — does not conform to federal HSA deduction (
              <Link href="https://www.ftb.ca.gov/forms/2024/2024-1001-publication.pdf">FTB Pub 1001</Link>
              ). Mental Health Services Tax (Prop 63): additional 1% on taxable income
              above $1,000,000, all filing statuses — top effective rate is 13.3%, not
              12.3% (
              <Link href="https://www.ftb.ca.gov/file/personal/tax-calculator-tables-rates.html">FTB tax rate schedules</Link>
              ). SDI 1.1% has no wage cap as of 2024 (
              <Link href="https://edd.ca.gov/en/payroll_taxes/Rates_and_Withholding/">EDD rates page</Link>
              ).
            </LI>
            <LI>
              <B>CT</B> — has <em>no</em> standard deduction; only a personal exemption
              ($24K MFJ / $15K single / $19K HoH for 2024) that phases out completely at
              $1-per-$1 above $48K MFJ / $30K single / $38K HoH (
              <Link href="https://portal.ct.gov/-/media/DRS/Forms/2024/Income/2024-IT-1040-Instructions.pdf">CT IT-1040 instructions</Link>
              ). Tax recapture (CGS §12-700b) phases out the benefit of lower bracket
              rates for high earners — modeled as a piecewise-linear add-on (~$450 at
              $300K MFJ; up to ~$7,200 at $1.05M+).
            </LI>
            <LI>
              <B>NY</B> — IT-201-I tax computation worksheet claws back the benefit of
              the lower-rate brackets above $107,650 NYTI (
              <Link href="https://www.tax.ny.gov/forms/income_cur_forms.htm">DTF forms</Link>
              ). Modeled as a piecewise-linear add-on (~$1,000 at $300K MFJ; ~$50K at
              the top-bracket transition $2,155,350; ~$200K well into the 10.9% range).
            </LI>
            <LI>
              <B>HI</B> — alternative tax on capital gains (HRS §235-51(f)) caps the
              LTCG rate at 7.25%, lower than the 11% top ordinary rate (
              <Link href="https://files.hawaii.gov/tax/legal/hrs/hrs_235.pdf">HRS Chapter 235</Link>
              ). Calc takes the lesser of ordinary bracket walk and (ordinary on stateAGI
              minus LTCG) + 7.25% × LTCG.
            </LI>
            <LI>
              <B>ID</B> — flat rate dropped to <strong>5.3%</strong> for tax year 2025
              (was 5.695% in 2024) per HB-40 (2025 session) (
              <Link href="https://tax.idaho.gov/taxes/income-tax/individual-income/">ID Tax Commission</Link>
              ).
            </LI>
            <LI>
              <B>MS</B> — flat rate above the $10K exemption dropped to{' '}
              <strong>4.4%</strong> for 2025 (was 4.7%) per the HB-531 phasedown (
              <Link href="https://www.dor.ms.gov/individual/individual-income-tax">MS DOR</Link>
              ).
            </LI>
            <LI>
              <B>WA</B> — no wage income tax, but 7% LTCG above $270,000 (
              <Link href="https://dor.wa.gov/taxes-rates/other-taxes/capital-gains-tax">DOR capital gains tax</Link>
              ). PFML worker share + WA Cares LTSS (
              <Link href="https://wacaresfund.wa.gov/">wacaresfund.wa.gov</Link>
              ) are real worker contributions.
            </LI>
            <LI>
              <B>NJ</B> — does not allow employee 401(k) contributions to reduce NJ wages
              (
              <Link href="https://www.state.nj.us/treasury/taxation/njit5.shtml">NJ-WT/GIT-2</Link>
              ). Does not conform to HSA deduction.
            </LI>
            <LI>
              <B>PA</B> — pretax 401(k) is excluded from PA compensation; Roth 401(k) is
              included (
              <Link href="https://www.revenue.pa.gov/FormsandPublications/PAPersonalIncomeTaxGuide/Pages/Gross-Compensation.aspx">PA PIT Guide — Gross Compensation</Link>
              ). Tool assumes pretax. PA does not conform to HSA.
            </LI>
            <LI>
              <B>MA</B> — 4% surtax on income above $1,083,150 in 2025 (
              <Link href="https://www.mass.gov/info-details/personal-income-tax-for-residents">MA DOR resident PIT</Link>
              ). Short-term capital gains taxed at 8.5% on a separate schedule; tool
              assumes long-term LTCG only.
            </LI>
            <LI>
              <B>MD</B> — every resident pays county tax 2.25%–3.20% on Maryland taxable
              income (
              <Link href="https://www.marylandtaxes.gov/individual/income/tax-info/tax-rates.php">Comptroller — local tax rates</Link>
              ). Tool defaults to Montgomery County (3.20%).
            </LI>
            <LI>
              <B>IN</B> — every resident pays county tax 0.5%–3.4% on Indiana adjusted
              gross income (
              <Link href="https://www.in.gov/dor/files/dn01.pdf">DOR Departmental Notice #1</Link>
              ). Tool defaults to Marion County / Indianapolis (2.02%).
            </LI>
            <LI>
              <B>NH</B> — Interest and Dividends tax fully repealed effective 2025 (
              <Link href="https://www.revenue.nh.gov/faq/interest-dividend.htm">NH DRA — I&amp;D tax</Link>
              ).
            </LI>
            <LI>
              <B>HI</B> — has an alternative tax on capital gains capped at 7.25%; tool
              uses ordinary rate (slightly conservative for top earners).
            </LI>
          </UL>
        </Section>

        <Section title="Known sensitivity">
          <P>
            The 80th-percentile home value assumption is the largest single sensitivity.
            Texas rankings are robust within a ±20% home value swing; California
            rankings shift by ~3 places moving from p80 to p50. Use the percentile
            selector to test your own scenario.
          </P>
          <P>
            The "representative city per state" choice is the second-largest. NYC
            triples the New York number relative to upstate; Detroit's wage tax adds
            ~2% to Michigan's effective rate. The dropdown lets you switch to "no local
            tax" or pin a specific city.
          </P>
        </Section>

        <Section title="Reproduction">
          <P>
            All calculations are pure TypeScript in{' '}
            <Code>src/lib/tax-calc.ts</Code>; data lives in twelve JSON files under{' '}
            <Code>src/data/</Code>, each with a <Code>_meta</Code> field documenting
            source and as-of date. Run <Code>npm test</Code> to execute the unit
            tests, which pin each load-bearing state to a hand-calculated value at
            the canonical $300K MFJ scenario.
          </P>
        </Section>
      </article>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="border-b border-slate-200 pb-2 text-xl font-semibold text-slate-900">
        {title}
      </h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

function P({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={`text-sm leading-6 ${className ?? ''}`}>{children}</p>;
}

function SourceBlock({
  file,
  primary,
  urls,
}: {
  file: string;
  primary: string;
  urls: Array<[string] | [string, string]>;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-baseline justify-between gap-3">
        <Code>{file}</Code>
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-700">{primary}</p>
      <ul className="mt-2 space-y-1 text-xs leading-5">
        {urls.map(([label, href], i) => (
          <li key={i} className="text-slate-600">
            {href ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-700 hover:underline"
              >
                {label}
              </a>
            ) : (
              <span className="text-slate-500">{label}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function UL({ children }: { children: React.ReactNode }) {
  return <ul className="list-disc space-y-2 pl-6 text-sm leading-6 marker:text-slate-400">{children}</ul>;
}

function LI({ children }: { children: React.ReactNode }) {
  return <li className="pl-1">{children}</li>;
}

function B({ children }: { children: React.ReactNode }) {
  return <strong className="font-semibold text-slate-900">{children}</strong>;
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.85em] text-slate-800">
      {children}
    </code>
  );
}

function Link({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-sky-700 hover:underline"
    >
      {children}
    </a>
  );
}
