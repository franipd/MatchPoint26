# MatchPoint26 — Agent Architecture

Design goal: **accuracy first, speed second, cost always visible.** Every
surface picks the cheapest architecture that can hit its accuracy bar — not
one pipeline for everything.

## Model tiers

Two tiers, chosen per role (set per call, not globally):

| Tier | Model | Used for | Why |
|---|---|---|---|
| Gatherer | `claude-haiku-4-5` | Factual retrieval with web search: results, scores, player stats | Facts come from the searches, not the model — a small fast model + good sources beats a big model working from memory. ~3× cheaper and faster than Sonnet. |
| Analyst | `claude-sonnet-5` | Synthesis, ranking, tactical analysis, reconciling conflicting sources | Judgment work — where model quality actually changes the output. |

The current code pins one model in `src/lib/anthropic.js` (`MODEL`). First
refactor: make `model` a per-call parameter of `callClaude` so each agent
declares its tier.

## Architecture per surface

**Match Center (scorecards)** — *single Gatherer call.*
One Haiku call, ~4 searches, returns structured scorecards (teams, score,
stage, date, venue, scorers). No orchestration needed — this is retrieval,
and extra agents add cost without adding accuracy. Completed matches are
immutable: cache forever, never auto-refetch.

**Player Hub (best players + stats)** — *fan-out + synthesis.*
1. One Gatherer identifies the tournament's standout players (~3 searches).
2. Parallel Gatherers, one per player (`Promise.allSettled`), each fetching
   goals this World Cup, career goals, and key performances (~2 searches
   each). Per-player isolation: one failure doesn't kill the board.
3. One Analyst call ranks and writes the board — no search; it may only use
   what the gatherers sourced.

**Flashpoints (controversies)** — *gather + adversarial verify.*
1. One Gatherer collects candidate controversies with sources (~4 searches).
2. One Analyst reviews each claim: kept only if backed by ≥2 independent
   sources; single-source claims render as "reported, unverified."
   Controversy is where hallucination hurts most — this is the one surface
   that pays for a second pass on every claim.

**Team Analysis (strengths + match data)** — *gather + analyst.*
One Gatherer pulls results, goals for/against, and key patterns for the
chosen team; one Analyst turns it into strengths/weaknesses with the data
cited inline.

**The Briefing (existing)** — *orchestrator-worker, re-tiered.*
Keep the shape (Orchestrator → 3 parallel Scouts → Chief Scout). Re-tier:
Scouts become Gatherers (Haiku — they search and report), Orchestrator and
Chief Scout stay Analysts (planning and synthesis). Same accuracy mechanics,
roughly half the cost, faster scouts.

## Accuracy mechanics (all surfaces)

- Per-claim source URLs; response blocks filtered by type, never position.
- Confidence 0–1 per claim; < 0.6 = "could not verify," rendered red.
- Stats corroborated by ≥2 sources or flagged; controversies always ≥2.
- Synthesis agents get **no search** — they can't invent facts the
  gatherers didn't source.
- Date line injected into every prompt ("trust your searches, not your
  training data") to defeat staleness.
- Defensive JSON parsing (`parseAgentJson`); `Promise.allSettled` isolation.

## Speed

- Tabs run on demand, never on load; results render from cache instantly.
- Fan-outs are parallel; wall clock = slowest single call, not the sum.
- Haiku gatherers cut the longest pole (search calls) materially.

## Cost model (visitor's key, order-of-magnitude)

Assumptions: web search ~$10 per 1,000 searches; Haiku ≈ $1/$5 per MTok
in/out; Sonnet ≈ $3/$15. Search-heavy calls carry large tool-result inputs
(~10k tokens). Verify against current pricing at https://docs.claude.com.

| Surface | Calls | Searches | Est. cost/run |
|---|---|---|---|
| Match Center | 1 Haiku | ~4 | ~$0.05 |
| Player Hub (8 players) | 9 Haiku + 1 Sonnet | ~19 | ~$0.35 |
| Flashpoints | 1 Haiku + 1 Sonnet | ~4 | ~$0.12 |
| Team Analysis | 1 Haiku + 1 Sonnet | ~4 | ~$0.12 |
| Briefing (re-tiered) | 2 Sonnet + 3 Haiku | ~10 | ~$0.25 |

Whole-app browse with caching: well under $1. The old all-Sonnet briefing
alone was ~$0.40–0.50 — tiering pays for the new surfaces.

Cost rules: no auto-runs, cache completed-match data permanently, show a
cost note before each run (the KeyGate pattern already sets expectations).
