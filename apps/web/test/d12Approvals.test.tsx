// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import '../src/i18n';
import App from '../src/App';
import { ADMIN_NAV, navForRole } from '../src/admin/AdminShell';
import { approvalChain, ratifyWait } from '../src/admin/adminDerive';
import { COUNTED } from '../src/admin/capabilities';
import { capsForRole, roleHasCapId } from '../src/admin/access';
import ar from '../src/locales/ar.json';
import en from '../src/locales/en.json';
import { DEMO_IDENTITIES, saveSession, type ApiRole } from '../src/session';
import { calendarOf, seedState, type State, type Tender } from '../src/store';

/**
 * د12 — «الموافقات + مقعد اللجنة».
 *
 * Four properties, and every one of them is a thing only a mounted screen (or the register itself)
 * can prove:
 *   · no row in this product decides anything — the ritual lives in the tender file (س‌ل6/ل7);
 *   · a joint-committee session opens on its own queue, and can leave it (ل2);
 *   · the sidebar never offers a destination the capability register refuses that role (ل3);
 *   · «منتظرة منذ» is working days on a PLANNED ratify stage, shown for undecided rows only —
 *     never a calendar count, never a 45-day threshold, never a figure on a decided file (س‌ل3/ل5).
 */

const KEY = 'masaar-operator-v13';
const MDOC = { name: 'د. سارة الجبوري', role: 'MDOC_ADMIN' as const, oid: 'oid-roc-01' };
const JMC = { name: 'م. رافد الدليمي', role: 'JMC_APPROVER' as const, oid: 'oid-jmc-01' };

beforeEach(() => { localStorage.clear(); });
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
function follow(hash: string) {
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new Event('hashchange'));
  });
}

const patch = (s: State, id: string, extra: Partial<Tender>): State =>
  ({ ...s, tenders: s.tenders.map((t) => (t.id === id ? { ...t, ...extra } : t)) });

const rowsOf = () => document.querySelectorAll('.op-tbl tbody tr');
const tbody = () => document.querySelector('.op-tbl tbody') as HTMLElement;

/* ============================================================ س‌ل6/ل7 — no decision in a row */

describe('the registry reads the chain and decides nothing (س‌ل6 / ل7)', () => {
  beforeEach(() => { saveSession(MDOC); });

  it('offers no decision control in ANY row — the only act is opening the file', () => {
    at('#/admin/approvals');
    expect(rowsOf().length).toBeGreaterThan(0);
    for (const row of rowsOf()) {
      // a row may hold links; it may hold no button, no select and no form control at all —
      // «مصادقة» and «إعادة» need an authority gate, an entry preview and a mandatory reason,
      // and a table cell can carry none of the three
      expect(row.querySelectorAll('button, select, input, textarea')).toHaveLength(0);
      const links = [...row.querySelectorAll('a')].map((a) => a.getAttribute('href') ?? '');
      expect(links.every((h) => h.startsWith('#/admin/review/'))).toBe(true);
    }
  });

  it('names no decision verb anywhere in the table body', () => {
    at('#/admin/approvals');
    // the words the reference put on its row buttons; «مُصادَق» (the past-tense state) is a
    // different word and is allowed — a recorded fact is not an offer to act
    for (const verb of ['مصادقة', 'إعادة المعاملة', 'اعتماد', 'رفض']) {
      expect(within(tbody()).queryByText(verb)).toBeNull();
    }
  });
});

/* ============================================================ ل2 — the JMC opening view */

