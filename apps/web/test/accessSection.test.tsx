// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import '../src/i18n';
import App from '../src/App';
import AdminShell from '../src/admin/AdminShell';
import TenderReview from '../src/admin/TenderReview';
import { saveSession } from '../src/session';
import { StoreProvider } from '../src/store';
import { ToastsProvider } from '../src/Toasts';

/**
 * The merged access section (client requests 20 + 21) and the tier gate on the award decision
 * (19ب), asserted where they actually live — in the rendered app.
 *
 * What is pinned is STRUCTURAL: that one address now holds three views of one subject, that the
 * retired address lands on the right VIEW and not merely the right page, that the three financial
 * facts print the LIVE ceilings, and that a body without standing sees a named gate rather than a
 * bare disabled button. Nothing cosmetic is asserted.
 */

const SUPER = { name: 'م. مصطفى الكرخي', role: 'SUPER_ADMIN' as const, oid: 'oid-super-01' };
const JMC = { name: 'م. رافد الدليمي', role: 'JMC_APPROVER' as const, oid: 'oid-jmc-01' };
const EVAL = { name: 'سعد الجبوري', role: 'EVALUATION' as const, oid: 'oid-eval-01' };

beforeEach(() => {
  localStorage.clear();
  saveSession(SUPER);
});

afterEach(() => {
  document.body.innerHTML = '';
  window.location.hash = '';
  localStorage.clear();
});

function at(hash: string) {
  window.location.hash = hash;
  return render(<App />);
}

/** The card of one role on the roles tab, found by its own heading. */
function roleCard(name: string): HTMLElement {
  const heading = screen.getByRole('heading', { name, level: 3 });
  return heading.closest('.acc-rc') as HTMLElement;
}

