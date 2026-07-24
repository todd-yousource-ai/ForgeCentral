// packages/design/test/accordion-group.test.tsx -- the collapsible-group primitive (IP-CONSOLE-05 P5.3),
// tier 1.
//
// Proves the disclosure contract: the group starts in its `defaultOpen` state, the toggle carries
// aria-expanded + controls the panel, clicking flips it, the meta slot renders, and a collapsed group
// removes its content from the tree (hidden) rather than merely hiding it visually. Accessibility is
// asserted through role/name queries only (the rest of the design suite's convention).

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AccordionGroup } from '../src/components/AccordionGroup.js';
import { Badge } from '../src/components/Badge.js';

describe('AccordionGroup', () => {
  it('starts collapsed by default and hides its content', () => {
    render(
      <AccordionGroup title="YouSource.Corp" label="YouSource.Corp, 3 policies">
        <p>panel body</p>
      </AccordionGroup>,
    );
    const toggle = screen.getByRole('button', { name: 'YouSource.Corp, 3 policies' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    // Collapsed: content is not rendered (removed from the tree, not merely visually clipped).
    expect(screen.queryByText('panel body')).not.toBeInTheDocument();
  });

  it('expands on click and reveals its content, flipping aria-expanded', () => {
    render(
      <AccordionGroup title="YouSource.Corp" label="YouSource.Corp, 3 policies">
        <p>panel body</p>
      </AccordionGroup>,
    );
    const toggle = screen.getByRole('button', { name: 'YouSource.Corp, 3 policies' });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('panel body')).toBeInTheDocument();
    // Toggling again collapses it.
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('panel body')).not.toBeInTheDocument();
  });

  it('honors defaultOpen and renders the meta slot', () => {
    render(
      <AccordionGroup
        title="YouSource.Public"
        meta={<Badge variant="neutral">2</Badge>}
        defaultOpen
        label="YouSource.Public, 2 policies"
      >
        <p>open body</p>
      </AccordionGroup>,
    );
    expect(screen.getByRole('button', { name: 'YouSource.Public, 2 policies' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByText('open body')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });
});
