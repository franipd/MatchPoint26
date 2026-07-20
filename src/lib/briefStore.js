// Saved briefings — localStorage-backed, same no-backend pattern as the API
// key gate. Every function is defensive: corrupted JSON or a full/unavailable
// store (private mode, quota) degrades to in-memory state, never a crash.

const STORAGE_KEY = 'matchpoint26:briefs';
const MAX_BRIEFS = 20; // localStorage is ~5MB; a dossier is a few KB — 20 is safe headroom.

function persist(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable or quota hit — list survives in memory for this session */
  }
  return list;
}

export function loadBriefs() {
  try {
    const list = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(list)
      ? list.filter((b) => b && typeof b.id === 'string' && b.briefing)
      : [];
  } catch {
    return [];
  }
}

export function defaultBriefName(briefing) {
  const m = briefing?.matchup;
  return m?.teamA && m?.teamB ? `${m.teamA} v ${m.teamB}` : 'Untitled briefing';
}

/** Save a completed briefing. Returns { entry, list } — newest first, capped. */
export function saveBrief(briefing, existing) {
  const entry = {
    id:
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `brief-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: defaultBriefName(briefing),
    savedAt: new Date().toISOString(),
    briefing,
  };
  const list = persist([entry, ...existing].slice(0, MAX_BRIEFS));
  return { entry, list };
}

export function renameBrief(id, name, existing) {
  const trimmed = (name || '').trim();
  if (!trimmed) return existing;
  return persist(existing.map((b) => (b.id === id ? { ...b, name: trimmed } : b)));
}

export function deleteBrief(id, existing) {
  return persist(existing.filter((b) => b.id !== id));
}
