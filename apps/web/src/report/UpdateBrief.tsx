import type { ApprovalTier } from '@masaar/scpp-rules';
import { useTranslation } from 'react-i18next';
import { approvalChain, awaitingTier } from '../admin/adminDerive';
import {
  activeTenders, awardedContracts, companyStats, TENDER_PARTS, tenderPartOf, tierCountsOf,
  type TenderPart,
} from '../admin/dashboardDerive';
import { DefaultLadderNote, TIER_ORDER, tierRange } from '../admin/TierPill';
import { fmtCount, fmtMoney } from '../operator/derive';
import { Icon } from '../operator/Icon';
import { resolveSessionOrg } from '../orgIdentity';
import { calendarOf, todayIso, useStore } from '../store';
import './report.css';

/**
 * «موجز تحديث منصة مسار» — the platform-update brief (CLIENT-SHOWCASE-SPEC §1).
 *
 * NOT a marketing page: an official document on the SAME A4 report system every other printed
 * surface uses (report.css, the header/title-block/footer anatomy of TenderStatusReport), so the
 * reader recognises it as one of their own documents rather than a slide.
 *
 * ── THE GOVERNING CONSTRAINT ────────────────────────────────────────────────────────────────────
 * Not one number in this file is written down. Every figure is read through an existing derivation
 * — the ladder from `state.approvalTiers` via `tierRange`, the queues from `awaitingTier`, the
 * portfolio from `companyStats` / `tenderPartOf` / `awardedContracts` — so the brief cannot survive
 * its own data going stale: change a tender and the sentence changes with it. The ONLY fixed text
 * is the «ما تغيّر» list, which states facts about what shipped and contains no figures at all.
 * `test/showcase.test.tsx` greps this source and fails on any digit outside a translation key or a
 * CSS class name, which is why there are no inline pixel sizes or column widths here either.
 *
 * ── WHY NO EXPORT STAMP ─────────────────────────────────────────────────────────────────────────
 * Every registry print and CSV carries `reportStamp` because each answers «which narrowing produced
 * these rows». This document narrows nothing and tabulates no registry population: a row count here
 * would be a checkable claim about a table that does not exist. Its provenance clause is the footer
 * sentence the spec fixes — «كل رقم محسوب لحظة العرض من سجلّ منصتكم» — which is the same promise
 * stated about the whole page instead of about a filtered subset of it.
 */

/** The seven shipped facts, in reading order — the one fixed text on the page (spec §1-4). */
const FACTS = ['ladder', 'archive', 'stamp', 'schedule', 'merged', 'gate', 'access'] as const;

