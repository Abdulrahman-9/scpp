// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import '../src/i18n';
import App from '../src/App';
import { saveSession } from '../src/session';

/**
 * Route-render sanity for the approval-chain wave (client decisions ق1/ق3/ق4). The derivations
 * are pinned in approvals.test.ts; what is unpinned until here is whether the SCREENS those
 * derivations feed actually mount — a missing translation namespace, a CSS-only class, or a
 * retired route left dangling all typecheck cleanly and only fail in a browser.
 *
 * What is asserted is structural, never cosmetic:
 *   1. #/admin/approvals renders the chain with exactly the gated tenders the seed contains,
 *   2. the retired #/admin/mct address lands on it (a bookmark must not 404 or fall through
 *      to the follow-up room, which would silently answer a different question),
 *   3. #/admin/tenders carries the «المطابقة» definition line and the field filter,
 *   4. the tier is named at the two places a decision is actually met — the ratify/return panel
 *      and the follow-up room's decision queue,
 *   5. the add-operator form states the GLOBAL ladder read-only, with nothing per-operator to type.
 */

const MDOC = { name: 'د. سارة الجبوري', role: 'MDOC_ADMIN' as const, oid: 'oid-roc-01' };

beforeEach(() => {
  localStorage.clear();
  saveSession(MDOC);
});

afterEach(() => {
  document.body.innerHTML = '';
  window.location.hash = '';
  localStorage.clear();
});

/** Mount the real app at a hash — the same entry point main.tsx uses. */
function at(hash: string) {
  window.location.hash = hash;
  return render(<App />);
}

describe('#/admin/approvals — the approval chain screen renders', () => {
  it('shows the ladder registry over the seeded tenders that owe an outside signature', () => {
    at('#/admin/approvals');
    expect(screen.getByRole('heading', { name: 'سلسلة الموافقات' })).toBeTruthy();

    // the two gated seed tenders are listed with their tier; the two inside the operator's own
    // authority (AH-DRL-0212 $4.20M, BD-MNT-0098 $0.85M) must NOT appear — ط1 opens no gate
    expect(screen.getByText('MN-EPC-0305')).toBeTruthy();
    expect(screen.getByText('B7-FAC-0331')).toBeTruthy();
    expect(screen.queryByText('AH-DRL-0212')).toBeNull();
    expect(screen.queryByText('BD-MNT-0098')).toBeNull();

    // the derived KPI strip and the value column read in Latin digits with the $ sign
    expect(screen.getByText('بانتظار JMC')).toBeTruthy();
    expect(screen.getByText('بانتظار MDOC')).toBeTruthy();
    expect(screen.getByText('صودق هذا الشهر')).toBeTruthy();
    expect(screen.getByText('$7,800,000')).toBeTruthy();
    expect(screen.getByText('$12,400,000')).toBeTruthy();
  });

  it('states the ladder with the live ceilings in the collapsed explainer', () => {
    at('#/admin/approvals');
    const strip = screen.getByText('ما هذه السلسلة؟ — سلّم الموافقات بحدوده الحالية');
    const details = strip.closest('details');
    expect(details).toBeTruthy();
    // the seeded ceilings are quoted from state (fmtMoney), never restated in prose — $5,000,000
    // appears twice on purpose: it is the top of ط1 and the floor of ط2, one figure two readings
    const text = details!.textContent ?? '';
    expect(text.match(/\$5,000,000/g)?.length).toBe(2);
    expect(text).toContain('$10,000,000');
  });

  it('offers the tier / operator / field filters the screen is read through', () => {
    at('#/admin/approvals');
    expect(screen.getByLabelText('كل الحقول')).toBeTruthy();
    expect(screen.getByLabelText('كل المشغّلين')).toBeTruthy();
  });
});

describe('#/admin/mct — the retired screen', () => {
  it('redirects the bookmark to the approval chain instead of 404ing or falling through', () => {
    at('#/admin/mct');
    expect(window.location.hash).toBe('#/admin/approvals');
  });
});

