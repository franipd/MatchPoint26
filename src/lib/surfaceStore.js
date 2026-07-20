// Cached surface results — localStorage-backed, same defensive pattern as
// briefStore.js: corrupted JSON or an unavailable store (private mode, quota)
// degrades to in-memory state, never a crash. Completed-tournament data is
// stable, so cached results have no auto-expiry — refresh is manual.

const STORAGE_KEY = 'matchpoint26:surfaces';

// A renderable entry must have the shape runSurface() produces; anything else
// (older format, partial write, manual edit) is dropped, not rendered.
function isValidEntry(e) {
  return Boolean(e && typeof e === 'object' && e.data && e.stats && e.generatedAt);
}

function readAll() {
  try {
    const obj = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {};
    return Object.fromEntries(Object.entries(obj).filter(([, v]) => isValidEntry(v)));
  } catch {
    return {};
  }
}

function writeAll(obj) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch {
    /* storage unavailable or quota hit — result survives in memory this session */
  }
}

export function loadSurfaces() {
  return readAll();
}

/** Save one surface result; returns the updated map. Callers pass a fresh
 *  loadSurfaces() read so a save never clobbers another browser tab's cache. */
export function saveSurface(id, result, existing) {
  const next = { ...existing, [id]: result };
  writeAll(next);
  return next;
}

/** Drop one surface's cache; returns the updated map. */
export function clearSurface(id, existing) {
  const next = { ...existing };
  delete next[id];
  writeAll(next);
  return next;
}