describe('a joint-committee session opens on what waits for its signature (ل2)', () => {
  it('lands on its own band and the pending gate, without being asked', () => {
    saveSession(JMC);
    at('#/admin/approvals');
    expect(window.location.hash).toBe('#/admin/approvals?tier=JMC&pending=1');
    // exactly the ط2 rows still owed a signature — t3 (7.80M, undecided); t4 is ط3
    expect(rowsOf()).toHaveLength(1);
    expect(screen.getByText('MN-EPC-0305')).toBeTruthy();
  });

  it('is a default, not a cell: the gate carries its own dismiss and the address follows it', () => {
    saveSession(JMC);
    at('#/admin/approvals');
    const chip = screen.getByText('بانتظار القرار فقط');
    fireEvent.click(within(chip.closest('.reg-chip') as HTMLElement).getByRole('button'));
    act(() => { window.dispatchEvent(new Event('hashchange')); });
    expect(window.location.hash).toBe('#/admin/approvals?tier=JMC');
    // and it does NOT re-seed itself on the next render — a default that reapplies is a cell
    expect(screen.queryByText('بانتظار القرار فقط')).toBeNull();
  });

  it('widens all the way back when the band chip is released — no floor under the reader', () => {
    saveSession(JMC);
    at('#/admin/approvals');
    fireEvent.click(screen.getByText('كل الطبقات'));
    act(() => { window.dispatchEvent(new Event('hashchange')); });
    expect(window.location.hash).not.toContain('tier=JMC');
  });

  it('never overrides a link that already said what to show', () => {
    saveSession(JMC);
    at('#/admin/approvals?tier=MDOC');
    expect(window.location.hash).toBe('#/admin/approvals?tier=MDOC');
    expect(screen.getByText('B7-FAC-0331')).toBeTruthy();
  });

  it('leaves the opening view of every other seat untouched', () => {
    saveSession(MDOC);
    at('#/admin/approvals');
    expect(window.location.hash).toBe('#/admin/approvals');
    expect(rowsOf()).toHaveLength(2); // the whole chain: t3 (ط2) and t4 (ط3)
  });
});

/* ============================================================ ل3 — the filtered rail */

describe('the sidebar promises no destination the register refuses (ل3)', () => {
  it('declares only capability ids the register actually carries', () => {
    const ids = new Set(COUNTED.map((c) => c.id));
    const declared = ADMIN_NAV.map((n) => n.needs).filter((x): x is string => !!x);
    expect(declared.length).toBeGreaterThan(0);
    expect(declared.filter((id) => !ids.has(id))).toEqual([]);
  });

  it('offers the joint committee no row whose subject its own register withholds', () => {
    const offered = navForRole(ADMIN_NAV, 'JMC_APPROVER');
    for (const n of offered) {
      if (n.needs) expect(roleHasCapId(n.needs, 'JMC_APPROVER')).toBe(true);
    }
    // and it is a real narrowing, not a filter that happens to keep everything
    expect(offered.length).toBeLessThan(ADMIN_NAV.length);
    const hidden = ADMIN_NAV.filter((n) => !offered.includes(n)).map((n) => n.view).sort();
    expect(hidden).toEqual(['audit', 'contracts', 'entities', 'holidays', 'reports', 'schedule']);
  });

  it('is derived, not authored: every hidden row is hidden BY the register', () => {
    const reach = new Set(capsForRole('JMC_APPROVER').map((c) => c.id));
    for (const n of ADMIN_NAV.filter((x) => !navForRole(ADMIN_NAV, 'JMC_APPROVER').includes(x))) {
      expect(n.needs).toBeDefined();
      expect(reach.has(n.needs!)).toBe(false);
    }
  });

  it('withholds nothing from the platform administrator, who holds every guarded capability', () => {
    expect(navForRole(ADMIN_NAV, 'SUPER_ADMIN')).toHaveLength(ADMIN_NAV.length);
  });

  it('renders the narrowed rail for a real JMC session', () => {
    saveSession(JMC);
    at('#/admin');
    const hrefs = [...document.querySelectorAll('a.ad-nav__btn')].map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('#/admin/approvals');
    for (const gone of ['#/admin/contracts', '#/admin/entities', '#/admin/audit', '#/admin/reports']) {
      expect(hrefs).not.toContain(gone);
    }
  });
});

/* ================================================= س‌ل3 / ل5 — the waiting measure */

