import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { NoticeBell } from '../NoticeBell';
import { fmtCount } from '../operator/derive';
import { Icon } from '../operator/Icon';
import { loadSession, type ApiRole } from '../session';
import { NAV_SEC_KEY, NavCount, readNavFlag, SIDE_ID, useNavMin, writeNavFlag } from '../shellNav';
import { SEARCH_KEYS, useShellSearch } from '../shellSearch';
import { useRegisterDispatchFail, useStore } from '../store';
import ThemeToggle from '../ThemeToggle';
import { ToastViewport, useToasts, type ToastOpts } from '../Toasts';
import { roleHasCapId, roleKey } from './access';
import { approvalChain, awaitingTier, decisionQueue } from './adminDerive';
import './admin.css';

export type AdminView =
  | 'room' | 'tenders' | 'contracts' | 'entities' | 'reports'
  // 'users' is now the WHOLE access section («الوصول والأدوار») — the retired 'roles' view is a
  // tab of it (client request 20), so `#/admin/roles` redirects instead of rendering its own screen
  | 'users' | 'operators' | 'fields' | 'holidays'
  // 'approvals' replaces the retired 'mct' view (client ق3) — the engine stays, the screen does not
  // 'schedule' (request 10) is the TIME-compliance registry; 'compliance' remains the §9 local
  // content + §12.2 nominations screen — two subjects that shared one word, never one screen
  | 'approvals' | 'schedule' | 'compliance' | 'paths' | 'audit' | 'review';

interface AdminUi { toast: (msg: string, opts?: ToastOpts) => void; }
const AdminUiContext = createContext<AdminUi | null>(null);
export function useAdminUi(): AdminUi {
  const ctx = useContext(AdminUiContext);
  if (!ctx) throw new Error('useAdminUi outside AdminShell');
  return ctx;
}

type NavCount = 'decisions' | 'tenders' | 'approvals' | 'contracts' | 'accounts';
interface NavItem {
  view: AdminView;
  hash: string;
  icon: string;
  counted?: NavCount;
  /**
   * ل3 — the capability id (admin/capabilities.ts) this destination's own data read requires.
   *
   * The sidebar may not promise a destination whose subject the session's role cannot read: today
   * it offers all fourteen to every platform role, and a joint-committee session that follows
   * «العقود» or «التدقيق» gets a 403 — and a ROLE_REFUSED row written against a body that never
   * claimed the right. The answer is asked of the capability register (the mirror of the real
   * `@Roles(...)` decorators), so «who sees this row» and «who may call it» are ONE fact.
   *
   * `undefined` means the destination has no server capability behind it at all — the local
   * registries (`operators`, `fields`) and the static SCPP reference (`paths`). Those are not
   * withheld from anyone, because there is no guard to withhold them by.
   */
  needs?: string;
}

/**
 * PRIMARY — the five destinations of the daily job, always visible (spec §4-أ).
 *
 * The order is the lifecycle order a request travels: it is raised (tenders), it climbs the
 * ladder (approvals), it becomes a contract, and companies are the register all three refer to.
 * «المتابعة» sits on top because it is where a manager starts the morning.
 *
 * «سلسلة الموافقات» is promoted OUT of the tool drawer: after ق1/ق3 it is a daily destination,
 * not a reference table. «التقارير» and «الوصول والمستخدمون» move the other way — printing and
 * account administration are periodic work, not the work of the day (§4-أ).
 */
const PRIMARY: NavItem[] = [
  { view: 'room', hash: '#/admin', icon: 'layers', counted: 'decisions', needs: 'listTenders' },
  { view: 'tenders', hash: '#/admin/tenders', icon: 'list', counted: 'tenders', needs: 'listTenders' },
  { view: 'approvals', hash: '#/admin/approvals', icon: 'check', counted: 'approvals', needs: 'listTenders' },
  { view: 'contracts', hash: '#/admin/contracts', icon: 'doc', counted: 'contracts', needs: 'listContracts' },
  // entities are companies, not people — the people glyph belongs to the access registry
  { view: 'entities', hash: '#/admin/entities', icon: 'building', needs: 'listVendors' },
];

/**
 * SECONDARY — «أدوات ومراجع»: printing, registers and evidence. Nine items, so it is a real
 * disclosure (the ≥3 rule in §4-ب); the operator shell, with one, stays a flat label.
 *
 * «الأدوار والصلاحيات» is deliberately absent: it is a TAB of the access section now, and a
 * second sidebar entry landing on the same page would re-create the three-places-one-question
 * problem the merge exists to end.
 */
