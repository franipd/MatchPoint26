import { useCallback, useRef, useState } from 'react';
import KeyGate, { loadStoredKey } from './components/KeyGate.jsx';
import AgentGraph from './components/AgentGraph.jsx';
import LogPanel from './components/LogPanel.jsx';
import Briefing from './components/Briefing.jsx';
import SavedBriefs from './components/SavedBriefs.jsx';
import TabBar from './components/TabBar.jsx';
import SurfaceView from './components/SurfaceView.jsx';
import { runScoutNetwork } from './lib/agents.js';
import { loadBriefs, saveBrief, renameBrief, deleteBrief } from './lib/briefStore.js';
import { SURFACES } from './lib/surfaces.js';
import { loadSurfaces, saveSurface, clearSurface } from './lib/surfaceStore.js';
import { MODELS } from './lib/anthropic.js';

const initialNodes = () => ({
  orchestrator: { kind: 'ORCHESTRATOR', title: 'Mission planner', subtitle: 'Confirms matchup · writes scout briefs', status: 'idle' },
  scoutA: { kind: 'SCOUT A', title: 'Finalist 1', subtitle: 'Awaiting brief', status: 'idle' },
  scoutB: { kind: 'SCOUT B', title: 'Finalist 2', subtitle: 'Awaiting brief', status: 'idle' },
  scoutC: { kind: 'SCOUT C', title: 'Match context', subtitle: 'Awaiting brief', status: 'idle' },
  chief: { kind: 'CHIEF SCOUT', title: 'Synthesis', subtitle: 'Reconciles · scores · flags gaps', status: 'idle' },
});

const PHASE_COPY = {
  idle: 'Standing by',
  planning: 'Orchestrator planning — live search',
  scouting: 'Scouts deployed in parallel — live search',
  synthesizing: 'Chief Scout assembling briefing',
  complete: 'Briefing delivered',
  error: 'Run halted',
};

// Derived from the surface registry — adding a surface adds its tab.
const TABS = [
  ...SURFACES.map(({ id, label }) => ({ id, label })),
  { id: 'briefing', label: 'The Briefing' },
];

