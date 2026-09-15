import { awardVerdict, scheduleCompliancePct, suggestMethod } from '@masaar/scpp-rules';
import { calendarDaysBetween } from '@masaar/working-days';
import { KpiTile, PathBadge, VerdictStrip } from '@masaar/ui';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import AccessSection from './admin/AccessSection';
import AdminShell, { type AdminView } from './admin/AdminShell';
import AdminTenders from './admin/AdminTenders';
import Approvals from './admin/Approvals';
import Audit from './admin/Audit';
import Compliance from './admin/Compliance';
import Contracts from './admin/Contracts';
import ContractProfile from './admin/ContractProfile';
import EntityProfile from './admin/EntityProfile';
import FollowUpRoom from './admin/FollowUpRoom';
import Holidays from './admin/Holidays';
import Fields from './admin/Fields';
import Operators from './admin/Operators';
import PathsGuide from './admin/PathsGuide';
import Reports from './admin/Reports';
import Schedule from './admin/Schedule';
import TenderReview from './admin/TenderReview';
import UserProfile from './admin/UserProfile';
import Vendors from './admin/Vendors';
import { apiLogout } from './api/endpoints';
import { isApiMode } from './config';
import Gallery from './Gallery';
import Login from './Login';
import { NoticeBell } from './NoticeBell';
import Inbox from './operator/Inbox';
import OperatorApprovals from './operator/Approvals';
import OperatorReports from './operator/OperatorReports';
import OperatorShell, { type OpView } from './operator/OperatorShell';
import TenderDetail from './operator/TenderDetail';
import TendersList from './operator/TendersList';
import AdvertiseWizard from './operator/wizard/AdvertiseWizard';
import CompleteWizard from './operator/wizard/CompleteWizard';
import EvaluateWizard from './operator/wizard/EvaluateWizard';
import RequestWizard from './operator/wizard/RequestWizard';
import TenderStatusReport from './report/TenderStatusReport';
import UpdateBrief from './report/UpdateBrief';
import WeeklyDeviationReport from './report/WeeklyDeviationReport';
import { roleKey } from './admin/access';
import { TierSplitBar } from './charts/TierSplitBar';
import { fmtCount, fmtMoneyShort } from './operator/derive';
import { clearSession, isOperatorRole, loadSession, type ApiRole } from './session';
import { watchSystemTheme } from './theme';
import { currentStage, expectedAwardDate, StoreProvider, useStore } from './store';
import { decisionQueue } from './admin/adminDerive';
import { activeTenders, awardedContracts, tierCountsOf } from './admin/dashboardDerive';
import { ToastsProvider } from './Toasts';

const ACCREDITED_ESTIMATE = 4_200_000;

function useHashRoute(): string {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return hash;
}