const SECONDARY: NavItem[] = [
  // the capacity bands and the ministry lists are built from the VENDOR registry — a session that
  // cannot read /vendors would open a report whose central tables are structurally empty
  { view: 'reports', hash: '#/admin/reports', icon: 'chart', needs: 'listVendors' },
  // schedule sits directly above §9 compliance: the two answer «هل التزمنا؟» about different
  // things (time / local content), and the adjacency is what makes the difference readable
  { view: 'schedule', hash: '#/admin/schedule', icon: 'clock', needs: 'listContracts' },
  { view: 'compliance', hash: '#/admin/compliance', icon: 'shield', needs: 'listTenders' },
  { view: 'operators', hash: '#/admin/operators', icon: 'building' },
  { view: 'fields', hash: '#/admin/fields', icon: 'layers' },
  // the holidays screen IS the calendar editor: reading /holidays is open to everyone, but a row
  // that leads only to two buttons the guard refuses is the promise this filter exists to stop
  { view: 'holidays', hash: '#/admin/holidays', icon: 'calendar', needs: 'addHoliday' },
  // «الوصول والأدوار» declares NO capability on purpose: two of its three views (the role cards
  // and the 46-row matrix) ARE the client-side capability register — static reference material with
  // no route behind it, readable by every platform role. Only the accounts tab reads /users, and it
  // stands empty for a non-super session exactly as `operators`/`fields` do, which is a thin
  // registry, not a refused destination.
  { view: 'users', hash: '#/admin/users', icon: 'users', counted: 'accounts' },
  { view: 'paths', hash: '#/admin/paths', icon: 'chart' },
  { view: 'audit', hash: '#/admin/audit', icon: 'doc', needs: 'listAuditLog' },
];

/**
 * ل3 — the destinations one role may be OFFERED, derived from the capability register.
 *
 * Exported because the test that guards it must ask the same question the sidebar asks, and
 * because «which rows does this role see» is a fact about the product, not a detail of a render.
 * A session with no role at all narrows nothing: the panel is unreachable without one (App.tsx
 * `canEnterAdmin`), so filtering by a missing role would be guessing, not gating.
 */
export function navForRole(items: NavItem[], role: ApiRole | undefined): NavItem[] {
  if (!role) return items;
  return items.filter((n) => !n.needs || roleHasCapId(n.needs, role));
}

/** The two maps as one list — what the crumb, the tests and the register check read. */
export const ADMIN_NAV: NavItem[] = [...PRIMARY, ...SECONDARY];

/**
 * The disclosure's remembered state — '1' open · '0' (or absent) collapsed, which is the default
 * and the whole point of a secondary group. Both the key and the read/write pair moved to
 * `shellNav.tsx` in د3, where the collapsed-rail preference joined them: two sidebar preferences
 * with one convention between them, kept in the module the two shells share rather than in the
 * shell that happened to need one first.
 */
const readSecPref = () => readNavFlag(NAV_SEC_KEY);
const writeSecPref = (open: boolean) => writeNavFlag(NAV_SEC_KEY, open);

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0] ?? '').join('');
}

