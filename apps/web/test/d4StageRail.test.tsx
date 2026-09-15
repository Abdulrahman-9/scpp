// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import '../src/i18n';
import App from '../src/App';
import { saveSession } from '../src/session';
import { seedState, type State } from '../src/store';

/**
 * Batch D4 — the path and its stages (ops/DESIGN-TRANSFER-PLAN.md §3 د4).
 *
 * Three facts only a mounted screen can hold:
 *
 * 1. THE RAIL IS THE DATA. The reference prototype draws a fixed rail — seven boxes on its login
 *    screen, twelve in its order file — and calls one of them «الحالية». Any constant would
 *    typecheck. So the guard renders a method-6 request (10 stages) and an 11.1 request (9 stages)
 *    on ONE screen and demands each rail equal ITS OWN `stages.length`: no single hard-coded
 *    number can satisfy both rows at once.
 * 2. RED IS A MEASUREMENT (س7). The reference paints the current stage red always. Here the red
 *    slot and the red running-tag appear only where `plannedTo` has passed with no `actualTo`, and
 *    the SAME stage with a future `plannedTo` carries no red anywhere.
 * 3. THE DRAWER AGREES WITH THE ROW. معرض-29 puts a status badge in the drawer head; a badge that
 *    can disagree with the row it was opened from is worse than no badge.
 */

const KEY = 'masaar-operator-v13';
const MDOC = { name: 'د. سارة الجبوري', role: 'MDOC_ADMIN' as const, oid: 'oid-roc-01' };
const ALWAHA = {
  name: 'كرار محسن',
  role: 'OPERATOR_USER' as const,
  oid: 'oid-opuser-01',
  company: 'شركة الواحة',
  companyId: 'op-alwaha',
};

/** Far past / far future relative to any clock this suite ever runs on. */
const PAST = '2020-01-05';
const FUTURE = '2099-12-31';

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  document.body.innerHTML = '';
  window.location.hash = '';
  localStorage.clear();
});

function at(hash: string, state?: State) {
  if (state) localStorage.setItem(KEY, JSON.stringify(state));
  window.location.hash = hash;
  return render(<App />);
}

/** The row whose tender code cell reads `code` — rails are counted inside their own row. */
function rowOf(code: string): HTMLElement {
  const cell = screen.getByText(code);
  return cell.closest('tr') as HTMLElement;
}

const slotsIn = (el: HTMLElement) => el.querySelectorAll('.op-seg').length;

describe('د4-1 — the rail has one slot per REAL stage, never a constant', () => {
  it('draws 9 slots for the 11.1 request and 10 for the method-6 request, on one screen', () => {
    saveSession(MDOC);
    const s = seedState();
    const t1 = s.tenders.find((x) => x.id === 't1')!; // methodId 7 — المناقصة العامة (11.1)
    const t2 = s.tenders.find((x) => x.id === 't2')!; // methodId 6 — المناقصة المحدودة
    expect(t1.methodId).toBe(7);
    expect(t2.methodId).toBe(6);
    // the two lengths must DIFFER, or the guard could not tell a constant from a derivation
    expect(t1.stages.length).not.toBe(t2.stages.length);

    at('#/admin/tenders', s);
    expect(slotsIn(rowOf(t1.code))).toBe(t1.stages.length);
    expect(slotsIn(rowOf(t2.code))).toBe(t2.stages.length);
  });

  it('follows the stage array when it changes, and marks exactly one slot as current', () => {
    saveSession(MDOC);
    const s = seedState();
    const t2 = s.tenders.find((x) => x.id === 't2')!;
    t2.stages = t2.stages.slice(0, 6); // a shorter path — the rail must shrink with it
    at('#/admin/tenders', s);

    const row = rowOf(t2.code);
    expect(slotsIn(row)).toBe(6);
    expect(row.querySelectorAll('.op-seg--now')).toHaveLength(1);
    // ق4 — decoration beside a name: the text stage column stays the readable one
    expect(row.querySelector('.op-segs')!.getAttribute('aria-hidden')).toBe('true');
    expect(within(row).getByText('استحصال الموافقة')).toBeTruthy();
  });

  it('names every slot, and labels the operator rail with the position it draws (م1)', () => {
    saveSession(ALWAHA);
    const s = seedState();
    const t1 = s.tenders.find((x) => x.id === 't1')!;
    at('#/operator/tenders', s);

    const row = rowOf(t1.code);
    const rail = row.querySelector('.op-segs') as HTMLElement;
    // a colour with no name means nothing to the reader who cannot count boxes
    const titles = [...row.querySelectorAll('.op-seg')].map((x) => x.getAttribute('title'));
    expect(titles).toHaveLength(t1.stages.length);
    expect(titles.every((x) => !!x && x.length > 0)).toBe(true);
    expect(titles[0]).toBe('المصادقة على الكلفة');

    // the position — 5 of 9, «تحليل فني» — is stated once, and from the real array
    expect(rail.getAttribute('role')).toBe('img');
    expect(rail.getAttribute('aria-label')).toBe('المرحلة 5 من 9: تحليل فني');
    expect(within(row).getByText('5/9')).toBeTruthy();
  });
});

