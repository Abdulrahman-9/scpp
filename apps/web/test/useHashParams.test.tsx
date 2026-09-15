// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hashParam, isValidParamValue, useHashParams, writeHashParam } from '../src/registry/useHashParams';

/**
 * The URL contract every clickable statistic in this wave lands through (§5-ج).
 *
 * The defect it replaces was real and shipping: `Fields.tsx` did `useState(opParam())`, reading
 * the query string once at mount. A link that changes only the query string does not remount the
 * screen, so the filter never moved — and after this wave, most links land on the screen the
 * reader is already on. The first test here is that exact scenario.
 */

const OPERATORS = ['op-alwaha', 'op-badra'];

function Probe() {
  const p = useHashParams();
  return (
    <div>
      <span data-testid="op">{hashParam(p, 'op', OPERATORS)}</span>
      <span data-testid="tier">{hashParam(p, 'tier')}</span>
      <span data-testid="status">{hashParam(p, 'status')}</span>
      <span data-testid="prog">{hashParam(p, 'prog')}</span>
      <span data-testid="pending">{hashParam(p, 'pending')}</span>
      <span data-testid="stage">{hashParam(p, 'stage')}</span>
      <span data-testid="field">{hashParam(p, 'field', ['f-ahdab'])}</span>
    </div>
  );
}

/** Move the address bar the way a link click does, and let the listeners run. */
function goto(hash: string) {
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new Event('hashchange'));
  });
}

const read = (id: string) => screen.getByTestId(id).textContent;

beforeEach(() => { window.location.hash = ''; });
afterEach(() => { document.body.innerHTML = ''; window.location.hash = ''; });

describe('useHashParams — the params are state, not a mount-time snapshot', () => {
  it('reads the query string the screen was opened at', () => {
    window.location.hash = '#/admin/tenders?op=op-alwaha';
    render(<Probe />);
    expect(read('op')).toBe('op-alwaha');
  });

  it('RE-SYNCS when only the query string changes — the bug this hook exists to fix', () => {
    window.location.hash = '#/admin/tenders?op=op-alwaha';
    render(<Probe />);
    goto('#/admin/tenders?op=op-badra');
    expect(read('op')).toBe('op-badra');
  });

  it('clears a parameter that the next address drops', () => {
    window.location.hash = '#/admin/tenders?op=op-alwaha';
    render(<Probe />);
    goto('#/admin/tenders');
    expect(read('op')).toBe('');
  });

  it('reads every accepted name off one address', () => {
    window.location.hash = '#/x?op=op-badra&tier=JMC&status=delayed&prog=50-75&pending=1&stage=execute&field=f-ahdab';
    render(<Probe />);
    expect([read('op'), read('tier'), read('status'), read('prog'), read('pending'), read('stage'), read('field')])
      .toEqual(['op-badra', 'JMC', 'delayed', '50-75', '1', 'execute', 'f-ahdab']);
  });

  it('stops listening when the screen unmounts', () => {
    window.location.hash = '#/admin/tenders?op=op-alwaha';
    const { unmount } = render(<Probe />);
    unmount();
    // no listener may survive to touch a torn-down tree
    expect(() => goto('#/admin/tenders?op=op-badra')).not.toThrow();
  });
});

describe('the whitelist — a bad value narrows nothing, and never empties the registry', () => {
  it('ignores a value outside a closed vocabulary', () => {
    window.location.hash = '#/x?tier=EVERYONE&status=exploded&prog=1-2&pending=yes&stage=launch';
    render(<Probe />);
    expect([read('tier'), read('status'), read('prog'), read('pending'), read('stage')]).toEqual(['', '', '', '', '']);
  });

  it('accepts `status=open` — the union the follow-up room tile actually counts', () => {
    window.location.hash = '#/x?status=open';
    render(<Probe />);
    expect(read('status')).toBe('open');
  });

  it('ignores a record id the store does not know', () => {
    window.location.hash = '#/x?op=op-nonexistent&field=f-nonexistent';
    render(<Probe />);
    expect([read('op'), read('field')]).toEqual(['', '']);
  });

  it('ignores an id parameter when no allowed set is supplied — an id we cannot vouch for filters nothing', () => {
    const p = new URLSearchParams('op=op-alwaha');
    expect(hashParam(p, 'op')).toBe('');
    expect(hashParam(p, 'op', OPERATORS)).toBe('op-alwaha');
  });

  it('treats an empty value as absent rather than as a filter on the empty string', () => {
    expect(hashParam(new URLSearchParams('tier='), 'tier')).toBe('');
  });

  it('is case-sensitive on the closed vocabularies — the ladder is written one way', () => {
    expect(hashParam(new URLSearchParams('tier=jmc'), 'tier')).toBe('');
    expect(hashParam(new URLSearchParams('tier=JMC'), 'tier')).toBe('JMC');
  });
});

