// Prompt fragments shared by every agent pipeline. One copy only — the
// anti-staleness line and the 0.6 confidence convention are product
// invariants, and two drifting copies would let the Briefing and the fan
// surfaces enforce different verification rules.

export const todayLine = () =>
  `Today's date is ${new Date().toUTCString()}. Treat anything you already ` +
  `"know" about this tournament as potentially stale — trust your searches.`;

export const JSON_RULES =
  'Respond with ONLY a single valid JSON object. No markdown fences, no prose ' +
  'before or after. All confidence values are numbers from 0 to 1, where a value ' +
  'below 0.6 means you could not properly verify the point.';
