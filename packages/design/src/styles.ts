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

.fc-scrim {
  position: fixed;
  inset: 0;
  display: flex;
  justify-content: flex-end;
  background: color-mix(in srgb, var(--fc-color-surface-canvas) 60%, transparent);
  z-index: 100;
}
.fc-scrim--center { justify-content: center; align-items: center; }
.fc-scrim__catch { position: absolute; inset: 0; appearance: none; border: 0; background: transparent; cursor: default; }

.fc-drawer {
  position: relative;
  display: flex;
  flex-direction: column;
  width: min(480px, 100%);
  height: 100%;
  background: var(--fc-color-surface-card);
  border-left: 1px solid var(--fc-color-surface-border);
  box-shadow: var(--fc-elevation-drawer);
  animation: fc-drawer-in var(--fc-motion-duration-base) var(--fc-motion-easing-standard);
}
@keyframes fc-drawer-in { from { transform: translateX(16px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .fc-drawer { animation: none; } }
.fc-drawer__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--fc-space-md);
  padding: var(--fc-space-lg);
  border-bottom: 1px solid var(--fc-color-surface-border);
}
.fc-drawer__title { margin: 0; font-family: var(--fc-font-fontFamily-sans); font-size: var(--fc-font-size-lg); font-weight: var(--fc-font-weight-semibold); color: var(--fc-color-text-primary); }
.fc-drawer__close {
  appearance: none;
  border: 0;
  background: transparent;
  padding: var(--fc-space-xs) var(--fc-space-sm);
  font-size: var(--fc-font-size-xl);
  line-height: var(--fc-font-lineHeight-tight);
  color: var(--fc-color-text-muted);
  cursor: pointer;
}
.fc-drawer__close:hover { color: var(--fc-color-text-primary); }
.fc-drawer__close:focus-visible { outline: 2px solid var(--fc-color-status-info); outline-offset: 2px; }
.fc-drawer__title { flex: 1; }
.fc-drawer__back {
  appearance: none;
  border: 0;
  background: transparent;
  padding: var(--fc-space-xs) var(--fc-space-sm);
  font-size: var(--fc-font-size-xl);
  line-height: var(--fc-font-lineHeight-tight);
  color: var(--fc-color-text-muted);
  cursor: pointer;
}
.fc-drawer__back:hover { color: var(--fc-color-text-primary); }
.fc-drawer__back:focus-visible { outline: 2px solid var(--fc-color-status-info); outline-offset: 2px; }
.fc-drawer__body { flex: 1; overflow-y: auto; padding: var(--fc-space-lg); }

.fc-members__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--fc-space-xs); }
.fc-members__row {
  appearance: none;
  border: 0;
  width: 100%;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--fc-space-md);
  padding: var(--fc-space-sm) var(--fc-space-md);
  border-radius: var(--fc-radius-sm);
  background: transparent;
  text-align: left;
  cursor: pointer;
  color: var(--fc-color-text-primary);
}
.fc-members__row:hover { background: color-mix(in srgb, var(--fc-color-text-muted) 12%, transparent); }
.fc-members__row:focus-visible { outline: 2px solid var(--fc-color-status-info); outline-offset: 2px; }
.fc-members__name { font-weight: var(--fc-font-weight-medium); overflow-wrap: anywhere; }
.fc-members__count { color: var(--fc-color-text-muted); font-size: var(--fc-font-size-sm); white-space: nowrap; }
.fc-members__note { margin: 0; color: var(--fc-color-text-muted); }
.fc-members__skeleton { height: 40px; border-radius: var(--fc-radius-sm); background: color-mix(in srgb, var(--fc-color-text-muted) 12%, transparent); }
.fc-members--error { display: flex; flex-direction: column; gap: var(--fc-space-md); align-items: flex-start; }

.fc-dialog {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--fc-space-md);
  width: min(420px, 100%);
  padding: var(--fc-space-xl);
  border-radius: var(--fc-radius-lg);
  background: var(--fc-color-surface-card);
  border: 1px solid var(--fc-color-surface-border);
  box-shadow: var(--fc-elevation-popover);
}
.fc-dialog__title { margin: 0; font-family: var(--fc-font-fontFamily-sans); font-size: var(--fc-font-size-lg); font-weight: var(--fc-font-weight-semibold); color: var(--fc-color-text-primary); }
.fc-dialog__desc { margin: 0; font-family: var(--fc-font-fontFamily-sans); font-size: var(--fc-font-size-md); line-height: var(--fc-font-lineHeight-normal); color: var(--fc-color-text-muted); }
.fc-dialog__actions { display: flex; justify-content: flex-end; gap: var(--fc-space-sm); margin-top: var(--fc-space-sm); }