function Home() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const { state } = useStore();

  const [bid, setBid] = useState(4_620_000);
  const [value, setValue] = useState(1_000_000);

  // Client requests 6 + 13 — the awarded-contract headline and the live tender ladder, both
  // DERIVED from the store like every other figure on this page. Pre-login in API mode the
  // store is empty until hydration, so these read honest zeroes rather than a placeholder.
  const awarded = awardedContracts(state);
  const tierCounts = tierCountsOf(state, activeTenders(state));

  const verdict = awardVerdict(bid, ACCREDITED_ESTIMATE);
  const routing = suggestMethod({ estimatedValueUSD: value });

  // KPIs are DERIVED from the live store (C2 — computed, never a hardcoded figure). Pre-login in API
  // mode the store is empty until hydration, so these honestly read 0 rather than a fabricated stat.
  const openTenders = state.tenders.filter((tn) => currentStage(tn)).length;
  const awaitingRatification = decisionQueue(state).length;
  const scheduleCompliance = scheduleCompliancePct(
    state.tenders.flatMap((tn) => tn.stages.filter((s) => s.plannedTo).map((s) => ({ plannedEnd: s.plannedTo!, actualEnd: s.actualTo }))),
  );
  const awardSpans = state.tenders
    .map((tn) => { const a = expectedAwardDate(tn); return a ? calendarDaysBetween(tn.createdOn, a) : null; })
    .filter((d): d is number => d != null);
  const avgAwardDays = awardSpans.length ? Math.round(awardSpans.reduce((s, d) => s + d, 0) / awardSpans.length) : 0;

  return (
    <>
      <section className="kpis m-skin">
        <KpiTile label={t('kpi.openTenders')} value={openTenders} />
        <KpiTile label={t('kpi.awaitingRatification')} value={awaitingRatification} />
        <KpiTile label={t('kpi.scheduleCompliance')} value={scheduleCompliance} suffix="%" />
        <KpiTile label={t('kpi.avgAwardDays')} value={avgAwardDays} />
      </section>

      {/* The awarded-contract strip (request 13) and the ladder split of live requests
          (request 6). This is the public surface: the numbers are stated and explained, and
          nothing is a link — a visitor holds no session, so a «filter the registry» affordance
          here would be a control that cannot do what it offers. */}
      <section className="card">
        <h2>{t('home.awarded.title')}</h2>
        <p className="hint">{t('home.awarded.hint')}</p>
        <div className="ch-stats">
          <div className="ch-stat">
            <span className="ch-stat__l">{t('home.awarded.count')}</span>
            <span className="ch-stat__v">{fmtCount(awarded.count, lang)}</span>
          </div>
          <div className="ch-stat">
            <span className="ch-stat__l">{t('home.awarded.value')}</span>
            <span className="ch-stat__v">{fmtMoneyShort(awarded.valueUSD)}</span>
          </div>
          <div className="ch-stat">
            <span className="ch-stat__l">{t('home.awarded.completed')}</span>
            <span className="ch-stat__v">{fmtCount(awarded.completed, lang)}</span>
          </div>
          <div className="ch-stat">
            <span className="ch-stat__l">{t('home.awarded.inExecution')}</span>
            <span className="ch-stat__v">{fmtCount(awarded.inExecution, lang)}</span>
          </div>
        </div>
        <div style={{ marginBlockStart: 20 }}>
          <TierSplitBar counts={tierCounts} lang={lang} title={t('home.ladder.title')} />
        </div>
      </section>

      <section className="card">
        <h2>{t('verdict.title')}</h2>
        <p className="hint">{t('verdict.hint')}</p>
        <div className="row">
          <div className="field">
            <label htmlFor="estimate">{t('verdict.estimate')}</label>
            <input id="estimate" className="ro" value={ACCREDITED_ESTIMATE.toLocaleString('en-US')} readOnly />
          </div>
          <div className="field">
            <label htmlFor="bid">{t('verdict.bid')}</label>
            <input
              id="bid"
              type="number"
              step={10_000}
              min={0}
              value={bid}
              onChange={(e) => setBid(Number(e.target.value) || 0)}
            />
          </div>
        </div>
        <div style={{ marginTop: 18 }}>
          <VerdictStrip verdict={verdict} lang={lang} />
        </div>
      </section>

      <section className="card">
        <h2>{t('routing.title')}</h2>
        <p className="hint">{t('routing.hint')}</p>
        <div className="row">
          <div className="field">
            <label htmlFor="value">{t('routing.value')}</label>
            <input
              id="value"
              type="number"
              step={10_000}
              min={0}
              value={value}
              onChange={(e) => setValue(Number(e.target.value) || 0)}
            />
          </div>
          <PathBadge id={routing.method.id} lang={lang} showClause />
        </div>
        <p className="method-reason">{lang === 'ar' ? routing.reasonAr : routing.reasonEn}</p>
      </section>
    </>
  );
}

/** Operator portal routing inside the full-screen redesigned shell. */
function OperatorRoutes({ hash, onLogout }: { hash: string; onLogout: () => void }) {
  let view: OpView = 'inbox';
  let tenderId: string | undefined;
  let node = <Inbox />;

  if (hash === '#/operator/tenders') {
    view = 'tenders';
    node = <TendersList />;
  } else if (hash === '#/operator/reports') {
    view = 'reports';
    node = <OperatorReports />;
  } else if (hash === '#/operator/approvals') {
    // د9 — the scoped, read-only ladder view (settles POST-V2 §ج)
    view = 'approvals';
    node = <OperatorApprovals />;
  } else {
    const m = /^#\/operator\/t\/([^/]+)$/.exec(hash);
    if (m) {
      view = 'file';
      tenderId = m[1]!;
      node = <TenderDetail id={m[1]!} />;
    }
  }

  return (
    <OperatorShell view={view} tenderId={tenderId} onLogout={onLogout}>
      {node}
    </OperatorShell>
  );
}

/** Full-screen operator surfaces (wizards + A4 reports) — outside the portal chrome. */
function operatorFullscreen(hash: string): JSX.Element | null {
  if (hash === '#/operator/new') return <RequestWizard />;
  if (hash === '#/operator/reports/weekly') return <WeeklyDeviationReport />;
  const rep = /^#\/operator\/t\/([^/]+)\/report$/.exec(hash);
  if (rep) return <TenderStatusReport tenderId={rep[1]!} />;
  const w = /^#\/operator\/t\/([^/]+)\/w\/(advertise|evaluate|complete)$/.exec(hash);
  if (!w) return null;
  const id = w[1]!;
  if (w[2] === 'advertise') return <AdvertiseWizard tenderId={id} />;
  if (w[2] === 'evaluate') return <EvaluateWizard tenderId={id} />;
  return <CompleteWizard tenderId={id} />;
}

