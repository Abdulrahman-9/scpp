import type { AnnouncementMode } from '@masaar/scpp-rules';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { addCalendarDays, addWorkingDays, toIso, toUtcDate } from '@masaar/working-days';
import { calendarOf, tenderLocalContentApplies, todayIso, useStore } from '../../store';
import { useActor } from '../../admin/UserActions';
import { Icon } from '../Icon';
import WizardShell, { FieldError, fieldReject, groupReject, type WizardRejection, type WizardStep } from './WizardShell';

const PAPERS = ['الصباح', 'الزمان', 'المدى', 'الصباح الجديد', 'العالم'];
const AD_TYPES: { k: AnnouncementMode; ref: string }[] = [
  { k: 'public', ref: 'SCPP 11.1' },
  { k: 'limited', ref: 'SCPP 11.2' },
  { k: 'direct', ref: 'SCPP 11.4' },
];

export default function AdvertiseWizard({ tenderId }: { tenderId: string }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const { state, dispatch } = useStore();
  const tender = state.tenders.find((x) => x.id === tenderId);
  const actor = useActor();

  const [mode, setMode] = useState<AnnouncementMode>(tender?.announcement.mode ?? 'public');
  const [start, setStart] = useState(todayIso());
  const [days, setDays] = useState(21);
  const [papers, setPapers] = useState<string[]>([]);
  const [site1, setSite1] = useState('');
  const [site2, setSite2] = useState('');
  const [invitees, setInvitees] = useState(0);

  if (!tender) return <div className="op-empty">{t('file.notFound')}</div>;

  const isPub = mode === 'public';
  const min = isPub ? 21 : 14;
  const invMin = mode === 'direct' ? 3 : 2;
  const cal = calendarOf(state);
  const endD = addCalendarDays(toUtcDate(start), days);
  const openD = addWorkingDays(endD, 2, cal);

  // §9 C8.1 — for a tender inside the state-company scope above authority, the documents must carry
  // the 20% participation clause BEFORE publication. `affixed` is store truth, never local state:
  // the box turns on only once the governed action lands, so a refused attestation shows as refused.
  const lcApplies = tenderLocalContentApplies(state, tender);
  const lcAffixed = tender.localContentClauseAffixed === true;
  const setLcClause = (affixed: boolean) => {
    if (!actor) return; // unreachable: every #/operator route is session-gated in App.tsx
    void dispatch({ type: 'SET_LC_CLAUSE', tenderId, affixed, by: actor });
  };

  // the last refusal the gate handed back — cleared by the edit that answers it
  const [bad, setBad] = useState<WizardRejection | null>(null);

  const steps: WizardStep[] = [
    {
      label: t('wizad.s0'), title: t('wizad.s0'), sub: t('wizad.sub0'),
      help: { t: t('wizad.help0'), r: 'SCPP 11.1 · 11.2 · 11.4' },
      conditions: [{ t: t('wizad.cType'), ok: !!mode, field: 'wizad-type' }],
      content: (
        <div role="group" aria-label={t('wizad.s0')} className="wz-grid3">
          {AD_TYPES.map((ty, i) => (
            <button key={ty.k} {...(i === 0 ? groupReject(bad, 'wizad-type') : {})} className={`wz-cardbtn${mode === ty.k ? ' wz-cardbtn--on' : ''}`} aria-pressed={mode === ty.k} onClick={() => { setBad(null); setMode(ty.k); }}>
              <span className="wz-cardbtn__t" style={{ fontSize: 14 }}>{t(`ann.${ty.k}`)}</span>
              <span className="wz-cardbtn__d">{t(`wizad.desc_${ty.k}`)}</span>
              <span className="op-scpp">{ty.ref}</span>
            </button>
          ))}
          <FieldError rejected={bad} id="wizad-type" />
        </div>
      ),
    },
    {
      label: t('wizad.s1'), title: t('wizad.s1'), sub: t('wizad.sub1'),
      help: { t: t('wizad.help1'), r: 'SCPP 11.1' },
      conditions: [
        { t: t('wizad.cDays', { n: min }), ok: days >= min },
        { t: t('wizad.cStart'), ok: !!start, field: 'wizad-start' },
      ],
      content: (
        <div className="wz-grid2">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="wz-field">
              <label className="wz-field__l" htmlFor="wizad-start">{t('wizad.start')}</label>
              {/* native date widget: value stored as Latin ISO; display digits follow browser locale (documented Track-0 exclusion) */}
              <input {...fieldReject(bad, 'wizad-start', 'wz-in wz-in--mono')} type="date" value={start} onChange={(e) => { setBad(null); setStart(e.target.value); }} />
              <FieldError rejected={bad} id="wizad-start" />
            </div>
            <div className="wz-field">
              <label className="wz-field__l">{t('wizad.days')}</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button className="wz-chip" style={{ width: 34, height: 34, padding: 0, justifyContent: 'center', borderRadius: 8 }} onClick={() => setDays((d) => Math.max(1, d - 1))}>−</button>
                <span className="op-code" style={{ fontSize: 20, fontWeight: 600, minWidth: 44, textAlign: 'center' }}>{days}</span>
                <button className="wz-chip" style={{ width: 34, height: 34, padding: 0, justifyContent: 'center', borderRadius: 8 }} onClick={() => setDays((d) => d + 1)}>+</button>
                <span className="op-task__due" style={{ background: days >= min ? 'var(--status-done-bg)' : 'var(--status-delayed-bg)', color: days >= min ? 'var(--status-done)' : 'var(--status-delayed)' }}>
                  {days >= min ? t('wizad.daysOk', { n: min }) : t('wizad.daysNo', { n: min })}
                </span>
              </div>
            </div>
          </div>
          <div className="wz-side-box">
            <div className="wz-side-box__l">{t('wizad.autoCalc')}</div>
            <div className="wz-kv"><span>{t('wizad.lastDay')}</span><b>{toIso(endD)}</b></div>
            <div className="wz-kv"><span>{t('wizad.openExpected')}</span><b>{toIso(openD)}</b></div>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', lineHeight: 1.7, borderTop: '1px dashed var(--border-2)', paddingTop: 10 }}>{t('wizad.holidayNote')}</div>
          </div>
        </div>
      ),
    },
    {
      label: t('wizad.s2'), title: t('wizad.s2'), sub: t('wizad.sub2'),
      help: { t: t('wizad.help2'), r: 'SCPP 8.1' },
      conditions: isPub
        ? [
            { t: t('wizad.cPapers'), ok: papers.length >= 3 },
            { t: t('wizad.cSite1'), ok: site1.trim().length > 8, field: 'wizad-site1' },
            { t: t('wizad.cSite2'), ok: site2.trim().length > 8, field: 'wizad-site2' },
          ]
        : [{ t: t('wizad.cInvitees', { n: invMin }), ok: invitees >= invMin }],
      content: isPub ? (
        <div>
          <div className="wz-field">
            <label className="wz-field__l">{t('wizad.papers')} <span className="op-code" style={{ color: 'var(--text-3)' }}>({papers.length}/3)</span></label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {PAPERS.map((p) => (
                <button key={p} className={`wz-chip${papers.includes(p) ? ' wz-chip--on' : ''}`} onClick={() => setPapers((ps) => ps.includes(p) ? ps.filter((x) => x !== p) : [...ps, p])} dir="auto">{p}</button>
              ))}
            </div>
          </div>
          <div className="wz-grid2" style={{ marginTop: 14 }}>
            <div className="wz-field">
              <label className="wz-field__l" htmlFor="wizad-site1">{t('wizad.site1')}</label>
              <input {...fieldReject(bad, 'wizad-site1', 'wz-in wz-in--mono')} style={{ height: 38, fontSize: 12 }} value={site1} onChange={(e) => { setBad(null); setSite1(e.target.value); }} placeholder="https://waha-oil.example/tenders/…" />
              <FieldError rejected={bad} id="wizad-site1" />
            </div>
            <div className="wz-field">
              <label className="wz-field__l" htmlFor="wizad-site2">{t('wizad.site2')}</label>
              <input {...fieldReject(bad, 'wizad-site2', 'wz-in wz-in--mono')} style={{ height: 38, fontSize: 12 }} value={site2} onChange={(e) => { setBad(null); setSite2(e.target.value); }} placeholder="https://company.example/tenders/…" />
              <FieldError rejected={bad} id="wizad-site2" />
            </div>
          </div>
        </div>
      ) : (
        <div className="wz-field">
          <label className="wz-field__l">{t('wizad.inviteesLabel', { n: invMin })} <span className="op-code" style={{ color: 'var(--text-3)' }}>({invitees})</span></label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="wz-chip" style={{ width: 34, height: 34, padding: 0, justifyContent: 'center', borderRadius: 8 }} onClick={() => setInvitees((n) => Math.max(0, n - 1))}>−</button>
            <span className="op-code" style={{ fontSize: 20, fontWeight: 600, minWidth: 44, textAlign: 'center' }}>{invitees}</span>
            <button className="wz-chip" style={{ width: 34, height: 34, padding: 0, justifyContent: 'center', borderRadius: 8 }} onClick={() => setInvitees((n) => n + 1)}>+</button>
          </div>
        </div>
      ),
    },
    {
      label: t('wizad.s3'), title: t('wizad.s3'), sub: t('wizad.sub3'),
      help: { t: t('wizad.help3'), r: 'SCPP 11.1' },
      conditions: [
        { t: t('wizad.cReady'), ok: isPub ? papers.length >= 3 && site1.length > 8 && site2.length > 8 && days >= min : invitees >= invMin },
        ...(lcApplies ? [{ t: t('wizad.cLcClause'), ok: lcAffixed }] : []),
      ],
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* a picture OF a printed notice: `theme-light` keeps it paper in the dark theme too,
              so the preview goes on looking like the thing it previews */}
          <div className="theme-light" style={{ border: '1px solid var(--border-2)', borderRadius: 'var(--r-sm)', padding: '18px 22px', background: 'var(--bg-card)', boxShadow: 'var(--shadow-2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '2px solid var(--primary-900)', paddingBottom: 8 }}>
              <img src="/logo.svg" alt="مسار" style={{ height: 22 }} />
              <span className="op-code" style={{ fontSize: 10, color: 'var(--text-3)' }}>{tender.code}</span>
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, marginTop: 12 }}>{t('wizad.adTitle', { type: t(`ann.${mode}`), name: tender.title[lang] })}</div>
            <div style={{ fontSize: 12, lineHeight: 1.9, color: 'var(--text-2)', marginTop: 6 }}>{t('wizad.adBody', { end: toIso(endD) })}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
              {(isPub ? [...papers.map((p) => `صحيفة ${p}`), t('wizad.chOperator'), t('wizad.chCompany')] : [t('wizad.chInvites', { n: invitees })]).map((c, i) => (
                <span key={i} style={{ fontSize: 11, background: 'var(--bg-muted)', color: 'var(--text-2)', padding: '2px 9px', borderRadius: 999 }}>{c}</span>
              ))}
            </div>
          </div>
          {lcApplies && (
            <>
              <div className="wz-note wz-note--info"><Icon name="shield" size={15} /><span>{t('wizad.lcNote')}</span></div>
              <button
                className={`wz-check${lcAffixed ? ' wz-check--on' : ''}`}
                style={{ width: '100%', alignSelf: 'stretch' }}
                aria-pressed={lcAffixed}
                onClick={() => setLcClause(!lcAffixed)}
              >
                <span className="wz-check__m">✓</span>
                <span style={{ flex: 1, textAlign: 'start' }}>{t('wizad.lcClauseLabel')}</span>
                <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{lcAffixed ? t('wizad.lcClauseOn') : t('wizad.lcClauseOff')}</span>
              </button>
              {!lcAffixed && <span className="wz-gate">{t('wizad.lcGate')}</span>}
            </>
          )}
          <div className="wz-note wz-note--warn"><Icon name="clock" size={15} /><span>{t('wizad.publishWarn')}</span></div>
        </div>
      ),
    },
  ];

  return (
    <WizardShell
      title={t('wizad.title')}
      tenderName={tender.title[lang]}
      code={tender.code}
      steps={steps}
      finalLabel={t('wizad.final')}
      finalInstitutional
      doneHash={`#/operator/t/${tenderId}`}
      exitHash={`#/operator/t/${tenderId}`}
      onReject={setBad}
      success={{ title: t('wizad.doneTitle'), desc: t('wizad.doneDesc', { end: toIso(endD) }), audit: `${tender.code} · PUBLISHED · ${toIso(toUtcDate(start))}` }}
      onFinish={() => {
        dispatch({
          type: 'SET_ANNOUNCEMENT',
          tenderId,
          patch: {
            mode,
            periodDays: days,
            newspapers: [papers[0] ?? '', papers[1] ?? '', papers[2] ?? ''],
            lcWebsite: site1.trim().length > 0,
            rocWebsite: site2.trim().length > 0,
            inviteeCount: invitees,
            inviteesPreQualified: true,
          },
        });
        dispatch({ type: 'PUBLISH_ANNOUNCEMENT', tenderId });
      }}
    />
  );
}
