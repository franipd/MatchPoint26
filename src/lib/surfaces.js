// Fan surfaces — each is the cheapest agent pipeline that hits its accuracy
// bar (see docs/architecture.md). Gatherers (Haiku) do factual retrieval with
// live web search; Analysts (Sonnet) synthesize with NO search, so they can't
// invent facts the gatherers didn't source. All prompts are tournament-relative
// so they keep working before and after the final.

import { callClaude, parseAgentJson, MODELS } from './anthropic.js';
import { todayLine, JSON_RULES as JSON_RULES_BASE } from './prompts.js';

const JSON_RULES =
  JSON_RULES_BASE +
  ' Every factual claim must carry the names of the sources it came from.';

const GATHERER_SYSTEM =
  'You are a factual research agent for a FIFA World Cup 2026 insights app. ' +
  'Rules: (1) every fact must come from your web searches, not memory; ' +
  '(2) attach a source name and confidence score to each fact; (3) prefer ' +
  'official or major-outlet sources; (4) if you could not verify something, ' +
  'put it in "gaps" instead of guessing; (5) return compact, structured data ' +
  '— you are feeding a UI, not writing prose.';

// ---------------------------------------------------------------- match center

async function runMatchCenter({ apiKey, signal, log }) {
  log('match center: fetching tournament results via live search…');
  const res = await callClaude({
    apiKey,
    signal,
    model: MODELS.GATHERER,
    system: GATHERER_SYSTEM,
    useSearch: true,
    maxSearches: 5,
    maxTokens: 8000,
    messages: [
      {
        role: 'user',
        content: `${todayLine()}

Compile FIFA World Cup 2026 scorecards: every completed knockout-stage match
(final if played, semi-finals, quarter-finals, round of 16), plus up to 4 of the
most notable group-stage results (upsets, records). If the final has not been
played yet, list it with score null. List EVERY distinct source you found for
each result — a result backed by a single source must be treated as unconfirmed.

${JSON_RULES}

Schema:
{
  "asOf": "one line on tournament state right now",
  "matches": [
    { "stage": "Final|Semi-final|Quarter-final|Round of 16|Group",
      "teamA": "", "teamB": "", "score": "2-1 or null if unplayed",
      "note": "one short line: extra time, penalties, upset, records — or null",
      "date": "", "sources": ["every distinct outlet found"], "confidence": 0.0 }
  ],
  "gaps": ["anything you could not verify"]
}`,
      },
    ],
  });
  const data = parseAgentJson(res.text);
  if (!Array.isArray(data.matches)) throw new Error('Match Center returned no matches array.');
  return { data, calls: [res] };
}

// ------------------------------------------------------------------ player hub

const PLAYER_COUNT = 8;

