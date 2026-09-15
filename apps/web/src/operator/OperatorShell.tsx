import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { roleKey } from '../admin/access';
import { NoticeBell } from '../NoticeBell';
import { resolveSessionOrg } from '../orgIdentity';
import { loadSession } from '../session';
import { NavCount, SIDE_ID, useNavMin } from '../shellNav';
import { NEW_REQUEST_KEY, SEARCH_KEYS, useArmedShortcut, useShellSearch } from '../shellSearch';
import { calendarOf, sessionScopedTenders, todayIso, useRegisterDispatchFail, useStore, type Tender } from '../store';
import ThemeToggle from '../ThemeToggle';
import { ToastViewport, useToasts, type ToastOpts } from '../Toasts';
import { deriveTasks, fmtCount } from './derive';
import { Icon } from './Icon';
import QuickLook from './QuickLook';
import './operator.css';

export type OpView = 'inbox' | 'tenders' | 'file' | 'request' | 'reports' | 'approvals';

interface OperatorUi {
  toast: (msg: string, opts?: ToastOpts) => void;
  openQuickLook: (tenderId: string) => void;
}
const OperatorUiContext = createContext<OperatorUi | null>(null);
export function useOperatorUi(): OperatorUi {
  const ctx = useContext(OperatorUiContext);
  if (!ctx) throw new Error('useOperatorUi outside OperatorShell');
  return ctx;
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('');
}

interface OpNavItem { view: OpView; hash: string; icon: string; key: string; counted?: 'tasks' | 'tenders' }

/** The daily job: what is owed today, the register it is owed against, and raising a new one. */
const PRIMARY: OpNavItem[] = [
  { view: 'inbox', hash: '#/operator', icon: 'inbox', key: 'inbox', counted: 'tasks' },
  { view: 'tenders', hash: '#/operator/tenders', icon: 'list', key: 'tenders', counted: 'tenders' },
  { view: 'request', hash: '#/operator/new', icon: 'plus', key: 'request' },
];

/**
 * «أدوات ومراجع» — printing is periodic, not daily, so it separates from the three above.
 *
 * It stays a FLAT static label, not a disclosure: the rule in spec §4-ب is that a disclosure is
 * emitted only at three or more secondary items. Below that a collapsible group costs a reader a
 * click and a caret to hide one row, which is chrome pretending to be organisation. The admin
 * shell has nine and therefore gets the real disclosure.
 */
const SECONDARY: OpNavItem[] = [
  // د9 — «on which ladder are we measured, and where do our requests stand». A REFERENCE, not a
  // daily errand: it is read when a ceiling moves or a request stalls, not every morning, which is
  // why it joins this group rather than the three above. With two secondary items the group stays
  // a flat static label; the disclosure rule (§4-ب) still starts at three.
  { view: 'approvals', hash: '#/operator/approvals', icon: 'check', key: 'approvals' },
  { view: 'reports', hash: '#/operator/reports', icon: 'chart', key: 'reports' },
];

/** Both groups as one lookup — the routing contract the breadcrumb reads, never a second copy. */
const NAV: OpNavItem[] = [...PRIMARY, ...SECONDARY];

function go(hash: string) {
  window.location.hash = hash;
}