describe('«منتظرة منذ» is working days on a planned ratify stage, for undecided rows only', () => {
  const cal = calendarOf(seedState());
  const chainOf = (s: State) => approvalChain(s);
  const rowFor = (s: State, id: string) => chainOf(s).find((r) => r.tender.id === id)!;

  const planRatify = (s: State, id: string, plannedTo: string): State => {
    const t = s.tenders.find((x) => x.id === id)!;
    return patch(s, id, {
      stages: t.stages.map((st) => (st.key === 'ratify' ? { ...st, plannedFrom: '2026-06-01', plannedTo } : st)),
    });
  };
  const unplanRatify = (s: State, id: string): State => {
    const t = s.tenders.find((x) => x.id === id)!;
    return patch(s, id, {
      stages: t.stages.map((st) => (st.key === 'ratify' ? { ...st, plannedFrom: undefined, plannedTo: undefined } : st)),
    });
  };

  it('counts WORKING days past the planned end — the weekend is not waiting', () => {
    // 2026-08-13 is a Thursday; 2026-08-20 is the Thursday after, i.e. 5 working days later
    const s = planRatify(seedState(), 't4', '2026-08-13');
    const w = ratifyWait(rowFor(s, 't4'), '2026-08-20', cal);
    expect(w.kind).toBe('overdue');
    expect(w.kind === 'overdue' && w.wd).toBe(5);
    // the same span in calendar days is 7 — the difference IS the point of the measure
    expect(w.kind === 'overdue' && w.wd).toBeLessThan(7);
  });

  it('says «not yet» rather than zero while the plan still has room', () => {
    const s = planRatify(seedState(), 't4', '2026-12-31');
    expect(ratifyWait(rowFor(s, 't4'), '2026-08-20', cal).kind).toBe('onPlan');
  });

  it('refuses to judge an UNPLANNED ratify stage — «0» there would read as «on time»', () => {
    const s = unplanRatify(seedState(), 't4');
    expect(ratifyWait(rowFor(s, 't4'), '2026-08-20', cal).kind).toBe('unplanned');
  });

  it('is silent on a decided row — nobody is waiting, so no duration is invented', () => {
    const ratified = planRatify(
      patch(seedState(), 't4', { ratification: { status: 'ratified', by: 'د. سارة الجبوري', on: '2026-08-18' } }),
      't4', '2026-01-01',
    );
    expect(ratifyWait(rowFor(ratified, 't4'), '2026-08-20', cal).kind).toBe('none');
    const cancelled = planRatify(
      patch(seedState(), 't4', { lifecycle: { status: 'cancelled', reason: 'r'.repeat(25), on: '2026-08-01', by: 'x' } }),
      't4', '2026-01-01',
    );
    expect(ratifyWait(rowFor(cancelled, 't4'), '2026-08-20', cal).kind).toBe('none');
  });

  it('shows the column only where it has something true to say', () => {
    const s = planRatify(
      patch(seedState(), 't3', { ratification: { status: 'ratified', by: 'د. سارة الجبوري', on: '2026-08-18' } }),
      't4', '2026-01-01',
    );
    saveSession(MDOC);
    at('#/admin/approvals', s);
    const cells = [...rowsOf()].map((r) => r.children[7]!.textContent!.trim());
    // t3 is decided → the shared dash; t4 is pending, planned and long past → a working-day figure
    expect(cells.filter((c) => /\d/.test(c))).toHaveLength(1);
    expect(cells.filter((c) => c === ar.audit.byNone)).toHaveLength(1);
  });

  it('carries no 45-day threshold and no red on waiting anywhere in the screen’s vocabulary', () => {
    const text = JSON.stringify(ar.approvals) + JSON.stringify(en.approvals);
    expect(text).not.toContain('45');
    // the overdue figure wears the NEUTRAL chip class, never the delayed/late colour
    const s = planRatify(seedState(), 't4', '2026-01-01');
    saveSession(MDOC);
    at('#/admin/approvals', s);
    const late = document.querySelectorAll('.op-tbl tbody .op-dev--late, .op-tbl tbody .op-dev--warn');
    expect(late).toHaveLength(0);
  });
});

/* ============================================ س‌ل1 / س‌ل2 / س‌ل4 — the decision surface */