describe('#/admin/tenders — «المطابقة» is stated, not inferred (ق4)', () => {
  it('renders the definition line, the renamed column and the field filter', () => {
    at('#/admin/tenders');
    expect(screen.getByText(/«المطابقة» = مقارنة ما نُفِّذ فعلاً بما خُطِّط له/)).toBeTruthy();
    expect(screen.getByText('مطابقة المخطط (أيام عمل)')).toBeTruthy();
    expect(screen.getByLabelText('كل الحقول')).toBeTruthy();
  });
});

describe('#/operator/tenders — the operator registry argues from the same sentence', () => {
  const OPERATOR = {
    name: 'م. أحمد عبد الرحمن', role: 'OPERATOR_ADMIN' as const, oid: 'oid-opadmin-01',
    company: 'شركة نفط الواحة الصينية', companyId: 'op-alwaha',
  };

  it('carries the identical «المطابقة» definition and its own field filter', () => {
    saveSession(OPERATOR);
    at('#/operator/tenders');
    // one wording across both portals — a second phrasing would be a second definition
    expect(screen.getByText(/«المطابقة» = مقارنة ما نُفِّذ فعلاً بما خُطِّط له/)).toBeTruthy();
    expect(screen.getByLabelText('كل الحقول')).toBeTruthy();
  });

  it('offers ONLY this company fields — the portal never lists the other operators', () => {
    saveSession(OPERATOR);
    at('#/operator/tenders');
    const select = screen.getByLabelText('كل الحقول') as HTMLSelectElement;
    // op-alwaha owns one of the 13 registered fields; the other 12 belong to other companies
    expect([...select.options].map((o) => o.textContent)).toEqual(['كل الحقول', 'حقل الأحدب النفطي']);
    expect(within(select).queryByText('حقل بدرة')).toBeNull();
  });

  it('hides the filter entirely for a session that names no company, rather than opening it to all', () => {
    saveSession(MDOC); // an MDOC account has no companyId — it has no operator scope to filter by
    at('#/operator/tenders');
    expect(screen.queryByLabelText('كل الحقول')).toBeNull();
  });
});

describe('the tier is named where the decision is actually taken', () => {
  /** The tier line, and the panel it sits in — the assertion is about PLACEMENT, not just presence. */
  function tierLineInDecisionPanel(): HTMLElement {
    const line = document.querySelector('.rv-tier') as HTMLElement | null;
    expect(line).toBeTruthy();
    const panel = line!.closest('.ad-panel');
    expect(panel?.querySelector('.ad-panel__t')?.textContent).toBe('قرار المصادقة');
    return line!;
  }

  it('the ratify/return panel states the tier and the body holding the decision', () => {
    // t3 (MN-EPC-0305, $7.80M) sits at the ratify stage — the gate itself
    at('#/admin/review/t3');
    const line = tierLineInDecisionPanel();
    expect(within(line).getByText('ط2 · JMC')).toBeTruthy();
    expect(within(line).getByText('هذه المناقصة ضمن الطبقة ط2 — القرار لدى اللجنة المشتركة (JMC).')).toBeTruthy();
  });

  it('names the operating company itself for ط1, not an abstraction', () => {
    // t1 ($4.20M ≤ the 5M ceiling) opens no gate: the decision is its own company's, by name
    at('#/admin/review/t1');
    const line = tierLineInDecisionPanel();
    expect(within(line).getByText('ط1 · المشغّل')).toBeTruthy();
    expect(within(line).getByText(/القرار لدى شركة نفط الواحة الصينية/)).toBeTruthy();
  });

  it('the follow-up room decision queue carries the tier of each waiting tender', () => {
    at('#/admin');
    const queue = screen.getByText('قرارات بانتظار الإدارة').closest('.ad-panel') as HTMLElement;
    expect(queue).toBeTruthy();
    expect(within(queue).getByText('MN-EPC-0305')).toBeTruthy();
    expect(within(queue).getByText('ط2 · JMC')).toBeTruthy();
  });
});

