import { METHODS, stageByKey } from '@masaar/scpp-rules';
import { StatusPill } from '@masaar/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDialogA11y } from '../useDialogA11y';
import { StageRail } from '../registry/StageRail';
import { calendarOf, currentStage, expectedAwardDate, todayIso, useStore } from '../store';
import { DevChip } from './DevChip';
import { fmtMoney, stageDevWd, stageViewStatus, tenderStatus } from './derive';
import { Icon } from './Icon';

/**
 * The exit animation is `--dur-fast` (see `.op-drawer--closing` in operator.css). This is the
 * SAFETY NET, not the mechanism: the teardown normally rides `animationend`, and this timer only
 * fires where no animation runs at all — jsdom, a headless print, a browser that dropped the
 * frame. Long enough to never pre-empt a real animation, short enough that a dead listener never
 * strands the drawer on screen.
 */
const EXIT_FALLBACK_MS = 260;

/** 440px preview drawer — stage segments + per-stage deviation, opens onto the file. */
export default function QuickLook({ tenderId, onClose }: { tenderId: string; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const { state } = useStore();

  // Closing is a STATE, not an event: the drawer paints its exit and only then unmounts (§2-3).
  // `done` guards against a double close (Escape landing on top of a backdrop click), which would
  // otherwise call the parent's onClose twice.
  const [closing, setClosing] = useState(false);
  const done = useRef(false);
  const beginClose = useCallback(() => {
    if (done.current) return;
    done.current = true;
    setClosing(true);
  }, []);

  const { panelRef, titleId } = useDialogA11y(beginClose);

  useEffect(() => {
    if (!closing) return;
    const panel = panelRef.current;
    let fired = false;
    const finish = () => {
      if (fired) return;
      fired = true;
      onClose();
    };
    // only the panel's OWN animation ends the drawer — animationend bubbles, and a child that
    // happens to animate would otherwise tear the drawer down mid-exit
    const onEnd = (e: AnimationEvent) => { if (e.target === panel) finish(); };
    panel?.addEventListener('animationend', onEnd);
    const timer = setTimeout(finish, EXIT_FALLBACK_MS);
    return () => {
      panel?.removeEventListener('animationend', onEnd);
      clearTimeout(timer);
    };
  }, [closing, onClose, panelRef]);

  const today = todayIso();
  const cal = calendarOf(state);
  const tender = state.tenders.find((x) => x.id === tenderId);
  if (!tender) return null;

  const method = METHODS.find((m) => m.id === tender.methodId);
  // the SAME derivation the registry row prints, from the same tender and the same calendar — the
  // head badge and the row's pill cannot disagree because there is one function, not two readings
  const status = tenderStatus(tender, today, cal);
  const cur = currentStage(tender);
  const award = expectedAwardDate(tender);

  return (
    <div className={`op-drawer${closing ? ' op-drawer--closing' : ''}`} onClick={beginClose}>
      <div
        ref={panelRef}
        className="op-drawer__panel"
        onClick={(e) => e.stopPropagation()}
        dir={lang === 'ar' ? 'rtl' : 'ltr'}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="op-drawer__head">
          <div className="op-drawer__main">
            <div className="op-drawer__namerow">
              <span className="op-drawer__name" id={titleId}>{tender.title[lang]}</span>
              <StatusPill status={status} title={t(`match.status.${status}`)}>{t(`status.${status}`)}</StatusPill>
            </div>
            <div className="op-drawer__sub">
              <span className="op-code">{tender.code}</span> · {method ? method[lang] : ''} · {fmtMoney(tender.estimatedValueUSD)}
              {award && (
                <>
                  {' · '}
                  {t('ql.award')} <span className="op-code">{award}</span>
                </>
              )}
            </div>
          </div>
          <button className="op-drawer__close" onClick={beginClose} aria-label={t('ql.close')}>
            ✕
          </button>
        </div>

        <div className="op-drawer__body">
          <div>
            <div className="op-drawer__label">{t('ql.segs')}</div>
            {/* د4 — the one rail component, in its wide dress. Merging it here retires the local
                copy of the band and, with it, the slots that carried a colour and no name (م1). */}
            <StageRail tender={tender} today={today} lang={lang} size="wide" />
            <div className="op-drawer__now">
              {cur ? (
                <>
                  {t('ql.now')} <b>{stageByKey(cur.key)?.[lang] ?? cur.key}</b>
                </>
              ) : (
                t('ql.nowDone')
              )}
            </div>
          </div>

          <div>
            <div className="op-drawer__label">{t('ql.stages')}</div>
            <div className="op-drawer__items">
              {tender.stages.map((s) => {
                const def = stageByKey(s.key);
                const st = stageViewStatus(tender, s, today);
                const from = s.plannedFrom ?? '—';
                const to = s.actualTo ?? s.plannedTo ?? '—';
                return (
                  <div key={s.key} className="op-drawer__item">
                    <div className="op-drawer__main">
                      <div className="op-drawer__iname">{def ? def[lang] : s.key}</div>
                      <div className="op-drawer__irange">
                        {from} → {to}
                      </div>
                    </div>
                    <DevChip wd={stageDevWd(s, today, cal)} className="op-drawer__idev op-dev" />
                    <StatusPill status={st}>{t(`status.${st}`)}</StatusPill>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="op-drawer__foot">
          <a className="op-btn-ghost" href={`#/operator/t/${tender.id}/report`}>
            <Icon name="printer" size={13} />
            {t('ql.a4')}
          </a>
          <span style={{ flex: 1 }} />
          <button
            className="op-btn-primary"
            onClick={() => {
              // navigating away replaces the surface outright — no exit to paint
              onClose();
              window.location.hash = `#/operator/t/${tender.id}`;
            }}
          >
            {t('ql.openFile')}
          </button>
        </div>
      </div>
    </div>
  );
}
