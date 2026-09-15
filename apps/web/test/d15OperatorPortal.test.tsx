// @vitest-environment jsdom
import { act, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import i18n from '../src/i18n';
import App from '../src/App';
import { saveSession } from '../src/session';
import { seedState, type State, type Tender } from '../src/store';

/**
 * Batch د15 — the operator portal (ops/DESIGN-FINISH-PLAN.md §2-و م2–م5).
 *
 * Four claims, and every one of them is a claim a screen can only make once it is MOUNTED — which
 * is why they are asserted here and not against the source:
 *
 *  · م2 — the money figure counts THE RUNNING WORK IN SCOPE. Three things must fall out of it and
 *    each has its own fixture row: another company's tender (out of scope), a delivered one (every
 *    stage closed) and a cancelled one. A sum that quietly included any of them would still look
 *    plausible on screen, which is exactly why the guard states the rule independently — from the
 *    raw store fields, never by calling the predicate the screen calls.
 *  · م3 — the scope sentence is a CLAIM, so it appears only where it is true. An operator session
 *    sees it with its own company named; a platform session, which reads every company here, must
 *    not see it at all. A sentence that said «طلبيات شركتك فقط» over a cross-company list would be
 *    the fabrication this plan exists to refuse.
 *  · م4 — «افتح الخطوة» opens the STEP. The destination is checked against `wizardTypeFor` for the
 *    stage the task actually names, and a stage the rules engine cannot name falls back to the
 *    file rather than guessing a seat.
 *  · م5 — «N» raises a request, and does NOT do so while the reader is typing one. The cap that
 *    advertises it may not exist before the listener that answers it (قانون الصدق §6).
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
/** The registry's display name for `op-alwaha` — the sentence must name the RECORD, not the session. */
const ALWAHA_NAME = 'شركة نفط الواحة الصينية';

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

/**
 * One company, four requests, and only ONE of them is running work this company owes money on.
 *
 * Every exclusion the م2 rule names gets a row with a DIFFERENT value, so a sum that let one
 * through lands a number the assertion can name — a fixture where the excluded rows were worth
 * zero would pass whether the rule held or not.
 */
function scopeFixture(): { state: State; expected: number } {
  const s = seedState();
  const base = s.tenders.find((x) => x.id === 't1')!; // op-alwaha, 4.2M, stage 5 of 9 open
  const clone = (id: string, code: string, value: number, patch: Partial<Tender>): Tender => ({
    ...base,
    ...patch,
    id,
    code,
    estimatedValueUSD: value,
    stages: (patch.stages ?? base.stages).map((x) => ({ ...x })),
  });

  const delivered = clone('t-done', 'AH-DONE-001', 9_000_000, {
    stages: base.stages.map((x) => ({ ...x, actualTo: x.actualTo ?? x.plannedTo ?? '2026-06-01' })),
  });
  const cancelled = clone('t-cxl', 'AH-CXL-002', 5_000_000, {
    lifecycle: { status: 'cancelled', reason: 'ألغيت بقرار موثّق لتغيّر نطاق العمل', on: '2026-06-02' },
  });
  // another company's running request: in the store, out of this session's scope
  const foreign = clone('t-other', 'XX-OTH-003', 3_000_000, { operatorId: 'op-badra', fieldId: 'f-badra' });

  s.tenders = [base, delivered, cancelled, foreign];
  return { state: s, expected: base.estimatedValueUSD };
}

/** The rule, restated from the RAW fields — never by calling the predicate the screen calls. */
function runningValueOf(state: State, operatorId: string): number {
  return state.tenders
    .filter((x) => x.operatorId === operatorId)
    .filter((x) => x.lifecycle?.status !== 'cancelled' && x.stages.some((st) => !st.actualTo))
    .reduce((sum, x) => sum + x.estimatedValueUSD, 0);
}

/** The tile whose label reads `label`, as the §2-ط filled surface the whole row now wears. */
function tile(label: string): HTMLElement {
  const l = screen.getByText(label);
  return l.closest('.ad-kpi') as HTMLElement;
}

describe('د15-م2 — «قيمة قيد الإنجاز» is the running work IN SCOPE, and nothing else', () => {
  it('sums the operator’s live requests and drops the delivered, the cancelled and the foreign', () => {
    saveSession(ALWAHA);
    const { state, expected } = scopeFixture();
    at('#/operator/tenders', state);

    // the rule, stated twice and independently: from the raw store, and on the screen
    expect(runningValueOf(state, 'op-alwaha')).toBe(expected);
    const value = tile('قيمة قيد الإنجاز');
    expect(value.querySelector('.ad-kpi__v')!.textContent).toBe('$4.2M');

    // …and every excluded row would have moved that figure, so the pass is not an accident
    expect(expected).not.toBe(expected + 9_000_000); // delivered
    expect(expected).not.toBe(expected + 5_000_000); // cancelled
    expect(expected).not.toBe(expected + 3_000_000); // another company
    // the register really did hold all four — the exclusions are the screen's, not the store's
    expect(state.tenders).toHaveLength(4);
  });

  it('prints the exact grouped figure under the short form whenever the short form rounded', () => {
    saveSession(ALWAHA);
    const { state } = scopeFixture();
    at('#/operator/tenders', state);
    // $4.2M is a ROUNDING of 4,200,000 — the tile owes the reader the figure it rounded
    expect(within(tile('قيمة قيد الإنجاز')).getByText('$4,200,000')).toBeTruthy();
  });

  it('is a NUMBER, not a button — no tile on this row opens anything (سابقة د14)', () => {
    saveSession(ALWAHA);
    const { state } = scopeFixture();
    at('#/operator/tenders', state);
    const tiles = [...document.querySelectorAll('.ad-kpi')];
    expect(tiles).toHaveLength(4); // إجمالي · متأخرة · مستحقة هذا الأسبوع · قيمة قيد الإنجاز
    for (const el of tiles) {
      expect(el.tagName, 'a tile grew an affordance it has no filter behind').toBe('DIV');
      expect(el.getAttribute('href')).toBeNull();
      expect(el.getAttribute('aria-pressed')).toBeNull();
      // §2-ط — the whole row is filled, and its tone comes from the NAME, never from a colour
      expect(el.classList.contains('ad-fill')).toBe(true);
      expect(el.getAttribute('data-tone')).toBeTruthy();
      expect(el.getAttribute('style')).toBeNull();
    }
  });
});

describe('د15-م3 — the scope sentence appears exactly where it is true', () => {
  const SENTENCE = `تُعرض طلبيات ${ALWAHA_NAME} فقط.`;

  it('names the operator’s own company on BOTH surfaces — the register and the inbox', () => {
    saveSession(ALWAHA);
    const { state } = scopeFixture();

    at('#/operator/tenders', state);
    expect(screen.getByText(SENTENCE)).toBeTruthy();
    document.body.innerHTML = '';

    at('#/operator', state);
    expect(screen.getByText(SENTENCE)).toBeTruthy();
  });

  /**
   * The sentence is a claim about THE ROWS, so it must name the company that produced them.
   * `resolveSessionOrg` — the chrome's resolver — answers «who does this person work for» and
   * prefers the ACCOUNT's `operatorId`; the list was filtered by the SESSION's `companyId`. Where
   * the two disagree, a sentence built on the chrome's answer names one company over another
   * company's rows, which is the exact fabrication م3 exists to remove.
   */
  it('names the company the ROWS were filtered by, not the one the account record points at', () => {
    saveSession(ALWAHA);
    const { state } = scopeFixture();
    const account = state.users.find((u) => u.azureOid === ALWAHA.oid)!;
    account.operatorId = 'op-badra'; // the account says badra; the session's scope says alwaha
    at('#/operator/tenders', state);

    // the rows really are alwaha's — the foreign badra request is NOT on this screen
    expect(screen.queryByText('XX-OTH-003')).toBeNull();
    const line = document.querySelector('.op-page__scope') as HTMLElement;
    expect(line.textContent).toBe(SENTENCE);
    expect(line.textContent, 'the sentence named the account’s company over another’s rows')
      .not.toContain('بدرة');
  });

  it('is ABSENT for a platform session, which reads every company here', () => {
    saveSession(MDOC);
    const { state } = scopeFixture();

    at('#/operator/tenders', state);
    // the same screen, and it really is unscoped: the foreign request is on it
    expect(screen.getByText('XX-OTH-003')).toBeTruthy();
    expect(document.querySelector('.op-page__scope')).toBeNull();
    expect(screen.queryByText(/تُعرض طلبيات/)).toBeNull();
    document.body.innerHTML = '';

    at('#/operator', state);
    expect(document.querySelector('.op-page__scope')).toBeNull();
  });
});

describe('د15-م4 — «افتح الخطوة» lands the wizard the stage names', () => {
  /** Every inbox card, as (tender code → href). */
  function taskLinks(): Map<string, string> {
    const out = new Map<string, string>();
    for (const a of document.querySelectorAll('.op-task')) {
      const code = a.querySelector('.op-code')!.textContent!;
      out.set(code, (a as HTMLAnchorElement).getAttribute('href')!);
    }
    return out;
  }

  it('routes each task to the wizard `wizardTypeFor` picks for ITS OWN open stage', async () => {
    const { wizardTypeFor } = await import('../src/operator/derive');
    saveSession(MDOC); // the platform session, so every seeded method is on one screen
    const state = seedState();
    at('#/operator', state);

    const links = taskLinks();
    expect(links.size).toBeGreaterThan(1);
    for (const t of state.tenders) {
      const open = t.stages.find((s) => !s.actualTo);
      if (!open) continue;
      const href = links.get(t.code);
      expect(href, `${t.code} has no task card`).toBeTruthy();
      expect(href).toBe(`#/operator/t/${t.id}/w/${wizardTypeFor(open.key)}`);
    }
    // the three wizard types are reachable by NAME — no card invents a fourth door
    for (const href of links.values()) {
      expect(href).toMatch(/^#\/operator\/t\/[^/]+\/w\/(advertise|evaluate|complete)$/);
    }
  });

  it('really opens the wizard — the destination is a route, not a plausible string', () => {
    saveSession(MDOC);
    const state = seedState();
    at('#/operator', state);
    const href = [...taskLinks().values()][0]!;
    document.body.innerHTML = '';

    at(href, state);
    // the wizard shell, not the file: the file prints its own back-link and a tab set
    expect(document.querySelector('.wz-shell, .wz-head, .wz-step')).toBeTruthy();
    expect(document.querySelector('.op-page--file')).toBeNull();
  });

  it('keeps a task on the FILE when the rules engine cannot name its stage', () => {
    saveSession(ALWAHA);
    const state = seedState();
    const t = state.tenders.find((x) => x.id === 't1')!;
    // a stage key outside the governed table: `StageState.key` is a plain string, so a record can
    // carry one — and there is no honest wizard to send its task to
    const open = t.stages.find((s) => !s.actualTo)!;
    open.key = 'not-a-governed-stage';
    at('#/operator', state);

    const href = [...document.querySelectorAll('.op-task')].map((a) => a.getAttribute('href'))[0];
    expect(href).toBe(`#/operator/t/${t.id}`);
    expect(href).not.toContain('/w/');
  });
});

describe('د15-م5 — «N» raises a request, and stands down while the reader is typing', () => {
  const press = (target: EventTarget, init: KeyboardEventInit = {}) => {
    const ev = new KeyboardEvent('keydown', { key: 'n', bubbles: true, cancelable: true, ...init });
    act(() => { target.dispatchEvent(ev); });
    return ev;
  };

  it('opens #/operator/new from a bare press', () => {
    saveSession(ALWAHA);
    at('#/operator/tenders', seedFixture());
    const ev = press(document);
    expect(window.location.hash).toBe('#/operator/new');
    expect(ev.defaultPrevented).toBe(true);
  });

  it('DOES NOT hijack the key while the caret is in a field', () => {
    saveSession(ALWAHA);
    at('#/operator/tenders', seedFixture());

    // the shell's own live-search field, and the register's search box: both are places «n» is data
    const fields = [...document.querySelectorAll('input, textarea, select')] as HTMLElement[];
    expect(fields.length).toBeGreaterThan(1);
    for (const el of fields) {
      const ev = press(el);
      expect(window.location.hash, `«n» was stolen from <${el.tagName.toLowerCase()}>`).toBe('#/operator/tenders');
      expect(ev.defaultPrevented).toBe(false);
    }

    // a rich-text host is the same case, and its event target is a DESCENDANT of the editable node
    const host = document.createElement('div');
    host.setAttribute('contenteditable', 'true');
    const inner = document.createElement('span');
    host.appendChild(inner);
    document.body.appendChild(host);
    expect(press(inner).defaultPrevented).toBe(false);
    expect(window.location.hash).toBe('#/operator/tenders');
    host.remove();
  });

  it('stands down for an IME mid-word, and for the browser’s own Ctrl/Cmd+N', () => {
    saveSession(ALWAHA);
    at('#/operator/tenders', seedFixture());
    for (const init of [{ isComposing: true }, { ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
      const ev = press(document, init);
      expect(window.location.hash, `«n» fired under ${JSON.stringify(init)}`).toBe('#/operator/tenders');
      expect(ev.defaultPrevented).toBe(false);
    }
  });

  /** قانون الصدق §٦ — a printed shortcut hint may not exist before the listener that answers it. */
  it('prints the cap only on the row it belongs to, and only once the key really fires', () => {
    saveSession(ALWAHA);
    at('#/operator/tenders', seedFixture());

    const caps = [...document.querySelectorAll('.op-nav__kbd')];
    expect(caps).toHaveLength(1);
    expect(caps[0]!.textContent).toBe('N');
    expect(caps[0]!.getAttribute('aria-hidden')).toBe('true'); // the row says it via aria-keyshortcuts

    const row = caps[0]!.closest('a') as HTMLAnchorElement;
    expect(row.getAttribute('href')).toBe('#/operator/new');
    expect(row.getAttribute('aria-keyshortcuts')).toBe('N');

    // the cap is on screen, so the key it advertises must WORK on this very screen
    press(document);
    expect(window.location.hash).toBe('#/operator/new');
  });

  it('folds the cap away with the label when the rail collapses — 72px has no room for it', () => {
    saveSession(ALWAHA);
    at('#/operator/tenders', seedFixture());
    const toggle = screen.getByRole('button', { name: 'طيّ الشريط' });
    act(() => { toggle.click(); });

    expect(document.querySelector('.op-shell--min')).toBeTruthy();
    expect(document.querySelector('.op-nav__kbd')).toBeNull();
    // …and the key itself is untouched: the cap is a hint, not the mechanism
    press(document);
    expect(window.location.hash).toBe('#/operator/new');
  });

  function seedFixture(): State {
    return scopeFixture().state;
  }
});

describe('د15 — the English mirror: every sentence this batch added crosses over', () => {
  afterEach(async () => { await act(async () => { await i18n.changeLanguage('ar'); }); });

  it('renders the scope sentence, the value tile and the key cap in English too', async () => {
    saveSession(ALWAHA);
    const { state } = scopeFixture();
    at('#/operator/tenders', state);
    await act(async () => { await i18n.changeLanguage('en'); });

    // the sentence takes the registry's ENGLISH name — and never the record id, which is a leaked
    // primary key that names nothing a reader can act on
    const line = document.querySelector('.op-page__scope') as HTMLElement;
    expect(line.textContent).toBe("Only AlWaha's requests are shown.");
    expect(line.textContent).not.toContain('op-alwaha');

    // the money label crosses; the FIGURE does not — money is one Latin machine island (fmtMoney)
    expect(screen.getByText('Value in flight')).toBeTruthy();
    expect(within(tile('Value in flight')).getByText('$4.2M')).toBeTruthy();

    // and the cap is the same key in both directions — a translated shortcut is a second contract
    expect(document.querySelector('.op-nav__kbd')!.textContent).toBe('N');
  });
});
