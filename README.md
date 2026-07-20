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
- **Match Center** *(planned)* — scorecards and results between countries
  across the tournament.
- **Player Hub** *(planned)* — the tournament's best players with stats:
  goals this World Cup, career totals, key performances.
- **Flashpoints** *(planned)* — controversies, verified against multiple
  sources before they render.
- **Team Analysis** *(planned)* — strengths, weaknesses, and tactical
  data analysis per team.

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