.fc-btn {
  appearance: none;
  border: 1px solid transparent;
  border-radius: var(--fc-radius-md);
  padding: var(--fc-space-sm) var(--fc-space-lg);
  font-family: var(--fc-font-fontFamily-sans);
  font-size: var(--fc-font-size-md);
  font-weight: var(--fc-font-weight-semibold);
  cursor: pointer;
}
.fc-btn:focus-visible { outline: 2px solid var(--fc-color-status-info); outline-offset: 2px; }
.fc-btn--primary { color: var(--fc-color-text-onBrand); background: var(--fc-color-brand-primary); }
.fc-btn--critical { color: var(--fc-color-text-primary); background: var(--fc-color-status-critical); }
.fc-btn--ghost { color: var(--fc-color-text-primary); background: transparent; border-color: var(--fc-color-surface-border); }
.fc-btn--ghost:hover { background: color-mix(in srgb, var(--fc-color-text-muted) 12%, transparent); }

/* -- the entity drawer body (IP-CONSOLE-12 DR.2) -- */
.fc-entity-detail { display: flex; flex-direction: column; gap: var(--fc-space-lg); }
.fc-entity-section { display: flex; flex-direction: column; gap: var(--fc-space-sm); }
.fc-entity-section__title { margin: 0; font-family: var(--fc-font-fontFamily-sans); font-size: var(--fc-font-size-sm); font-weight: var(--fc-font-weight-semibold); text-transform: uppercase; letter-spacing: 0.04em; color: var(--fc-color-text-muted); }
.fc-entity-section__note { margin: 0; font-family: var(--fc-font-fontFamily-sans); font-size: var(--fc-font-size-sm); color: var(--fc-color-text-muted); }
.fc-entity-section__error { margin: 0; font-family: var(--fc-font-fontFamily-sans); font-size: var(--fc-font-size-sm); color: var(--fc-color-status-critical); }

.fc-entity-header { display: flex; align-items: center; gap: var(--fc-space-lg); }
.fc-entity-header__meta { display: flex; flex-direction: column; gap: var(--fc-space-xs); }
.fc-entity-header__kind { font-family: var(--fc-font-fontFamily-sans); font-size: var(--fc-font-size-sm); color: var(--fc-color-text-muted); }

.fc-entity-info { margin: 0; display: grid; gap: var(--fc-space-sm); }
.fc-entity-info__row { display: grid; grid-template-columns: 96px 1fr; align-items: baseline; gap: var(--fc-space-md); }
.fc-entity-info__row dt { font-family: var(--fc-font-fontFamily-sans); font-size: var(--fc-font-size-sm); color: var(--fc-color-text-muted); }
.fc-entity-info__row dd { margin: 0; font-family: var(--fc-font-fontFamily-sans); font-size: var(--fc-font-size-sm); color: var(--fc-color-text-primary); }
.fc-entity-info__tags { display: flex; flex-wrap: wrap; gap: var(--fc-space-xs); }

.fc-entity-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--fc-space-xs); }
.fc-entity-link {
  appearance: none;
  width: 100%;
  border: 0;
  background: transparent;
  padding: var(--fc-space-xs) var(--fc-space-sm);
  border-radius: var(--fc-radius-sm);
  font-family: var(--fc-font-fontFamily-sans);
  font-size: var(--fc-font-size-sm);
  text-align: left;
  color: var(--fc-color-text-primary);
  cursor: pointer;
}
.fc-entity-link:hover { background: color-mix(in srgb, var(--fc-color-text-muted) 12%, transparent); }
.fc-entity-link:focus-visible { outline: 2px solid var(--fc-color-status-info); outline-offset: 2px; }

.fc-entity-cap { display: flex; align-items: baseline; justify-content: space-between; gap: var(--fc-space-sm); padding: var(--fc-space-xs) var(--fc-space-sm); }
.fc-entity-cap__name { font-family: var(--fc-font-fontFamily-sans); font-size: var(--fc-font-size-sm); color: var(--fc-color-text-primary); }
.fc-entity-cap__surface { font-family: var(--fc-font-fontFamily-sans); font-size: var(--fc-font-size-xs); color: var(--fc-color-text-muted); }

.fc-entity-policy { display: flex; align-items: center; gap: var(--fc-space-sm); }
.fc-entity-policy__name { flex: 1; }
.fc-entity-policy__origin { font-size: var(--fc-font-size-xs); color: var(--fc-color-text-muted); }

