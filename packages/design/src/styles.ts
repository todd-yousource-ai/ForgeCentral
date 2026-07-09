// packages/design/src/styles.ts -- component stylesheet (F0.2b).
//
// The visual styling for the component shells, as a CSS string the consumer injects alongside
// `tokensToCss()`. Every value references a design token via a `--fc-*` custom property; there are NO
// color literals here (INV-CONSOLE-DESIGN-SEMANTIC-COLOR), so a component's look changes only by editing
// a token. Components render semantic classNames (`fc-badge`, `fc-tab--active`, ...); this stylesheet
// gives them their appearance and interaction states (hover/focus).

/** The Console component stylesheet (inject with `tokensToCss()` at the app root). */
export function componentStyles(): string {
  return `
.fc-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--fc-space-xs);
  padding: 2px var(--fc-space-sm);
  border-radius: var(--fc-radius-pill);
  font-family: var(--fc-font-fontFamily-sans);
  font-size: var(--fc-font-size-xs);
  font-weight: var(--fc-font-weight-semibold);
  line-height: var(--fc-font-lineHeight-tight);
  color: var(--fc-color-text-muted);
  background: color-mix(in srgb, var(--fc-color-text-muted) 16%, transparent);
}
.fc-badge--good { color: var(--fc-color-status-good); background: color-mix(in srgb, var(--fc-color-status-good) 16%, transparent); }
.fc-badge--caution { color: var(--fc-color-status-caution); background: color-mix(in srgb, var(--fc-color-status-caution) 16%, transparent); }
.fc-badge--critical { color: var(--fc-color-status-critical); background: color-mix(in srgb, var(--fc-color-status-critical) 16%, transparent); }
.fc-badge--quarantine { color: var(--fc-color-status-quarantine); background: color-mix(in srgb, var(--fc-color-status-quarantine) 16%, transparent); }
.fc-badge--info { color: var(--fc-color-status-info); background: color-mix(in srgb, var(--fc-color-status-info) 16%, transparent); }

.fc-score-ring { position: relative; display: inline-grid; place-items: center; }
.fc-score-ring__track { fill: none; stroke: var(--fc-color-surface-border); }
.fc-score-ring__value { fill: none; stroke-linecap: round; transform: rotate(-90deg); transform-origin: center; transition: stroke-dasharray var(--fc-motion-duration-base) var(--fc-motion-easing-standard); }
.fc-score-ring--good .fc-score-ring__value { stroke: var(--fc-color-status-good); }
.fc-score-ring--caution .fc-score-ring__value { stroke: var(--fc-color-status-caution); }
.fc-score-ring--critical .fc-score-ring__value { stroke: var(--fc-color-status-critical); }
.fc-score-ring__num { position: absolute; font-family: var(--fc-font-fontFamily-sans); font-weight: var(--fc-font-weight-bold); font-size: var(--fc-font-size-md); color: var(--fc-color-text-primary); }

.fc-kpi {
  display: flex;
  flex-direction: column;
  gap: var(--fc-space-sm);
  padding: var(--fc-space-lg);
  border-radius: var(--fc-radius-lg);
  background: var(--fc-color-surface-card);
  border: 1px solid var(--fc-color-surface-border);
}
.fc-kpi__head { display: flex; align-items: center; justify-content: space-between; gap: var(--fc-space-md); }
.fc-kpi__label { font-family: var(--fc-font-fontFamily-sans); font-size: var(--fc-font-size-sm); color: var(--fc-color-text-muted); }
.fc-kpi__value { font-family: var(--fc-font-fontFamily-sans); font-size: var(--fc-font-size-2xl); font-weight: var(--fc-font-weight-bold); color: var(--fc-color-text-primary); }

.fc-tabs { display: inline-flex; gap: var(--fc-space-xs); border-bottom: 1px solid var(--fc-color-surface-border); }
.fc-tab {
  appearance: none;
  border: 0;
  background: transparent;
  padding: var(--fc-space-sm) var(--fc-space-md);
  font-family: var(--fc-font-fontFamily-sans);
  font-size: var(--fc-font-size-md);
  color: var(--fc-color-text-muted);
  border-bottom: 2px solid transparent;
  cursor: pointer;
}
.fc-tab:hover { color: var(--fc-color-text-primary); }
.fc-tab:focus-visible { outline: 2px solid var(--fc-color-status-info); outline-offset: 2px; }
.fc-tab--active { color: var(--fc-color-text-primary); border-bottom-color: var(--fc-color-brand-primary); }
`;
}
