import { useCountUp } from '@masaar/ui';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { CompanyBars } from '../charts/CompanyBars';
import { CompletionHistogram } from '../charts/CompletionHistogram';
import { Sparkline } from '../charts/Sparkline';
import { TierDonut } from '../charts/TierDonut';
import { fmtCount, fmtMoney, fmtMoneyShort, tenderStatus } from '../operator/derive';
import { Icon } from '../operator/Icon';
import { orgName } from '../orgIdentity';
import { EmptyState } from '../registry/EmptyState';
import { calendarOf, currentStage, resolveTiersFor, tenderApprovalTier, todayIso, useStore } from '../store';
import { WhatsNew } from '../WhatsNew';
import { approvalChain, awaitingTier, decisionQueue } from './adminDerive';
import {
  companyStats, complianceSeries, completionBuckets, contractsAtStage, SCOPES, tierCountsOf,
} from './dashboardDerive';
import { allTimeSchedulePct } from './scheduleDerive';
import { OverrideCaveat, TierPill } from './TierPill';

/**
 * The counting figure inside a KPI tile (spec §2-1).
 *
 * A COMPONENT, not a bare `useCountUp(…)` call inside the tile `.map()`: hooks may not be called
 * from a loop whose length can change, and the tile row does change (the ladder tiles come and go
 * with the store). One component per figure keeps the hook at the top level of its own render.
 *
 * `format` must be referentially stable — the caller memoizes it per language. An inline arrow
 * here would re-run the effect every render and restart the count from zero, forever.
 */
function KpiCount({ value, format }: { value: number; format: (n: number) => string }) {
  const ref = useCountUp(value, { format });
  /**
   * The markup ships the TRUE figure, already formatted by the caller's locale-aware `format`.
   * A hard-coded `0` was wrong twice over on a governance dashboard: the count-up only starts on
   * `IntersectionObserver` at `threshold: 0.4`, so a tile that never reaches 40% visibility — a
   * short viewport, a headless print of the room — displayed and announced a figure of zero that
   * no derivation had produced; and the literal was a Latin `0` whatever the language, and `0`
   * rather than `0%` on the ratio tile. The hook overwrites this node when the reveal fires, so
   * the animation is unchanged; what changed is that the pre-reveal state is now a fact.
   */
  return <span className="ad-kpi__v" ref={ref}>{format(value)}</span>;
}

/**
 * د17 — ONE spelling of «nothing» for the company table.
 *
 * The room used to say the same absence two ways: «—» in the scope, late and value columns and a
 * bare `0` in fields, tenders and contracts. Read across a row that is a typographic accident, not
 * a distinction — the reader is invited to look for a meaning that is not there — and it disagreed
 * with the operators registry, which spells nothing as «—» in every numeric cell of the row that
 * carries THE SAME FIGURES (the parity law of د14). The two screens now say it identically, and
 * they say it in one place rather than six, so the next column added cannot drift back.
 */
function Fig({ n, fmt }: { n: number; fmt: (n: number) => string }) {
  return n === 0 ? <span className="op-dev op-dev--none">—</span> : <>{fmt(n)}</>;
}