.fc-entity-decision { display: flex; align-items: center; gap: var(--fc-space-sm); }
.fc-entity-decision__summary { flex: 1; }
.fc-entity-decision__time { font-size: var(--fc-font-size-xs); color: var(--fc-color-text-muted); }
.fc-entity-conn { display: flex; align-items: baseline; justify-content: space-between; gap: var(--fc-space-md); padding: var(--fc-space-xs) 0; }
.fc-entity-conn__dest { overflow-wrap: anywhere; }
.fc-entity-conn__kind { color: var(--fc-color-text-muted); font-size: var(--fc-font-size-sm); white-space: nowrap; }

.fc-entity-actions { display: flex; flex-wrap: wrap; gap: var(--fc-space-sm); padding-top: var(--fc-space-sm); border-top: 1px solid var(--fc-color-surface-border); }
.fc-entity-action {
  appearance: none;
  border: 1px solid var(--fc-color-surface-border);
  border-radius: var(--fc-radius-md);
  padding: var(--fc-space-sm) var(--fc-space-md);
  font-family: var(--fc-font-fontFamily-sans);
  font-size: var(--fc-font-size-sm);
  font-weight: var(--fc-font-weight-semibold);
  color: var(--fc-color-text-primary);
  background: transparent;
  cursor: pointer;
}
.fc-entity-action:hover { background: color-mix(in srgb, var(--fc-color-text-muted) 12%, transparent); }
.fc-entity-action:focus-visible { outline: 2px solid var(--fc-color-status-info); outline-offset: 2px; }
.fc-entity-action--critical { color: var(--fc-color-status-critical); border-color: color-mix(in srgb, var(--fc-color-status-critical) 40%, transparent); }
.fc-entity-action--critical:hover { background: color-mix(in srgb, var(--fc-color-status-critical) 14%, transparent); }

.fc-sparkline { display: inline-flex; align-items: center; color: var(--fc-color-text-muted); font-family: var(--fc-font-fontFamily-sans); font-size: var(--fc-font-size-xs); }
.fc-sparkline__line { stroke: var(--fc-color-brand-primary); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.fc-sparkline__end { fill: var(--fc-color-brand-primary); }

.fc-skeleton { display: flex; flex-direction: column; gap: var(--fc-space-xs); }
.fc-skeleton__line { height: 10px; border-radius: var(--fc-radius-sm); background: var(--fc-color-surface-border); animation: fc-skeleton-pulse var(--fc-motion-duration-base) var(--fc-motion-easing-standard) infinite alternate; }
.fc-skeleton__line--short { width: 60%; }
@keyframes fc-skeleton-pulse { from { opacity: 0.5; } to { opacity: 0.85; } }

.fc-visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }

.fc-table__scroll { overflow-x: auto; border: 1px solid var(--fc-color-surface-border); border-radius: var(--fc-radius-lg); background: var(--fc-color-surface-card); }
.fc-table { width: 100%; border-collapse: collapse; font-family: var(--fc-font-fontFamily-sans); font-size: var(--fc-font-size-sm); color: var(--fc-color-text-primary); }
.fc-table thead th { position: sticky; top: 0; z-index: 1; text-align: left; padding: var(--fc-space-sm) var(--fc-space-md); font-size: var(--fc-font-size-xs); font-weight: var(--fc-font-weight-semibold); color: var(--fc-color-text-muted); background: var(--fc-color-surface-card); border-bottom: 1px solid var(--fc-color-surface-border); white-space: nowrap; }
.fc-table tbody td { padding: var(--fc-space-sm) var(--fc-space-md); border-bottom: 1px solid color-mix(in srgb, var(--fc-color-surface-border) 60%, transparent); vertical-align: top; }
.fc-table__cell--end { text-align: right; }
.fc-table__row--interactive { cursor: pointer; }
.fc-table__row--interactive:hover { background: color-mix(in srgb, var(--fc-color-text-muted) 10%, transparent); }
.fc-table__row--interactive:focus-visible { outline: 2px solid var(--fc-color-status-info); outline-offset: -2px; }
.fc-table__empty { padding: var(--fc-space-xl) var(--fc-space-md); text-align: center; color: var(--fc-color-text-muted); }

