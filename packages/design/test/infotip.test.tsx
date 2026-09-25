// packages/design/test/infotip.test.tsx -- GD.12 InfoTip and FieldHint, GD.13 DisabledReason a11y tests.

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DisabledReason, FieldHint, InfoTip } from '../src/index.js';

describe('InfoTip', () => {
  it('is a named button, collapsed, with no note text until opened', () => {
    render(<InfoTip label="Maximum edits">At most 64 edits per commit.</InfoTip>);
    const button = screen.getByRole('button', { name: 'About Maximum edits' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('At most 64 edits per commit.')).toBeNull();
  });

  it('opens on click into a live region the button controls, and closes on a second click', () => {
    render(<InfoTip label="Maximum edits">At most 64 edits per commit.</InfoTip>);
    const button = screen.getByRole('button', { name: 'About Maximum edits' });
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    const note = screen.getByRole('status');
    expect(note).toHaveTextContent('At most 64 edits per commit.');
    expect(button.getAttribute('aria-controls')).toBe(note.id);
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(note).toBeEmptyDOMElement();
  });

  it('closes on Escape and keeps focus on the button', () => {
    render(<InfoTip label="Maximum edits">At most 64 edits per commit.</InfoTip>);
    const button = screen.getByRole('button', { name: 'About Maximum edits' });
    button.focus();
    fireEvent.click(button);
    fireEvent.keyDown(button, { key: 'Escape' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveFocus();
  });

  it('is a plain button, so it never submits the form it sits in', () => {
    render(<InfoTip label="x">y</InfoTip>);
    expect(screen.getByRole('button', { name: 'About x' })).toHaveAttribute('type', 'button');
  });
});

describe('FieldHint', () => {
  it('renders a visible constraint line a field can name with aria-describedby', () => {
    render(
      <>
        <input aria-label="Value" aria-describedby="h1" />
        <FieldHint id="h1">At most 256 characters.</FieldHint>
      </>,
    );
    expect(screen.getByRole('textbox', { name: 'Value' })).toHaveAccessibleDescription(
      'At most 256 characters.',
    );
  });
});

describe('DisabledReason', () => {
  it('gives a disabled control a reason read with it', () => {
    render(
      <>
        <button type="button" disabled aria-describedby="r1">
          Commit
        </button>
        <DisabledReason id="r1">Under dual control: propose instead.</DisabledReason>
      </>,
    );
    expect(screen.getByRole('button', { name: 'Commit' })).toHaveAccessibleDescription(
      'Under dual control: propose instead.',
    );
  });
});