function route(hash: string) {
  if (hash === '#/ui') return <Gallery />;
  return <Home />;
}

/**
 * Who may enter #/admin: the five PLATFORM roles (SUPER_ADMIN / MDOC_ADMIN / JMC_APPROVER /
 * EVALUATION / AUDITOR). The two operator roles are company-scoped by definition (session.ts
 * isOperatorRole) and every admin registry is cross-company, so the panel is closed to them.
 * A session alone is not the gate — that was the bug: any signed-in operator walked in.
 */
const canEnterAdmin = (role: ApiRole): boolean => !isOperatorRole(role);

/**
 * Honest refusal, never a silent redirect (Design Principle 4): an operator that reaches
 * #/admin is told which role it holds, why the panel is closed to it, and where its own
 * portal is — a bounce to #/operator would leave it guessing whether the link was broken.
 */
function AdminAccessRefused({ role }: { role: ApiRole }) {
  const { t, i18n } = useTranslation();
  return (
    <div className="op-page op-page--reports" dir={i18n.language === 'ar' ? 'rtl' : 'ltr'}>
      <div className="op-page__head">
        <h1 className="op-page__title">{t('adminGate.title')}</h1>
      </div>
      <div className="op-empty">
        {t('adminGate.body', { role: t(`roles.names.${roleKey(role)}`) })}
        <div style={{ marginBlockStart: 12 }}>
          <a className="op-btn-ghost" href="#/operator">{t('adminGate.back')}</a>
        </div>
      </div>
    </div>
  );
}

/**
 * A retired route sending its traffic to the successor screen. `replace` rather than assignment,
 * so Back does not bounce the user straight into the dead address again.
 */
function Redirect({ to }: { to: string }) {
  useEffect(() => { window.location.replace(to); }, [to]);
  return null;
}

/** Admin panel — full-screen redesigned shell (dark sidebar + topbar). */
function renderAdmin(hash: string, onLogout: () => void) {
  /**
   * The platform-update brief is an A4 DOCUMENT, so it renders full-screen outside the shell —
   * exactly like the tender and weekly reports do in the operator portal. A sidebar and a topbar
   * have no business on a page whose whole point is that it prints. It is matched before the
   * single-segment dispatch below because `\w` does not match '/', so a two-segment admin address
   * would otherwise fall through to the follow-up room.
   *
   * It stays INSIDE the admin gate (renderAdmin is only reached by a platform role): the brief
   * reads cross-company figures, which is precisely what an operator session may not see.
   */
  if (hash === '#/admin/reports/update-brief') return <UpdateBrief />;

  const rv = /^#\/admin\/review\/(.+)$/.exec(hash);
  if (rv) return <AdminShell view="review" onLogout={onLogout}><TenderReview id={rv[1]!} /></AdminShell>;

  const ent = /^#\/admin\/entities\/(.+)$/.exec(hash);
  if (ent) return <AdminShell view="entities" onLogout={onLogout}><EntityProfile id={ent[1]!} /></AdminShell>;

  const ctr = /^#\/admin\/contracts\/(.+)$/.exec(hash);
  if (ctr) return <AdminShell view="contracts" onLogout={onLogout}><ContractProfile id={ctr[1]!} /></AdminShell>;

  // \w does not match '/', so a nested user route must be caught before the single-segment dispatch
  const usr = /^#\/admin\/users\/(.+)$/.exec(hash);
  if (usr) return <AdminShell view="users" onLogout={onLogout}><UserProfile id={usr[1]!} /></AdminShell>;

  // tolerate a trailing ?query (e.g. #/admin/fields?op=op-alwaha, #/admin/users?tab=roles)
  const m = /^#\/admin\/(\w+)(?:\?.*)?$/.exec(hash);
  const sub = m?.[1] ?? 'room';
  // `?tab=` is carried through by the section itself; a bare `#/admin/roles` is preserved for the
  // one thing it was ever asked, and answered by the tab that now holds it (client request 20).
  if (sub === 'roles') return <Redirect to="#/admin/users?tab=roles" />;
  // The MCT screen is retired (client ق3: hidden entirely) and the approval chain took its place.
  // A bookmark to it is REDIRECTED, not 404'd or silently re-rendered: the same portfolio question
  // now has a different, better answer, and the address bar must end up saying so.
  if (sub === 'mct') return <Redirect to="#/admin/approvals" />;
  if (sub === 'approvals') return <AdminShell view="approvals" onLogout={onLogout}><Approvals /></AdminShell>;
  if (sub === 'tenders') return <AdminShell view="tenders" onLogout={onLogout}><AdminTenders /></AdminShell>;
  if (sub === 'entities') return <AdminShell view="entities" onLogout={onLogout}><Vendors /></AdminShell>;
  if (sub === 'contracts') return <AdminShell view="contracts" onLogout={onLogout}><Contracts /></AdminShell>;
  // 'system' stays alive as an alias so existing bookmarks don't fall through to the room
  if (sub === 'users' || sub === 'system') return <AdminShell view="users" onLogout={onLogout}><AccessSection /></AdminShell>;
  if (sub === 'operators') return <AdminShell view="operators" onLogout={onLogout}><Operators /></AdminShell>;
  if (sub === 'fields') return <AdminShell view="fields" onLogout={onLogout}><Fields /></AdminShell>;
  // request 10 — the TIME-compliance registry the follow-up room's ratio tile now opens
  if (sub === 'schedule') return <AdminShell view="schedule" onLogout={onLogout}><Schedule /></AdminShell>;
  if (sub === 'holidays') return <AdminShell view="holidays" onLogout={onLogout}><Holidays /></AdminShell>;
  const LEGACY: Record<string, [AdminView, JSX.Element]> = {
    reports: ['reports', <Reports />],
    compliance: ['compliance', <Compliance />],
    paths: ['paths', <PathsGuide />],
    audit: ['audit', <Audit />],
  };
  const legacy = LEGACY[sub];
  if (legacy) return <AdminShell view={legacy[0]} onLogout={onLogout}><div className="op-legacy">{legacy[1]}</div></AdminShell>;
  return <AdminShell view="room" onLogout={onLogout}><FollowUpRoom /></AdminShell>;
}

