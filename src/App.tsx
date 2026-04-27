import { useMemo, useState } from 'react';
import { useProfileUrl } from './lib/use-profile-url';
import { computeAllBreakdowns } from './lib/tax-calc';
import { STATE_DATA, makeOverlayResolver } from './lib/load-data';
import type { StateCode } from './lib/profile';
import { ProfilePanel } from './components/ProfilePanel';
import { RankedList } from './components/RankedList';
import { Choropleth } from './components/Choropleth';
import { AssumptionsDrawer } from './components/AssumptionsDrawer';
import { MethodologyPage } from './components/MethodologyPage';
import { StateAuditPage } from './components/StateAuditPage';
import { PosterPage } from './components/PosterPage';

type Page = 'main' | 'methodology' | 'audit';

// Detect ?poster=1 (or ?poster) in the URL on initial render. Used by the
// Puppeteer screenshot pipeline to render a print-quality static layout.
const isPosterMode = (() => {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.has('poster');
})();

export default function App() {
  const { profile, setProfile, reset } = useProfileUrl();
  const [page, setPage] = useState<Page>('main');
  const [selected, setSelected] = useState<StateCode | null>(null);

  const resolver = useMemo(() => makeOverlayResolver(profile.city), [profile.city]);
  const breakdowns = useMemo(
    () => computeAllBreakdowns(profile, STATE_DATA, resolver),
    [profile, resolver],
  );

  const selectedBreakdown = selected
    ? breakdowns.find((b) => b.state === selected) ?? null
    : null;


  if (isPosterMode) {
    return <PosterPage profile={profile} />;
  }
  if (page === 'methodology') {
    return <MethodologyPage onBack={() => setPage('main')} />;
  }
  if (page === 'audit') {
    return <StateAuditPage onBack={() => setPage('main')} />;
  }

  return (
    <div className="min-h-full bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:px-6">
          <h1 className="text-sm font-semibold sm:text-base">
            State Taxes for Individuals <span className="font-normal text-slate-500">— 50 states + DC</span>
          </h1>
          <nav className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <button onClick={() => setPage('audit')} className="text-sky-700 hover:underline">per-state data</button>
            <button onClick={() => setPage('methodology')} className="text-sky-700 hover:underline">methodology</button>
            <a href="https://github.com/jasonly35/state_tax_visualization" target="_blank" rel="noopener noreferrer" className="text-sky-700 hover:underline">source</a>
          </nav>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-4 px-4 py-4 sm:gap-6 sm:px-6 sm:py-6 lg:grid-cols-[1fr_320px]">
        <section className="min-w-0 space-y-4">
          <Choropleth
            breakdowns={breakdowns}
            selected={selected}
            onSelect={setSelected}
          />

          {selectedBreakdown && (
            <AssumptionsDrawer breakdown={selectedBreakdown} onClose={() => setSelected(null)} />
          )}

          <RankedList breakdowns={breakdowns} selected={selected} onSelect={setSelected} />
        </section>

        <aside className="min-w-0 lg:order-none">
          <ProfilePanel profile={profile} onChange={setProfile} onReset={reset} />
        </aside>
      </main>

      <footer className="mx-auto max-w-7xl px-4 py-6 text-[11px] text-slate-400 sm:px-6">
        Seeded with 2024–2025 public data. Verify against state DOR worksheets before publishing.
        Federal tax shown for context but excluded from the comparison since it doesn't vary by state.
      </footer>
    </div>
  );
}