describe('#/admin/users — three screens became one section (20)', () => {
  it('carries the section title and the three tabs, on the canonical address', () => {
    at('#/admin/users');
    expect(screen.getByRole('heading', { name: 'الوصول والأدوار', level: 1 })).toBeTruthy();
    // a real tab set, not three loose buttons: tablist › tab › tabpanel, with aria-selected
    const tabs = screen.getByRole('tablist', { name: 'الوصول والأدوار' });
    const items = within(tabs).getAllByRole('tab');
    expect(items.map((b) => b.querySelector('.acc-tab__l')?.textContent))
      .toEqual(['الحسابات', 'الأدوار', 'المصفوفة المرجعية']);
    expect(items.map((b) => b.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);
    // the selected tab names the panel, and the panel points back at it
    const panel = screen.getByRole('tabpanel');
    expect(panel.getAttribute('aria-labelledby')).toBe(items[0]!.id);
    expect(items[0]!.getAttribute('aria-controls')).toBe(panel.id);
  });

  it('opens on the accounts register — the section’s own subject', () => {
    at('#/admin/users');
    expect(screen.getByPlaceholderText('ابحث بالاسم أو البريد')).toBeTruthy();
    // the two seeded joint-committee members are in the register
    expect(screen.getByText('rafid.dulaimi@jmc.iq')).toBeTruthy();
    expect(screen.getByText('suhad.azzawi@jmc.iq')).toBeTruthy();
  });

  it('says out loud that a governance role has no enabled holder (19أ left AUDITOR empty)', () => {
    at('#/admin/users');
    expect(screen.getByText(/من الأدوار الحوكمية بلا حساب مفعّل/)).toBeTruthy();
  });

  it('moves between views by rewriting the address, so a tab is linkable', () => {
    at('#/admin/users');
    fireEvent.click(screen.getByText('الأدوار').closest('button') as HTMLButtonElement);
    expect(window.location.hash).toBe('#/admin/users?tab=roles');
  });

  it('falls back to the register on a tampered tab rather than showing an empty view', () => {
    at('#/admin/users?tab=nope');
    expect(screen.getByPlaceholderText('ابحث بالاسم أو البريد')).toBeTruthy();
  });
});

describe('#/admin/roles — the retired address lands on the right VIEW', () => {
  it('redirects into the roles tab, not merely onto the page', () => {
    at('#/admin/roles');
    expect(window.location.hash).toBe('#/admin/users?tab=roles');
  });
});

describe('the roles tab — the triad, then the cards (20 + 21)', () => {
  it('states the three bodies with the LIVE ceilings, never restated prose figures', () => {
    at('#/admin/users?tab=roles');
    const triad = document.querySelector('.acc-triad') as HTMLElement;
    expect(within(triad).getByText('من يوافق على ماذا')).toBeTruthy();
    expect(within(triad).getByText('≤ $5,000,000')).toBeTruthy();
    expect(within(triad).getByText('> $5,000,000 → $10,000,000')).toBeTruthy();
    expect(within(triad).getByText('> $10,000,000')).toBeTruthy();
  });

  it('grounds each body in a REAL seeded request — the worked example the client asked for', () => {
    at('#/admin/users?tab=roles');
    const lines = [...document.querySelectorAll('.acc-triad__ex')].map((e) => e.textContent);
    expect(lines).toContain('مثال قائم:MN-EPC-0305$7,800,000← القرار لدى اللجنة المشتركة (JMC)');
    expect(lines).toContain('مثال قائم:B7-FAC-0331$12,400,000← القرار لدى نفط الوسط (MDOC)');
    // the code and the figure are each their own LTR island, or bidi reorders the $ to the far end
    const jmcEx = [...document.querySelectorAll('.acc-triad--x, .acc-triad__ex')]
      .find((e) => e.textContent?.includes('MN-EPC-0305'))!;
    expect([...jmcEx.querySelectorAll('.acc-mono')].map((s) => s.textContent))
      .toEqual(['MN-EPC-0305', '$7,800,000']);
  });

  it('renders one card per role in the universe — seven, in ladder order', () => {
    at('#/admin/users?tab=roles');
    const cards = [...document.querySelectorAll('.acc-rc')];
    expect(cards).toHaveLength(7);
    expect(cards.map((c) => c.querySelector('.acc-rc__code')?.textContent)).toEqual([
      'SUPER_ADMIN', 'MDOC_ADMIN', 'JMC_APPROVER', 'EVALUATION', 'AUDITOR', 'OPERATOR_ADMIN', 'OPERATOR_USER',
    ]);
  });

  it('prints the three financial facts on the joint committee’s card', () => {
    at('#/admin/users?tab=roles');
    const card = roleCard('اللجنة المشتركة (JMC)');
    const facts = [...card.querySelectorAll('.acc-rc__fact')].map((f) => [
      f.querySelector('dt')?.textContent, f.querySelector('dd')?.textContent,
    ]);
    expect(facts).toEqual([
      // د9 §7-5 — the ceiling is read off the DEFAULT ladder and now SAYS so: unqualified, the
      // sentence claimed this signature clears $10M at every company, which an approved
      // per-operator ladder makes false. The «قد يختلف» clause is absent here on purpose —
      // this universe has no override, so there is nothing to caveat (asserted below).
      ['يوافق حتى؟', 'حتى $10,000,000 الافتراضي النظامي'],
      ['يشهد القرار؟', 'نعم — يصادق ويعيد'],
      ['نطاقه؟', 'كل المنظومة'],
    ]);
    expect(card.querySelector('.ad-ladder__src')?.textContent).toBe('الافتراضي النظامي');
    expect(card.querySelector('.ad-ladder__note')).toBeNull();
    // the ceiling is a mono LTR island — «$10,000,000», never «10,000,000$» inside Arabic
    expect(card.querySelector('.acc-rc__money')?.textContent).toBe('$10,000,000');
    // its two enabled holders — the headline count and one avatar link each
    expect(card.querySelector('.acc-rc__holders')?.textContent).toBe('2');
    expect(card.querySelectorAll('.acc-rc__people a')).toHaveLength(2);
  });

  it('prints «لا يوافق» — never a blank or an implied ceiling — for a role with no ratify seat', () => {
    at('#/admin/users?tab=roles');
    const card = roleCard('مدقق');
    expect(within(card).getByText('لا يوافق')).toBeTruthy();
    expect(within(card).getByText('لا')).toBeTruthy();
    // 19أ withdrew its only holder, and the card says so rather than showing an empty avatar row
    expect(within(card).getByText(/لا حساب مفعّل يحمل هذا الدور/)).toBeTruthy();
  });

  /**
   * «حاملو الدور» — the way from a role to the ACCOUNTS it is granted to. Granting, revoking and
   * disabling are per-account acts and stay on the account file, where the orphan-role, last-super
   * and scope-consistency guards can reason about a specific person; the card LINKS there rather
   * than growing a second mutation surface without any of them.
   */
  it('links each role card to the account register, filtered to that role’s holders', () => {
    at('#/admin/users?tab=roles');
    const card = roleCard('اللجنة المشتركة (JMC)');
    const link = card.querySelector('.acc-rc__holderlink') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('#/admin/users?role=JMC_APPROVER');
    expect(link.textContent).toContain('حاملو الدور (2)');
    // and it is a link, not a button — no new way to mutate a role from a card
    expect(card.querySelectorAll('.acc-rc__holderlink button')).toHaveLength(0);
  });

  it('honours ?role= at the register — the link lands on a really-narrowed list', () => {
    at('#/admin/users?role=JMC_APPROVER');
    // the two joint-committee members, and nobody else
    expect(screen.getByText('rafid.dulaimi@jmc.iq')).toBeTruthy();
    expect(screen.getByText('suhad.azzawi@jmc.iq')).toBeTruthy();
    expect(screen.queryByText('ahmed.abdulrahman@alwaha.iq')).toBeNull();
    // the chip for that role reads as the active one, so the screen agrees with the address
    const chip = [...document.querySelectorAll('.reg-chip, .acc-chip, [class*="chip"]')]
      .find((c) => c.textContent?.includes('اللجنة المشتركة (JMC)'));
    expect(chip?.className).toMatch(/on|active/);
  });

  it('ignores a role outside the vocabulary rather than emptying the register', () => {
    at('#/admin/users?role=NOPE');
    expect(screen.getByText('rafid.dulaimi@jmc.iq')).toBeTruthy();
    expect(screen.getByText('ahmed.abdulrahman@alwaha.iq')).toBeTruthy();
  });

  it('expands the detailed permissions to exactly the rows the register grants', () => {
    at('#/admin/users?tab=roles');
    const card = roleCard('اللجنة المشتركة (JMC)');
    const toggle = within(card).getByRole('button', { name: /عرض الصلاحيات التفصيلية \(5\)/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const rows = card.querySelectorAll('.acc-rc__caps li');
    expect(rows).toHaveLength(5);
    expect(within(card).getByText('مصادقة الإحالة')).toBeTruthy();
    expect(within(card).getByText('إعادة المعاملة مع الملاحظات')).toBeTruthy();
  });
});

describe('the reference matrix tab — kept for the auditor’s question', () => {
  it('renders the full register with a column for every role, JMC included', () => {
    at('#/admin/users?tab=matrix');
    const matrix = document.querySelector('.acc-matrix') as HTMLElement;
    const heads = [...matrix.querySelectorAll('thead th')].map((h) => h.textContent);
    expect(heads).toContain('اللجنة المشتركة (JMC)');
    // the provenance line counts the roles it actually renders instead of naming a stale figure
    expect(screen.getByText(/46 نقطة نهاية · 7 أدوار · 7 مجالات/)).toBeTruthy();
  });
});

describe('the award decision names the body that owns the band (19ب)', () => {
  it('opens the decision to the joint committee on a ط2 file', () => {
    saveSession(JMC);
    at('#/admin/review/t3'); // MN-EPC-0305, $7.80M → ط2
    const ratify = screen.getByRole('button', { name: /صادق/ }) as HTMLButtonElement;
    expect(ratify.disabled).toBe(false);
    expect(document.querySelector('.wz-note--warn')).toBeNull();
  });

  it('holds it shut for a body with no ratifying authority, and NAMES the body that has it', () => {
    saveSession(EVAL);
    at('#/admin/review/t3');
    expect(screen.getByText(/القرار فيه لدى اللجنة المشتركة \(JMC\)، وجلستك الحالية «لجان التحليل» لا تبلغ هذه الطبقة/)).toBeTruthy();
    expect((screen.getByRole('button', { name: /صادق/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: /أعِد المعاملة|إعادة/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  /**
   * FAIL CLOSED — the phase-5 fix. `TenderReview` used to default an absent session to
   * `MDOC_ADMIN`, the HIGHEST ratifying body, so a render with no identity at all opened every
   * decision. `App` gates `#/admin/*` on a session, which is why this was never visible; the
   * screen is rendered directly here for exactly that reason — a defence that only holds because
   * something upstream happens to hold first is not a defence, and the router is not this
   * component's guard.
   */
  const reviewWithoutSession = (id: string) => render(
    <StoreProvider>
      <ToastsProvider>
        <AdminShell view="review" onLogout={() => {}}>
          <TenderReview id={id} />
        </AdminShell>
      </ToastsProvider>
    </StoreProvider>,
  );

  it('grants NO decision rights without a session — and says why instead of showing a bare button', () => {
    localStorage.clear(); // no session at all: no identity, therefore no authority
    reviewWithoutSession('t3');
    expect((screen.getByRole('button', { name: /صادق/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: /أعِد المعاملة|إعادة/ }) as HTMLButtonElement).disabled).toBe(true);
    // the gate names the band's owner and the real reason — it does not invent a body for the reader
    expect(screen.getByText(/ولا توجد جلسة قائمة يُنسَب إليها قرار/)).toBeTruthy();
    expect(screen.queryByText(/وجلستك الحالية/)).toBeNull();
  });

  it('holds the governance acts shut too — a cancellation is an attributed record as well', () => {
    localStorage.clear();
    reviewWithoutSession('t3');
    for (const name of ['تعليق مؤقّت', 'إلغاء المناقصة']) {
      expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true);
    }
  });
});
