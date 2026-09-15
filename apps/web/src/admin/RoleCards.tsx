import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fmtCount, fmtMoney } from '../operator/derive';
import { Icon } from '../operator/Icon';
import { API_ROLES, type ApiRole } from '../session';
import { useStore, type State } from '../store';
import {
  capsForRole, holdersOfRole, impactfulCount, readCount, roleFinancialFacts, roleIcon, roleKey, roleTone,
} from './access';
import { tierExample } from './adminDerive';
import { DefaultLadderNote, LadderSourceTag, OverrideCaveat, TIER_ORDER, TierPill, tierRange } from './TierPill';
import { initials } from './Users';

/**
 * The ROLES tab of «الوصول والأدوار» (client requests 20 + 21).
 *
 * The client's complaint was not that the capability matrix was wrong — it is exactly right — but
 * that it answers a question nobody asks first. The first question is «من هذا الدور، وعلى ماذا
 * يوافق؟», and a 46×7 grid of glyphs cannot answer it. So this tab answers it in three sentences
 * per role, in large type, and keeps the grid one tab away for whoever needs to reconcile.
 *
 * NOTHING HERE IS AUTHORED. The three financial facts come from `roleFinancialFacts`, which reads
 * the live ladder and the same rank table the ratify gate enforces; the counts come from the
 * capability register; the holders come from the account list. A card cannot promise an authority
 * the server would refuse, because it is not allowed to know one.
 */

/* ------------------------------------------------------------------ triad */

/**
 * «من يوافق على ماذا» — the three approving bodies with their live ceilings and, where the
 * platform actually holds one, a worked example drawn from a real request in that band.
 *
 * `tierExample` is guarded: an empty band shows its range and says so, rather than borrowing a
 * figure from somewhere it does not belong.
 */
