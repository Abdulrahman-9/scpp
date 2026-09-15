import { stageByKey } from '@masaar/scpp-rules';
import { useTranslation } from 'react-i18next';
import { sessionScopeOrgName } from '../orgIdentity';
import { calendarOf, sessionScopedTenders, todayIso, useStore } from '../store';
import { WhatsNew } from '../WhatsNew';
import { deriveTasks, fmtCount, fmtDate, groupTasks, STAGE_CLAUSE, STAGE_ICON, wizardTypeFor, type DerivedTask, type TaskGroup } from './derive';
import { Icon } from './Icon';

const GROUPS: TaskGroup[] = ['late', 'today', 'week'];

function dueLabel(task: DerivedTask, lang: 'ar' | 'en', t: ReturnType<typeof useTranslation>['t']): string {
  if (task.group === 'late') return t('dev.overdueWd', { n: fmtCount(Math.abs(task.dueWd), lang) });
  if (task.group === 'today') return t('dev.dueToday');
  return t('dev.dueWd', { n: fmtCount(task.dueWd, lang) });
}

export default function Inbox() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const { state } = useStore();
  const today = todayIso();
  const cal = calendarOf(state);

  // D4 — the operator's inbox lists ITS company's work only, mirroring the server scope
  // (apps/api/src/auth/scope.ts); platform roles keep the full portfolio.
  const tasks = deriveTasks({ ...state, tenders: sessionScopedTenders(state) }, today, cal);
  const grouped = groupTasks(tasks);
  const tenderCount = new Set(tasks.map((x) => x.tender.id)).size;

  // fmtDate: Arabic month/weekday names, guaranteed Latin digits (client decision «كل الأرقام لاتينية»).
  const dateLabel = fmtDate(today, lang);

  // م3 — the scope, said out loud. `undefined` on a platform session, which reads every company
  // here and would be making a false claim; the register prints the identical sentence.
  const scopeOrg = sessionScopeOrgName(state, lang);

  return (
    <div className="op-page op-page--inbox">
      {/* The update strip (spec §2) — above the head, so it never displaces the first thing an
          operator opens this screen for, and gone for good once dismissed. Operator variant: its
          links stay inside this portal, because #/admin is closed to company-scoped roles. */}
      <WhatsNew audience="operator" />

      <div className="op-page__head">
        <div>
          <h1 className="op-page__title">{t('inbox.title')}</h1>
          <div className="op-page__sub">
            {t('inbox.sub', { date: dateLabel, tasks: fmtCount(tasks.length, lang), tenders: fmtCount(tenderCount, lang) })}
          </div>
          {scopeOrg && <div className="op-page__scope" dir="auto">{t('shell.scopeNote', { name: scopeOrg })}</div>}
        </div>
        <div className="op-legend">
          {GROUPS.map((g) => (
            <span key={g} className={`op-legend__i op-legend--${g}`}>
              <span className="op-legend__dot" />
              {t(`inbox.leg.${g}`)} {fmtCount(grouped[g].length, lang)}
            </span>
          ))}
        </div>
      </div>

      <div className="op-guide">
        <Icon name="clock" size={15} />
        <span>{t('inbox.guide')}</span>
      </div>

      {tasks.length === 0 ? (
        <div className="op-empty">{t('inbox.empty')}</div>
      ) : (
        GROUPS.filter((g) => grouped[g].length > 0).map((g) => (
          <section key={g} className={`op-group op-group--${g}`}>
            <div className="op-group__head">
              <span className="op-group__dot" />
              <span className="op-group__title">{t(`inbox.group.${g}`)}</span>
              <span className="op-group__count">{fmtCount(grouped[g].length, lang)}</span>
              <span className="op-group__rule" />
            </div>
            <div className="op-group__list">
              {grouped[g].map((task) => {
                const def = stageByKey(task.stageKey);
                /**
                 * م4 — «افتح الخطوة» opens THE STEP, not the folder it sits in.
                 *
                 * The card used to land the file, from which the reader clicked «ابدأ الخطوة»
                 * to reach the very wizard this task names — a whole screen spent restating what
                 * the row already said. The destination is `wizardTypeFor(stageKey)`, the same
                 * function `TenderDetail.openWizard` calls, so the two doors open on one seat and
                 * no third button was born to do it.
                 *
                 * The fallback is not decoration: `stageByKey` is the rules engine's own answer to
                 * «is this a stage I govern», and `StageState.key` is a plain string, so a record
                 * carrying a stage outside the table is reachable. For that task there IS no
                 * wizard to open honestly, and the card stays on the file — where the reader can
                 * see the whole record and decide — rather than guessing a seat for it.
                 */
                const href = def
                  ? `#/operator/t/${task.tender.id}/w/${wizardTypeFor(task.stageKey)}`
                  : `#/operator/t/${task.tender.id}`;
                return (
                  <a key={task.tender.id} className={`op-task${g === 'late' ? ' op-task--late' : ''}`} href={href}>
                    <span className={`op-task__icon op-task__icon--${g}`}>
                      <Icon name={STAGE_ICON[task.stageKey] ?? 'doc'} size={16} />
                    </span>
                    <span className="op-task__body">
                      <span className="op-task__title">{t(`taskAction.${task.stageKey}`)}</span>
                      <span className="op-task__meta">
                        <span>{task.tender.title[lang]}</span>
                        <span className="op-code">{task.tender.code}</span>
                        <span className="op-task__mdot" />
                        <span>{t('inbox.stageLabel', { stage: def ? def[lang] : task.stageKey })}</span>
                        <span className="op-scpp">SCPP {STAGE_CLAUSE[task.stageKey] ?? ''}</span>
                      </span>
                    </span>
                    <span className={`op-task__due op-task__due--${g}`}>{dueLabel(task, lang, t)}</span>
                    <span className="op-btn-primary">
                      {t('inbox.openStep')}
                      <Icon name="chevronStart" size={13} strokeWidth={2} className="op-chev-fwd" />
                    </span>
                  </a>
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