.fc-overview-flow { display: block; width: 100%; }
.fc-overview-flow svg { display: block; width: 100%; height: auto; }
.fc-overview-flow__field { opacity: 0.25; }
.fc-overview-flow__hex { stroke: var(--fc-color-surface-border); stroke-width: 1; }
.fc-overview-flow__edge { stroke: var(--fc-color-text-muted); fill: none; stroke-linecap: round; opacity: 0.5; transition: opacity var(--fc-motion-duration-base) var(--fc-motion-easing-standard); }
.fc-overview-flow__edge--users { stroke: var(--fc-color-flow-users); }
.fc-overview-flow__edge--devices { stroke: var(--fc-color-flow-devices); }
.fc-overview-flow__edge--agents { stroke: var(--fc-color-flow-agents); }
.fc-overview-flow__edge--muted { stroke: var(--fc-color-text-muted); }
.fc-overview-flow__node rect { fill: var(--fc-color-surface-card); stroke: var(--fc-color-surface-border); stroke-width: 1.5; }
.fc-overview-flow__node--users rect { stroke: var(--fc-color-flow-users); }
.fc-overview-flow__node--devices rect { stroke: var(--fc-color-flow-devices); }
.fc-overview-flow__node--agents rect { stroke: var(--fc-color-flow-agents); }
.fc-overview-flow__node--objects rect { stroke: var(--fc-color-flow-objects); }
.fc-overview-flow__node--muted rect { stroke: var(--fc-color-text-muted); }
.fc-overview-flow__node-label { fill: var(--fc-color-text-primary); font-family: var(--fc-font-fontFamily-sans); font-size: var(--fc-font-size-sm); font-weight: var(--fc-font-weight-semibold); }
.fc-overview-flow__node-count { fill: var(--fc-color-text-muted); font-family: var(--fc-font-fontFamily-sans); font-size: var(--fc-font-size-xs); }
.fc-overview-flow__zone rect { fill: color-mix(in srgb, var(--fc-color-text-muted) 12%, transparent); stroke: var(--fc-color-surface-border); stroke-width: 1.5; }
.fc-overview-flow__zone--good rect { fill: color-mix(in srgb, var(--fc-color-status-good) 14%, transparent); stroke: var(--fc-color-status-good); }
.fc-overview-flow__zone--caution rect { fill: color-mix(in srgb, var(--fc-color-status-caution) 14%, transparent); stroke: var(--fc-color-status-caution); }
.fc-overview-flow__zone--critical rect { fill: color-mix(in srgb, var(--fc-color-status-critical) 16%, transparent); stroke: var(--fc-color-status-critical); }
.fc-overview-flow__zone-label { fill: var(--fc-color-text-primary); font-family: var(--fc-font-fontFamily-sans); font-size: var(--fc-font-size-md); font-weight: var(--fc-font-weight-bold); }
.fc-overview-flow__zone-risk { fill: var(--fc-color-text-muted); font-family: var(--fc-font-fontFamily-sans); font-size: var(--fc-font-size-xs); font-weight: var(--fc-font-weight-semibold); }
.fc-overview-flow__zone--good .fc-overview-flow__zone-risk { fill: var(--fc-color-status-good); }
.fc-overview-flow__zone--caution .fc-overview-flow__zone-risk { fill: var(--fc-color-status-caution); }
.fc-overview-flow__zone--critical .fc-overview-flow__zone-risk { fill: var(--fc-color-status-critical); }
.fc-overview-flow__empty-note { fill: var(--fc-color-text-muted); font-family: var(--fc-font-fontFamily-sans); font-size: var(--fc-font-size-sm); }
.fc-overview-flow__skeleton { fill: var(--fc-color-surface-border); animation: fc-skeleton-pulse var(--fc-motion-duration-base) var(--fc-motion-easing-standard) infinite alternate; }

/* Overview redesign (Sankey) -- IP-CONSOLE-01 RD.2. Colours are tokens only. */
.fc-ov-wrap { position: relative; display: block; width: 100%; }
.fc-ov { display: block; width: 100%; }
.fc-ov svg { display: block; width: 100%; height: auto; }
/* The keyboard/screen-reader path to open a container's members: each button is visually hidden (the
   visible affordance is the clickable ring) but reachable by tab, and reveals itself on focus. */
