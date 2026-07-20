// Horizontal scrollable tab strip. Proper tab semantics: roving tabindex,
// arrow-key navigation, aria-selected.

export default function TabBar({ tabs, activeId, onSelect }) {
  const onKeyDown = (e) => {
    const idx = tabs.findIndex((t) => t.id === activeId);
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const dir = e.key === 'ArrowRight' ? 1 : -1;
      const next = tabs[(idx + dir + tabs.length) % tabs.length];
      onSelect(next.id);
      e.currentTarget.querySelector(`#tab-${next.id}`)?.focus();
    }
  };

  return (
    <div className="tabbar" role="tablist" aria-label="MatchPoint26 surfaces" onKeyDown={onKeyDown}>
      {tabs.map((t) => (
        <button
          key={t.id}
          id={`tab-${t.id}`}
          role="tab"
          aria-selected={t.id === activeId}
          // Only the active panel exists in the DOM — a dangling aria-controls
          // on inactive tabs would point assistive tech at nothing.
          aria-controls={t.id === activeId ? `panel-${t.id}` : undefined}
          tabIndex={t.id === activeId ? 0 : -1}
          className={`tab${t.id === activeId ? ' tab-active' : ''}`}
          onClick={() => onSelect(t.id)}
        >
          {t.label}
          {t.badge && <span className="tab-badge">{t.badge}</span>}
        </button>
      ))}
    </div>
  );
}
