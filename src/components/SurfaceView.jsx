import { useEffect, useRef, useState } from 'react';
import { runSurface } from '../lib/surfaces.js';
import LogPanel from './LogPanel.jsx';

// Confidence chip. Threshold on the RAW value, not the rounded percent —
// 0.596 must render red ("could not verify" is < 0.6, never softened).
function Conf({ value }) {
  if (value == null) return null;
  const v = Math.min(1, Math.max(0, value));
  const tone = v >= 0.75 ? 'ok' : v >= 0.6 ? 'warn' : 'err';
  return <span className={`conf conf-${tone}`}>{Math.round(v * 100)}%</span>;
}

function Sources({ list }) {
  const names = (Array.isArray(list) ? list : [list]).filter(Boolean);
  if (!names.length) return null;
  return <span className="sources">{names.join(' · ')}</span>;
}

// A stat is single-sourced only if it EXISTS and has fewer than 2 sources —
// a missing stat must not trigger the footnote.
const isSingleSourced = (stat) =>
  Boolean(stat && stat.value != null && (stat.sources || []).length < 2);

function Gaps({ gaps }) {
  if (!gaps?.length) return null;
  return (
    <div className="surface-gaps">
      <h4>Not verified</h4>
      <ul>{gaps.map((g, i) => <li key={i}>{g}</li>)}</ul>
    </div>
  );
}

function SingleSourceNote() {
  return (
    <p className="single-source-note">* backed by a single source — treat as unconfirmed.</p>
  );
}

// ---------------------------------------------------------------- renderers

function MatchCenter({ data }) {
  const anySingle = data.matches.some((m) => m.score && (m.sources || []).length < 2);
  return (
    <div>
      {data.asOf && <p className="surface-lede">{data.asOf}</p>}
      <div className="score-grid">
        {data.matches.map((m, i) => {
          const single = m.score && (m.sources || []).length < 2;
          return (
            <div className="score-card" key={i}>
              <div className="score-stage">{m.stage}{m.date ? ` · ${m.date}` : ''}</div>
              <div className="score-line">
                <span className="score-team">{m.teamA}</span>
                <span className="score-num">{m.score ? `${m.score}${single ? ' *' : ''}` : 'v'}</span>
                <span className="score-team">{m.teamB}</span>
              </div>
              {m.note && <div className="score-note">{m.note}</div>}
              <div className="score-meta">
                <Sources list={m.sources} /> <Conf value={m.confidence} />
              </div>
            </div>
          );
        })}
      </div>
      {anySingle && <SingleSourceNote />}
      <Gaps gaps={data.gaps} />
    </div>
  );
}

function Stat({ label, stat }) {
  if (!stat || stat.value == null) return null;
  return (
    <div className="pstat">
      <span className="pstat-num">{stat.value}</span>
      <span className="pstat-label">{label}{isSingleSourced(stat) ? ' *' : ''}</span>
      <span className="pstat-src"><Sources list={stat.sources} /> <Conf value={stat.confidence} /></span>
    </div>
  );
}

function PlayerHub({ data }) {
  const anySingle = data.ranking.some(
    (p) =>
      isSingleSourced(p.goalsThisWorldCup) ||
      isSingleSourced(p.careerInternationalGoals) ||
      p.singleSourceStats?.length,
  );
  return (
    <div>
      {data.summary && <p className="surface-lede">{data.summary}</p>}
      <div className="player-list">
        {data.ranking.map((p, i) => (
          <div className="player-card" key={i}>
            <div className="player-rank">{p.rank ?? i + 1}</div>
            <div className="player-main">
              <div className="player-name">
                {p.name} <span className="player-team">{p.team}{p.position ? ` · ${p.position}` : ''}</span>
              </div>
              {p.verdict && <div className="player-verdict">{p.verdict}</div>}
            </div>
            <div className="player-stats">
              <Stat label="WC 2026 goals" stat={p.goalsThisWorldCup} />
              <Stat label="career intl goals" stat={p.careerInternationalGoals} />
            </div>
          </div>
        ))}
      </div>
      {anySingle && <SingleSourceNote />}
      <Gaps gaps={data.gaps} />
    </div>
  );
}

function Flashpoints({ data }) {
  return (
    <div>
      <div className="incident-list">
        {data.incidents.map((inc, i) => {
          const verified = inc.status === 'verified';
          const kind = verified ? 'verified' : 'reported';
          return (
            <div className={`incident incident-${kind}`} key={i}>
              <div className="incident-head">
                <span className={`status-chip status-${kind}`}>
                  {verified ? 'Verified' : 'Reported, unverified'}
                </span>
                <span className="incident-title">{inc.title}</span>
                {inc.date && <span className="incident-date">{inc.date}</span>}
              </div>
              <p className="incident-summary">{inc.summary}</p>
              {inc.whyItMatters && <p className="incident-why">{inc.whyItMatters}</p>}
              <div className="score-meta">
                <Sources list={inc.sources} /> <Conf value={inc.confidence} />
              </div>
            </div>
          );
        })}
      </div>
      <Gaps gaps={data.gaps} />
    </div>
  );
}