export default function AdminShell({ view, onLogout, children }: { view: AdminView; onLogout: () => void; children: ReactNode }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const isAr = lang === 'ar';
  const { state } = useStore();
  const session = loadSession();
  const { toast } = useToasts();
  useRegisterDispatchFail((error) => toast(t('toastv2.dispatchFail'), { kind: 'error', desc: error }));

  const [q, setQ] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  // د3 — the 72px shelf, remembered across reloads; the same hook the operator shell wears
  const { min, toggle: toggleMin } = useNavMin();
  const searchRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const ui = useMemo<AdminUi>(() => ({ toast }), [toast]);

  // one definition, shared with the follow-up room's tile and the `?pending=1` registry it opens
  const decisions = decisionQueue(state).length;
  /**
   * «سلسلة الموافقات» badges the OUTSTANDING SIGNATURES, not the size of the chain: the same
   * `awaitingTier` predicate the room's two ladder tiles and the approvals screen's own KPI strip
   * call, so no two surfaces can disagree about how many decisions are owed.
   */
  const chain = approvalChain(state);
  const approvals = awaitingTier(chain, 'JMC').length + awaitingTier(chain, 'MDOC').length;
  const counts: Record<NavCount, number> = {
    decisions,
    tenders: state.tenders.length,
    approvals,
    contracts: state.contracts.length,
    accounts: state.users.filter((u) => !u.disabled).length,
  };

  /**
   * The secondary group. Two inputs, deliberately kept apart:
   *   · `secPref` — what the reader chose, persisted.
   *   · `activeInSecondary` — a forced open, so a deep link (`#/admin/audit`) can never land on a
   *     highlighted item that is not on screen.
   * The forced open is NOT written back: leaving the section restores the reader's own choice.
   */
  /**
   * ل3 — what THIS session may be offered. The crumb below still reads the FULL maps: which group
   * a destination belongs to is a fact about the routing contract, not about the reader, and a
   * deep link that lands outside the filtered rail must still say where it is rather than losing
   * its middle segment.
   */
  const primaryNav = useMemo(() => navForRole(PRIMARY, session?.role), [session?.role]);
  const secondaryNav = useMemo(() => navForRole(SECONDARY, session?.role), [session?.role]);

  const [secPref, setSecPref] = useState(readSecPref);
  const activeInSecondary = SECONDARY.some((n) => n.view === view);
  const secOpen = secPref || activeInSecondary;
  /**
   * While a secondary destination is the current page the group CANNOT be collapsed — collapsing
   * it would hide the page the reader is on. That makes the disclosure genuinely unavailable
   * there, and it has to SAY so: a button that reports `aria-expanded="true"` and then does
   * nothing when activated is a lie told to exactly the reader who cannot see the caret. It also
   * used to compute `!secOpen`, i.e. always `false` on such a page, so every click wrote
   * `masaar.nav.sec = '0'` — the stored preference could only ever be destroyed there, never
   * restored. The toggle now reads and writes the PREFERENCE, and is inert only where it is
   * announced as inert.
   */
  const secForced = activeInSecondary;
  const toggleSec = () => {
    if (secForced) return;
    const next = !secPref;
    setSecPref(next);
    writeSecPref(next);
  };
  // collapsing must never hide an alarm: the header carries the sum of what it folded away — of
  // what THIS session was offered, so a badge never counts a row the rail is not showing
  const hiddenCount = secondaryNav.reduce((n, i) => n + (i.counted ? counts[i.counted] : 0), 0);

  const qn = q.trim().toLowerCase();
  type Result = { kind: 'tender' | 'contract' | 'entity'; name: string; code: string; hash: string };
  const results: Result[] = qn.length < 2 ? [] : [
    ...state.tenders.filter((x) => (x.title[lang] + ' ' + x.code).toLowerCase().includes(qn)).map((x): Result => ({ kind: 'tender', name: x.title[lang], code: x.code, hash: `#/admin/review/${x.id}` })),
    // deep-link to the record itself (the profile routes exist in App.tsx) — landing on the
    // bare registry would drop the search the operator just made
    ...state.contracts.filter((c) => (c.title[lang] + ' ' + c.code).toLowerCase().includes(qn)).map((c): Result => ({ kind: 'contract', name: c.title[lang], code: c.code, hash: `#/admin/contracts/${c.id}` })),
    ...state.vendors.filter((v) => v.name.toLowerCase().includes(qn)).map((v): Result => ({ kind: 'entity', name: v.name, code: v.id.toUpperCase(), hash: `#/admin/entities/${v.id}` })),
  ].slice(0, 6);

  /** د2 — the same jump for a click, for Enter on the highlighted row, and for nothing else. */
  const pick = (i: number) => {
    const r = results[i];
    if (!r) return;
    setQ('');
    window.location.hash = r.hash;
  };
  const search = useShellSearch({ query: q, count: results.length, hasQuery: qn.length >= 2, onPick: pick });

  useEffect(() => {
    if (!menuOpen && qn.length < 2) return;
    const onDown = (e: MouseEvent) => {
      if (menuOpen && menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setQ('');
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuOpen, qn.length]);

  /**
   * ق8 — the breadcrumb, read off the ROUTING CONTRACT rather than written by hand.
   *
   * The trail is: the portal · the section the current destination actually sits in · the
   * destination. The middle segment is looked up in the two nav maps above, which is the whole
   * point: a destination moved between PRIMARY and SECONDARY moves in the trail on the same edit,
   * and no path can be invented here that the sidebar does not offer. It is `null` for a primary
   * destination — those ARE the top level, and printing a fake group over them would be the
   * invention this rule exists to stop.
   *
   * `#/admin/review/:id` is the one view with no nav entry of its own: the sidebar already
   * highlights «المناقصات» for it (a file is reached THROUGH the registry), so the trail says the
   * same thing and links there — the only link in the trail, because it is the only ancestor that
   * is a real destination. A section header is a group, not a page, so it is not a link.
   */
  const parent = view === 'review' ? PRIMARY.find((n) => n.view === 'tenders') : undefined;
  const section = parent
    ? { label: t(`adnav.${parent.view}`), hash: parent.hash }
    : (activeInSecondary ? { label: t('adnav.tools'), hash: undefined } : null);
  const crumb = t(`adnav.${view === 'review' ? 'review' : view}`);

  /** د3/§7-أ-5 — see the twin in `OperatorShell`: collapsed the name carries the count, open the
   *  row's own text is already the name and a second copy of it would only drift. */
  const navName = (label: string, n?: number): string | undefined =>
    min ? (n ? t('shell.navItemCount', { name: label, n: fmtCount(n, lang) }) : label) : undefined;
  const minLabel = t(min ? 'shell.navExpand' : 'shell.navCollapse');
  const toolsLabel = t('adnav.tools');

  return (
    <AdminUiContext.Provider value={ui}>
      <div className={`op-shell${min ? ' op-shell--min' : ''}`} dir={isAr ? 'rtl' : 'ltr'}>
        <aside id={SIDE_ID} className="op-side ad-side" data-noprint="1">
          <div className="ad-side__logo">
            <img
              src={min ? '/logo-mark.svg' : '/logo-on-dark.svg'}
              alt={t('app.title')}
              onError={(e) => { (e.target as HTMLImageElement).src = '/logo.svg'; }}
            />
            <span className="ad-side__badge">{t('adnav.badge')}</span>
            {/* س2 — one release value in one place: read from `app.subtitle`'s own `app.rev`, and
                the hand-typed copy that used to sit in the support block below is gone */}
            <span className="op-side__rev">{t('app.rev')}</span>
          </div>
          <nav className="ad-nav" aria-label={t('adnav.navLabel')}>
            {primaryNav.map((n) => {
              const on = n.view === view || (n.view === 'tenders' && view === 'review');
              const label = t(`adnav.${n.view}`);
              const count = n.counted ? counts[n.counted] : undefined;
              return (
                <a
                  key={n.view}
                  href={n.hash}
                  className={`ad-nav__btn${on ? ' ad-nav__btn--on' : ''}`}
                  aria-current={on ? 'page' : undefined}
                  title={label}
                  aria-label={navName(label, count)}
                >
                  <Icon name={n.icon} size={17} /><span className="op-nav__lbl">{label}</span>
                  {count !== undefined && <NavCount base="ad-nav__count" n={count} min={min} lang={lang} />}
                </a>
              );
            })}

            {/* ل3 — a group whose every row this session may not be offered is not rendered as an
                empty disclosure: a caret that opens onto nothing is the same broken promise as a
                row that 403s, made one click earlier. */}
            {secondaryNav.length > 0 && (
              <>
            {/* The disclosure. `hidden` is the attribute — a screen reader understands it, whereas
                a bare `display: none` is invisible to the accessibility tree's own bookkeeping;
                `aria-controls` names the container it governs. Only the caret animates: growing a
                block-size costs a layout pass per frame and fights `hidden` besides (§4-ج). */}
            <button
              type="button"
              className="ad-nav__disc"
              aria-expanded={secOpen}
              aria-controls="ad-nav-secondary"
              aria-disabled={secForced || undefined}
              title={toolsLabel}
              aria-label={navName(toolsLabel, secOpen ? undefined : hiddenCount)}
              onClick={toggleSec}
            >
              <Icon name="chevronStart" size={14} strokeWidth={2} className="ad-nav__caret" />
              <span className="op-nav__lbl">{toolsLabel}</span>
              {!secOpen && hiddenCount > 0 && (
                <NavCount base="ad-nav__count" n={hiddenCount} min={min} lang={lang} />
              )}
            </button>

            {/* §7-أ-5 — the forced open survives the collapse: `secOpen` is computed from
                `activeInSecondary` exactly as before, so a reader who deep-linked into «التدقيق»
                still sees their row highlighted on the 72px shelf. «أين أنا» is not a function of
                the rail's width. */}
            <div id="ad-nav-secondary" className="ad-nav__sec" hidden={!secOpen}>
              {secondaryNav.map((n) => {
                const on = n.view === view;
                const label = t(`adnav.${n.view}`);
                const count = n.counted ? counts[n.counted] : undefined;
                return (
                  <a
                    key={n.view}
                    href={n.hash}
                    className={`ad-nav__btn${on ? ' ad-nav__btn--on' : ''}`}
                    aria-current={on ? 'page' : undefined}
                    title={label}
                    aria-label={navName(label, count)}
                  >
                    <Icon name={n.icon} size={17} /><span className="op-nav__lbl">{label}</span>
                    {count !== undefined && <NavCount base="ad-nav__count" n={count} min={min} lang={lang} />}
                  </a>
                );
              })}
            </div>
              </>
            )}
          </nav>
          <div className="ad-side__sup">
            <div className="ad-side__sup-l">{t('adnav.supLabel')}</div>
            <div className="ad-side__sup-n">{t('adnav.supName')}</div>
          </div>
          <div className="ad-side__credit">
            <div className="ad-side__credit-l">{t('shell.creditLabel')}</div>
            <div className="ad-side__credit-n">{t('shell.creditName')}</div>
          </div>
          <button
            type="button"
            className="op-side__min"
            aria-expanded={!min}
            aria-controls={SIDE_ID}
            title={minLabel}
            aria-label={minLabel}
            onClick={toggleMin}
          >
            <Icon name="chevronStart" size={15} strokeWidth={2} className="op-side__min-caret" />
            <span className="op-nav__lbl">{minLabel}</span>
          </button>
        </aside>

        <main className="op-main">
          <header className="op-topbar" data-noprint="1">
            <nav className="op-crumb" aria-label={t('adnav.crumbLabel')}>
              <span>{t('admin.title')}</span>
              {section && (
                <>
                  <span className="op-crumb__sep">/</span>
                  {section.hash
                    ? <a className="op-crumb__a" href={section.hash}>{section.label}</a>
                    : <span>{section.label}</span>}
                </>
              )}
              <span className="op-crumb__sep">/</span>
              <span className="op-crumb__b" aria-current="page">{crumb}</span>
            </nav>

            <div className="op-search op-search--k op-search--wide" ref={searchRef}>
              <input
                ref={search.inputRef}
                className="op-search__in"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={search.onInputKeyDown}
                placeholder={t('adnav.searchPh')}
                aria-label={t('adnav.searchPh')}
                role="combobox"
                aria-expanded={search.open}
                aria-controls={search.open ? search.listId : undefined}
                aria-autocomplete="list"
                aria-activedescendant={search.activeId}
                aria-keyshortcuts={SEARCH_KEYS}
              />
              <span className="op-search__icon"><Icon name="search" size={14} strokeWidth={2} /></span>
              {/* rendered only once the listener is planted — see OperatorShell for the rule */}
              {search.armed && (
                <kbd className="op-search__kbd" title={t('shell.searchKeyHint')} aria-hidden="true">/</kbd>
              )}
              {search.open && (
                <div
                  className="op-panel op-search__panel"
                  id={search.listId}
                  role={results.length ? 'listbox' : undefined}
                  aria-label={results.length ? t('shell.searchResults') : undefined}
                >
                  {results.length === 0 ? <div className="op-panel__empty" role="status">{t('shell.noResults', { q })}</div> : results.map((r, i) => (
                    <button
                      key={i}
                      id={search.optionId(i)}
                      role="option"
                      aria-selected={search.active === i}
                      className="op-result"
                      onMouseEnter={() => search.setActive(i)}
                      onClick={() => pick(i)}
                    >
                      <span className={`ad-searchchip ad-searchchip--${r.kind}`}>{t(`adnav.kind_${r.kind}`)}</span>
                      <span className="op-result__main">
                        <span className="op-result__name">{r.name}</span>
                        <span className="op-result__sub"><span className="op-code">{r.code}</span></span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="op-top-actions">
              <ThemeToggle />
              <button className="op-langbtn" onClick={() => void i18n.changeLanguage(isAr ? 'en' : 'ar')}>{t('app.switchLang')}</button>
              <NoticeBell portal="admin" />
              <div className="op-notif" ref={menuRef}>
                <button className="op-avatar ad-avatar" title={session?.name ?? t('login.signOut')} aria-label={session?.name ?? t('login.signOut')} onClick={() => setMenuOpen((o) => !o)}>{initials(session?.name ?? '—')}</button>
                {menuOpen && (
                  <div className="op-panel op-menu">
                    <div className="op-menu__head">
                      <div className="op-menu__name">{session?.name}</div>
                      <div className="op-menu__role">{session ? t(`roles.names.${roleKey(session.role)}`) : '—'}</div>
                    </div>
                    <button className="op-menu__out" onClick={onLogout}>{t('login.signOut')}</button>
                  </div>
                )}
              </div>
            </div>
          </header>

          {children}
        </main>

        <ToastViewport />
      </div>
    </AdminUiContext.Provider>
  );
}