export default function UpdateBrief() {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language === 'ar' ? 'ar' : 'en') as 'ar' | 'en';
  const { state } = useStore();
  const today = todayIso();
  const cal = calendarOf(state);

  /**
   * Who ISSUES the document. The session's own operating company when there is one (an operator
   * reading their own copy), otherwise the parent company that owns the platform — named from the
   * locale, never assembled from a record that does not exist: `state.operators` holds the twelve
   * Lead Contractors, and نفط الوسط is not one of them.
   */
  const issuer = resolveSessionOrg(state, lang).name ?? t('brief.parentOrg');

  // ── the ladder, live ──────────────────────────────────────────────────────────────────────────
  // Two DIFFERENT questions, kept apart because they have different answers: how many live requests
  // sit in a band, and how many of them still owe that body a signature. The room's tiles and the
  // approvals registry read the same two derivations, so this page cannot disagree with either.
  const chain = approvalChain(state);
  const waiting: Record<Exclude<ApprovalTier, 'OPERATOR'>, number> = {
    JMC: awaitingTier(chain, 'JMC').length,
    MDOC: awaitingTier(chain, 'MDOC').length,
  };
  const inBand = tierCountsOf(state, activeTenders(state));

  // ── the portfolio, live ───────────────────────────────────────────────────────────────────────
  const companies = companyStats(state, today, cal);
  // The fields the companies above actually hold — the same population `companyStats` counts one
  // company at a time (§7.1: a field's service contract is where its authority comes from). A
  // field registered under no company is excluded rather than folded in, because the row's own
  // label claims the fields of these companies and nothing else.
  const fields = state.fields.filter((f) => companies.some((c) => c.op.id === f.operatorId)).length;
  const partCount = (p: TenderPart) => state.tenders.filter((x) => tenderPartOf(x) === p).length;
  const awarded = awardedContracts(state);

  const portfolio = [
    {
      k: 'rowCompanies',
      n: companies.length,
      detail: t('brief.companiesDetail'),
    },
    {
      k: 'rowFields',
      n: fields,
      detail: t('brief.fieldsDetail'),
    },
    {
      k: 'rowTenders',
      n: state.tenders.length,
      // the three lifecycle parts PARTITION the registry — they add up to the count beside them
      detail: TENDER_PARTS.map((p) => `${t(`ch.part.${p}`)} ${fmtCount(partCount(p), lang)}`).join(' · '),
    },
    {
      k: 'rowContracts',
      n: awarded.count,
      detail: t('brief.contractsDetail', {
        value: fmtMoney(awarded.valueUSD),
        completed: fmtCount(awarded.completed, lang),
        inExecution: fmtCount(awarded.inExecution, lang),
      }),
    },
  ];

  return (
    <div className="rp-screen">
      <div className="rp-toolbar">
        <a className="op-btn-ghost" href="#/admin/reports">{t('brief.back')}</a>
        <span className="rp-toolbar__title">{t('brief.title')}</span>
        <span className="rp-toolbar__spacer" />
        {/* the report system's own print path — @media print in report.css drops this toolbar */}
        <button className="op-btn-primary" onClick={() => window.print()}>
          <Icon name="printer" />{t('report.print')}
        </button>
      </div>

      <div className="rp-page theme-light" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <div className="rp-hdr">
          <img src="/logo.svg" alt={t('app.title')} />
          <div className="rp-hdr__ref">DOC MSR-UPD-{today.replace(/-/g, '')}<br />PLATFORM · UPDATE BRIEF</div>
        </div>

        <div className="rp-body">
          <div className="rp-titleblock">
            <div>
              <div className="rp-eyebrow">{t('brief.eyebrow')}</div>
              <h1 className="rp-h1">{t('brief.title')}</h1>
              <p className="rp-p rp-sub">{t('brief.sub')}</p>
            </div>
            <table className="rp-metatbl">
              <tbody>
                <tr><td className="k">{t('brief.issuer')}</td><td dir="auto">{issuer}</td></tr>
                <tr><td className="k">{t('report.issueDate')}</td><td className="v">{today}</td></tr>
              </tbody>
            </table>
          </div>

          {/* ① the ladder — the client's own governing idea, with THEIR ceilings and THEIR queues */}
          <div className="rp-sec rp-sec--avoid">
            <div className="rp-sec__head">
              <span className="rp-sec__t">{t('brief.ladderTitle')}</span>
              <span className="rp-sec__hint">{t('brief.ladderHint')}</span>
            </div>
            <table className="rp-tbl">
              <thead>
                <tr>
                  <th>{t('brief.colTier')}</th>
                  <th>{t('brief.colBody')}</th>
                  <th>{t('brief.colBand')}</th>
                  <th className="c">{t('brief.colInBand')}</th>
                  <th className="c">{t('brief.colWaiting')}</th>
                </tr>
              </thead>
              <tbody>
                {TIER_ORDER.map((tier) => (
                  <tr key={tier}>
                    <td>{t(`tier.pill.${tier}`)}</td>
                    <td>{t(`tier.body.${tier}`)}</td>
                    {/* د9 — the DEFAULT ceilings, read from state; the note under the table says
                        so and counts the companies on a ladder of their own. The two count columns
                        need no such caveat: `awaitingTier` goes through `tenderApprovalTier`, so
                        every request is already counted in the band ITS ladder puts it in. */}
                    <td className="rp-num">{tierRange(tier, state.approvalTiers)}</td>
                    <td className="c rp-mono">{fmtCount(inBand[tier], lang)}</td>
                    <td className="c">
                      {/* ط1 opens no approval gate at all, so it has no queue to print — a zero
                          there would read as «nobody is waiting today» rather than «nobody ever
                          waits», which is a different and false claim */}
                      {tier === 'OPERATOR'
                        ? <span className="rp-st--muted">{t('brief.noGate')}</span>
                        : <span className="rp-mono">{fmtCount(waiting[tier], lang)}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <DefaultLadderNote state={state} className="rp-note" />
            <div className="rp-note">{t('brief.ladderNote')}</div>
          </div>

          {/* ② the portfolio as the store holds it right now */}
          <div className="rp-sec rp-sec--avoid">
            <div className="rp-sec__head">
              <span className="rp-sec__t">{t('brief.portfolioTitle')}</span>
              <span className="rp-sec__hint">{t('brief.portfolioHint')}</span>
            </div>
            <table className="rp-kvtbl">
              <tbody>
                {portfolio.map((row) => (
                  <tr key={row.k}>
                    <td className="k">{t(`brief.${row.k}`)}</td>
                    <td className="rp-num">{fmtCount(row.n, lang)}</td>
                    <td>{row.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ③ what changed — the only fixed text on the page: facts, never promises */}
          <div className="rp-sec rp-sec--avoid">
            <div className="rp-sec__head">
              <span className="rp-sec__t">{t('brief.changesTitle')}</span>
              <span className="rp-sec__hint">{t('brief.changesHint')}</span>
            </div>
            <ul className="rp-list">
              {FACTS.map((f) => <li key={f}>{t(`brief.fact.${f}`)}</li>)}
            </ul>
          </div>
        </div>

        <div className="rp-ftr">
          <span>{t('brief.footer')}</span>
          {/* the same footer reference the other two A4 models carry; it lives in the locale so
              this file can stay literally digit-free (see the zero-literal guard) */}
          <span className="rp-ftr__ref">{t('brief.docRef')}</span>
        </div>
      </div>
    </div>
  );
}
