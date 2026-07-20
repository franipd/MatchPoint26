// The Scout Network — orchestrator-worker pipeline.
//
//   ORCHESTRATOR  (live search: confirms the real matchup, writes scout briefs)
//        │
//   ┌────┼────────────┐
//   ▼    ▼            ▼
// SCOUT A  SCOUT B  SCOUT C     (parallel workers, each with live web search)
//   └────┼────────────┘
//        ▼
//   CHIEF SCOUT  (synthesis only — no search; must reconcile, score, flag gaps)
//
// Every stage is a real API call. Nothing about the match is hard-coded.

import { callClaude, parseAgentJson, MODELS } from './anthropic.js';
import { todayLine, JSON_RULES } from './prompts.js';

// ---------------------------------------------------------------- orchestrator

const ORCHESTRATOR_SYSTEM =
  'You are the Orchestrator of a football scouting network preparing a briefing ' +
  'for the FIFA World Cup 2026 final. Your job is planning, not opinion: use web ' +
  'search to confirm who is actually contesting the final (plus date, venue, and ' +
  'kick-off), then write precise, NON-OVERLAPPING research briefs for three scout ' +
  'agents. Scout A covers the first finalist, Scout B the second finalist, Scout C ' +
  'covers match context only (venue, conditions, referee, stakes, storylines). ' +
  'Scoped briefs prevent duplicated work — be specific about what each scout must ' +
  'find and what they must NOT cover.';

function orchestratorUserPrompt() {
  return `${todayLine()}

Confirm the FIFA World Cup 2026 final matchup via search, then produce scout briefs.

${JSON_RULES}

Schema:
{
  "matchup": { "teamA": "", "teamB": "", "date": "", "venue": "", "note": "one line on how the finalists got here" },
  "matchupConfidence": 0.0,
  "scoutBriefs": {
    "scoutA": { "subject": "", "objectives": ["3-4 specific research objectives"] },
    "scoutB": { "subject": "", "objectives": ["3-4 specific research objectives"] },
    "scoutC": { "subject": "Match context", "objectives": ["3-4 specific research objectives"] }
  }
}`;
}

// --------------------------------------------------------------------- scouts

const SCOUT_SYSTEM =
  'You are a professional football scout filing a pre-match intelligence report. ' +
  'Use web search to complete every objective in your brief. Rules of the network: ' +
  '(1) every finding must come from your searches, not memory; (2) attach a source ' +
  'name and a confidence score to each finding; (3) if you could not verify ' +
  'something, list it under "gaps" instead of guessing — an honest gap is worth ' +
  'more than a confident bluff; (4) stay inside your brief.';

function scoutUserPrompt(brief, matchup) {
  return `${todayLine()}

Match: ${matchup.teamA} vs ${matchup.teamB}, ${matchup.date}, ${matchup.venue}.

Your subject: ${brief.subject}
Your objectives:
${brief.objectives.map((o, i) => `${i + 1}. ${o}`).join('\n')}

${JSON_RULES}

Schema:
{
  "subject": "",
  "headline": "one-line top finding",
  "findings": [ { "claim": "", "source": "publication or site name", "confidence": 0.0 } ],
  "tacticalRead": "2-3 sentences of scout interpretation",
  "gaps": [ "anything you could not verify" ],
  "overallConfidence": 0.0
}`;
}

// ---------------------------------------------------------------- chief scout

const CHIEF_SYSTEM =
  'You are the Chief Scout. You do NOT search — you synthesise. You receive raw ' +
  'reports from three field scouts and must produce the final match briefing. ' +
  'Rules: reconcile the reports rather than concatenating them; if scouts ' +
  'disagree, say so; carry forward every unresolved gap into flaggedGaps rather ' +
  'than papering over it; your prediction confidence must reflect the weakest ' +
  'evidence it depends on, not the average.';

function chiefUserPrompt(matchup, reports) {
  return `Match: ${matchup.teamA} vs ${matchup.teamB}, ${matchup.date}, ${matchup.venue}.

Scout reports (raw JSON):
${JSON.stringify(reports, null, 2)}

${JSON_RULES}

Schema:
{
  "executiveSummary": "3-4 sentences",
  "teamDossiers": [
    { "team": "", "strengths": ["2-3"], "vulnerabilities": ["2-3"], "keyPlayers": ["2-3 names with one-phrase reasons"] }
  ],
  "keyBattles": [ { "battle": "", "why": "" } ],
  "tacticalRead": "3-4 sentences on how the final is likely to play out",
  "prediction": { "call": "scoreline or outcome", "confidence": 0.0, "caveat": "what would change this" },
  "flaggedGaps": [ "unresolved gaps inherited from scouts" ]
}`;
}

// ------------------------------------------------------------------- pipeline