export default function App() {
  const [apiKey, setApiKey] = useState(loadStoredKey);
  const [activeTab, setActiveTab] = useState('matchCenter');
  const [surfaceCache, setSurfaceCache] = useState(loadSurfaces);
  const [phase, setPhase] = useState('idle');
  const [nodes, setNodes] = useState(initialNodes);
  const [logEntries, setLogEntries] = useState([]);
  const [briefing, setBriefing] = useState(null);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const [savedBriefs, setSavedBriefs] = useState(loadBriefs);
  const [activeBriefId, setActiveBriefId] = useState(null);
  const abortRef = useRef(null);

  const patchNode = useCallback((id, patch) => {
    setNodes((n) => ({ ...n, [id]: { ...n[id], ...patch } }));
  }, []);

  const running = phase === 'planning' || phase === 'scouting' || phase === 'synthesizing';

  // Read the store fresh on every write so a save never clobbers results
  // cached by another browser tab (same pattern as saveBrief below), and keep
  // the side effect out of a state updater (StrictMode double-invokes those).
  const handleSurfaceResult = (id, result) =>
    setSurfaceCache(saveSurface(id, result, loadSurfaces()));
  const handleSurfaceClear = (id) => setSurfaceCache(clearSurface(id, loadSurfaces()));

  const deploy = async () => {
    if (!apiKey || running) return;
    setPhase('planning');
    setNodes(initialNodes());
    setLogEntries([]);
    setBriefing(null);
    setStats(null);
    setError('');
    setActiveBriefId(null);
    abortRef.current = new AbortController();

    patchNode('orchestrator', { status: 'active' });

    const on = {
      log: (entry) => setLogEntries((l) => [...l, entry]),
      phase: setPhase,
      stats: setStats,
      orchestrator: (plan) => {
        patchNode('orchestrator', {
          status: 'done',
          subtitle: `${plan.matchup.teamA} v ${plan.matchup.teamB} · ${plan.matchup.venue}`,
          confidence: plan.matchupConfidence,
          latencyMs: plan.latencyMs,
          queries: plan.queries,
        });
      },
      scoutStart: (id, brief) =>
        patchNode(id, { status: 'active', title: brief.subject, subtitle: `${brief.objectives.length} objectives` }),
      scoutQueries: (id, queries) => patchNode(id, { queries }),
      scoutDone: (id, report) =>
        patchNode(id, {
          status: 'done',
          subtitle: report.headline || 'Report filed',
          confidence: report.overallConfidence,
          gaps: report.gaps?.length || 0,
          latencyMs: report._latencyMs,
        }),
      scoutError: (id, msg) => patchNode(id, { status: 'error', subtitle: msg }),
      briefing: (b) => {
        patchNode('chief', { status: 'done', subtitle: 'Briefing delivered', confidence: b.prediction?.confidence });
        setBriefing(b);
        // Auto-archive every completed run. Read the store fresh so a save
        // never clobbers briefs from another tab, and keep the side effect
        // out of a state updater (StrictMode double-invokes those).
        const { entry, list } = saveBrief(b, loadBriefs());
        setSavedBriefs(list);
        setActiveBriefId(entry.id);
      },
    };

    // Chief goes active when synthesis begins
    const phaseWithChief = (p) => {
      if (p === 'synthesizing') patchNode('chief', { status: 'active' });
      setPhase(p);
    };
    on.phase = phaseWithChief;

    try {
      await runScoutNetwork({ apiKey, on, signal: abortRef.current.signal });
    } catch (err) {
      if (err.name === 'AbortError') {
        setPhase('idle');
        return;
      }
      const hint =
        err.name === 'ApiError'
          ? ' — check your key and Anthropic account credit, then run again.'
          : ' — this is an app-side issue, not your key. Run the network again.';
      setError((err.message || 'The run failed.') + hint);
      setPhase('error');
      setLogEntries((l) => [
        ...l,
        { ts: new Date().toISOString().slice(11, 19), level: 'error', msg: `halted — ${err.message}` },
      ]);
    }
  };

  const cancel = () => abortRef.current?.abort();

  const openBrief = (id) => {
    if (running) return;
    const entry = savedBriefs.find((b) => b.id === id);
    if (!entry) return;
    setBriefing(entry.briefing);
    setActiveBriefId(id);
    setError('');
  };

  const handleRenameBrief = (id, name) => setSavedBriefs(renameBrief(id, name, savedBriefs));

  const handleDeleteBrief = (id) => {
    setSavedBriefs(deleteBrief(id, savedBriefs));
    if (id === activeBriefId) setActiveBriefId(null);
  };

  const activeSurface = SURFACES.find((s) => s.id === activeTab);

  return (
    <div className="app">
      <header className="masthead">
        <div>
          <div className="eyebrow">AGENTIC INSIGHTS · FIFA WORLD CUP 2026</div>
          <h1 className="title">MATCHPOINT 26</h1>
          <p className="subtitle">
            Scorecards, standout players, controversies and tactical reads — researched live by
            AI agents with a source and a confidence score on every claim. Nothing is hard-coded;
            what the agents couldn&rsquo;t verify is flagged, never bluffed.
          </p>
        </div>
        <div className="statbox" aria-live="polite">
          <div className="stat">
            <span className="stat-num">{stats?.calls ?? '—'}</span>
            <span className="stat-label">agent calls</span>
          </div>
          <div className="stat">
            <span className="stat-num">{stats?.searches ?? '—'}</span>
            <span className="stat-label">live searches</span>
          </div>
          <div className="stat">
            <span className="stat-num">
              {stats ? `${Math.round(stats.elapsedMs / 1000)}s` : '—'}
            </span>
            <span className="stat-label">elapsed</span>
          </div>
          <div className="stat">
            <span className="stat-num">
              {stats ? ((stats.inputTokens + stats.outputTokens) / 1000).toFixed(1) + 'k' : '—'}
            </span>
            <span className="stat-label">tokens</span>
          </div>
        </div>
      </header>

      <KeyGate apiKey={apiKey} onKeyChange={setApiKey} disabled={running} />

      <TabBar
        tabs={TABS.map((t) => ({ ...t, badge: t.id !== 'briefing' && surfaceCache[t.id] ? '●' : null }))}
        activeId={activeTab}
        onSelect={setActiveTab}
      />

      {activeSurface && (
        <SurfaceView
          key={activeSurface.id}
          surface={activeSurface}
          apiKey={apiKey}
          cached={surfaceCache[activeSurface.id]}
          onResult={handleSurfaceResult}
          onClear={handleSurfaceClear}
        />
      )}

      {activeTab === 'briefing' && (
        <section id="panel-briefing" role="tabpanel" aria-labelledby="tab-briefing">
          <div className="controls">
            <button className="deploy" onClick={deploy} disabled={!apiKey || running}>
              {running ? 'Network running…' : briefing ? 'Run the network again' : 'Deploy the network'}
            </button>
            {running && (
              <button className="cancel" onClick={cancel}>
                Abort run
              </button>
            )}
            <span className={`phase phase-${phase}`}>{PHASE_COPY[phase]}</span>
            <span className="model-tag">
              {MODELS.GATHERER} scouts · {MODELS.ANALYST} analysts · web search
            </span>
          </div>

          {error && (
            <div className="error-banner" role="alert">
              {error}
            </div>
          )}

          <main className="stage">
            <AgentGraph nodes={nodes} />
            <LogPanel entries={logEntries} />
          </main>

          <SavedBriefs
            briefs={savedBriefs}
            activeId={activeBriefId}
            disabled={running}
            onOpen={openBrief}
            onRename={handleRenameBrief}
            onDelete={handleDeleteBrief}
          />

          <Briefing briefing={briefing} />
        </section>
      )}

      <footer className="foot">
        Tiered agent architecture — cheap gatherers with live search, strong analysts that may
        only use sourced data · every claim confidence-scored, gaps flagged, never bluffed ·
        bring-your-own-key: your key never leaves your browser except to api.anthropic.com.
      </footer>
    </div>
  );
}
