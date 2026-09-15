import { bidderCounts } from '@masaar/scpp-rules';
import { PathBadge } from '@masaar/ui';
import { useTranslation } from 'react-i18next';
import { roleKey } from '../admin/access';
import { TierPill } from '../admin/TierPill';
import { operatorContact } from '../orgIdentity';
import { resolveTiersFor, tenderApprovalTier, useStore, type Tender } from '../store';
import { fmtCount } from './derive';

type Lang = 'ar' | 'en';

/** An org/field name in the reading language, falling back to the registry's Arabic name. */
const orgName = (o: { name: string; nameEn?: string } | undefined, lang: Lang): string | undefined =>
  o ? (lang === 'en' ? (o.nameEn ?? o.name) : o.name) : undefined;

/**
 * ت3 · ت4 · ت5 — the file's side column: three cards that state WHO raised the request, HOW MANY
 * companies are standing in it, and under WHICH path and authority it is judged.
 *
 * Nothing here is authored. The path chip and its clause come from `PathBadge showClause`
 * (METHODS owns the clause, so no «SCPP §11» is ever typed); the band comes from
 * `tenderApprovalTier` reading the LIVE ladder in the store, so no threshold is restated; the
 * funnel comes from `bidderCounts` — the same derivation `TenderReview` judges with.
 *
 * §12.4.2 IS STRUCTURAL HERE, not a condition: the funnel renders three COUNTS and nothing else.
 * It never holds a bidder name or a price to hide, so there is no disclosure moment at which it
 * changes — which is the only form of the gate a redesign cannot accidentally re-open.
 */
export default function FileSide({ tender }: { tender: Tender }) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language === 'ar' ? 'ar' : 'en') as Lang;
  const { state } = useStore();

  const op = state.operators.find((o) => o.id === tender.operatorId);
  const field = state.fields.find((f) => f.id === tender.fieldId);
  /**
   * Client question 18 — the contact is DERIVED, never invented (`operatorContact`, shared with
   * the operators registry): the operator's first enabled account is the one the registry can
   * vouch for and the only one printed. A company with no live account gets no contact line at
   * all, because the alternative is printing a person who does not exist.
   */
  const contact = operatorContact(state, tender.operatorId);

  const counts = bidderCounts(tender.bidders);
  const funnel = [
    { key: 'applied', n: counts.applied },
    { key: 'qualified', n: counts.qualified },
    { key: 'priced', n: counts.priced },
  ] as const;
  // the widest bar is the widest COUNT, so a funnel of 1/1/1 does not read as a funnel of 9/9/9
  const top = Math.max(...funnel.map((f) => f.n), 0);

  const opLabel = orgName(op, lang);
  const fieldLabel = orgName(field, lang);
  const tier = tenderApprovalTier(state, tender);

  return (
    <aside className="file-side">
      <section className="file-sidecard">
        <h2 className="file-sidecard__h">{t('fileside.operator')}</h2>
        <div className="file-sidecard__org">
          <span className="file-sidecard__name" dir="auto">{opLabel ?? t('fileside.operatorUnknown')}</span>
          {fieldLabel && <span className="file-sidecard__sub" dir="auto">{fieldLabel}</span>}
        </div>
        {contact && (
          <div className="file-sidecard__rows">
            <div className="file-siderow">
              <span className="file-siderow__l">{t('fileside.contact')}</span>
              <span className="file-siderow__v" dir="auto">{contact.name}</span>
            </div>
            <div className="file-siderow">
              <span className="file-siderow__l">{t('fileside.contactRole')}</span>
              <span className="file-siderow__v">{t(`roles.names.${roleKey(contact.role)}`)}</span>
            </div>
          </div>
        )}
      </section>

      <section className="file-sidecard">
        <h2 className="file-sidecard__h">{t('fileside.competing')}</h2>
        {top === 0 ? (
          <p className="file-sidecard__empty">{t('fileside.funnelNone')}</p>
        ) : (
          <div className="file-funnel">
            {funnel.map((f) => (
              <div key={f.key} className="file-funnel__row">
                <span className="file-funnel__l">{t(`fileside.funnel.${f.key}`)}</span>
                {/* the bar is decoration over a number that is ALSO printed: a reader who cannot
                    judge a 5px width still reads the count, so the bar is aria-hidden */}
                <span className="file-funnel__track" aria-hidden="true">
                  <span className="file-funnel__fill" style={{ inlineSize: `${(f.n / top) * 100}%` }} />
                </span>
                <span className="file-funnel__v">{fmtCount(f.n, lang)}</span>
              </div>
            ))}
          </div>
        )}
        <p className="file-sidecard__note">{t('fileside.gate')}</p>
      </section>

      <section className="file-sidecard">
        <h2 className="file-sidecard__h">{t('fileside.method')}</h2>
        <div className="file-sidecard__rows">
          <div className="file-siderow file-siderow--wrap">
            <span className="file-siderow__l">{t('fileside.path')}</span>
            <PathBadge id={tender.methodId} lang={lang} showClause />
          </div>
          <div className="file-siderow">
            <span className="file-siderow__l">{t('fileside.tier')}</span>
            {/* د9 — one tender's row: the tooltip states the bands of THIS company's ladder */}
            <TierPill tier={tier} tiers={resolveTiersFor(state, tender.operatorId)} />
          </div>
        </div>
      </section>
    </aside>
  );
}