async function runPlayerHub({ apiKey, signal, log }) {
  log('player hub: identifying the tournament standouts…');
  const idRes = await callClaude({
    apiKey,
    signal,
    model: MODELS.GATHERER,
    system: GATHERER_SYSTEM,
    useSearch: true,
    maxSearches: 3,
    maxTokens: 4000,
    messages: [
      {
        role: 'user',
        content: `${todayLine()}

Identify the ${PLAYER_COUNT} standout players of the FIFA World Cup 2026 so far
(Golden Boot contenders, Golden Ball contenders, breakout performers).

${JSON_RULES}

Schema:
{ "players": [ { "name": "", "team": "", "position": "", "why": "one line" } ],
  "gaps": [] }`,
      },
    ],
  });
  const shortlist = parseAgentJson(idRes.text);
  const players = (shortlist.players || []).slice(0, PLAYER_COUNT);
  if (!players.length) throw new Error('Player Hub could not identify any players.');
  log(`player hub: researching ${players.length} players in parallel…`);

  // One gatherer per player; one failure must not kill the board.
  const settled = await Promise.allSettled(
    players.map((p) =>
      callClaude({
        apiKey,
        signal,
        model: MODELS.GATHERER,
        system: GATHERER_SYSTEM,
        useSearch: true,
        maxSearches: 2,
        maxTokens: 4000,
        messages: [
          {
            role: 'user',
            content: `${todayLine()}

Research ${p.name} (${p.team}) at the FIFA World Cup 2026.

${JSON_RULES}

Schema:
{ "name": "${p.name}", "team": "${p.team}", "position": "${p.position || ''}",
  "goalsThisWorldCup": { "value": 0, "sources": [""], "confidence": 0.0 },
  "careerInternationalGoals": { "value": 0, "sources": [""], "confidence": 0.0 },
  "keyPerformance": "one line, with match",
  "gaps": [] }`,
          },
        ],
      }),
    ),
  );

  const calls = [idRes];
  const cards = [];
  const failures = [];
  settled.forEach((s, i) => {
    if (s.status === 'fulfilled') {
      calls.push(s.value);
      try {
        cards.push(parseAgentJson(s.value.text));
      } catch {
        failures.push(players[i].name);
      }
    } else {
      failures.push(players[i].name);
    }
  });
  // allSettled swallows AbortError — re-surface a user abort as an abort,
  // not as a failure banner.
  if (signal?.aborted) throw new DOMException('Run aborted', 'AbortError');
  if (!cards.length) throw new Error('Every player lookup failed.');
  failures.forEach((n) => log(`player hub: lookup failed for ${n}`, 'warn'));

  log('player hub: analyst ranking the board (no search — sources only)…');
  const rankRes = await callClaude({
    apiKey,
    signal,
    model: MODELS.ANALYST,
    system:
      'You are the ranking analyst of a World Cup insights app. You do NOT ' +
      'search — you may only use the sourced player data you are given. Rank ' +
      'the players by tournament impact. Carry each stat forward with its ' +
      'sources and confidence untouched. Flag any stat backed by fewer than 2 ' +
      'sources. Carry every gap forward.',
    useSearch: false,
    maxTokens: 16000,
    messages: [
      {
        role: 'user',
        content: `Player research (raw JSON):
${JSON.stringify(cards)}

${JSON_RULES}

Schema:
{ "summary": "2-3 sentences on the tournament's individual story",
  "ranking": [
    { "rank": 1, "name": "", "team": "", "position": "",
      "goalsThisWorldCup": { "value": 0, "sources": [""], "confidence": 0.0 },
      "careerInternationalGoals": { "value": 0, "sources": [""], "confidence": 0.0 },
      "verdict": "one line on why they rank here",
      "singleSourceStats": ["names of stats backed by <2 sources, if any"] }
  ],
  "gaps": [] }`,
      },
    ],
  });
  calls.push(rankRes);
  const data = parseAgentJson(rankRes.text);
  if (!Array.isArray(data.ranking)) throw new Error('Player Hub analyst returned no ranking.');
  if (failures.length) data.gaps = [...(data.gaps || []), `Lookups failed: ${failures.join(', ')}`];
  return { data, calls };
}

// ----------------------------------------------------------------- flashpoints

async function runFlashpoints({ apiKey, signal, log }) {
  log('flashpoints: gathering reported controversies…');
  const gatherRes = await callClaude({
    apiKey,
    signal,
    model: MODELS.GATHERER,
    system: GATHERER_SYSTEM,
    useSearch: true,
    maxSearches: 5,
    maxTokens: 8000,
    messages: [
      {
        role: 'user',
        content: `${todayLine()}

Gather the significant controversies of the FIFA World Cup 2026: refereeing and
VAR disputes, disciplinary incidents, off-pitch disputes. For each, list EVERY
distinct source you found reporting it — the count matters downstream.

${JSON_RULES}

Schema:
{ "incidents": [
    { "title": "", "description": "2-3 sentences, factual",
      "date": "", "teamsOrPeople": [""],
      "sources": ["every distinct outlet found"], "confidence": 0.0 }
  ],
  "gaps": [] }`,
      },
    ],
  });
  const gathered = parseAgentJson(gatherRes.text);
  if (!Array.isArray(gathered.incidents) || !gathered.incidents.length) {
    throw new Error('Flashpoints gatherer returned no incidents.');
  }

  log('flashpoints: analyst verifying — 2+ sources or labeled unverified…');
  const verifyRes = await callClaude({
    apiKey,
    signal,
    model: MODELS.ANALYST,
    system:
      'You are the verification analyst of a World Cup insights app. You do ' +
      'NOT search — you may only use the gathered reports. Hard rule, never ' +
      'bypassed: an incident is "verified" ONLY if backed by 2 or more ' +
      'independent sources; otherwise its status is "reported" and it must be ' +
      'presented as unconfirmed. Strip loaded language; state what happened, ' +
      'not who was right.',
    useSearch: false,
    maxTokens: 16000,
    messages: [
      {
        role: 'user',
        content: `Gathered reports (raw JSON):
${JSON.stringify(gathered)}

${JSON_RULES}

Schema:
{ "incidents": [
    { "title": "", "summary": "2-3 neutral sentences", "date": "",
      "status": "verified|reported", "sources": [""],
      "confidence": 0.0, "whyItMatters": "one line" }
  ],
  "gaps": [] }`,
      },
    ],
  });
  const data = parseAgentJson(verifyRes.text);
  if (!Array.isArray(data.incidents)) throw new Error('Flashpoints analyst returned no incidents.');
  return { data, calls: [gatherRes, verifyRes] };
}

// --------------------------------------------------------------- team analysis

