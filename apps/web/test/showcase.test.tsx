// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import '../src/i18n';
import i18n from '../src/i18n';
import App from '../src/App';
import { awardedContracts, companyStats } from '../src/admin/dashboardDerive';
import { tierRange } from '../src/admin/TierPill';
import { fmtCount, fmtMoney } from '../src/operator/derive';
import { saveSession } from '../src/session';
import { calendarOf, seedState, todayIso, type State } from '../src/store';
import { WHATS_NEW_KEY } from '../src/WhatsNew';

/**
 * The client showcase (ops/CLIENT-SHOWCASE-SPEC §1 + §2).
 *
 * Two deliverables, and each has exactly one way to fail silently:
 *
 *  · THE A4 BRIEF is a document whose entire claim is that its figures are alive. A brief that
 *    typechecks, renders and prints a frozen «12 شركة» is indistinguishable from a correct one
 *    until the client's data moves — so the tests below change the store and demand the page move
 *    with it, and a source guard fails on any digit typed into the component at all.
 *
 *  · THE STRIP is a preference that must survive a reload and never come back. «Dismissed» is not
 *    a render state; it is a stored fact, and the only proof is a second mount.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
const STORE_KEY = 'masaar-operator-v13';
const BRIEF = '#/admin/reports/update-brief';

const MDOC = { name: 'د. سارة الجبوري', role: 'MDOC_ADMIN' as const, oid: 'oid-roc-01' };
const OPERATOR = {
  name: 'م. أحمد عبد الرحمن', role: 'OPERATOR_ADMIN' as const, oid: 'oid-opadmin-01',
  company: 'شركة نفط الواحة الصينية', companyId: 'op-alwaha',
};

beforeEach(() => {
  localStorage.clear();
  saveSession(MDOC);
});

afterEach(async () => {
  document.body.innerHTML = '';
  window.location.hash = '';
  localStorage.clear();
  // the English mirror below switches the shared i18n instance; a test that fails mid-switch would
  // otherwise leave every later Arabic query looking for text that is no longer on the screen
  if (i18n.language !== 'ar') await act(async () => { await i18n.changeLanguage('ar'); });
});

/** Mount the real app at a hash, optionally over a store the test seeded first. */
function at(hash: string, state?: State) {
  if (state) localStorage.setItem(STORE_KEY, JSON.stringify(state));
  window.location.hash = hash;
  return render(<App />);
}

/* ================================================================== */
/*  1 — «موجز تحديث منصة مسار» (spec §1)                               */
/* ================================================================== */

/** One ladder row, selected by the tier pill label the rest of the product uses. */
const ladderRow = (pill: string) => screen.getByText(pill).closest('tr') as HTMLTableRowElement;
const cells = (row: HTMLTableRowElement) => [...row.querySelectorAll('td')].map((td) => td.textContent ?? '');
/** One portfolio row, selected by its label — `[1]` is the figure, `[2]` the detail clause. */
const portfolioRow = (label: string) => cells(screen.getByText(label).closest('tr') as HTMLTableRowElement);

