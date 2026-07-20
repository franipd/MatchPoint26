# PRD: MatchPoint26 — Agentic FIFA 2026 Insights

## 1. Problem Statement

Football fans following the 2026 World Cup piece together results, player
stats, controversies, and analysis from scattered articles, apps, and social
feeds — none of which show their sources or admit what's unverified. There is
no single place that researches the tournament live and shows its work.
MatchPoint26 turns a proven multi-agent research engine into that place. It
matters now: the final is July 19, 2026 — peak fan attention is this week,
and the app becomes the tournament's retrospective afterward.

This is a production app, not a demo: agents are judged on **accuracy**
(sourced, corroborated claims) and **speed** (parallel research, cached
results).

## 2. Goals

- Every rendered stat or claim carries a source; 0 uncorroborated stats
  shown as fact within the launch build.
- Median surface load ≤ 20 seconds on first run, instant (< 200 ms) from
  cache.
- Full-app browse costs the visitor < $1 in API usage with caching on.
  `[ASSUMPTION]` — based on the cost model in architecture.md; validate with
  real runs.
- 3+ surfaces viewed per session within 2 weeks of launch. `[NEEDS INPUT]` —
  no analytics exist; see open questions.

## 3. Non-Goals

- No backend, accounts, comments, or social features — BYOK static site.
- No video/image embedding (rights); text, stats, and links only.
- No live in-match tracking or minute-by-minute updates.
- No betting content or odds.
- No coverage of other tournaments or leagues in v1.

## 4. Users & Use Cases

**The match-day fan** opens MatchPoint26 before the final, runs the Briefing,
then flips to Player Hub to settle a group-chat argument about the Golden
Boot — and screenshots the ranking, sources included.

**The catch-up fan** hasn't followed the group stage. Match Center gives them
every scorecard at a glance; Team Analysis tells them why the finalists are
here. Five minutes and they can talk football tonight.

**The post-final visitor** arrives in August. Completed-match data is cached
and immutable, Flashpoints and Player Hub work as a retrospective — the app
has a second life after the tournament.

## 5. User Stories

**Must-have**
- As a fan, I want scorecards for matches between countries so that I can
  see results across the whole tournament in one place.
- As a fan, I want the best players with their stats — goals this World Cup
  and career totals — so that I can compare them with evidence.
- As a fan, I want controversies listed with sources so that I know what's
  confirmed versus rumor.
- As a fan, I want team strengths and match data analysis so that I
  understand *why* teams win, not just scores.
- As a visitor, I want each surface to run on demand and cache its result so
  that I control what I spend.
- As a returning visitor, I want the existing Briefing to keep working
  unchanged.

**Should-have**
- As a fan, I want low-confidence claims visually flagged (red / "reported,
  unverified") so that the app never presents guesses as facts.
- As a fan, I want to see the live searches agents run so the wait feels
  active and trustworthy.

**Nice-to-have**
- As a fan, I want to copy a surface's content as text for group chats.
- As a fan, I want to re-run a surface to refresh after new matches.

## 6. Acceptance Criteria

**Match Center**
- Given a valid key, when I run Match Center, then scorecards render with
  teams, score, stage, and date, each carrying at least one source URL.
- Given Match Center has run once, when I revisit it, then cached scorecards
  render with no new API call.

**Player Hub**
- Given a valid key, when I run Player Hub, then a ranked list of players
  renders where each entry shows goals this World Cup and career goals, each
  stat sourced; any stat with a single source is flagged.
- Given one player's research call fails, when the run completes, then the
  other players still render and the failed one shows an error chip.

**Flashpoints**
- Given a controversy is backed by fewer than 2 independent sources, when it
  renders, then it is labeled "reported, unverified" — never as fact.

**Team Analysis**
- Given a valid key, when I run Team Analysis for a finalist, then strengths
  and weaknesses render with the underlying data (results, goals) cited
  inline.

**Cost & regression**
- Given I have not entered an API key, when I open any surface, then the key
  gate blocks all API calls.
- Given the new surfaces exist, when I run the Briefing, then it completes
  as before and saved briefs still load.

## 7. Risks & Assumptions

| Risks | Assumptions |
|---|---|
| Stats disagree across sources (official vs. media) — mitigated by corroboration rule + flagging, but expect edge cases | Web search reliably surfaces official/major-outlet stats for a live World Cup `[ASSUMPTION]` |
| Player Hub fan-out (~10 calls) is the cost hot spot — a visitor could find it expensive despite caching | Haiku-tier gatherers are accurate enough for factual retrieval when synthesis is source-locked `[ASSUMPTION]` — spot-check in testing |
| Controversy content risks defamation-adjacent claims — the ≥2-source rule and "unverified" labeling must never be bypassed | The BYOK audience overlaps enough with football fans for launch `[ASSUMPTION]` |
| Model IDs age (`claude-sonnet-5`, `claude-haiku-4-5`) — keep them in one config module | Tournament data is stable once matches complete, so permanent caching is safe |

## 8. Open Questions

- Which surface is the default landing tab — Match Center (cheapest, instant
  value) or the Briefing (flagship)? `[NEEDS INPUT]`
- Player Hub size: top 8 players? Top 11 (a "team of the tournament")?
  Affects cost linearly. `[NEEDS INPUT]`
- Do we add a privacy-light analytics counter, or stay fully
  analytics-free? `[NEEDS INPUT]`
- Repo visibility: public from day one, or private until the first surfaces
  ship? Owner: you.

## 9. Success Metrics

**Leading:** first-run completion rate per surface (started vs. rendered);
share of claims rendering with ≥2 sources; error/retry rate; median run time
per surface.
**Lagging:** sessions viewing 3+ surfaces; return visits in the week after
the final; fans sharing screenshots/copied content. `[NEEDS INPUT]` — only
observable anecdotally unless the analytics question above is a yes.

---

Review the [ASSUMPTION] and [NEEDS INPUT] sections before sharing with
engineering.
