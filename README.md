# MatchPoint26

Real-time agentic insights for the FIFA World Cup 2026 — scorecards, player
stats, controversies, team analysis, and a pre-match intelligence briefing,
all researched live by AI agents with per-claim sources and confidence scores.
Nothing is hard-coded; every fact is fetched and verified at run time.

MatchPoint26 grew out of an orchestrator-worker scouting prototype and is now
a fan-facing product: fast, accurate, and honest about what it could not
verify.

## Features

- **The Briefing** — full pre-match dossier for the final: one Orchestrator
  agent confirms the matchup live, three Scout agents research in parallel,
  a Chief Scout synthesizes with confidence scores and flagged gaps.
- **Match Center** — scorecards and results across the tournament, each
  with a source and confidence score. Cached after the first run.
- **Player Hub** — the tournament's standout players with stats (goals this
  World Cup and career), researched per player in parallel and ranked by an
  analyst that may only use the sourced data.
- **Flashpoints** — controversies, rendered as "Verified" only when backed
  by 2+ independent sources; otherwise labeled "Reported, unverified".
- **Team Analysis** — the finalists' strengths and weaknesses, argued from
  gathered match data with evidence cited on every point.

All surfaces run on demand (you control what you spend), cache their results
on your device, and run on a two-tier model architecture: `claude-haiku-4-5`
gatherers with live web search, `claude-sonnet-5` analysts with no search.

See [docs/architecture.md](docs/architecture.md) for the agent architecture
and cost model, and [docs/prd.md](docs/prd.md) for the product requirements.

## Bring your own key

Pure static site, **no backend**. Your Anthropic API key stays in your
browser (in memory, or localStorage only if you tick "Remember on this
device") and is sent exclusively to `api.anthropic.com` using Anthropic's
explicit CORS opt-in header for browser use
(`anthropic-dangerous-direct-browser-access`). No key is ever embedded in
this site's code — visitors use their own.

Cost note: agents use live web search, billed by Anthropic on top of token
usage — see current pricing at https://docs.claude.com and the cost model in
[docs/architecture.md](docs/architecture.md).

## Run locally

```bash
npm install
npm run dev
```

## Deploy to Vercel

1. Push this repo to GitHub.
2. In Vercel: **Add New → Project**, import the repo. Framework preset:
   **Vite** (auto-detected).
3. No environment variables needed — keys are supplied by visitors.
4. Deploy.

## Stack

Vite + React 18, no UI libraries — hand-rolled SVG + CSS.
Fonts: Saira Condensed / Inter / IBM Plex Mono.
