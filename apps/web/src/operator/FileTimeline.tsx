import { stageByKey } from '@masaar/scpp-rules';
import { StatusPill } from '@masaar/ui';
import { toUtcDate } from '@masaar/working-days';
import { useTranslation } from 'react-i18next';
import { calendarOf, currentStage, todayIso, useStore, type Tender } from '../store';
import { DevChip } from './DevChip';
import { fmtCount, stageDevWd, stageViewStatus } from './derive';
import { Icon } from './Icon';

type Lang = 'ar' | 'en';
const ms = (iso: string) => toUtcDate(iso).getTime();
const md = (iso: string) => iso.slice(5); // compact MM-DD for the dense axis
const clamp = (n: number) => Math.max(0, Math.min(100, n));

/** color token per stage bar, following the design's status/deviation rule. */
function actualColor(status: string, dev: number): string {
  if (status === 'progress' || status === 'delayed') return dev > 5 ? 'var(--status-delayed)' : 'var(--status-progress)';
  if (status === 'done') return dev > 5 ? 'var(--status-delayed)' : dev > 0 ? 'var(--status-risk)' : 'var(--status-done)';
  return 'transparent';
}

export default function FileTimeline({
  tender,
  focus,
  onFocus,
  onWizard,
}: {
  tender: Tender;
  focus: string | null;
  onFocus: (key: string) => void;
  onWizard: (key: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language === 'ar' ? 'ar' : 'en') as Lang;
  const { state } = useStore();
  const cal = calendarOf(state);
  const today = todayIso();

  const dated = tender.stages.filter((s) => s.plannedFrom && s.plannedTo);
  const starts = dated.map((s) => ms(s.plannedFrom!));
  const ends = dated.map((s) => ms(s.actualTo ?? s.plannedTo!));
  const a = starts.length ? Math.min(...starts) : 0;
  const b = ends.length ? Math.max(...ends) : 0;
  const span = b - a;
  const pct = (m: number) => (span > 0 ? clamp(((m - a) / span) * 100) : 0);
  const todayMs = ms(today);
  const todayIn = todayMs >= a && todayMs <= b;

  // month ticks
  const months: { label: string; left: number }[] = [];
  if (span > 0) {
    const first = new Date(a);
    let y = first.getUTCFullYear();
    let m = first.getUTCMonth();
    for (let i = 0; i < 14; i++) {
      const tick = Date.UTC(y, m, 1);
      if (tick > b) break;
      if (tick >= a) {
        months.push({
          label: new Intl.DateTimeFormat(lang === 'ar' ? 'ar' : 'en', { month: 'short', timeZone: 'UTC' }).format(new Date(tick)),
          left: pct(tick),
        });
      }
      if (++m > 11) { m = 0; y++; }
    }
  }

  const active = currentStage(tender);
  const focusKey = focus ?? active?.key ?? tender.stages[tender.stages.length - 1]?.key ?? '';
  const sel = tender.stages.find((s) => s.key === focusKey) ?? tender.stages[0];
  const selSt = sel ? stageViewStatus(tender, sel, today) : 'planned';
  const doneCount = tender.stages.filter((s) => s.actualTo).length;

  return (
    <>
      <div className="file-card">
        <div className="file-card__head">
          <div>
            <div className="file-card__title">{t('timeline.title')}</div>
            <div className="file-card__sub">
              {t('timeline.sub', {
                stages: fmtCount(tender.stages.length, lang),
                done: fmtCount(doneCount, lang),
              })}
            </div>
          </div>
          <div className="file-tl__legend">
            <span className="file-tl__leg"><span className="file-tl__leg-bar file-tl__leg-bar--planned" />{t('timeline.legPlanned')}</span>
            <span className="file-tl__leg"><span className="file-tl__leg-bar file-tl__leg-bar--actual" />{t('timeline.legActual')}</span>
            <span className="file-tl__leg"><span className="file-tl__leg-today" />{t('timeline.legToday')}</span>
          </div>
        </div>

        <div className="file-tl__axis">
          <span className="file-tl__axis-h">{t('timeline.colStage')}</span>
          <div className="file-tl__months">
            {months.map((mo, i) => (
              <span key={i} className="file-tl__month" style={{ insetInlineStart: `${mo.left}%` }}>{mo.label}</span>
            ))}
          </div>
          <span className="file-tl__axis-h">{t('timeline.colDates')}</span>
          <span className="file-tl__axis-h">{t('timeline.colDev')}</span>
          <span className="file-tl__axis-h" />
        </div>

        {tender.stages.map((s, i) => {
          const def = stageByKey(s.key);
          const st = stageViewStatus(tender, s, today);
          const dev = stageDevWd(s, today, cal);
          const activeLike = st === 'progress' || st === 'delayed';
          const hasBars = !!(s.plannedFrom && s.plannedTo);
          const pL = hasBars ? pct(ms(s.plannedFrom!)) : 0;
          const pW = hasBars ? Math.max(1.2, pct(ms(s.plannedTo!)) - pL) : 0;
          const aEndMs = s.actualTo ? ms(s.actualTo) : activeLike && todayIn ? todayMs : null;
          const hasActual = (st === 'done' || activeLike) && hasBars && aEndMs != null;
          const aW = hasActual ? Math.max(1.2, pct(aEndMs!) - pL) : 0;

          return (
            <button key={s.key} className={`file-tl__row${s.key === focusKey ? ' file-tl__row--on' : ''}`} onClick={() => onFocus(s.key)}>
              <span className="file-tl__stage">
                {/* د11-ت7 — the dot GREW into a numbered bubble on a connecting rail. It is a skin
                    over the existing `stageViewStatus`: the colour family is still the one the
                    status names (so red still means a planned end that passed with no actual
                    close, never «current»), and the number is the stage's own position in THIS
                    tender's stage array — a path with nine stages numbers to nine, not to twelve. */}
                <span className={`file-tl__dot file-tl__dot--${st}`}>{i + 1}</span>
                <span style={{ minWidth: 0 }}>
                  <span className={`file-tl__name ${st === 'planned' ? 'file-tl__name--muted' : activeLike ? 'file-tl__name--active' : ''}`}>
                    {def ? def[lang] : s.key}
                  </span>
                  {/* د4 — the running stage wears a pulsing tag; nothing else on the chart moves.
                      `activeLike` is `stageViewStatus` reporting THIS stage as the one still open,
                      so the pulse is conditional on the stage genuinely running. The tag turns
                      `--status-delayed` on the same measured fact the dot does — a planned end
                      that passed with no actual close — and never merely because it is current. */}
                  {activeLike ? (
                    <span className={`file-tl__now${st === 'delayed' ? ' file-tl__now--delayed' : ''}`}>
                      <span className="file-tl__now-dot" />
                      {st === 'delayed' ? t('status.delayed') : t('timeline.progressNow')}
                    </span>
                  ) : (
                    <span className="file-tl__sub">{st === 'planned' ? t('timeline.notStarted') : ''}</span>
                  )}
                </span>
              </span>

              <span className="file-tl__bars">
                {todayIn && <span className="file-tl__today" style={{ insetInlineStart: `${pct(todayMs)}%` }} />}
                {hasBars && <span className="file-tl__planned" style={{ insetInlineStart: `${pL}%`, width: `${pW}%` }} />}
                {hasActual && <span className="file-tl__actual" style={{ insetInlineStart: `${pL}%`, width: `${aW}%`, background: actualColor(st, dev) }} />}
              </span>

              <span className="file-tl__dates">
                {hasBars ? `${md(s.plannedFrom!)} → ${md(s.plannedTo!)}` : '—'}
                <br />
                {hasActual ? `${md(s.plannedFrom!)} → ${s.actualTo ? md(s.actualTo) : '…'}` : '— —'}
              </span>

              <span><DevChip wd={dev} /></span>

              <span className="file-tl__action">
                {activeLike ? (
                  <span className="op-btn-primary" onClick={(e) => { e.stopPropagation(); onWizard(s.key); }}>{t('timeline.openWizard')}</span>
                ) : st === 'done' ? (
                  <span className="file-tl__done"><Icon name="check" size={13} strokeWidth={2} />{t('timeline.done')}</span>
                ) : (
                  <span className="file-tl__later">{t('timeline.later')}</span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {sel && (
        <div className="file-sel">
          <div className="file-sel__card">
            <div className="file-sel__head">
              <div className="file-sel__title">{t('timeline.detailsTitle', { name: stageByKey(sel.key)?.[lang] ?? sel.key })}</div>
              <StatusPill status={selSt}>{t(`status.${selSt}`)}</StatusPill>
            </div>
            <div className="file-sel__grid">
              <div className="file-sel__cell">
                <div className="file-sel__cell-l">{t('timeline.planned')}</div>
                <div className="file-sel__cell-v">{sel.plannedFrom && sel.plannedTo ? `${md(sel.plannedFrom)} → ${md(sel.plannedTo)}` : '—'}</div>
              </div>
              <div className="file-sel__cell">
                <div className="file-sel__cell-l">{t('timeline.actual')}</div>
                <div className="file-sel__cell-v">
                  {sel.actualTo ? `${md(sel.plannedFrom ?? sel.actualTo)} → ${md(sel.actualTo)}` : selSt === 'progress' || selSt === 'delayed' ? t('timeline.running') : '—'}
                </div>
              </div>
              <div className="file-sel__cell">
                <div className="file-sel__cell-l">{t('timeline.deviation')}</div>
                <div className="file-sel__cell-v file-sel__cell-v--dev"><DevChip wd={stageDevWd(sel, today, cal)} /></div>
              </div>
            </div>
            <div className="file-sel__note">{t(`timeline.note.${selSt === 'delayed' ? 'progress' : selSt}`)}</div>
            {(selSt === 'progress' || selSt === 'delayed') && (
              <div className="file-sel__cta">
                <button className="op-btn-primary" onClick={() => onWizard(sel.key)}>{t('timeline.openStageWizard')}</button>
                <span className="file-sel__hint">{t('timeline.ctaHint')}</span>
              </div>
            )}
          </div>

          <div className="file-guide">
            <div className="file-guide__head">
              <Icon name="shield" size={15} />
              {t('guide.title')}
            </div>
            <div className="file-guide__body">{t(`guide.${sel.key}.t`)}</div>
            <span className="file-guide__ref">{t(`guide.${sel.key}.r`)}</span>
          </div>
        </div>
      )}
    </>
  );
}