/**
 * The room asks «whose signature is this waiting on», not «what is in the cost cycle» (ق3): the
 * MCT tile is gone, and the two that replaced it are real links into the band they counted.
 */
describe('#/admin — the follow-up room speaks the approval ladder, not MCT', () => {
  it('shows no MCT tile at all', () => {
    at('#/admin');
    expect(screen.queryByText(/MCT/)).toBeNull();
    expect(screen.queryByText('في دورة MCT')).toBeNull();
  });

  it('counts the outstanding signatures per band and links each tile to that band', () => {
    at('#/admin');
    // seed: t3 (7.80M) awaits the JMC, t4 (12.40M) awaits MDOC — one each, both undecided
    const jmc = screen.getByText('بانتظار موافقة اللجنة المشتركة JMC').closest('a') as HTMLAnchorElement;
    const mdoc = screen.getByText('بانتظار موافقة نفط الوسط').closest('a') as HTMLAnchorElement;
    // the tiles count the UNDECIDED rows of a band, so the destination carries the same gate —
    // `?tier=` alone opens the whole band and would list rows the tile never counted
    expect(jmc.getAttribute('href')).toBe('#/admin/approvals?tier=JMC&pending=1');
    expect(mdoc.getAttribute('href')).toBe('#/admin/approvals?tier=MDOC&pending=1');
    expect(within(jmc).getByText('1')).toBeTruthy();
    expect(within(mdoc).getByText('1')).toBeTruthy();
  });

  it('the tile deep link lands on the registry already narrowed to that band and gate', () => {
    at('#/admin/approvals?tier=JMC&pending=1');
    expect(screen.getByText('MN-EPC-0305')).toBeTruthy();   // the JMC row, still undecided
    expect(screen.queryByText('B7-FAC-0331')).toBeNull();   // the MDOC row is filtered out
    expect(screen.getByText('بانتظار القرار فقط')).toBeTruthy();
  });
});

describe('#/admin/operators — the add form shows the global ladder read-only (ق1)', () => {
  it('lists the three tiers with the live default ceilings, tagged, and nothing to type into', () => {
    // only a SUPER_ADMIN may open the form; the ladder is what the form must state.
    // The trigger is the MERGED wizard now (request 9 — one flow for the company and its
    // fields); the ladder moved into its review section and must still read out of state.
    saveSession({ name: 'م. مصطفى الكرخي', role: 'SUPER_ADMIN', oid: 'oid-super-01' });
    at('#/admin/operators');
    fireEvent.click(screen.getByRole('button', { name: 'إضافة مشغّل وحقوله' }));

    const dialog = screen.getByRole('dialog');
    // د9 — the wizard shows the SYSTEM DEFAULT, and now says so: a company under registration
    // has no ladder of its own yet, and approving one is a later act from the registry itself
    expect(within(dialog).getByText('سلّم الموافقات الافتراضي النظامي — يسري على هذه الشركة ما لم يُعتمد لها سلّم خاص')).toBeTruthy();
    expect(within(dialog).getByText('الافتراضي النظامي')).toBeTruthy();
    expect(within(dialog).getByText('ط1 · المشغّل')).toBeTruthy();
    expect(within(dialog).getByText('ط2 · JMC')).toBeTruthy();
    expect(within(dialog).getByText('ط3 · MDOC')).toBeTruthy();
    // the bands are read out of state.approvalTiers, and there is nothing to type into
    expect(within(dialog).getByText('≤ $5,000,000')).toBeTruthy();
    expect(within(dialog).getByText('> $5,000,000 → $10,000,000')).toBeTruthy();
    expect(within(dialog).getByText('> $10,000,000')).toBeTruthy();
    expect(within(dialog).queryByLabelText(/سقف|ceiling/i)).toBeNull();
  });
});
