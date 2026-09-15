import { stageByKey, stageCanClose, stageDeviationWorkingDays } from '@masaar/scpp-rules';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { calendarOf, currentStage, DEV_REASON_CATS, requiredDocsFor, todayIso, useStore } from '../../store';
import { DevBadge } from '../DevBadge';
import { DevChip } from '../DevChip';
import { Icon } from '../Icon';
import WizardShell, { FieldError, fieldReject, groupReject, type WizardRejection, type WizardStep } from './WizardShell';

export default function CompleteWizard({ tenderId }: { tenderId: string }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const { state, dispatch } = useStore();
  const tender = state.tenders.find((x) => x.id === tenderId);
  const cur = tender ? currentStage(tender) : undefined;

  const [from, setFrom] = useState(cur?.plannedFrom ?? todayIso());
  const [to, setTo] = useState('');
  const [cat, setCat] = useState<string | null>(null);
  const [note, setNote] = useState('');
  // the last refusal the gate handed back — cleared by the edit that answers it
  const [bad, setBad] = useState<WizardRejection | null>(null);

  if (!tender || !cur) return <div className="op-empty">{t('file.notFound')}</div>;

  const def = stageByKey(cur.key);
  const req = requiredDocsFor(cur.key);
  // D7 — the ONE docs judgement the reducer and the server make (stageCanClose), consumed rather
  // than re-implemented, so `missing` names the documents instead of being thrown away.
  const docsGate = stageCanClose(req, cur.uploadedDocs);
  const docsOk = docsGate.ok;
  const missingNames = docsGate.missing.map((d) => t(`docs.${d}`)).join(lang === 'ar' ? '، ' : ', ');
  // D3 — the live calendar, exactly what every display slice passes (derive.ts stageDevWd):
  // without it a holiday inside the window made the wizard promise a different figure than the
  // chip shown after closing.
  const cal = calendarOf(state);
  const dev = to && cur.plannedTo ? stageDeviationWorkingDays(cur.plannedTo, to, cal) : null;
  const needReason = dev != null && dev > 0;

  const steps: WizardStep[] = [
    {
      label: t('wizco.s0'), title: t('wizco.s0'), sub: t('wizco.sub0'),
      help: { t: t('wizco.help0'), r: 'SCPP 8.1' },
      conditions: [
        // each condition names the control it guards, so a refusal lands on the field that caused
        // it: the missing date first, and the end date when the two are simply out of order
        { t: t('wizco.cDates'), ok: !!from && !!to, field: from ? 'wizco-to' : 'wizco-from' },
        { t: t('wizco.cOrder'), ok: !!from && !!to && to >= from, field: 'wizco-to' },
      ],
      content: (
        <div className="wz-grid2">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="wz-side-box" style={{ background: 'var(--bg-page)' }}>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{t('wizco.planned', { stage: def?.[lang] ?? cur.key })}</span>
              <span className="op-code" style={{ fontSize: 13, fontWeight: 600 }}>{cur.plannedFrom ?? '—'} → {cur.plannedTo ?? '—'}</span>
            </div>
            {/* native date widgets: values stored as Latin ISO; display digits follow browser locale (documented Track-0 exclusion) */}
            <div className="wz-field">
              <label className="wz-field__l" htmlFor="wizco-from">{t('wizco.from')}</label>
              <input {...fieldReject(bad, 'wizco-from', 'wz-in wz-in--mono')} type="date" value={from} onChange={(e) => { setBad(null); setFrom(e.target.value); }} />
              <FieldError rejected={bad} id="wizco-from" />
            </div>
            <div className="wz-field">
              <label className="wz-field__l" htmlFor="wizco-to">{t('wizco.to')}</label>
              <input {...fieldReject(bad, 'wizco-to', 'wz-in wz-in--mono')} type="date" value={to} onChange={(e) => { setBad(null); setTo(e.target.value); }} />
              <FieldError rejected={bad} id="wizco-to" />
            </div>
          </div>
          <div className="wz-side-box">
            <div className="wz-side-box__l">{t('wizco.devAuto')}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {dev == null ? <span className="op-dev op-dev--none">{t('wizco.awaitTo')}</span> : <DevChip wd={dev} />}
              <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{t('wizco.weekend')}</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.8, borderTop: '1px dashed var(--border-2)', paddingTop: 10 }}>{dev == null ? t('wizco.devHintNull') : needReason ? t('wizco.devHintPos') : t('wizco.devHintNeg')}</div>
          </div>
        </div>
      ),
    },
    {
      label: t('wizco.s1'), title: t('wizco.s1'), sub: t('wizco.sub1'),
      help: { t: t('wizco.help1'), r: 'SCPP 8.1' },
      conditions: [{
        // the unmet condition line feeds the wz-gate sentence, so the gate NAMES what is missing
        // (D7) instead of only counting it
        t: docsOk
          ? t('wizco.cDocs', { n: `${cur.uploadedDocs.filter((d) => req.includes(d)).length}/${req.length}` })
          : t('wizco.cDocsMissing', { n: `${cur.uploadedDocs.filter((d) => req.includes(d)).length}/${req.length}`, docs: missingNames }),
        ok: docsOk,
      }],
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {req.map((d) => {
            const up = cur.uploadedDocs.includes(d);
            return (
              <div key={d} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', border: '1px solid var(--border-1)', borderRadius: 10, background: 'var(--bg-card)' }}>
                <Icon name="doc" size={16} />
                <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{t(`docs.${d}`)}</span>
                <span className="op-task__due" style={{ background: up ? 'var(--status-done-bg)' : 'var(--status-delayed-bg)', color: up ? 'var(--status-done)' : 'var(--status-delayed)' }}>{up ? t('filedocs.stDone') : t('wizco.docMissing')}</span>
                {/* the toggle marks the document RECEIVED — it uploads nothing, so it carries the
                    same wording and the same «محاكاة» badge as the Documents tab (FileDocs.tsx). */}
                {!up && (
                  <>
                    <button className="op-btn-primary" onClick={() => void dispatch({ type: 'TOGGLE_DOC', tenderId, stageKey: cur.key, doc: d })}>
                      <Icon name="check" size={12} />
                      {t('filedocs.markReceived')}
                    </button>
                    <DevBadge title={t('filedocs.simTitle')} />
                  </>
                )}
              </div>
            );
          })}
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>{t('wizco.docsNote')}</div>
        </div>
      ),
    },
    {
      label: t('wizco.s2'), title: t('wizco.s2'), sub: t('wizco.sub2'),
      help: { t: t('wizco.help2'), r: 'SCPP 8.2' },
      conditions: needReason
        ? [
            { t: t('wizco.cCat'), ok: !!cat, field: 'wizco-cat' },
            { t: t('wizco.cNote'), ok: note.trim().length >= 15, field: 'wizco-note' },
          ]
        : [{ t: t('wizco.cNoDev'), ok: true }],
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {dev == null ? <span className="op-dev op-dev--none">{t('dev.none')}</span> : <DevChip wd={dev} />}
            <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{t('wizco.againstPlan')} <b className="op-code">{cur.plannedTo ?? '—'}</b></span>
          </div>
          {needReason ? (
            <>
              <div className="wz-field">
                <span className="wz-field__l" id="wizco-cat-l">{t('wizco.reasonCat')}</span>
                {/* toggle buttons in a NAMED group, not `role="radio"`: a radio group also owes
                    arrow-key navigation and a roving tabindex, and half of an ARIA pattern reads
                    worse than none. `aria-pressed` is complete as it stands, and the group's name
                    is what a screen reader announces the refusal against. */}
                <div role="group" aria-labelledby="wizco-cat-l" style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                  {DEV_REASON_CATS.map((c, i) => (
                    <button
                      key={c}
                      // no red edge on a chip: the refusal here is «none of these is chosen», which
                      // belongs to the GROUP, not to one option. The line below carries it.
                      {...(i === 0 ? groupReject(bad, 'wizco-cat') : {})}
                      className={`wz-chip${cat === c ? ' wz-chip--on' : ''}`}
                      aria-pressed={cat === c}
                      onClick={() => { setBad(null); setCat(c); }}
                    >
                      {t(`wizco.cat_${c}`)}
                    </button>
                  ))}
                </div>
                <FieldError rejected={bad} id="wizco-cat" />
              </div>
              <div className="wz-field">
                <label className="wz-field__l" htmlFor="wizco-note">{t('wizco.reasonDetail')}</label>
                <textarea {...fieldReject(bad, 'wizco-note', 'wz-ta')} rows={3} dir="auto" value={note} onChange={(e) => { setBad(null); setNote(e.target.value); }} placeholder={t('wizco.reasonPh')} />
                <FieldError rejected={bad} id="wizco-note" />
              </div>
            </>
          ) : (
            <div className="wz-note wz-note--ok"><Icon name="check" size={15} strokeWidth={2} /><span>{t('wizco.noDevBox')}</span></div>
          )}
        </div>
      ),
    },
    {
      label: t('wizco.s3'), title: t('wizco.s3'), sub: t('wizco.sub3'),
      help: { t: t('wizco.help3'), r: 'SCPP 8' },
      conditions: [{ t: t('wizco.cAll'), ok: docsOk && !!to }],
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { k: t('wizco.stage'), v: def?.[lang] ?? cur.key },
            { k: t('wizco.actual'), v: `${from || '—'} → ${to || '—'}` },
            { k: t('timeline.deviation'), v: dev == null ? '—' : `${dev > 0 ? t('dev.lateWd', { n: Math.abs(dev) }) : dev < 0 ? t('dev.earlyWd', { n: Math.abs(dev) }) : t('wizco.onPlan')}${needReason && cat ? ` — ${t(`wizco.cat_${cat}`)}` : ''}` },
            { k: t('filedocs.title'), v: `${cur.uploadedDocs.filter((d) => req.includes(d)).length}/${req.length}` },
          ].map((r, i) => <div key={i} className="wz-reviewrow"><span>{r.k}</span><span>{r.v}</span></div>)}
          <div className="wz-note wz-note--info"><Icon name="clock" size={15} /><span>{t('wizco.finalNote')}</span></div>
        </div>
      ),
    },
  ];

  return (
    <WizardShell
      title={t('wizco.title', { stage: def?.[lang] ?? cur.key })}
      tenderName={tender.title[lang]}
      code={tender.code}
      steps={steps}
      finalLabel={t('wizco.final')}
      doneHash={`#/operator/t/${tenderId}`}
      exitHash={`#/operator/t/${tenderId}`}
      onReject={setBad}
      success={{ title: t('wizco.doneTitle', { stage: def?.[lang] ?? cur.key }), desc: t('wizco.doneDesc'), audit: `${tender.code} · STAGE CLOSED · DEV ${dev != null && dev > 0 ? '+' : ''}${dev ?? 0}WD` }}
      onFinish={() => {
        // D1 — everything the form collected rides the action: the start date, and (when the
        // deviation is positive) the classified reason the compliance report promises to show.
        void dispatch({
          type: 'COMPLETE_STAGE',
          tenderId,
          stageKey: cur.key,
          actualTo: to || todayIso(),
          ...(from ? { actualFrom: from } : {}),
          ...(needReason && cat && note.trim().length >= 15 ? { devReason: { cat, note: note.trim() } } : {}),
        });
      }}
    />
  );
}