describe('#/admin/reports/update-brief — the A4 brief is the report system, not a slide', () => {
  it('renders on the existing A4 page anatomy, with a print action and a way back', () => {
    at(BRIEF);
    // the same skeleton TenderStatusReport prints on — a document the client already recognises
    expect(document.querySelector('.rp-page')).toBeTruthy();
    expect(document.querySelector('.rp-hdr img')).toBeTruthy();
    expect(document.querySelector('.rp-ftr')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'موجز تحديث منصة مسار' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /طباعة/ })).toBeTruthy();
    expect((screen.getByText('عودة إلى التقارير') as HTMLAnchorElement).getAttribute('href'))
      .toBe('#/admin/reports');
    // the footer states the document's provenance, which is the whole claim of the page
    expect(screen.getByText(/كل رقم في هذا الموجز محسوب لحظة العرض/)).toBeTruthy();
    // it prints OUTSIDE the admin shell: a sidebar has no business on a printed page
    expect(document.querySelector('.ad-shell, .ad-side')).toBeNull();
  });

  it('reads the ladder\'s ceilings from state.approvalTiers — never from the page', () => {
    const s = seedState();
    at(BRIEF, s);
    expect(cells(ladderRow('ط1 · المشغّل'))[2]).toBe(tierRange('OPERATOR', s.approvalTiers));
    expect(cells(ladderRow('ط2 · JMC'))[2]).toBe(tierRange('JMC', s.approvalTiers));
    expect(cells(ladderRow('ط3 · MDOC'))[2]).toBe(tierRange('MDOC', s.approvalTiers));
    // ط1 opens no gate at all, so it prints no queue — a «0» there would claim «nobody is
    // waiting today» instead of «nobody ever waits», which is a different and false statement
    expect(cells(ladderRow('ط1 · المشغّل'))[4]).toBe('لا بوابة موافقة');
  });

  it('counts each band and each outstanding signature from the live store', () => {
    at(BRIEF);
    // the seed spans all three bands: t1 4.2M + t2 0.85M (ط1), t3 7.8M (ط2), t4 12.4M (ط3)
    expect(cells(ladderRow('ط1 · المشغّل'))[3]).toBe('2');
    expect(cells(ladderRow('ط2 · JMC'))[3]).toBe('1');
    expect(cells(ladderRow('ط3 · MDOC'))[3]).toBe('1');
    // both gated requests are undecided, so both bands owe a signature
    expect(cells(ladderRow('ط2 · JMC'))[4]).toBe('1');
    expect(cells(ladderRow('ط3 · MDOC'))[4]).toBe('1');
  });

  /**
   * THE claim of the document. A brief with the right numbers typed into it passes every test
   * above; only moving the data can tell the two apart.
   */
  it('MOVES when a tender moves: raising one request\'s value re-bands it and re-queues it', () => {
    const richer = seedState();
    richer.tenders.find((t) => t.id === 't1')!.estimatedValueUSD = 20_000_000;
    at(BRIEF, richer);
    // t1 left the operator's own authority and landed above the joint committee's ceiling
    expect(cells(ladderRow('ط1 · المشغّل'))[3]).toBe('1');
    expect(cells(ladderRow('ط3 · MDOC'))[3]).toBe('2');
    // …and, being undecided, it now owes the parent company a signature as well
    expect(cells(ladderRow('ط3 · MDOC'))[4]).toBe('2');
  });

  it('drops an outstanding signature the moment the decision is recorded', () => {
    const ratified = seedState();
    ratified.tenders.find((t) => t.id === 't3')!.ratification =
      { status: 'ratified', on: '2026-08-18', by: 'د. سارة الجبوري' };
    at(BRIEF, ratified);
    // the request is still in the band — it is simply no longer waiting on anybody
    expect(cells(ladderRow('ط2 · JMC'))[3]).toBe('1');
    expect(cells(ladderRow('ط2 · JMC'))[4]).toBe('0');
  });

  it('prints the portfolio from the same derivations the follow-up room draws', () => {
    const s = seedState();
    const companies = companyStats(s, todayIso(), calendarOf(s));
    const awarded = awardedContracts(s);
    at(BRIEF, s);

    expect(portfolioRow('الشركات المشغّلة')[1]).toBe(fmtCount(companies.length, 'ar'));
    expect(portfolioRow('الحقول النفطية')[1])
      .toBe(fmtCount(companies.reduce((sum, c) => sum + c.fields, 0), 'ar'));
    expect(portfolioRow('المناقصات المسجّلة')[1]).toBe(fmtCount(s.tenders.length, 'ar'));
    expect(portfolioRow('العقود')[1]).toBe(fmtCount(awarded.count, 'ar'));
    // the contract clause carries the value and the completed / in-execution partition
    expect(portfolioRow('العقود')[2]).toContain(fmtMoney(awarded.valueUSD));
    expect(portfolioRow('العقود')[2]).toContain(`قيد التنفيذ ${fmtCount(awarded.inExecution, 'ar')}`);
    // the three lifecycle parts are a PARTITION: they must add up to the count beside them
    const parts = [...portfolioRow('المناقصات المسجّلة')[2]!.matchAll(/\d+/g)].map((m) => Number(m[0]));
    expect(parts.reduce((a, b) => a + b, 0)).toBe(s.tenders.length);
  });

  it('follows the store when a request is added — the portfolio line is not a headline', () => {
    const fewer = seedState();
    fewer.tenders = fewer.tenders.filter((t) => t.id !== 't4');
    at(BRIEF, fewer);
    expect(portfolioRow('المناقصات المسجّلة')[1]).toBe(fmtCount(fewer.tenders.length, 'ar'));
    // and the band that request occupied is now empty, honestly
    expect(cells(ladderRow('ط3 · MDOC'))[3]).toBe('0');
  });

  it('states the seven shipped facts, and nothing that reads as a promise', () => {
    at(BRIEF);
    const list = document.querySelector('.rp-list') as HTMLElement;
    expect(list.querySelectorAll('li')).toHaveLength(7);
    expect(within(list).getByText(/سلسلة الموافقات الثلاثية حلّت محل/)).toBeTruthy();
    expect(within(list).getByText(/الأرشفة بدل الحذف/)).toBeTruthy();
    expect(within(list).getByText(/ختم يسمّي الفلاتر النشطة/)).toBeTruthy();
    expect(within(list).getByText(/شاشة الامتثال الزمني/)).toBeTruthy();
    expect(within(list).getByText(/معالجاً واحداً بدل شاشتين/)).toBeTruthy();
    expect(within(list).getByText(/بوابة الدور/)).toBeTruthy();
    expect(within(list).getByText(/قسم وصول واحد/)).toBeTruthy();
  });

  /**
   * THE ZERO-LITERAL GUARD (spec §1, «القيد الحاكم»).
   *
   * Every figure on this page must come from a derivation, and the cheapest way to break that is
   * to type a number «just for now». The source is read with FOUR allowances, each of which is
   * incapable of asserting a fact about the client's data:
   *   · comments,
   *   · translation keys inside `t('…')` — the text they name lives in the locale files,
   *   · `className` values (`rp-h1` is a style, not a claim),
   *   · heading tag names (`<h1>`),
   *   · module specifiers and the `i18n` binding — a library's name, not a figure.
   * Anything else with a digit in it fails, which is why the component carries no inline pixel
   * sizes, no column widths, no document reference constants and not even a reduction seed.
   */
  it('contains no numeric literal at all — every figure is derived', () => {
    const src = readFileSync(join(ROOT, 'apps/web/src/report/UpdateBrief.tsx'), 'utf8');
    const stripped = src
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/\/\/[^\n]*/g, ' ')
      .replace(/t\((['"`])[^'"`]*\1\)/g, 't(KEY)')
      .replace(/className="[^"]*"/g, 'className=""')
      .replace(/<\/?h[a-z0-9]?/gi, '<h')
      .replace(/from '[^']*'/g, "from ''")
      .replace(/\bi18n\b/g, 'II');
    const offenders = [...stripped.matchAll(/.*[0-9].*/g)].map((m) => m[0]!.trim());
    expect(offenders).toEqual([]);
  });

  it('is launched from the admin reports screen by a card that names what it is', () => {
    at('#/admin/reports');
    const card = screen.getByText('موجز تحديث منصة مسار').closest('section') as HTMLElement;
    expect((within(card).getByText('افتح الموجز').closest('a') as HTMLAnchorElement).getAttribute('href'))
      .toBe(BRIEF);
  });

  it('is closed to an operator session, like every other cross-company surface', () => {
    saveSession(OPERATOR);
    at(BRIEF);
    // the honest refusal, not the document and not a silent bounce
    expect(screen.getByText('هذه لوحة إدارة نفط الوسط')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'موجز تحديث منصة مسار' })).toBeNull();
  });

  it('mirrors into English with the same derived figures', async () => {
    at(BRIEF);
    await act(async () => { await i18n.changeLanguage('en'); });
    expect(screen.getByRole('heading', { name: 'Masaar platform update brief' })).toBeTruthy();
    // the tier pill is translated, the derived figures and the $ ceilings are not — a number is
    // the same fact in both languages, and Latin digits are the client's standing decision
    const jmc = cells(ladderRow('T2 · JMC'));
    expect(jmc[2]).toBe(tierRange('JMC', seedState().approvalTiers));
    expect(jmc[3]).toBe('1');
    expect(jmc[4]).toBe('1');
    expect(screen.getByText(/Every figure in this brief is computed as the page is drawn/)).toBeTruthy();
  });
});

