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

type Page = 'main' | 'methodology' | 'audit';

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


  if (page === 'methodology') {
    return <MethodologyPage onBack={() => setPage('main')} />;
  }
  if (page === 'audit') {
    return <StateAuditPage onBack={() => setPage('main')} />;
  }

  return (
    <div className="min-h-full bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-baseline justify-between px-6 py-3">
          <h1 className="text-base font-semibold">
            State Taxes for Individuals
          </h1>
          <div className="flex gap-4 text-xs">
            <button onClick={() => setPage('audit')} className="text-sky-700 hover:underline">per-state data</button>
            <button onClick={() => setPage('methodology')} className="text-sky-700 hover:underline">methodology</button>
            <a href="https://github.com/jasonly35/state_tax_visualization" target="_blank" rel="noopener noreferrer" className="text-sky-700 hover:underline">source</a>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <section className="space-y-4">
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

        <aside>
          <ProfilePanel profile={profile} onChange={setProfile} onReset={reset} />
        </aside>
      </main>

      <footer className="mx-auto max-w-7xl px-6 py-6 text-[11px] text-slate-400">
        Seeded with 2024–2025 public data. Verify against state DOR worksheets before publishing.
        Federal tax shown for context but excluded from the comparison since it doesn't vary by state.
      </footer>
    </div>
  );
}