.fc-ov__container-nav {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.fc-ov__container-nav:focus-visible {
  position: absolute;
  top: var(--fc-space-sm);
  left: var(--fc-space-sm);
  z-index: 1;
  width: auto;
  height: auto;
  margin: 0;
  padding: var(--fc-space-xs) var(--fc-space-sm);
  overflow: visible;
  clip: auto;
  background: var(--fc-color-surface-raised);
  color: var(--fc-color-text-primary);
  border-radius: var(--fc-radius-sm);
  outline: 2px solid var(--fc-color-status-info);
  outline-offset: 2px;
  cursor: pointer;
}
.fc-ov__ribbons { mix-blend-mode: screen; }
.fc-ov__ring { fill: none; stroke-width: 1; stroke-dasharray: 0.5 4; stroke-linecap: round; opacity: 0.38; }
.fc-ov__ring--users { stroke: var(--fc-color-flow-users); }
.fc-ov__ring--devices { stroke: var(--fc-color-flow-devices); }
.fc-ov__ring--agents { stroke: var(--fc-color-flow-agents); }
.fc-ov__ring--objects { stroke: var(--fc-color-flow-objects); }
.fc-ov__ring--muted { stroke: var(--fc-color-text-muted); }
.fc-ov__count { fill: var(--fc-color-text-soft); font-family: var(--fc-font-fontFamily-sans); font-weight: 300; }
.fc-ov__label { fill: var(--fc-color-text-muted); font-family: var(--fc-font-fontFamily-sans); font-weight: 600; letter-spacing: 0.2em; }
.fc-ov__dest-label { fill: var(--fc-color-flow-objects); font-family: var(--fc-font-fontFamily-sans); font-weight: 600; letter-spacing: 0.08em; }
.fc-ov__ray { stroke-width: 1; stroke-linecap: round; }
.fc-ov__vtz--good .fc-ov__ray { stroke: var(--fc-color-status-good); }
.fc-ov__vtz--caution .fc-ov__ray { stroke: var(--fc-color-status-caution); }
.fc-ov__vtz--critical .fc-ov__ray { stroke: var(--fc-color-status-critical); }
.fc-ov__rim { stroke-width: 0.6; }
.fc-ov__vtz--good .fc-ov__rim { stroke: var(--fc-color-status-good); stroke-opacity: 0.4; }
.fc-ov__vtz--caution .fc-ov__rim { stroke: var(--fc-color-status-caution); stroke-opacity: 0.4; }
.fc-ov__vtz--critical .fc-ov__rim { stroke: var(--fc-color-status-critical); stroke-opacity: 0.4; }
.fc-ov__vtz-disc { stroke-width: 1.25; stroke-opacity: 0.6; }
.fc-ov__vtz--good .fc-ov__vtz-disc { fill: color-mix(in srgb, var(--fc-color-status-good) 8%, var(--fc-color-surface-card)); stroke: var(--fc-color-status-good); }
.fc-ov__vtz--caution .fc-ov__vtz-disc { fill: color-mix(in srgb, var(--fc-color-status-caution) 8%, var(--fc-color-surface-card)); stroke: var(--fc-color-status-caution); }
.fc-ov__vtz--critical .fc-ov__vtz-disc { fill: color-mix(in srgb, var(--fc-color-status-critical) 8%, var(--fc-color-surface-card)); stroke: var(--fc-color-status-critical); }
.fc-ov__vtz-org { fill: var(--fc-color-text-muted); font-family: var(--fc-font-fontFamily-sans); font-weight: 600; }
.fc-ov__vtz-name { fill: var(--fc-color-text-primary); font-family: var(--fc-font-fontFamily-sans); font-weight: 700; }
.fc-ov__vtz-risk { font-family: var(--fc-font-fontFamily-sans); font-weight: 600; }
.fc-ov__vtz--good .fc-ov__vtz-risk { fill: var(--fc-color-status-good); }
.fc-ov__vtz--caution .fc-ov__vtz-risk { fill: var(--fc-color-status-caution); }
.fc-ov__vtz--critical .fc-ov__vtz-risk { fill: var(--fc-color-status-critical); }
.fc-ov__app { fill: var(--fc-color-text-primary); font-family: var(--fc-font-fontFamily-sans); }
.fc-ov__app--more { fill: var(--fc-color-text-muted); }
.fc-ov__app-dot { stroke: var(--fc-color-flow-objects); stroke-width: 1.1; }
.fc-ov__app-dot--more { stroke: var(--fc-color-text-muted); }
.fc-ov__empty-note { fill: var(--fc-color-text-muted); font-family: var(--fc-font-fontFamily-sans); font-size: 15px; }
.fc-ov__skeleton { fill: var(--fc-color-surface-border); animation: fc-skeleton-pulse var(--fc-motion-duration-base) var(--fc-motion-easing-standard) infinite alternate; }
.fc-ov__corona { transform-box: fill-box; transform-origin: center; animation: fc-ov-spin 120s linear infinite; }
@keyframes fc-ov-spin { to { transform: rotate(360deg); } }
`;
}