export function TriadExplainer({ state }: { state: State }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  /** د9 — the triad describes THE SYSTEM, so it shows the default ladder; the tag beside the
   *  heading says so, and `DefaultLadderNote` in the foot counts the companies that are not on it.
   *  `tierExample` needs no change: it goes through `tenderApprovalTier`, which already resolves
   *  per operator, so an example is drawn from a request that really does sit in that band. */
  const tiers = state.approvalTiers;

  return (
    <section className="ad-panel acc-triad">
      <div className="ad-panel__head">
        <div>
          <div className="ad-panel__t">{t('triad.title')} <LadderSourceTag own={false} /></div>
          <div className="ad-panel__s">{t('triad.sub')}</div>
        </div>
      </div>
      <div className="acc-triad__grid">
        {TIER_ORDER.map((tier) => {
          const example = tierExample(state, tier);
          return (
            <div key={tier} className={`acc-triad__body acc-triad__body--${tier.toLowerCase()}`}>
              <div className="acc-triad__head">
                <TierPill tier={tier} tiers={tiers} />
                <span className="acc-triad__band">{tierRange(tier, tiers)}</span>
              </div>
              <div className="acc-triad__who">{t(`tier.body.${tier}`)}</div>
              <p className="acc-triad__what">{t(`triad.what.${tier}`)}</p>
              {example ? (
                /* the code and the figure are MACHINE data: each gets its own LTR mono island,
                   or bidi reorders «$7,800,000» into «7,800,000$» inside the Arabic run */
                <div className="acc-triad__ex">
                  <Icon name="chevronEnd" size={11} strokeWidth={2} className="op-chev-fwd" />
                  <span>{t('triad.exampleLead')}</span>
                  <span className="acc-mono">{example.code}</span>
                  <span className="acc-mono">{fmtMoney(example.estimatedValueUSD)}</span>
                  <span>{t('triad.exampleTail', { body: t(`tier.body.${tier}`) })}</span>
                </div>
              ) : (
                <div className="acc-triad__ex acc-triad__ex--none">{t('triad.noExample')}</div>
              )}
            </div>
          );
        })}
      </div>
      {/* `n`, never `count`: i18next reserves `count` for pluralization, and a Latin-digit
          string handed to it would be read as a plural selector rather than printed */}
      <div className="acc-triad__foot">
        {t('triad.foot', { n: fmtCount(state.tenders.length, lang) })}
        <DefaultLadderNote state={state} />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- role cards */

function RoleCard({ role, state }: { role: ApiRole; state: State }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const [open, setOpen] = useState(false);

  const holders = holdersOfRole(role, state.users);
  const caps = capsForRole(role);
  const facts = roleFinancialFacts(role, state.approvalTiers);

  /**
   * «يوافق حتى؟» — the ceiling of the band this role's signature clears, read off the live ladder.
   * The figure is rendered as its own mono LTR island rather than interpolated into the sentence:
   * a `$` left loose in an RTL run is reordered to the far end («10,000,000$»), which is a wrong
   * number in the one place on this screen that must not be misread.
   *
   * د9 §7-5 — the ceiling comes from `roleFinancialFacts(role, state.approvalTiers)`, which asks
   * the DEFAULT ladder, and rightly so: the question is about a ROLE, and a role's rank is not a
   * property of any one company. But printed bare the figure said «this signature clears exactly
   * $X» — true of every company on the default and false of any company on a ladder of its own.
   * The function therefore does not change; the SENTENCE does. The figure wears the same
   * «الافتراضي النظامي» tag every other system-describing surface wears, and `OverrideCaveat`
   * adds the one clause the tag cannot carry — how many companies are measured by something else.
   *
   * Only this branch is qualified. «لا يوافق» names no ceiling at all, and «يوافق على الكل» is the
   * MDOC rank, which clears the top band whatever its floor is: an override moves ceilings, never
   * the fact that the last rung is unbounded. Tagging either would be a caveat about nothing.
   */
  const readsDefaultCeiling = facts.decides && !facts.approvesUnlimited;
  const approves = !facts.decides
    ? <>{t('rolecard.approvesNone')}</>
    : facts.approvesUnlimited
      ? <>{t('rolecard.approvesAll')}</>
      : (
        <>
          {t('rolecard.approvesUpTo')}{' '}
          <span className="acc-rc__money">{fmtMoney(facts.approvesUpToUSD ?? 0)}</span>{' '}
          <LadderSourceTag own={false} />
        </>
      );

  return (
    <article className={`acc-rc acc-rc--${roleTone(role)}`}>
      <header className="acc-rc__head">
        <span className="acc-rc__icon" aria-hidden="true"><Icon name={roleIcon(role)} size={20} /></span>
        <div className="acc-rc__id">
          <h3 className="acc-rc__name">{t(`roles.names.${roleKey(role)}`)}</h3>
          <span className="op-code acc-rc__code">{role}</span>
        </div>
        <span className="acc-rc__holders" title={t('rolecard.holders')}>{fmtCount(holders.length, lang)}</span>
      </header>

      <p className="acc-rc__who">{t(`caps.layer_${role}`)}</p>

      {/* the three financial facts, in the client's own words and in large type (request 21) */}
      <dl className="acc-rc__facts">
        <div className="acc-rc__fact">
          <dt>{t('rolecard.qApproves')}</dt>
          {/* the caveat lives INSIDE the <dd>: a <dl> with div wrappers admits dt/dd and nothing
              else between them, and `.ad-ladder__note` resets the size the --strong figure sets */}
          <dd className={facts.decides ? 'acc-rc__v acc-rc__v--strong' : 'acc-rc__v acc-rc__v--none'}>
            {approves}
            {readsDefaultCeiling && <OverrideCaveat state={state} className="ad-ladder__note" />}
          </dd>
        </div>
        <div className="acc-rc__fact">
          <dt>{t('rolecard.qWitnesses')}</dt>
          <dd className={facts.decides ? 'acc-rc__v acc-rc__v--strong' : 'acc-rc__v acc-rc__v--none'}>
            {facts.decides ? t('rolecard.witnessYes') : t('rolecard.witnessNo')}
          </dd>
        </div>
        <div className="acc-rc__fact">
          <dt>{t('rolecard.qScope')}</dt>
          <dd className="acc-rc__v">
            {facts.scope === 'company' ? t('access.scopeOwnCompany') : t('access.scopeWhole')}
          </dd>
        </div>
      </dl>

      <div className="acc-rc__stats">
        <span><span className="acc-mono">{fmtCount(impactfulCount(role), lang)}</span> {t('caps.statActions')}</span>
        <span><span className="acc-mono">{fmtCount(readCount(role), lang)}</span> {t('caps.statReads')}</span>
      </div>

      {holders.length === 0 ? (
        <div className="acc-rc__orphan">{t('caps.noHolder')}</div>
      ) : (
        <div className="acc-rc__people">
          {holders.map((h) => (
            <a key={h.id} className="acc-avatar acc-avatar--sm" href={`#/admin/users/${h.id}`} title={h.name}>
              {initials(h.name)}
            </a>
          ))}
        </div>
      )}

      {/*
        «حاملو الدور» — the way from a role to the ACCOUNTS this role is granted to, filtered.
        Granting, revoking and disabling are per-ACCOUNT acts and they live on the account file
        (`#/admin/users/:id` — ChangeRoleModal / MoveScopeModal / DisableModal), which is where the
        guards are: the orphan-role warning, the last-enabled-super-admin rule and the scope
        consistency check all need a specific person to reason about. A «grant this role» button on
        a card would be a second mutation surface with none of that, so the card LINKS to the file
        instead of duplicating it — which is the affordance the acceptance criterion asked for.
      */}
      <a className="acc-rc__holderlink" href={`#/admin/users?role=${role}`}>
        <Icon name="users" size={12} />
        {t('rolecard.holdersLink', { n: fmtCount(holders.length, lang) })}
        <Icon name="chevronEnd" size={12} strokeWidth={2} className="op-chev-fwd" />
      </a>

      {/* the detailed list is the SAME register the matrix renders — expanded, never restated */}
      <button
        type="button"
        className="acc-rc__more"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {/* the disclosure caret follows the registry explainer's convention exactly (registry.css
            .reg-explain__caret): mirrored under RTL, rotated 90° when open — one gesture for
            «expand me» wherever the reader meets it */}
        <Icon name="chevronEnd" size={12} strokeWidth={2} className="acc-rc__caret" />
        {t('rolecard.showCaps', { n: fmtCount(caps.length, lang) })}
      </button>
      {open && (
        caps.length === 0 ? (
          <div className="ad-empty-inline">{t('rolecard.noCaps')}</div>
        ) : (
          <ul className="acc-rc__caps">
            {caps.map((c) => (
              <li key={c.id} title={t('caps.authority', { route: `${c.method} ${c.route}`, roles: c.roles.join(', ') || '—' })}>
                <span className={c.mutating ? 'acc-type--action' : 'acc-type--read'}>
                  {c.mutating ? t('access.typeAction') : t('access.typeRead')}
                </span>
                <span dir="auto">{c.label[lang]}</span>
                {c.clause && <span className="op-scpp">{c.clause}</span>}
              </li>
            ))}
          </ul>
        )
      )}
    </article>
  );
}

export default function RoleCards() {
  const { t } = useTranslation();
  const { state } = useStore();

  return (
    <>
      <TriadExplainer state={state} />
      <div className="acc-tabhead" style={{ marginBlockStart: 16 }}>
        <div className="acc-tabhead__s">{t('rolecard.gridSub')}</div>
      </div>
      <div className="acc-rc-grid">
        {API_ROLES.map((r) => <RoleCard key={r} role={r} state={state} />)}
      </div>
    </>
  );
}
