// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '../src/i18n';
import { Modal } from '../src/admin/Modal';

afterEach(() => {
  document.body.innerHTML = '';
});

function renderModal(onClose = vi.fn()) {
  const utils = render(
    <Modal title="Test title" sub="sub" onClose={onClose}>
      <input aria-label="field" />
    </Modal>,
  );
  return { onClose, ...utils };
}

describe('Modal a11y contract', () => {
  it('exposes a labelled modal dialog wired to its title', () => {
    renderModal();
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const labelId = dialog.getAttribute('aria-labelledby');
    expect(labelId).toBeTruthy();
    expect(document.getElementById(labelId!)?.textContent).toBe('Test title');
  });

  it('gives the close button a real (non-glyph) aria-label from i18n', () => {
    renderModal();
    // '✕' must not be the accessible name; the i18n label is
    expect(screen.queryByRole('button', { name: '✕' })).toBeNull();
    expect(screen.getByLabelText('إغلاق النافذة')).toBeTruthy();
  });

  it('moves focus inside the dialog on open', () => {
    renderModal();
    const dialog = screen.getByRole('dialog');
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('closes on Escape', () => {
    const { onClose } = renderModal();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on backdrop click but not on a click inside the panel', () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByRole('dialog')); // panel — stopPropagation guards it
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(document.querySelector('.ad-modal')!); // the backdrop itself
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('returns focus to the opener on close', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    expect(document.activeElement).toBe(opener);

    const { unmount } = renderModal();
    expect(document.activeElement).not.toBe(opener); // focus pulled into the dialog

    unmount();
    expect(document.activeElement).toBe(opener); // and handed back
  });
});
