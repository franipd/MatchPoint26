# MatchPoint26 — Claude Context

## What this project is

A fan-facing agentic insights app for the FIFA World Cup 2026. **This is a
real product, not a demo** — agents are judged on accuracy and speed. It is
a pure static site (Vite + React 18) with **no backend**; visitors bring
their own Anthropic API key (BYOK), sent only to `api.anthropic.com` from
the browser.

Shipped surfaces (tabs): **Match Center** (scorecards), **Player Hub**
(standout players + stats via parallel per-player gatherers), **Flashpoints**
(controversies, ≥2-source verification), **Team Analysis** (strengths from
data), and **The Briefing** (orchestrator → 3 parallel scouts → chief scout).
Requirements live in [docs/prd.md](docs/prd.md). Agent design, model tiering
(`claude-haiku-4-5` gatherers / `claude-sonnet-5` analysts), and the cost
model live in [docs/architecture.md](docs/architecture.md) — read it before
adding or changing any agent.

## Structure

```
MatchPoint26/
├── index.html
├── vite.config.js
├── docs/
│   ├── prd.md               ← product requirements
│   └── architecture.md      ← agent architecture, model tiers, cost model
├── src/
│   ├── main.jsx
│   ├── App.jsx              ← run state machine, wires everything together
│   ├── styles.css           ← all styling (no CSS framework)
│   ├── lib/
│   │   ├── anthropic.js     ← browser-direct API client (callClaude, MODELS, parseAgentJson)
│   │   ├── agents.js        ← prompts + pipeline for the briefing agents
│   │   ├── surfaces.js      ← fan-surface registry, prompts + pipelines
│   │   ├── briefStore.js    ← saved briefings in localStorage, defensive
│   │   └── surfaceStore.js  ← cached surface results in localStorage, defensive
│   └── components/
│       ├── TabBar.jsx       ← accessible scrollable tab strip
│       ├── SurfaceView.jsx  ← generic surface frame + per-surface renderers
│       ├── KeyGate.jsx      ← API key entry (memory or opt-in localStorage)
│       ├── AgentGraph.jsx   ← hand-rolled SVG agent graph
│       ├── LogPanel.jsx     ← live run log
│       ├── Briefing.jsx     ← the final dossier UI
│       └── SavedBriefs.jsx  ← save/rename/delete past briefings
└── dist/                    ← build output, do not edit
```

## Commands

- `npm run dev` — local dev server
- `npm run build` — production build to `dist/`
- `npm run preview` — serve the built output

No tests yet, no linter, no environment variables.

## Conventions and invariants

- **No backend, ever.** The visitor's API key lives in the browser only
  (memory, or localStorage if they opt in). Never add server code, never
  embed a key in the source, never send the key anywhere except
  `api.anthropic.com`. The `anthropic-dangerous-direct-browser-access`
  header is deliberate — this is the BYOK pattern; do not "fix" it.
- **Accuracy over fluency.** Claims need sources. Confidence < 0.6 means
  "could not verify" and renders red; unverified points go to flagged-gaps.
  Never soften or hide low confidence. Stats (goals, results) should be
  corroborated by more than one source or flagged.
- **Cost is a feature.** Follow the model tiering in
  [docs/architecture.md](docs/architecture.md) — cheap models for factual
  gathering, stronger models for synthesis. Cache results in localStorage;
  completed-match data never changes, so never re-fetch it by default.
- **Filter response blocks by type, never by position.** Search-enabled
  responses interleave `text`, `server_tool_use`, and
  `web_search_tool_result` blocks.
- **Parse agent JSON defensively** — always through `parseAgentJson`
  (fence stripping, balanced-brace extraction). Never assume clean JSON.
- **Isolate agent failures.** One worker failing must not kill a run
  (`Promise.allSettled`). Every new multi-agent surface keeps this.
- **localStorage is best-effort.** Storage code must degrade to in-memory
  state on quota/private-mode errors — never crash on storage.
- No UI libraries, no CSS frameworks. React + hand-rolled SVG/CSS only.
- Plain JavaScript (`.jsx`), no TypeScript.
- localStorage keys are namespaced `matchpoint26:*`.