describe('د4-2 — red appears on real lateness and on nothing else (س7)', () => {
  /** t1 with its open stage re-dated: `plannedTo` in the future, or in the past. */
  function seedWithOpenStage(plannedTo: string): State {
    const s = seedState();
    const t1 = s.tenders.find((x) => x.id === 't1')!;
    const open = t1.stages.find((x) => !x.actualTo)!;
    open.plannedFrom = PAST;
    open.plannedTo = plannedTo;
    return s;
  }

  it('a running stage whose plan has NOT expired carries no red slot and no red tag', () => {
    saveSession(ALWAHA);
    const s = seedWithOpenStage(FUTURE);
    const t1 = s.tenders.find((x) => x.id === 't1')!;

    const { unmount } = at('#/operator/tenders', s);
    const row = rowOf(t1.code);
    expect(row.querySelectorAll('.op-seg--now')).toHaveLength(1);
    expect(row.querySelectorAll('.op-seg--delayed')).toHaveLength(0);
    expect(row.querySelectorAll('.op-seg--progress')).toHaveLength(1);
    unmount();

    // …and the same fact on the tender file, where the craft of the reference's StageRail landed
    at('#/operator/t/t1', s);
    expect(document.querySelectorAll('.file-tl__now')).toHaveLength(1);
    expect(document.querySelectorAll('.file-tl__now--delayed')).toHaveLength(0);
    expect(document.querySelectorAll('.file-tl__now-dot')).toHaveLength(1);
    expect(document.querySelectorAll('.file-tl__dot--delayed')).toHaveLength(0);
  });

  it('the SAME stage, once its planned end has passed unclosed, turns red in both places', () => {
    saveSession(ALWAHA);
    const s = seedWithOpenStage(PAST);
    const t1 = s.tenders.find((x) => x.id === 't1')!;

    const { unmount } = at('#/operator/tenders', s);
    const row = rowOf(t1.code);
    expect(row.querySelectorAll('.op-seg--delayed.op-seg--now')).toHaveLength(1);
    expect(row.querySelectorAll('.op-seg--progress')).toHaveLength(0);
    unmount();

    at('#/operator/t/t1', s);
    expect(document.querySelectorAll('.file-tl__now--delayed')).toHaveLength(1);
    // the pulse rides the one running row only — closed and not-yet-started rows never move
    expect(document.querySelectorAll('.file-tl__now-dot')).toHaveLength(1);
  });
});

describe('د4-3 — the drawer head carries the row’s own status (معرض-29)', () => {
  it('shows the same badge as the row it was opened from, and names the current stage', async () => {
    saveSession(ALWAHA);
    const s = seedWithFutureT1();
    const t1 = s.tenders.find((x) => x.id === 't1')!;
    at('#/operator/tenders', s);

    const row = rowOf(t1.code);
    const rowStatus = row.querySelector('.m-pill')!.textContent;
    await act(async () => {
      fireEvent.click(within(row).getByText('معاينة'));
    });

    const head = document.querySelector('.op-drawer__namerow') as HTMLElement;
    expect(head.querySelector('.m-pill')!.textContent).toBe(rowStatus);

    // the shape is read and the NAME confirms it — no hovering eleven boxes to place the request
    const now = document.querySelector('.op-drawer__now') as HTMLElement;
    expect(now.textContent).toContain('المرحلة الحالية:');
    expect(now.textContent).toContain('تحليل فني');
    // the drawer wears the SAME rail component, in its wide dress (no `N/M`, no mini slots)
    const rail = document.querySelector('.op-drawer__body .op-segs') as HTMLElement;
    expect(rail.classList.contains('op-segs--mini')).toBe(false);
    expect(rail.querySelectorAll('.op-seg')).toHaveLength(t1.stages.length);
    // …including م1: the slot NAMES travel with the component, so the drawer's rail is as
    // readable to a pointer as the row's. Asserted rather than inferred — «same component»
    // is a claim about today's source, and this is a claim about what the drawer renders.
    const titles = [...rail.querySelectorAll('.op-seg')].map((x) => x.getAttribute('title'));
    expect(titles.every((x) => !!x && x.length > 0)).toBe(true);
    expect(titles[0]).toBe('المصادقة على الكلفة');
  });

  /** A request that is NOT late, so the badge under test is «قيد التنفيذ» rather than the
   *  everything-is-red state the seed's 2026 dates fall into once the clock passes them. */
  function seedWithFutureT1(): State {
    const s = seedState();
    const t1 = s.tenders.find((x) => x.id === 't1')!;
    const open = t1.stages.find((x) => !x.actualTo)!;
    open.plannedFrom = PAST;
    open.plannedTo = FUTURE;
    return s;
  }
});
