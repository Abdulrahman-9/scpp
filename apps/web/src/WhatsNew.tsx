import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from './operator/Icon';
import './whatsnew.css';

/**
 * «الجديد في مسار» — the first-entry strip on the two landing screens (CLIENT-SHOWCASE-SPEC §2).
 *
 * A calm navy-50 band, three facts, two REAL links, and a dismissal that sticks. It is deliberately
 * the quietest thing on the screen: the inbox and the follow-up room exist to say what is late and
 * what needs a decision, and an update notice that outshouts them has made the product worse.
 *
 * ── THE KEY LIVES OUTSIDE THE BUSINESS STORE ────────────────────────────────────────────────────
 * `masaar.whatsnew.w1` follows the `masaar.nav.sec` precedent: a chrome preference must never
 * travel with — or be wiped by — a data migration of `masaar-operator-v13`. The wave number is IN
 * the key, so the next wave's strip is a new key rather than a reset of this one, and nobody's
 * dismissal is silently revoked by a deploy.
 *
 * ── WHY THE TWO AUDIENCES GET DIFFERENT LINKS ───────────────────────────────────────────────────
 * The three FACTS are identical, because they are statements about the platform and true for both
 * readers. The links are not, and cannot be: `#/admin/**` is closed to the two operator roles by
 * `canEnterAdmin` (App.tsx), so pointing an operator at the A4 brief would ship a link that lands
 * them on the refusal screen — a placebo affordance, and exactly the fabrication Design Principle 4
 * forbids. Operators are therefore sent to the surfaces in THEIR OWN portal where the same two
 * changes are visible: the tender registry that now carries the approval-tier dimension, and the
 * weekly A4 deviation sheet that now prints the stamp.
 */

export type WhatsNewAudience = 'admin' | 'operator';

/** The dismissal flag. Namespaced outside every business key, and versioned by wave. */
export const WHATS_NEW_KEY = 'masaar.whatsnew.w1';

/** EXACTLY three, and the same three for both readers (spec §2). */
const FACTS = ['ladder', 'stamp', 'schedule'] as const;

/**
 * The two destinations per audience. Every one of them is a route this role can actually reach —
 * admin: the brief itself and the time-compliance registry; operator: their own tender registry and
 * their own stamped A4 sheet.
 */
const LINKS: Record<WhatsNewAudience, { key: string; href: string }[]> = {
  admin: [
    { key: 'adminBrief', href: '#/admin/reports/update-brief' },
    { key: 'adminSchedule', href: '#/admin/schedule' },
  ],
  operator: [
    { key: 'opTenders', href: '#/operator/tenders' },
    { key: 'opWeekly', href: '#/operator/reports/weekly' },
  ],
};

function readDismissed(): boolean {
  try {
    return localStorage.getItem(WHATS_NEW_KEY) === '1';
  } catch {
    return false; // private mode / disabled storage — the strip still works, it just forgets
  }
}

function writeDismissed(): void {
  try {
    localStorage.setItem(WHATS_NEW_KEY, '1');
  } catch {
    /* a preference that cannot be stored is not an error worth interrupting anybody for */
  }
}

export function WhatsNew({ audience }: { audience: WhatsNewAudience }) {
  const { t } = useTranslation();
  // read ONCE, on mount: a dismissal must remove the strip for this render and every later
  // session, and re-reading storage on every render would only add a way for the two to disagree
  const [dismissed, setDismissed] = useState(readDismissed);
  const [open, setOpen] = useState(true);

  if (dismissed) return null;

  return (
    <section className="wn" aria-labelledby="wn-t">
      <div className="wn__head">
        <span className="wn__mark" aria-hidden="true"><Icon name="bell" size={15} /></span>
        <span className="wn__t" id="wn-t">{t('whatsnew.title')}</span>
        <span className="wn__s">{t('whatsnew.sub')}</span>
        <button
          type="button"
          className="wn__fold"
          aria-expanded={open}
          aria-controls="wn-body"
          onClick={() => setOpen((x) => !x)}
        >
          {open ? t('whatsnew.collapse') : t('whatsnew.expand')}
        </button>
        {/* the label says what closing actually DOES — this strip does not come back */}
        <button
          type="button"
          className="wn__x"
          aria-label={t('whatsnew.dismiss')}
          onClick={() => { writeDismissed(); setDismissed(true); }}
        >
          <Icon name="close" size={14} />
        </button>
      </div>

      {open && (
        <div className="wn__body" id="wn-body">
          <ul className="wn__facts">
            {FACTS.map((f) => <li key={f} className="wn__fact">{t(`whatsnew.fact.${f}`)}</li>)}
          </ul>
          <div className="wn__links">
            {LINKS[audience].map((l) => (
              <a key={l.key} className="wn__link" href={l.href}>
                {t(`whatsnew.${l.key}`)}
                <Icon name="chevronStart" size={12} strokeWidth={2} className="op-chev-fwd" />
              </a>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