/**
 * Run the full network. `on` is an event sink the UI subscribes to:
 *   on.log({ ts, level, msg })
 *   on.phase('planning' | 'scouting' | 'synthesizing' | 'complete')
 *   on.orchestrator(plan)
 *   on.scoutStart(id) / on.scoutQueries(id, queries) / on.scoutDone(id, report)
 *   on.scoutError(id, message)
 *   on.briefing(briefing)
 *   on.stats({ calls, inputTokens, outputTokens, searches, elapsedMs })
 */
export async function runScoutNetwork({ apiKey, on, signal }) {
  const t0 = performance.now();
  const stats = { calls: 0, inputTokens: 0, outputTokens: 0, searches: 0 };

  const track = (r) => {
    stats.calls += 1;
    stats.inputTokens += r.usage.input_tokens || 0;
    stats.outputTokens += r.usage.output_tokens || 0;
    stats.searches += r.searchQueries.length;
    on.stats({ ...stats, elapsedMs: Math.round(performance.now() - t0) });
  };
  const log = (msg, level = 'info') =>
    on.log({ ts: new Date().toISOString().slice(11, 19), level, msg });

  // 1 · Orchestrator ---------------------------------------------------------
  on.phase('planning');
  log('orchestrator: confirming final matchup via live search…');
  const orchRes = await callClaude({
    apiKey,
    signal,
    model: MODELS.ANALYST,
    system: ORCHESTRATOR_SYSTEM,
    messages: [{ role: 'user', content: orchestratorUserPrompt() }],
    useSearch: true,
    maxSearches: 3,
  });
  track(orchRes);
  orchRes.searchQueries.forEach((q) => log(`orchestrator search → "${q}"`, 'search'));
  const plan = parseAgentJson(orchRes.text);
  if (!plan?.matchup?.teamA || !plan?.scoutBriefs) {
    throw new Error('Orchestrator returned an incomplete plan.');
  }
  log(
    `matchup confirmed: ${plan.matchup.teamA} vs ${plan.matchup.teamB} ` +
      `(confidence ${plan.matchupConfidence ?? '?'}) · ${orchRes.latencyMs}ms`,
    'ok',
  );
  on.orchestrator({ ...plan, latencyMs: orchRes.latencyMs, queries: orchRes.searchQueries });

  // 2 · Scouts in parallel ---------------------------------------------------
  on.phase('scouting');
  const scoutIds = ['scoutA', 'scoutB', 'scoutC'];
  const runScout = async (id) => {
    const brief = plan.scoutBriefs[id];
    if (!brief) throw new Error(`No brief produced for ${id}.`);
    on.scoutStart(id, brief);
    log(`${id}: deployed → ${brief.subject}`);
    const res = await callClaude({
      apiKey,
      signal,
      model: MODELS.GATHERER,
      system: SCOUT_SYSTEM,
      messages: [{ role: 'user', content: scoutUserPrompt(brief, plan.matchup) }],
      useSearch: true,
      maxSearches: 4,
      maxTokens: 8000,
    });
    track(res);
    res.searchQueries.forEach((q) => log(`${id} search → "${q}"`, 'search'));
    on.scoutQueries(id, res.searchQueries);
    const report = parseAgentJson(res.text);
    report._latencyMs = res.latencyMs;
    const gapNote = report.gaps?.length ? ` · ${report.gaps.length} gap(s) flagged` : '';
    log(
      `${id}: report filed (confidence ${report.overallConfidence ?? '?'})${gapNote} · ${res.latencyMs}ms`,
      report.gaps?.length ? 'warn' : 'ok',
    );
    on.scoutDone(id, report);
    return report;
  };

  const settled = await Promise.allSettled(scoutIds.map(runScout));
  const reports = {};
  settled.forEach((s, i) => {
    const id = scoutIds[i];
    if (s.status === 'fulfilled') {
      reports[id] = s.value;
    } else {
      const msg = s.reason?.message || 'unknown error';
      log(`${id}: FAILED — ${msg}`, 'error');
      on.scoutError(id, msg);
      reports[id] = { subject: id, error: msg, findings: [], gaps: [`Scout failed: ${msg}`] };
    }
  });
  if (settled.every((s) => s.status === 'rejected')) {
    throw new Error('All scouts failed — cannot synthesise a briefing.');
  }

  // 3 · Chief Scout ----------------------------------------------------------
  on.phase('synthesizing');
  log('chief scout: reconciling reports, scoring confidence, flagging gaps…');
  const chiefRes = await callClaude({
    apiKey,
    signal,
    model: MODELS.ANALYST,
    system: CHIEF_SYSTEM,
    messages: [{ role: 'user', content: chiefUserPrompt(plan.matchup, reports) }],
    useSearch: false,
    maxTokens: 16000,
  });
  track(chiefRes);
  const briefing = parseAgentJson(chiefRes.text);
  log(`briefing assembled · ${chiefRes.latencyMs}ms`, 'ok');
  on.briefing({ ...briefing, matchup: plan.matchup });
  on.phase('complete');
  log(
    `network complete — ${stats.calls} agent calls, ${stats.searches} live searches, ` +
      `${Math.round((performance.now() - t0) / 1000)}s total`,
    'ok',
  );
}