/* ================================================================== */
/*  2 — «الجديد في مسار» strip (spec §2)                               */
/* ================================================================== */

const strip = () => document.querySelector('.wn') as HTMLElement | null;
const stripLinks = () => [...document.querySelectorAll('.wn__link')] as HTMLAnchorElement[];

describe('the «الجديد في مسار» strip on both landing screens', () => {
  it('opens the admin room with exactly three facts and two links this role can reach', () => {
    at('#/admin');
    const s = strip()!;
    expect(s).toBeTruthy();
    expect(s.querySelectorAll('.wn__fact')).toHaveLength(3);
    expect(stripLinks().map((a) => a.getAttribute('href')))
      .toEqual([BRIEF, '#/admin/schedule']);
    // it sits ABOVE the page head, so it never displaces what the room is for
    expect(s.nextElementSibling?.classList.contains('op-page__head')).toBe(true);
  });

  /**
   * The role-honest half. `#/admin` is closed to the two company-scoped roles (canEnterAdmin), so
   * an operator's strip may not offer the A4 brief: the link would land them on the refusal screen,
   * which is a placebo affordance. They get the SAME three facts — statements about the platform,
   * true for both readers — pointed at the surfaces in their own portal where those two changes
   * are actually visible.
   */
  it('gives the operator the same three facts, and no link into the admin panel', () => {
    saveSession(OPERATOR);
    at('#/operator');
    const s = strip()!;
    expect(s.querySelectorAll('.wn__fact')).toHaveLength(3);
    expect(stripLinks().map((a) => a.getAttribute('href')))
      .toEqual(['#/operator/tenders', '#/operator/reports/weekly']);
    expect(s.querySelector('a[href^="#/admin"]')).toBeNull();
    // the three facts are the same sentences the admin reads
    expect(within(s).getByText(/سلسلة الموافقات الثلاثية/)).toBeTruthy();
    expect(within(s).getByText(/ختم الفلاتر النشطة/)).toBeTruthy();
    expect(within(s).getByText(/الالتزام الزمني مقروء مرحلةً مرحلة/)).toBeTruthy();
  });

  it('folds and unfolds without losing its dismissal affordance', () => {
    at('#/admin');
    const fold = screen.getByRole('button', { name: 'طيّ' });
    expect(fold.getAttribute('aria-expanded')).toBe('true');
    expect(fold.getAttribute('aria-controls')).toBe('wn-body');
    fireEvent.click(fold);
    expect(document.querySelector('.wn__body')).toBeNull();
    expect(screen.getByRole('button', { name: 'عرض' }).getAttribute('aria-expanded')).toBe('false');
    // folded is not dismissed — the strip and its close button are still there
    expect(strip()).toBeTruthy();
    expect(screen.getByRole('button', { name: /إغلاق شريط/ })).toBeTruthy();
  });

  it('dismisses to a key OUTSIDE the business store, and disappears at once', () => {
    at('#/admin');
    fireEvent.click(screen.getByRole('button', { name: 'إغلاق شريط «الجديد في مسار» نهائياً' }));
    expect(strip()).toBeNull();
    expect(localStorage.getItem(WHATS_NEW_KEY)).toBe('1');
    /*
     * The flag must never travel with — or be wiped by — a migration of the business state. It is
     * its own namespaced key (the `masaar.nav.sec` precedent), and nothing about it is written
     * into the store blob: a chrome preference inside `masaar-operator-v13` would be dropped by
     * the next schema bump, silently un-dismissing a strip the reader closed on purpose.
     */
    expect(WHATS_NEW_KEY.startsWith('masaar.')).toBe(true);
    expect(WHATS_NEW_KEY).not.toContain(STORE_KEY);
    expect(localStorage.getItem(STORE_KEY) ?? '').not.toContain('whatsnew');
  });

  it('never returns after dismissal — on either landing screen, in a fresh session', () => {
    at('#/admin');
    fireEvent.click(screen.getByRole('button', { name: /إغلاق شريط/ }));
    document.body.innerHTML = '';

    // a second mount is the only proof a preference was actually stored
    at('#/admin');
    expect(strip()).toBeNull();
    expect(screen.getByRole('heading', { name: 'غرفة المتابعة' })).toBeTruthy();

    document.body.innerHTML = '';
    saveSession(OPERATOR);
    at('#/operator');
    expect(strip()).toBeNull();
  });

  it('keeps its motion to one state fade, and answers reduced motion through the ONE block', () => {
    const css = readFileSync(join(ROOT, 'apps/web/src/whatsnew.css'), 'utf8');
    expect(css).toMatch(/\.wn__body \{[^}]*animation: fade-in/);
    // D1-1: the strip's own hand-kept list is gone. It named three classes and would have gone
    // stale the next time someone gave the strip a fourth transition; the single block in
    // tokens.css covers whatever the sheet grows. This asserts the sheet is SILENT on it.
    expect(css).not.toContain('prefers-reduced-motion');
    const tokens = readFileSync(join(ROOT, 'packages/tokens/css/tokens.css'), 'utf8');
    expect(tokens).toContain('@media (prefers-reduced-motion: reduce)');
    // and nothing physical-direction: the strip mirrors with the document like every other surface
    expect(css).not.toMatch(/\b(margin|padding|border)-(left|right)\b/);
  });
});