// Analysts sometimes normalize team names ("United States" → "USA"), so the
// join to the gatherer's raw record is fuzzy, never exact-equality.
function findTeamData(teamData, name) {
  if (!teamData || !name) return undefined;
  const norm = (s) => (s || '').toLowerCase().trim();
  const n = norm(name);
  return (
    teamData.find((d) => norm(d.team) === n) ||
    teamData.find((d) => norm(d.team).includes(n) || n.includes(norm(d.team)))
  );
}

function TeamAnalysis({ data }) {
  return (
    <div>
      {data.comparison && <p className="surface-lede">{data.comparison}</p>}
      <div className="ta-grid">
        {data.teams.map((t, i) => {
          const raw = findTeamData(data._teamData, t.team);
          return (
            <div className="ta-card" key={i}>
              <h3>{t.team}</h3>
              {raw && raw.goalsFor != null && (
                <div className="ta-record">
                  GF {raw.goalsFor} · GA {raw.goalsAgainst}
                  {raw.results?.length ? ` · from ${raw.results.length} sourced results` : ''}
                </div>
              )}
              {t.styleRead && <p className="ta-style">{t.styleRead}</p>}
              <h4>Strengths</h4>
              <ul>
                {(t.strengths || []).map((s, j) => (
                  <li key={j}>{s.point} <span className="evidence">{s.evidence}</span></li>
                ))}
              </ul>
              <h4>Weaknesses</h4>
              <ul>
                {(t.weaknesses || []).map((s, j) => (
                  <li key={j}>{s.point} <span className="evidence">{s.evidence}</span></li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      <Gaps gaps={data.gaps} />
    </div>
  );
}

const RENDERERS = {
  matchCenter: MatchCenter,
  playerHub: PlayerHub,
  flashpoints: Flashpoints,
  teamAnalysis: TeamAnalysis,
};

// -------------------------------------------------------------- surface frame

/**
 * Generic surface frame: idle → running → result | error.
 * Cached results render instantly; runs are on-demand only. Unmounting
 * (switching tabs) aborts the in-flight run — no orphaned spend on the
 * visitor's key, ever.
 */
export default function SurfaceView({ surface, apiKey, cached, onResult, onClear }) {
  const [state, setState] = useState('idle'); // idle | running | error
  const [logLines, setLogLines] = useState([]);
  const [error, setError] = useState('');
  const abortRef = useRef(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const running = state === 'running';
  const Renderer = RENDERERS[surface.id];

  const run = async () => {
    if (!apiKey || running) return;
    setState('running');
    setLogLines([]);
    setError('');
    abortRef.current = new AbortController();
    const log = (msg, level = 'info') =>
      setLogLines((l) => [...l, { ts: new Date().toISOString().slice(11, 19), level, msg }]);
    try {
      const result = await runSurface(surface, {
        apiKey,
        signal: abortRef.current.signal,
        log,
      });
      onResult(surface.id, result);
      setState('idle');
    } catch (err) {
      if (err.name === 'AbortError') {
        setState('idle');
        return;
      }
      setError(err.message || 'The run failed.');
      setState('error');
    }
  };

  return (
    <section
      id={`panel-${surface.id}`}
      role="tabpanel"
      aria-labelledby={`tab-${surface.id}`}
      className="surface"
    >
      <div className="surface-head">
        <div>
          <h2 className="surface-title">{surface.label}</h2>
          <p className="surface-tagline">{surface.tagline}</p>
        </div>
        <div className="surface-actions">
          {cached && !running && (
            <span className="cache-note">
              scouted {new Date(cached.generatedAt).toLocaleString()} · {cached.stats.calls} calls ·{' '}
              {cached.stats.searches} searches
            </span>
          )}
          {!running && (
            <button className="deploy deploy-sm" onClick={run} disabled={!apiKey}>
              {cached ? 'Refresh' : 'Scout it'}
            </button>
          )}
          {running && (
            <button className="cancel" onClick={() => abortRef.current?.abort()}>
              Abort
            </button>
          )}
          {cached && !running && (
            <button className="cancel" onClick={() => onClear(surface.id)}>
              Clear cache
            </button>
          )}
        </div>
      </div>

      {!cached && !running && state !== 'error' && (
        <p className="surface-idle">
          Runs live agent research on your key: {surface.costNote}. Result is cached on this
          device — you only pay again if you refresh. Switching tabs mid-run aborts the run.
        </p>
      )}

      {running && (
        <LogPanel
          entries={[
            ...logLines,
            {
              ts: '·····',
              level: 'info',
              msg: 'agents working — live searches count toward your API usage…',
            },
          ]}
        />
      )}

      {state === 'error' && (
        <div className="error-banner" role="alert">
          {error}{' '}
          <button className="retry" onClick={run}>
            Retry
          </button>
        </div>
      )}

      {cached && !running && Renderer && <Renderer data={cached.data} />}
    </section>
  );
}