export default function App() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const hash = useHashRoute();
  const [, forceRender] = useState(0);
  const session = loadSession();

  // The OS preference is followed only while the reader has expressed none of their own; the
  // subscription lives once, at the root, because the theme is a document-level fact.
  useEffect(watchSystemTheme, []);

  const logout = () => {
    if (isApiMode) void apiLogout().catch(() => {});
    clearSession();
    window.location.hash = '#/';
    forceRender((x) => x + 1);
  };

  // Operator portal — the redesigned full-screen shell (own topbar + sidebar).
  if (hash.startsWith('#/operator') && session) {
    const full = operatorFullscreen(hash);
    return (
      <StoreProvider>
        <ToastsProvider>{full ?? <OperatorRoutes hash={hash} onLogout={logout} />}</ToastsProvider>
      </StoreProvider>
    );
  }

  // Admin panel — full-screen redesigned shell. Gated on the ROLE, not merely on a session.
  if (hash.startsWith('#/admin') && session) {
    return (
      <StoreProvider>
        <ToastsProvider>
          {canEnterAdmin(session.role) ? renderAdmin(hash, logout) : <AdminAccessRefused role={session.role} />}
        </ToastsProvider>
      </StoreProvider>
    );
  }

  // Home / gallery / admin / login — shared top-bar layout.
  const needsAuth = hash.startsWith('#/operator') || hash.startsWith('#/admin');
  const section = hash.startsWith('#/operator') ? 'operator' : hash.startsWith('#/admin') ? 'admin' : hash === '#/ui' ? 'ui' : 'home';

  return (
    <StoreProvider>
      <header className="bar">
        <div className="bar-in">
          <img className="logo-adaptive" src="/logo.svg" alt={t('app.title')} />
          <div>
            <div className="bar-title">{t('app.title')}</div>
            <div className="bar-sub">{t('app.subtitle')}</div>
          </div>
          <nav className="nav">
            <a className={`nav-link${section === 'home' ? ' nav-link--on' : ''}`} href="#/">
              {t('nav.home')}
            </a>
            <a className={`nav-link${section === 'operator' ? ' nav-link--on' : ''}`} href="#/operator">
              {t('nav.operator')}
            </a>
            <a className={`nav-link${section === 'admin' ? ' nav-link--on' : ''}`} href="#/admin">
              {t('nav.admin')}
            </a>
            <a className={`nav-link${section === 'ui' ? ' nav-link--on' : ''}`} href="#/ui">
              {t('nav.gallery')}
            </a>
          </nav>
          {session && <NoticeBell portal="public" />}
          {session && (
            <button className="user-chip" title={t('login.signOut')} onClick={logout}>
              {session.name}
            </button>
          )}
          <button className="lang-btn" onClick={() => i18n.changeLanguage(isAr ? 'en' : 'ar')}>
            {t('app.switchLang')}
          </button>
        </div>
      </header>

      <main className="wrap">
        {needsAuth && !session ? <Login onLogin={() => forceRender((x) => x + 1)} /> : route(hash)}
        <p className="foot">{t('footer')}</p>
      </main>
    </StoreProvider>
  );
}
