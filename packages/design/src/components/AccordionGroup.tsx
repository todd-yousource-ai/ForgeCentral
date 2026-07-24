// packages/design/src/components/AccordionGroup.tsx -- the collapsible-group primitive (IP-CONSOLE-05 P5.3).
//
// A disclosure section: a header button that expands/collapses its content in place, with an optional
// right-aligned meta slot (e.g. a count badge). The first collapsible-group primitive in the design
// system; the Policies surface groups its per-VTZ policy tables in these (grounded on the `06-*.png`
// prototype). Native disclosure semantics for assistive tech: the toggle carries `aria-expanded` +
// `aria-controls`, the panel is a labelled region, and the collapsed panel is truly removed from the
// accessibility tree (`hidden`), never just visually clipped. All appearance comes from `--fc-*` tokens
// via the `.fc-accordion*` classes in styles.ts (no color literals here).

import { useId, useState, type ReactElement, type ReactNode } from 'react';

export interface AccordionGroupProps {
  /** The group heading content (e.g. a zone name). Rendered inside the toggle button. */
  readonly title: ReactNode;
  /** Optional right-aligned meta (e.g. a policy-count `Badge`). */
  readonly meta?: ReactNode;
  /** Whether the group starts expanded. Default collapsed. */
  readonly defaultOpen?: boolean;
  /** The accessible name for the toggle + panel (e.g. `YouSource.Corp, 3 policies`). */
  readonly label: string;
  /** The content revealed when expanded (rendered only while open). */
  readonly children: ReactNode;
}

/** A single collapsible group. Uncontrolled: it owns its open state, seeded by `defaultOpen`. */
export function AccordionGroup({
  title,
  meta,
  defaultOpen = false,
  label,
  children,
}: AccordionGroupProps): ReactElement {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  return (
    <section className="fc-accordion">
      <h3 className="fc-accordion__header">
        <button
          type="button"
          className="fc-accordion__toggle"
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={label}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="fc-accordion__chevron" aria-hidden="true">
            {open ? '▾' : '▸'}
          </span>
          <span className="fc-accordion__title">{title}</span>
          {meta !== undefined ? <span className="fc-accordion__meta">{meta}</span> : null}
        </button>
      </h3>
      <div
        id={panelId}
        className="fc-accordion__panel"
        role="region"
        aria-label={label}
        hidden={!open}
      >
        {open ? children : null}
      </div>
    </section>
  );
}