async function runTeamAnalysis({ apiKey, signal, log }) {
  log('team analysis: gathering finalists’ tournament data…');
  const gatherRes = await callClaude({
    apiKey,
    signal,
    model: MODELS.GATHERER,
    system: GATHERER_SYSTEM,
    useSearch: true,
    maxSearches: 5,
    maxTokens: 8000,
    messages: [
      {
        role: 'user',
        content: `${todayLine()}

First confirm via search which two teams contest(ed) the FIFA World Cup 2026
final. Then gather each finalist's full tournament data: every result, goals
for and against, and notable statistical patterns (possession, set pieces,
clean sheets — whatever the sources actually report).

${JSON_RULES}

Schema:
{ "teams": [
    { "team": "",
      "results": [ { "opponent": "", "stage": "", "score": "", "source": "" } ],
      "goalsFor": 0, "goalsAgainst": 0,  // must sum from the sourced results above
      "patterns": [ { "fact": "", "source": "", "confidence": 0.0 } ] }
  ],
  "gaps": [] }`,
      },
    ],
  });
  const gathered = parseAgentJson(gatherRes.text);
  if (!Array.isArray(gathered.teams) || !gathered.teams.length) {
    throw new Error('Team Analysis gatherer returned no teams.');
  }

  log('team analysis: analyst reading strengths and weaknesses from the data…');
  const analyzeRes = await callClaude({
    apiKey,
    signal,
    model: MODELS.ANALYST,
    system:
      'You are the tactical analyst of a World Cup insights app. You do NOT ' +
      'search — you may only reason from the sourced data you are given. Every ' +
      'strength or weakness must cite the data point it rests on. If the data ' +
      'is too thin to support a judgment, say so in gaps instead of stretching.',
    useSearch: false,
    maxTokens: 16000,
    messages: [
      {
        role: 'user',
        content: `Gathered team data (raw JSON):
${JSON.stringify(gathered)}

${JSON_RULES}

Schema:
{ "teams": [
    { "team": "",
      "strengths": [ { "point": "", "evidence": "the data it rests on" } ],
      "weaknesses": [ { "point": "", "evidence": "" } ],
      "styleRead": "2-3 sentences on how this team plays" }
  ],
  "comparison": "2-3 sentences directly comparing the two",
  "gaps": [] }`,
      },
    ],
  });
  const data = parseAgentJson(analyzeRes.text);
  if (!Array.isArray(data.teams)) throw new Error('Team Analysis analyst returned no teams.');
  // The UI renders the gatherer's raw scorecard data alongside the analysis.
  data._teamData = gathered.teams;
  return { data, calls: [gatherRes, analyzeRes] };
}

// -------------------------------------------------------------------- registry

/**
 * Each surface: id, label, tagline, costNote (shown before the visitor spends
 * money), and run({apiKey, signal, log}) → { data, calls }. The wrapper below
 * aggregates usage across calls so the UI can show what a run actually cost.
 */
export const SURFACES = [
  {
    id: 'matchCenter',
    label: 'Match Center',
    tagline: 'Every scorecard, live-researched and sourced.',
    costNote: '1 agent call · up to 5 live searches',
    run: runMatchCenter,
  },
  {
    id: 'playerHub',
    label: 'Player Hub',
    tagline: 'The standouts — goals this World Cup and career, with receipts.',
    costNote: `${PLAYER_COUNT + 2} agent calls · up to ${3 + PLAYER_COUNT * 2} live searches`,
    run: runPlayerHub,
  },
  {
    id: 'flashpoints',
    label: 'Flashpoints',
    tagline: 'Controversies — verified by 2+ sources or labeled as reported.',
    costNote: '2 agent calls · up to 5 live searches',
    run: runFlashpoints,
  },
  {
    id: 'teamAnalysis',
    label: 'Team Analysis',
    tagline: 'Finalists’ strengths and weaknesses, argued from the data.',
    costNote: '2 agent calls · up to 5 live searches',
    run: runTeamAnalysis,
  },
];

/** Run a surface and aggregate stats. */
export async function runSurface(surface, { apiKey, signal, log }) {
  const t0 = performance.now();
  const { data, calls } = await surface.run({ apiKey, signal, log });
  const stats = {
    calls: calls.length,
    searches: calls.reduce((n, c) => n + c.searchQueries.length, 0),
    inputTokens: calls.reduce((n, c) => n + (c.usage.input_tokens || 0), 0),
    outputTokens: calls.reduce((n, c) => n + (c.usage.output_tokens || 0), 0),
    elapsedMs: Math.round(performance.now() - t0),
  };
  const queries = calls.flatMap((c) => c.searchQueries);
  return { data, stats, queries, generatedAt: new Date().toISOString() };
}
