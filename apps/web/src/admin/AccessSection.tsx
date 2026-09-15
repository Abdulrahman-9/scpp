import { useTranslation } from 'react-i18next';
import { fmtCount } from '../operator/derive';
import { Icon } from '../operator/Icon';
import { useStore } from '../store';
import { hashParam, useHashParams, writeHashParam } from '../registry/useHashParams';
import { ACCESS_TABS, orphanRoleCount, type AccessTab } from './access';
import RoleCards from './RoleCards';
import CapabilityMatrix from './RolesMatrix';
import UsersRegistry from './Users';

/**
 * «الوصول والأدوار» — ONE section for what used to be three screens (client request 20).
 *
 * (The file is `AccessSection.tsx`, not `Access.tsx`, because `access.ts` — the section's
 * derivations — already occupies that name on a case-insensitive filesystem.)
 *
 * The client said the accounts screen, the role matrix and the role explanations were three
 * places to answer one question, and he was right: an administrator asking «who may approve this»
 * had to hold three addresses in his head. They are now three TABS of one subject, in the order
 * the question is actually asked:
 *
 *   · الحسابات — the people. The canonical address (`#/admin/users`) and the default view: the
 *     register is what the section is FOR, and the roles explain it.
 *   · الأدوار — the seven bodies as cards, each with its three financial facts in large type,
 *     over the triad explainer (request 21). This replaced the old «حسب الدور» sub-tab.
 *   · المصفوفة المرجعية — the full 46-row endpoint × role grid. KEPT, deliberately: it is the
 *     only view that answers an auditor's «reconcile the whole surface», and simplifying the
 *     section is not a licence to delete the evidence.
 *
 * The tab lives in the ADDRESS (`?tab=`), not in component state, so a tab is linkable, survives
 * Back, and lets the retired `#/admin/roles` bookmark land on the right view rather than merely
 * on the right page.
 */

const TAB_ICON: Record<AccessTab, string> = { accounts: 'users', roles: 'lock', matrix: 'sliders' };

export default function AccessSection() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const { state } = useStore();
  const params = useHashParams();

  // an absent or tampered `?tab=` resolves to the register — the section's own subject, never an error
  const tab = (hashParam(params, 'tab') || 'accounts') as AccessTab;

  const enabled = state.users.filter((u) => !u.disabled).length;
  const orphans = orphanRoleCount(state.users);

  return (
    <div className="op-page" style={{ maxWidth: 1240 }}>
      <div className="op-page__head">
        <div>
          <h1 className="op-page__title">{t('access.sectionTitle')}</h1>
          <div className="op-page__sub">
            {t('access.sectionSub', { n: fmtCount(enabled, lang), r: fmtCount(state.users.length, lang) })}
          </div>
        </div>
      </div>

      {orphans > 0 && (
        <div className="wz-note wz-note--warn" style={{ marginBlockStart: 12 }}>
          <Icon name="alert" size={15} />
          <span>{t('access.orphanBanner', { n: fmtCount(orphans, lang) })}</span>
        </div>
      )}

      {/*
        Big, colour-coded, always-visible switches — the client asked for buttons he can see.
        They are also a real TAB SET to assistive technology: `tablist`/`tab`/`tabpanel` with
        `aria-selected`, so a screen reader hears «tab 2 of 3, selected» instead of three unrelated
        buttons followed by content whose relationship to them is invisible. `aria-current="page"`
        was the wrong word for it — these switch a view, they do not navigate a site.
        Focus styles are untouched: the visual affordance was already right.
      */}
      <div className="acc-tabs" role="tablist" aria-label={t('access.sectionTitle')}>
        {ACCESS_TABS.map((k) => (
          <button
            key={k}
            id={`acc-tab-${k}`}
            type="button"
            role="tab"
            className={`acc-tab acc-tab--${k}${tab === k ? ' acc-tab--on' : ''}`}
            aria-selected={tab === k}
            aria-controls={`acc-panel-${k}`}
            onClick={() => writeHashParam('tab', k === 'accounts' ? null : k)}
          >
            <Icon name={TAB_ICON[k]} size={17} />
            <span className="acc-tab__l">{t(`access.tab_${k}`)}</span>
            <span className="acc-tab__s">{t(`access.tabSub_${k}`)}</span>
          </button>
        ))}
      </div>

      {/* one panel at a time — the tab that selected it names it, so the pair is announced together */}
      <div role="tabpanel" id={`acc-panel-${tab}`} aria-labelledby={`acc-tab-${tab}`}>
        {tab === 'accounts' ? <UsersRegistry /> : tab === 'roles' ? <RoleCards /> : <CapabilityMatrix />}
      </div>
    </div>
  );
}