describe('the settled decision, said out loud (س‌ل1 / س‌ل2 / س‌ل4)', () => {
  const DECIDED: State = (() => {
    const s = seedState();
    return patch(s, 't3', { ratification: { status: 'ratified', by: { oid: 'oid-jmc-01', name: 'م. رافد الدليمي', role: 'JMC_APPROVER' }, on: '2026-08-18' } });
  })();

  beforeEach(() => { saveSession(MDOC); });

  it('names WHO signed and WHEN, off the stored ratification', () => {
    at('#/admin/approvals?dec=ratified', DECIDED);
    expect(rowsOf()).toHaveLength(1);
    const row = rowsOf()[0]!;
    expect(row.children[8]!.textContent).toContain('م. رافد الدليمي');
    expect(row.children[8]!.getAttribute('title')).toBe('oid-jmc-01');
    expect(row.children[9]!.textContent).toBe('2026-08-18');
  });

  it('shows the ONE shared dash on an undecided row — never a second way of saying «nobody»', () => {
    at('#/admin/approvals?pending=1', DECIDED);
    for (const row of rowsOf()) {
      expect(row.children[8]!.textContent!.trim()).toBe(ar.audit.byNone);
      expect(row.children[9]!.textContent!.trim()).toBe(ar.audit.byNone);
    }
  });

  it('the decision chips count live and land exactly what they counted', () => {
    at('#/admin/approvals', DECIDED);
    const chip = screen.getByText('مُصادَق', { selector: '.wz-chip' }).closest('button')!;
    expect(chip.querySelector('.acc-count')!.textContent).toBe('1');
    fireEvent.click(chip);
    act(() => { window.dispatchEvent(new Event('hashchange')); });
    expect(rowsOf()).toHaveLength(1);
  });

  it('keeps the pending gate and the settled chips ONE dimension — they never both narrow', () => {
    at('#/admin/approvals?pending=1', DECIDED);
    fireEvent.click(screen.getByText('مُصادَق', { selector: '.wz-chip' }).closest('button')!);
    act(() => { window.dispatchEvent(new Event('hashchange')); });
    expect(window.location.hash).toContain('dec=ratified');
    expect(window.location.hash).not.toContain('pending=1');
  });

  it('the ladder tiles are filled, pressed and land exactly their own count', () => {
    at('#/admin/approvals', DECIDED);
    const tiles = [...document.querySelectorAll('button.ad-kpi--fill')] as HTMLButtonElement[];
    expect(tiles).toHaveLength(2); // the two bands; «صودق هذا الشهر» has no month filter to land on
    expect(tiles.map((b) => b.getAttribute('data-tone'))).toEqual(['jmc', 'mdoc']);
    const mdocTile = tiles[1]!;
    const counted = Number(mdocTile.querySelector('.ad-kpi__v')!.textContent);
    fireEvent.click(mdocTile);
    act(() => { window.dispatchEvent(new Event('hashchange')); });
    expect(rowsOf()).toHaveLength(counted);
    expect((document.querySelectorAll('button.ad-kpi--fill')[1] as HTMLButtonElement).getAttribute('aria-pressed')).toBe('true');
  });

  it('never turns «صودق هذا الشهر» into a button it cannot honour', () => {
    at('#/admin/approvals', DECIDED);
    const still = document.querySelector('div.ad-kpi--fill') as HTMLElement;
    expect(still).toBeTruthy();
    expect(still.tagName).toBe('DIV');
    expect(still.textContent).toContain(ar.approvals.kpiMonthWindow);
  });
});

/* ============================================================ ل1 — the fifth seat */

describe('the joint-committee seat has a door (ل1)', () => {
  it('offers one sign-in option per demo identity — the picker IS the mandate', () => {
    // no session: `needsAuth` puts the sign-in card in front of the admin panel
    at('#/admin');
    const options = [...document.querySelectorAll('.login-card select option')] as HTMLOptionElement[];
    expect(options.map((o) => o.value)).toEqual(DEMO_IDENTITIES.map((i) => i.role));
    expect(options.map((o) => o.value)).toContain('JMC_APPROVER');
    expect(options.every((o) => o.textContent!.trim().length > 0)).toBe(true);
  });

  it('names the seat in both languages, with no raw key leaking through', () => {
    const key = DEMO_IDENTITIES.find((i) => i.role === 'JMC_APPROVER')!.labelKey;
    expect(key).toBe('login.roleJmc');
    for (const dict of [ar, en] as const) {
      const value = (dict.login as Record<string, string>).roleJmc;
      expect(typeof value).toBe('string');
      expect(value.trim()).not.toBe('');
    }
  });
});

/* ============================================================ ل4 / س‌ل5 — «سجل قراراتي» */