export default function OperatorShell({
  view,
  tenderId,
  onLogout,
  children,
}: {
  view: OpView;
  tenderId?: string;
  onLogout: () => void;
  children: ReactNode;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const isAr = lang === 'ar';
  const { state } = useStore();
  const today = todayIso();
  const cal = calendarOf(state);

  const session = loadSession();
  // the operating company + its Service Contract, resolved from the registries (never a literal);
  // each part is dropped from the chrome when it cannot be resolved
  const org = resolveSessionOrg(state, lang);
  const { toast } = useToasts();
  useRegisterDispatchFail((error) => toast(t('toastv2.dispatchFail'), { kind: 'error', desc: error }));
  const [q, setQ] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [quickId, setQuickId] = useState<string | null>(null);
  // د3 — the 72px shelf, remembered across reloads; the same hook the admin shell wears
  const { min, toggle: toggleMin } = useNavMin();
  const searchRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const ui = useMemo<OperatorUi>(
    () => ({
      toast,
      openQuickLook: (id: string) => setQuickId(id),
    }),
    [toast],
  );

  // D4 — the shell's counters and search read the SESSION's scope, mirroring the server
  // (apps/api/src/auth/scope.ts): an operator session must not count or find another company's
  // tenders; platform roles keep the full portfolio.
  const myTenders = sessionScopedTenders(state);
  const tasks = deriveTasks({ ...state, tenders: myTenders }, today, cal);
  const counts = { tasks: tasks.length, tenders: myTenders.length };

  // live search (≥ 2 chars) across name + code → jump to the file
  const qn = q.trim().toLowerCase();
  const results: Tender[] =
    qn.length < 2 ? [] : myTenders.filter((x) => (x.title[lang] + ' ' + x.code).toLowerCase().includes(qn)).slice(0, 5);

  /**
   * د2 — one jump, reached three ways: a click, Enter on the highlighted row, or the shortcut
   * that brought the reader here in the first place. The destination is the deep link that
   * already existed; the keyboard is what is new.
   */
  const pick = (i: number) => {
    const r = results[i];
    if (!r) return;
    setQ('');
    go(`#/operator/t/${r.id}`);
  };
  const search = useShellSearch({ query: q, count: results.length, hasQuery: qn.length >= 2, onPick: pick });

  /**
   * م5 — «N» raises a new request, from any view in this portal.
   *
   * It is the د2 shortcut written a second TIME, not a second WAY: the same `useArmedShortcut`
   * carries the typing guard, the IME guard and the `armed` flag, so the two keys cannot drift
   * apart about what «I am typing» means. The destination is the nav map's own hash — the row
   * below links to `#/operator/new` and this fires the same address, so the key and the row can
   * never point at two different places.
   *
   * Modifiers are excluded deliberately: Ctrl+N is the browser's window, and a bare letter is the
   * only form a page may claim.
   */
  const newHash = PRIMARY.find((n) => n.view === 'request')?.hash ?? '#/operator/new';
  const newArmed = useArmedShortcut(
    (e) => !e.ctrlKey && !e.metaKey && !e.altKey && e.key.toUpperCase() === NEW_REQUEST_KEY,
    () => go(newHash),
  );

  // close the open panels when clicking outside them
  useEffect(() => {
    if (!menuOpen && qn.length < 2) return;
    const onDown = (e: MouseEvent) => {
      if (menuOpen && menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setQ('');
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuOpen, qn.length]);

  const crumbTender = tenderId ? state.tenders.find((x) => x.id === tenderId) : undefined;
  /**
   * ق8 — the trail, read off the SAME nav maps the sidebar renders. Every segment, including the
   * ancestor's HREF: the admin shell already derives its own from `PRIMARY.find(...)`, and this
   * one used to hand-write `#/operator/tenders` beside it — one shell reading the routing contract
   * and the other retyping it, so a destination that moved would silently keep the old address
   * here alone. The two shells now answer the question the same way.
   *
   * `#/operator/t/:id` is the one view with no nav entry of its own: the sidebar already
   * highlights «المناقصات» for it (a file is reached THROUGH the register), so the trail names
   * that entry and links to ITS hash — the only link in the trail, because it is the only ancestor
   * that is a real destination.
   *
   * The operator shell has one secondary destination, so the trail gains a group segment only
   * there; the three daily destinations are the top level and print no invented group above
   * themselves. The company name stays the root when it resolves — it is the scope every row below
   * belongs to, and it is dropped rather than guessed when the registries cannot vouch for it.
   */
  const parent = view === 'file' ? NAV.find((n) => n.view === 'tenders') : undefined;
  const here = parent ?? NAV.find((n) => n.view === view);
  const viewLabel = t(`onav.${here?.key ?? view}`);
  const section = SECONDARY.some((n) => n.view === view) ? t('onav.tools') : null;

  /**
   * د3/§7-أ-5 — what a row is CALLED when its label is folded away.
   *
   * Collapsed the row is an icon, so its accessible name has to carry both the destination and the
   * count that used to sit beside it in a pill; expanded the row's own text is already that name,
   * and an `aria-label` there would only be a second copy of it to keep in sync. Returning
   * `undefined` is therefore the correct answer for the open rail, not a missing one.
   */
  const navName = (label: string, n?: number): string | undefined =>
    min ? (n ? t('shell.navItemCount', { name: label, n: fmtCount(n, lang) }) : label) : undefined;
  const minLabel = t(min ? 'shell.navExpand' : 'shell.navCollapse');

  return (
    <OperatorUiContext.Provider value={ui}>
      <div className={`op-shell${min ? ' op-shell--min' : ''}`} dir={isAr ? 'rtl' : 'ltr'}>
        {/* ---------- Sidebar ---------- */}
        <aside id={SIDE_ID} className="op-side" data-noprint="1">
          <div className="op-side__logo">
            {/* collapsed the wordmark has no room to be read, so the shipped SQUARE mark stands in
                — the same file the favicon already uses, not a new asset and not a cropped logo */}
            <img
              src={min ? '/logo-mark.svg' : '/logo-on-dark.svg'}
              alt={t('app.title')}
              onError={(e) => { (e.target as HTMLImageElement).src = '/logo.svg'; }}
            />
            {/* س2 — the release mark, read from `app.subtitle`'s own `app.rev` rather than typed
                a second time; the footer's copy is dropped in the admin shell for the same reason */}
            <span className="op-side__rev">{t('app.rev')}</span>
          </div>
          <nav className="op-nav" aria-label={t('onav.navLabel')}>
            {PRIMARY.map((n) => {
              const on = n.view === view || (n.view === 'tenders' && view === 'file');
              const label = t(`onav.${n.key}`);
              const count = n.counted ? counts[n.counted] : undefined;
              /**
               * م5 — the cap, and the three conditions it needs.
               *
               * `newArmed` is the honesty gate: the hint exists only while its listener does.
               * `!min` is the room gate — the collapsed rail is 72px of icon and has nowhere to
               * print a key, and the row's accessible name is already doing the work there.
               * `aria-keyshortcuts` says the same thing to a reader who gets no glyph, and the
               * `<kbd>` is `aria-hidden` so the two are never announced twice.
               */
              const capped = n.view === 'request' && newArmed;
              return (
                <a
                  key={n.view}
                  href={n.hash}
                  className={`op-nav__btn${on ? ' op-nav__btn--on' : ''}`}
                  aria-current={on ? 'page' : undefined}
                  title={label}
                  aria-label={navName(label, count)}
                  aria-keyshortcuts={capped ? NEW_REQUEST_KEY : undefined}
                >
                  <Icon name={n.icon} size={17} />
                  <span className="op-nav__lbl">{label}</span>
                  {capped && !min && (
                    <kbd className="op-nav__kbd" title={t('shell.newKeyHint')} aria-hidden="true">{NEW_REQUEST_KEY}</kbd>
                  )}
                  {count !== undefined && <NavCount base="op-nav__count" n={count} min={min} lang={lang} />}
                </a>
              );
            })}
            <div className="op-nav__group">{t('onav.tools')}</div>
            {SECONDARY.map((n) => {
              const on = n.view === view;
              const label = t(`onav.${n.key}`);
              return (
                <a
                  key={n.view}
                  href={n.hash}
                  className={`op-nav__btn${on ? ' op-nav__btn--on' : ''}`}
                  aria-current={on ? 'page' : undefined}
                  title={label}
                  aria-label={navName(label)}
                >
                  <Icon name={n.icon} size={17} />
                  <span className="op-nav__lbl">{label}</span>
                </a>
              );
            })}
          </nav>
          {org.name && (
            <div className="op-side__op">
              <div className="op-side__op-l">{t('shell.operatorLabel')}</div>
              <div className="op-side__op-name" dir="auto">{org.name}</div>
              {org.contractRef && <div className="op-side__op-ref">{org.contractRef}</div>}
            </div>
          )}
          <div className="op-side__credit">
            <div className="op-side__credit-l">{t('shell.creditLabel')}</div>
            <div className="op-side__credit-n">{t('shell.creditName')}</div>
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

        {/* ---------- Main ---------- */}
        <main className="op-main">
          <header className="op-topbar" data-noprint="1">
            <nav className="op-crumb" aria-label={t('onav.crumbLabel')}>
              {org.name && (
                <>
                  <span dir="auto">{org.name}</span>
                  <span className="op-crumb__sep">/</span>
                </>
              )}
              {section && (
                <>
                  <span>{section}</span>
                  <span className="op-crumb__sep">/</span>
                </>
              )}
              {/* on a file the register is the ANCESTOR, so it becomes the link back to it — and
                  the address comes off `parent.hash`, i.e. the nav map, never a hand-written path */}
              {parent
                ? <a className="op-crumb__a" href={parent.hash}>{viewLabel}</a>
                : <span className="op-crumb__b" aria-current="page">{viewLabel}</span>}
              {crumbTender && (
                <>
                  <span className="op-crumb__sep">/</span>
                  <span className="op-crumb__c" aria-current="page">{crumbTender.code}</span>
                </>
              )}
            </nav>

            <div className="op-search op-search--k" ref={searchRef}>
              <input
                ref={search.inputRef}
                className="op-search__in"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={search.onInputKeyDown}
                placeholder={t('shell.searchPlaceholder')}
                aria-label={t('shell.searchPlaceholder')}
                role="combobox"
                aria-expanded={search.open}
                aria-controls={search.open ? search.listId : undefined}
                aria-autocomplete="list"
                aria-activedescendant={search.activeId}
                aria-keyshortcuts={SEARCH_KEYS}
              />
              <span className="op-search__icon">
                <Icon name="search" size={14} strokeWidth={2} />
              </span>
              {/* the chip is rendered off `armed`, i.e. only once the listener exists — a shortcut
                  hint printed before its listener is a button with no action (§6 الصدق) */}
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
                  {results.length === 0 ? (
                    <div className="op-panel__empty" role="status">{t('shell.noResults', { q })}</div>
                  ) : (
                    results.map((r, i) => (
                      <button
                        key={r.id}
                        id={search.optionId(i)}
                        role="option"
                        aria-selected={search.active === i}
                        className="op-result"
                        onMouseEnter={() => search.setActive(i)}
                        onClick={() => pick(i)}
                      >
                        <span className="op-result__main">
                          <span className="op-result__name">{r.title[lang]}</span>
                          <span className="op-result__sub">
                            <span className="op-code">{r.code}</span>
                          </span>
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            <div className="op-top-actions">
              <ThemeToggle />
              <button className="op-langbtn" onClick={() => void i18n.changeLanguage(isAr ? 'en' : 'ar')}>
                {t('app.switchLang')}
              </button>

              <NoticeBell portal="operator" />

              <div className="op-notif" ref={menuRef}>
                <button
                  className="op-avatar"
                  title={session?.name ?? t('login.signOut')}
                  aria-label={session?.name ?? t('login.signOut')}
                  onClick={() => setMenuOpen((o) => !o)}
                >
                  {initials(session?.name ?? '—')}
                </button>
                {menuOpen && (
                  <div className="op-panel op-menu">
                    <div className="op-menu__head">
                      <div className="op-menu__name">{session?.name}</div>
                      <div className="op-menu__role">{session ? t(`roles.names.${roleKey(session.role)}`) : '—'}</div>
                    </div>
                    <button className="op-menu__out" onClick={onLogout}>
                      {t('login.signOut')}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>

          {children}
        </main>

        {/* ---------- Toasts (shared v2 queue) ---------- */}
        <ToastViewport />

        {/* ---------- Quick-look drawer ---------- */}
        {quickId && <QuickLook tenderId={quickId} onClose={() => setQuickId(null)} />}
      </div>
    </OperatorUiContext.Provider>
  );
}