export default function FollowUpRoom() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const { state } = useStore();
  const today = todayIso();
  // memoized: `calendarOf` builds a fresh object each call, which would defeat every derivation
  // memo below it
  const cal = useMemo(() => calendarOf(state), [state]);

  const open = state.tenders.filter((x) => currentStage(x));
  const decisions = decisionQueue(state);
  // The two outstanding-signature counts, in the client's own vocabulary (ق1/ق3). They replace
  // the single «في دورة MCT» tile, which named a substrate the client asked never to show: the
  // question a manager actually opens this room with is «whose signature is this waiting on».
  const chain = approvalChain(state);
  const awaitingJmc = awaitingTier(chain, 'JMC').length;
  const awaitingMdoc = awaitingTier(chain, 'MDOC').length;
  // THE SAME call `#/admin/schedule` makes for its header KPI — one predicate, two surfaces, so
  // the tile's «open its decomposition» is a checkable claim rather than a hopeful one
  const compliance = allTimeSchedulePct(state);
  // «مراحل متأخرة» — the same predicate `tenderStatus` uses for 'delayed', which is exactly what
  // `#/admin/tenders?status=delayed` lists. The removed «مراحل متجاوزة للمخطط» panel counted this
  // and then made the reader scroll a list; the tile counts it and opens the registry that holds it.
  const late = state.tenders.filter((x) => tenderStatus(x, today, cal) === 'delayed').length;
  const inExecution = contractsAtStage(state, 'execute').length;

  const companies = useMemo(() => companyStats(state, today, cal), [state, today, cal]);
  const tierCounts = useMemo(() => tierCountsOf(state, state.tenders), [state]);
  const buckets = useMemo(() => completionBuckets(state.contracts), [state.contracts]);
  const series = useMemo(() => complianceSeries(state, today), [state, today]);

  /**
   * A tile that COUNTS ROWS is a real `<a>` to the registry listing exactly those rows (§5), and
   * the «افتح السجل مصفّى» line is printed in the RESTING state, not revealed on hover: an
   * affordance that only exists under a pointer does not exist for a touch or keyboard reader.
   *
   * «الالتزام بالجداول» — PHASE 4 CLOSURE of the phase-3 finding. It was the one tile with no
   * destination, and that was the honest answer at the time: a ratio over every stage ever closed
   * has no registry of rows, and the screen it used to point at (`#/admin/compliance`) answers §9
   * local content and §12.2 nominations — a different subject entirely. Client request 10 built
   * the registry that was missing (`#/admin/schedule`: planned against actual, request by request
   * and contract by contract), so the tile links again — to the DECOMPOSITION, not to a filtered
   * list, and it keeps naming the window it measures. Its affordance therefore reads «افتح
   * الامتثال الزمني», not «افتح السجل مصفّى»: the destination is unfiltered by construction, and
   * a tile must never promise a narrowing it does not carry.
   *
   * PHASE-4 FIX: «decomposition» was still only a word. This tile and that screen each computed
   * their own compliance figure over a different population in a different window, so the link
   * pointed at a number that did not decompose this one. `allTimeSchedulePct` is now the ONE
   * derivation both surfaces call, and `#/admin/schedule` prints it in its header beside its own
   * filtered windows — the same number in both places, pinned by test.
   *
   * No trend delta is emitted on any tile — the store keeps no earlier snapshot to compare
   * against, and the no-fabrication rule forbids inventing one: a «—» or a «0%» in a trend slot
   * asserts a comparison that was never made, which is the same lie as a wrong number.
   *
   * The two ladder tiles count `decision === 'pending'` rows, so they carry `pending=1` as well as
   * the band: `?tier=JMC` alone opens the whole band including the requests already decided, which
   * is a larger set than the number printed on the tile.
   */
  /* The two formatters the counting figures use. Memoized per language because `useCountUp` calls
     `format` on every frame and re-runs its effect whenever the reference changes — an inline
     arrow would reset the count on every render (spec §2-1, rule 1). Latin digits either way. */
  const fmtN = useCallback((n: number) => fmtCount(n, lang), [lang]);
  const fmtPct = useCallback((n: number) => `${fmtCount(n, lang)}%`, [lang]);

  /**
   * §2-ط — the same seven questions, now answered on a FILLED tile.
   *
   * Nothing about the row's behaviour moves: every destination, every count and the two tiles that
   * carry a window or a different affordance are exactly what they were. What changes is that the
   * quiet dot becomes the whole surface — the client's own request, and the reference's intent
   * corrected: its fills failed AA, ours are measured in `tokens.css` and guarded by test.
   *
   * `tone` REPLACES `dot` rather than joining it: the dot's colour and the tile's fill would be two
   * declarations of one decision, and the dot now inherits the tile's ink. The mapping is exactly
   * the one the dots already carried, so no tile makes a claim it did not make yesterday — and that
   * includes the two LADDER tiles: their dots were `--tier-jmc` and `--tier-mdoc`, two different
   * rungs of the authority ladder, and collapsing both onto `brand` erased a distinction the room
   * used to draw. `jmc`/`mdoc` are those same two rungs worn as a fill (§2-ط, tokens.css), so «ط2»
   * and «ط3» are told apart again — by the ladder's own vocabulary, not by a lifecycle state and
   * not by a new colour. The compliance ratio keeps the reading its dot has always had.
   */
  const kpis: {
    l: string; v: number; fmt: (n: number) => string;
    tone: 'brand' | 'risk' | 'delayed' | 'progress' | 'done' | 'planned' | 'jmc' | 'mdoc';
    href?: string; go?: string; window?: string;
  }[] = [
    { l: t('admin.kpiOpen'), v: open.length, fmt: fmtN, tone: 'progress', href: '#/admin/tenders?status=open' },
    { l: t('admin.kpiRatify'), v: decisions.length, fmt: fmtN, tone: 'risk', href: '#/admin/tenders?pending=1' },
    { l: t('adroom.kpiLate'), v: late, fmt: fmtN, tone: 'delayed', href: '#/admin/tenders?status=delayed' },
    { l: t('adroom.kpiExecuting'), v: inExecution, fmt: fmtN, tone: 'done', href: '#/admin/contracts?stage=execute' },
    {
      l: t('admin.kpiCompliance'), v: compliance, fmt: fmtPct, tone: 'done',
      href: '#/admin/schedule', go: t('adroom.openSchedule'), window: t('adroom.windowAllTime'),
    },
    { l: t('admin.kpiAwaitJmc'), v: awaitingJmc, fmt: fmtN, tone: 'jmc', href: '#/admin/approvals?tier=JMC&pending=1' },
    { l: t('admin.kpiAwaitMdoc'), v: awaitingMdoc, fmt: fmtN, tone: 'mdoc', href: '#/admin/approvals?tier=MDOC&pending=1' },
  ];

  /**
   * د9 — the donut's sub-line describes THE SYSTEM, so it prints the SYSTEM DEFAULT ceilings and
   * the sentence now says so (`ch.donut.sub`) instead of announcing them as the only ladder there
   * is. The donut's own SLICES need no change: they are counted by `tierCounts`, which routes
   * through `tenderApprovalTier` and therefore already places each tender in the band its own
   * company's ladder puts it in — the same is true of the «بانتظار موافقة» tiles above.
   */
  const ladderSub = t('ch.donut.sub', {
    op: fmtMoney(state.approvalTiers.operatorMaxUSD),
    jmc: fmtMoney(state.approvalTiers.jmcMaxUSD),
  });

  return (
    <div className="op-page ad-room">
      {/* The update strip (spec §2), admin variant — the same three facts as the operator's, with
          the two links this role can actually open: the A4 brief and the compliance registry. */}
      <WhatsNew audience="admin" />

      <div className="op-page__head">
        <div>
          <h1 className="op-page__title">{t('adroom.title')}</h1>
          {/* the portfolio breadth is DERIVED from the live registry (C2) — a hardcoded figure here
              would claim a portfolio size the store cannot vouch for (and reads wrong the moment an
              operator is created), exactly the fabrication the KPI row below never commits. */}
          <div className="op-page__sub">{t('adroom.sub', { operators: fmtCount(state.operators.length, lang) })}</div>
        </div>
        <a className="op-btn-ghost" href="#/operator/reports/weekly">
          <Icon name="printer" size={14} />{t('adroom.weeklyReport')}
        </a>
      </div>

      <div className="ad-kpis ad-kpis--wrap">
        {kpis.map((k) => {
          const body = (
            <>
              <span className="ad-kpi__head">
                {/* §2-ط-د — the one carrier of hierarchy inside a fully-filled row: «مراحل متأخرة»
                    pulses, and only while it counts something. Everything else stays still. */}
                <span className={`ad-kpi__dot${k.tone === 'delayed' && k.v > 0 ? ' ad-kpi__dot--alert' : ''}`} />
                <span className="ad-kpi__l">{k.l}</span>
              </span>
              <span className="ad-kpi__row">
                <KpiCount value={k.v} format={k.fmt} />
              </span>
              {/* the window a figure covers is printed whenever it is not simply «the rows below» —
                  the ratio tile carries BOTH: what it measures, and where its decomposition lives */}
              {k.window && <span className="ad-kpi__win">{k.window}</span>}
              {k.href && (
                <span className="ad-kpi__go">
                  {k.go ?? t('adroom.openFiltered')}
                  <Icon name="chevronStart" size={12} strokeWidth={2} className="op-chev-fwd" />
                </span>
              )}
            </>
          );
          const skin = 'ad-kpi ad-fill ad-kpi--fill';
          return k.href
            ? <a key={k.l} className={`${skin} ad-kpi--link`} data-tone={k.tone} href={k.href}>{body}</a>
            : <div key={k.l} className={skin} data-tone={k.tone}>{body}</div>;
        })}
      </div>

      {/* (د) schedule compliance month by month — placed directly under the strip that carries the
          all-time ratio, because it is the only decomposition of that figure this store can
          honestly draw. `Sparkline` returns null below two derivable points, so a store that
          cannot support a series prints no series, and never a line through a single number. */}
      {series.length >= 2 && (
        <div className="ad-panel ad-panel--fig ad-panel--stacked">
          {/* the same `<figure>` skeleton the other three charts use — one anatomy per surface
              class, and it is what spaces the caption, the strip and the note evenly */}
          <figure className="ch">
            <figcaption className="ch__cap">
              <span className="ch__t">{t('ch.spark.title')}</span>
              <span className="ch__s">{t('ch.spark.sub')}</span>
            </figcaption>
            <Sparkline points={series} lang={lang} />
            {/* the two percentages on this screen measure different windows and are computed by
                the same function — say which is which, rather than leave a reader to hunt for a
                discrepancy that is not one */}
            <div className="ch__note">{t('ch.spark.note')}</div>
          </figure>
        </div>
      )}

      <div className="ad-cols">
        {/* Decision queue */}
        <div className="ad-panel">
          <div className="ad-panel__head">
            <div>
              <div className="ad-panel__t">{t('adroom.decisions')}</div>
              <div className="ad-panel__s">{t('adroom.decisionsSub')}</div>
            </div>
            <span className="ad-panel__count ad-panel__count--amber">{decisions.length}</span>
          </div>
          {decisions.length === 0 ? (
            <EmptyState mode="empty" inline>{t('adroom.noDecisions')}</EmptyState>
          ) : (
            decisions.map((d) => (
              <button key={d.id} className="ad-decision" onClick={() => { window.location.hash = `#/admin/review/${d.id}`; }}>
                <span className="ad-decision__icon"><Icon name="check" size={16} /></span>
                <span className="ad-decision__body">
                  <span className="ad-decision__t">{t('adroom.decideRatify')}</span>
                  <span className="ad-decision__meta">
                    <span dir="auto">{d.title[lang]}</span>
                    <span className="op-code">{d.code}</span>
                    {/* whose signature this queue entry is actually waiting on (ق1) — the queue is
                        read at a glance, and «who decides» is the first thing it should answer */}
                    {/* د9 — this row describes ONE tender: its own company's ladder, not the default */}
                    <TierPill tier={tenderApprovalTier(state, d)} tiers={resolveTiersFor(state, d.operatorId)} />
                    <span className="op-scpp">SCPP 6.6</span>
                  </span>
                </span>
                <span className="ad-decision__due">{t('adroom.awaiting')}</span>
                <span className="op-btn-primary">{t('adroom.openDecision')}<Icon name="chevronStart" size={13} strokeWidth={2} className="op-chev-fwd" /></span>
              </button>
            ))
          )}
        </div>

        {/* (ب) the ladder split — the figure lives directly in the panel, never in a card inside it */}
        <div className="ad-panel ad-panel--fig">
          <TierDonut counts={tierCounts} lang={lang} sub={ladderSub} />
          {/* د9 §7-7 — the sub-line above says the ceilings are the DEFAULT, but a tag alone does
              not say how far the exception reaches. This is the SAME component and the SAME key
              the role card uses, so the room and the card can never quote two different N. */}
          <OverrideCaveat state={state} className="ad-ladder__note" />
        </div>
      </div>

      <div className="ad-cols">
        {/* (أ) per-company bars — all twelve companies, zero rows included */}
        <div className="ad-panel ad-panel--fig">
          <CompanyBars rows={companies} lang={lang} />
        </div>

        {/* (ج) contract completion distribution */}
        <div className="ad-panel ad-panel--fig">
          <CompletionHistogram buckets={buckets} lang={lang} />
        </div>
      </div>

      {/* Client request 2 — the per-company detail, folded away by default because it answers a
          second question («what kind of work does each company run») that the bars above do not.
          A native <details>: the panel IS the disclosure, so nothing is nested inside a card. */}
      <details className="ad-panel ad-disc">
        <summary className="ad-panel__head ad-disc__sum">
          <div>
            <div className="ad-panel__t">{t('adroom.companies')}</div>
            <div className="ad-panel__s">{t('adroom.companiesSub')}</div>
          </div>
          <span className="ad-panel__count">{fmtCount(companies.length, lang)}</span>
          <Icon name="chevronEnd" size={14} strokeWidth={2} className="ad-disc__caret" />
        </summary>
        {/* the widest table in the room (four fixed columns + one per scope): it scrolls INSIDE its
            own box, so the page itself never gains a horizontal scrollbar */}
        <div className="ad-tblwrap">
          <table className="op-tbl">
            <thead>
              <tr>
                <th>{t('adroom.colCompany')}</th>
                <th className="op-end">{t('adroom.colFields')}</th>
                {SCOPES.map((s) => <th key={s} className="op-end">{t(`compliance.scope.${s}`)}</th>)}
                <th className="op-end">{t('adroom.colTenders')}</th>
                <th className="op-end">{t('adroom.colLate')}</th>
                <th className="op-end">{t('adroom.colContracts')}</th>
                <th className="op-end">{t('adroom.colContractValue')}</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((r) => (
                <tr key={r.op.id} className="op-tbl__row">
                  <td>
                    {/* a real link: the operators registry, narrowed to this company */}
                    <a className="acc-open" href={`#/admin/operators?op=${encodeURIComponent(r.op.id)}`} dir="auto">
                      {orgName(r.op, lang)}
                      <Icon name="chevronEnd" size={12} strokeWidth={2} className="op-chev-fwd" />
                    </a>
                  </td>
                  <td className="op-end mono"><Fig n={r.fields} fmt={fmtN} /></td>
                  {SCOPES.map((s) => (
                    <td key={s} className="op-end mono"><Fig n={r.scopes[s]} fmt={fmtN} /></td>
                  ))}
                  <td className="op-end mono"><Fig n={r.tenders} fmt={fmtN} /></td>
                  {/* the ONE cell in the table that changes ink, and it changes it for the one
                      reason the room's alarm vocabulary allows: a real count of late stages */}
                  <td className={`op-end mono${r.late > 0 ? ' ad-num--late' : ''}`}>
                    <Fig n={r.late} fmt={fmtN} />
                  </td>
                  <td className="op-end mono"><Fig n={r.contracts} fmt={fmtN} /></td>
                  <td className="op-end mono"><Fig n={r.contractValueUSD} fmt={fmtMoneyShort} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* the one thing a reader cannot infer from the zeros: a contract is attributed to a
            company only through its originating tender, and a contract signed without one is
            attributed to nobody rather than guessed at */}
        <div className="ad-note">{t('adroom.companiesNote')}</div>
      </details>
    </div>
  );
}
