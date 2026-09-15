import { useTranslation } from 'react-i18next';
import { fmtCount } from '../operator/derive';
import { SectionExplainer } from '../registry/SectionExplainer';
import { useStore, type VendorState } from '../store';

/**
 * ق5 — «قائمة الوزارة» named TWO different registers, and the client could not tell which one a
 * screen meant. They are separated here, once, and every surface that shows either one carries
 * this disclosure so the two definitions travel together:
 *
 *   1. الشركات الحكومية الخمس (المادة 25) — `VendorState.isStateCompany`. SEEDED LAW, not registry
 *      data: `CREATE_VENDOR` deliberately refuses to set the flag (Vendors.tsx AddVendorModal), so
 *      nobody can mint an Article-25 company. It is what §9 C8.1/C8.2 reads: the 20% participation
 *      the tender documents must offer, and whose acceptance/refusal `localContentStatus` judges.
 *
 *   2. قائمة مجهّزي الوزارة — `VendorState.mooListed` / `MaterialDeclaration.onMooList`. An open
 *      register of suppliers, GOVERNMENT AND PRIVATE alike. It is what §9 C8.7 reads: membership is
 *      an accepted alternative to the approved-origin rule for an imported critical material
 *      (`criticalOriginVerdict` → `{ ok: true, reason: 'moo-list' }`).
 *
 * The two overlap and neither contains the other — four of the five seeded state companies are on
 * the suppliers list and one is not — which is exactly why one label for both was a defect. The
 * live counts below are DERIVED from the registry, so the explanation cannot drift from the data.
 */
export function MinistryListsExplainer() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const { state } = useStore();
  const vendors: readonly VendorState[] = state.vendors;
  const stateCount = vendors.filter((v) => v.isStateCompany).length;
  const mooCount = vendors.filter((v) => v.mooListed).length;
  const both = vendors.filter((v) => v.isStateCompany && v.mooListed).length;

  return (
    <SectionExplainer title={t('mlist.title')}>
      <p>
        <strong>{t('vendors.stateChip')}</strong> — {t('mlist.stateBody')}{' '}
        <span className="op-scpp">SCPP 25 · C8.1/C8.2</span>
      </p>
      <p>
        <strong>{t('vendors.mooChip')}</strong> — {t('mlist.mooBody')}{' '}
        <span className="op-scpp">SCPP C8.7</span>
      </p>
      <p>{t('mlist.overlap', {
        state: fmtCount(stateCount, lang),
        moo: fmtCount(mooCount, lang),
        both: fmtCount(both, lang),
      })}</p>
      <p>{t('mlist.pending')}</p>
    </SectionExplainer>
  );
}