describe('«سجل قراراتي» is a filter on the durable trail, not a session memory (ل4 / س‌ل5)', () => {
  const TRAILED: State = (() => {
    const s = seedState();
    return {
      ...s,
      audit: [
        ...s.audit,
        { ts: '2026-08-18T09:00:00.000Z', action: 'RATIFY', target: 'MN-EPC-0305', by: { oid: 'oid-roc-01', name: 'د. سارة الجبوري', role: 'MDOC_ADMIN' as ApiRole }, outcome: 'applied' as const },
        { ts: '2026-08-18T10:00:00.000Z', action: 'RATIFY', target: 'B7-FAC-0331', by: { oid: 'oid-jmc-01', name: 'م. رافد الدليمي', role: 'JMC_APPROVER' as ApiRole }, outcome: 'refused' as const },
        { ts: '2026-08-18T11:00:00.000Z', action: 'CREATE_TENDER', target: 'X-000' },
      ],
    };
  })();

  const auditRows = () => document.querySelectorAll('.dtable tbody tr');

  it('narrows the permanent log to the rows bound to MY immutable oid', () => {
    saveSession(MDOC);
    at('#/admin/audit', TRAILED);
    const all = auditRows().length;
    fireEvent.click(screen.getByText('قراراتي'));
    expect(auditRows()).toHaveLength(1);
    expect(auditRows()).not.toHaveLength(all);
    expect(document.querySelector('.dtable tbody tr td:nth-child(3)')!.textContent).toBe('MN-EPC-0305');
  });

  it('matches on the oid, never on the display name', () => {
    // same NAME, different account: a name-matched filter would hand this row to the wrong reader
    const impostor: State = {
      ...TRAILED,
      audit: [...TRAILED.audit, { ts: '2026-08-19T09:00:00.000Z', action: 'RATIFY', target: 'IMPOSTOR', by: { oid: 'oid-someone-else', name: 'د. سارة الجبوري', role: 'MDOC_ADMIN' as ApiRole } }],
    };
    saveSession(MDOC);
    at('#/admin/audit', impostor);
    fireEvent.click(screen.getByText('قراراتي'));
    expect(within(document.querySelector('.dtable tbody') as HTMLElement).queryByText('IMPOSTOR')).toBeNull();
  });

  it('claims no unattributed row: a log entry that cannot say whose it is, is not mine', () => {
    saveSession(JMC);
    at('#/admin/audit', TRAILED);
    fireEvent.click(screen.getByText('قراراتي'));
    expect(auditRows()).toHaveLength(1);
    expect(within(document.querySelector('.dtable tbody') as HTMLElement).queryByText('X-000')).toBeNull();
  });

  it('says «nothing matches» rather than «nothing exists» when my column is empty', () => {
    saveSession({ name: 'م. مصطفى الكرخي', role: 'SUPER_ADMIN', oid: 'oid-super-01' });
    at('#/admin/audit', TRAILED);
    fireEvent.click(screen.getByText('قراراتي'));
    expect(screen.getByText(ar.audit.emptyMine)).toBeTruthy();
    expect(screen.queryByText(ar.audit.empty)).toBeNull();
  });

  it('adds no write: the trail stays append-only and the filter is read-only', () => {
    saveSession(MDOC);
    at('#/admin/audit', TRAILED);
    const before = JSON.parse(localStorage.getItem(KEY)!).audit.length;
    fireEvent.click(screen.getByText('قراراتي'));
    expect(JSON.parse(localStorage.getItem(KEY)!).audit).toHaveLength(before);
  });
});

/* ============================================================ the fetch plan */

describe('the api-mode fetch plan is DERIVED from the same register (ل3)', () => {
  const guards: [string, ApiRole[]][] = [
    ['listVendors', ['SUPER_ADMIN', 'MDOC_ADMIN', 'EVALUATION', 'AUDITOR']],
    ['listContracts', ['SUPER_ADMIN', 'MDOC_ADMIN', 'AUDITOR']],
    ['listAuditLog', ['SUPER_ADMIN', 'MDOC_ADMIN', 'AUDITOR']],
    ['listUsers', ['SUPER_ADMIN']],
  ];

  it('mirrors the controllers verified on 2026-08-31 — the joint committee is on none of them', () => {
    for (const [id, expected] of guards) {
      const cap = COUNTED.find((c) => c.id === id)!;
      expect([...cap.roles].sort()).toEqual([...expected].sort());
      expect(cap.roles).not.toContain('JMC_APPROVER');
    }
  });

  it('reaches only the two open reads and the two ratify rows for the ط2 seat', () => {
    expect(capsForRole('JMC_APPROVER').map((c) => c.id).sort())
      .toEqual(['getTender', 'listHolidays', 'listTenders', 'ratifyAward', 'returnWithNotes']);
  });
});
