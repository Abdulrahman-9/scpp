import { stageByKey } from '@masaar/scpp-rules';
import { StatusPill } from '@masaar/ui';
import { useTranslation } from 'react-i18next';
import { requiredDocsFor, todayIso, useStore, type Tender } from '../store';
import { stageViewStatus } from './derive';
import { DevBadge } from './DevBadge';
import { Icon } from './Icon';
import { useOperatorUi } from './OperatorShell';

/** Documents tab — required docs per relevant stage; marking one received flags it present. */
export default function FileDocs({ tender }: { tender: Tender }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const { dispatch } = useStore();
  const { toast } = useOperatorUi();
  const today = todayIso();

  // only stages that matter now: done + the active one (future docs come later)
  const groups = tender.stages.filter((s) => {
    const st = stageViewStatus(tender, s, today);
    return st === 'done' || st === 'progress' || st === 'delayed';
  });

  return (
    <div className="file-card">
      <div className="file-card__head">
        <div>
          <div className="file-card__title">{t('filedocs.title')}</div>
          <div className="file-card__sub">{t('filedocs.sub')}</div>
        </div>
      </div>
      {groups.map((s) => {
        const st = stageViewStatus(tender, s, today);
        const active = st === 'progress' || st === 'delayed';
        const def = stageByKey(s.key);
        return (
          <div key={s.key} className="file-docgroup">
            <div className="file-docgroup__l">{t('filedocs.stageLabel', { stage: def ? def[lang] : s.key })}</div>
            <div className="file-doclist">
              {requiredDocsFor(s.key).map((doc) => {
                const uploaded = s.uploadedDocs.includes(doc);
                const status = uploaded ? 'done' : active ? 'delayed' : 'planned';
                const label = uploaded ? t('filedocs.stDone') : active ? t('filedocs.stMissing') : t('filedocs.stPending');
                const name = t(`docs.${doc}`);
                return (
                  <div key={doc} className="file-doc">
                    <Icon name="doc" size={15} />
                    <span className="file-doc__name">{name}</span>
                    <StatusPill status={status}>{label}</StatusPill>
                    {!uploaded && active && (
                      <>
                        <button
                          className="file-doc__up"
                          onClick={() => {
                            // قناة الصدق: the success toast fires only after the store
                            // confirms; a server refusal is surfaced by the shell's fail sink.
                            void dispatch({ type: 'TOGGLE_DOC', tenderId: tender.id, stageKey: s.key, doc }).then((r) => {
                              if (r.ok) toast(t('filedocs.received', { doc: name }), { kind: 'success' });
                            });
                          }}
                        >
                          <Icon name="check" size={12} />
                          {t('filedocs.markReceived')}
                        </button>
                        <DevBadge title={t('filedocs.simTitle')} />
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
