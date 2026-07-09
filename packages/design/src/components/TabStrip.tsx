// packages/design/src/components/TabStrip.tsx -- the secondary-navigation tab strip (F0.2b).
//
// The horizontal tab strip under a page title (AIOps tabs, Reports tabs, Settings tabs). Implements the
// ARIA tablist pattern: `role=tablist`/`tab`, `aria-selected`, roving `tabindex`, and Left/Right/Home/End
// keyboard navigation (WCAG 2.1.1). Controlled: the parent owns `activeId` and is told of a change.

import type { KeyboardEvent, ReactElement } from 'react';

export interface TabItem {
  readonly id: string;
  readonly label: string;
}

export interface TabStripProps {
  readonly tabs: readonly TabItem[];
  readonly activeId: string;
  readonly onChange: (id: string) => void;
  /** Names the tablist for assistive tech (e.g. "AIOps sections"). */
  readonly ariaLabel: string;
}

export function TabStrip({ tabs, activeId, onChange, ariaLabel }: TabStripProps): ReactElement {
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const current = tabs.findIndex((t) => t.id === activeId);
    if (current < 0) return;
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') nextIndex = (current + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') nextIndex = (current - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = tabs.length - 1;
    if (nextIndex === null) return;
    const next = tabs[nextIndex];
    if (next) {
      event.preventDefault();
      onChange(next.id);
    }
  }

  return (
    <div role="tablist" aria-label={ariaLabel} className="fc-tabs" onKeyDown={onKeyDown}>
      {tabs.map((tab) => {
        const selected = tab.id === activeId;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`fc-tab-${tab.id}`}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            className={`fc-tab${selected ? ' fc-tab--active' : ''}`}
            onClick={() => {
              onChange(tab.id);
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