describe('writeHashParam — the address never disagrees with the screen', () => {
  it('sets a parameter while keeping the path', () => {
    window.location.hash = '#/admin/tenders';
    writeHashParam('op', 'op-badra');
    expect(window.location.hash).toBe('#/admin/tenders?op=op-badra');
  });

  it('replaces one parameter and leaves the others untouched', () => {
    window.location.hash = '#/admin/tenders?op=op-alwaha&status=delayed';
    writeHashParam('op', 'op-badra');
    expect(window.location.hash).toContain('op=op-badra');
    expect(window.location.hash).toContain('status=delayed');
    expect(window.location.hash.startsWith('#/admin/tenders?')).toBe(true);
  });

  it('removes a parameter on null — what dismissing a filter chip does', () => {
    window.location.hash = '#/admin/tenders?op=op-alwaha&status=delayed';
    writeHashParam('op', null);
    expect(window.location.hash).toBe('#/admin/tenders?status=delayed');
  });

  it('drops the «?» entirely once the last parameter goes', () => {
    window.location.hash = '#/admin/contracts?prog=0-25';
    writeHashParam('prog', null);
    expect(window.location.hash).toBe('#/admin/contracts');
  });

  it('treats an empty string as a removal, so «all» never writes «op=» into the address', () => {
    window.location.hash = '#/admin/fields?op=op-alwaha';
    writeHashParam('op', '');
    expect(window.location.hash).toBe('#/admin/fields');
  });
});

/**
 * PHASE-4 FIX — the writer validates before it writes.
 *
 * `hashParam` has always IGNORED a value it cannot accept, so a tampered link narrows nothing. The
 * writer had no such guard: it wrote whatever it was handed. `?vmin=notanumber` therefore reached
 * the address bar, the reader ignored it, and the screen showed an unnarrowed registry under an
 * address claiming a filter — a link that can be copied and sent, promising a window nobody will
 * ever see. Read and write now share one vocabulary, so the address can only ever hold narrowings
 * that exist.
 */
describe('writeHashParam validates FIRST — the address never claims a filter the reader will ignore', () => {
  it('refuses a malformed bound and leaves the address exactly as it was', () => {
    window.location.hash = '#/admin/tenders?op=op-alwaha';
    expect(writeHashParam('vmin', 'notanumber')).toBe(false);
    expect(window.location.hash).toBe('#/admin/tenders?op=op-alwaha');
  });

  it('refuses a date that the calendar does not contain, not merely one of the wrong shape', () => {
    window.location.hash = '#/admin/tenders';
    expect(writeHashParam('from', '2026-02-31')).toBe(false);
    expect(writeHashParam('from', '2026-13-01')).toBe(false);
    expect(window.location.hash).toBe('#/admin/tenders');
    expect(writeHashParam('from', '2026-02-28')).toBe(true);
    expect(window.location.hash).toBe('#/admin/tenders?from=2026-02-28');
  });

  it('refuses a value outside a closed vocabulary', () => {
    window.location.hash = '#/admin/tenders';
    expect(writeHashParam('tier', 'EVERYONE')).toBe(false);
    expect(writeHashParam('status', 'exploded')).toBe(false);
    expect(window.location.hash).toBe('#/admin/tenders');
  });

  it('does NOT wipe an existing good value when a bad one is offered for the same name', () => {
    window.location.hash = '#/admin/tenders?vmin=1000000';
    writeHashParam('vmin', 'oops');
    // silently clearing the window would be a second lie: the reader asked for neither
    expect(window.location.hash).toBe('#/admin/tenders?vmin=1000000');
  });

  it('still allows a REMOVAL through, whatever the current value is', () => {
    window.location.hash = '#/admin/tenders?vmin=1000000';
    expect(writeHashParam('vmin', null)).toBe(true);
    expect(window.location.hash).toBe('#/admin/tenders');
  });

  it('lets record ids through — their vocabulary is the live store, which the writer cannot see', () => {
    // the READER still refuses one the store does not know (see the whitelist tests above), so a
    // bad id narrows nothing; failing the write here would instead break every legitimate `?op=`
    expect(isValidParamValue('op', 'op-anything')).toBe(true);
    expect(isValidParamValue('vmin', '5000000')).toBe(true);
    expect(isValidParamValue('vmin', '5,000,000')).toBe(false);
    expect(isValidParamValue('arch', 'live')).toBe(true);
    expect(isValidParamValue('arch', 'LIVE')).toBe(false);
  });
});
