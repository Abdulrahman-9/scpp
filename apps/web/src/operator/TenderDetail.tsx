import { stageByKey } from '@masaar/scpp-rules';
import { StatusPill } from '@masaar/ui';
import { calendarDaysBetween, workingDaysBetween } from '@masaar/working-days';
import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { calendarOf, currentStage, expectedAwardDate, requiredDocsFor, stageStatus, todayIso, useStore } from '../store';
import { fmtCount, fmtMoney, tenderDeviationWd, tenderStatus, wizardTypeFor } from './derive';
import { DevChip } from './DevChip';
import FileBidders from './FileBidders';
import FileDocs from './FileDocs';
import FileLog from './FileLog';
import FileSide from './FileSide';
import FileTimeline from './FileTimeline';
import { Icon } from './Icon';
import { useOperatorUi } from './OperatorShell';
import { PathChip } from './PathChip';

type Tab = 'timeline' | 'docs' | 'bidders' | 'log';
const TABS: readonly Tab[] = ['timeline', 'docs', 'bidders', 'log'];

/**
 * ت6 — the clipboard, defensively. `navigator.clipboard` is absent in jsdom, absent over plain
 * HTTP and revocable by permission, and reading the property itself can throw in a hardened
 * context. So the write is attempted, its PROMISE is what proves success, and every failure path
 * lands on one honest toast instead of an unhandled rejection: no button on this page may break it.
 */
function writeClipboard(text: string): Promise<void> {
  try {
    const p = navigator.clipboard?.writeText?.(text);
    return p instanceof Promise ? p : Promise.reject(new Error('no-clipboard'));
  } catch (e) {
    return Promise.reject(e instanceof Error ? e : new Error('clipboard-threw'));
  }
}

export default function TenderDetail({ id }: { id: string }) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language === 'ar' ? 'ar' : 'en') as 'ar' | 'en';
  const { state } = useStore();
  const { toast } = useOperatorUi();
  const today = todayIso();
  const cal = calendarOf(state);

  const [tab, setTab] = useState<Tab>('timeline');
  const [focus, setFocus] = useState<string | null>(null);

  /**
   * Tab anatomy (spec §2-4). Three buttons styled as tabs were not a tablist to anything but a
   * sighted reader: no role, no aria-selected, no arrow keys, and Tab itself stopped on each of
   * the three before reaching the panel. A roving tabindex fixes the last part — only the
   * selected tab is in the tab order, the arrows move between them.
   */
  const tabsId = useId();
  const tabId = (k: Tab) => `${tabsId}-tab-${k}`;
  const panelId = (k: Tab) => `${tabsId}-panel-${k}`;
  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});
  const isRtl = lang === 'ar';

  const onTabKey = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const i = TABS.indexOf(tab);
    let next = -1;
    if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = TABS.length - 1;
    else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      // the arrows follow the SCREEN, not the array: under RTL the next tab is the one to the
      // left, and a reader who presses «left to go forward» is right in Arabic and wrong in English
      const forward = (e.key === 'ArrowLeft') === isRtl;
      next = (i + (forward ? 1 : -1) + TABS.length) % TABS.length;
    }
    const key = next < 0 ? undefined : TABS[next];
    if (!key) return;
    e.preventDefault();
    setTab(key);
    tabRefs.current[key]?.focus();
  };

  const tender = state.tenders.find((x) => x.id === id);
  if (!tender) {
    return (
      <div className="op-page op-page--file">
        <a className="file-back" href="#/operator">
          <Icon name="chevronEnd" size={13} strokeWidth={2} className="op-chev-fwd" />
          {t('file.back')}
        </a>
        <div className="op-empty">{t('file.notFound')}</div>
      </div>
    );
  }

  const status = tenderStatus(tender, today, cal);
  const active = currentStage(tender);
  const award = expectedAwardDate(tender);

  const froms = tender.stages.map((s) => s.plannedFrom).filter((d): d is string => !!d);
  const tos = tender.stages.map((s) => s.plannedTo).filter((d): d is string => !!d);
  const duration = froms.length && tos.length ? calendarDaysBetween(froms.reduce((a, b) => (a < b ? a : b)), tos.reduce((a, b) => (a > b ? a : b))) : 0;

  // "you are here" due label from the active stage
  let hereDue = '';
  if (active?.plannedTo) {
    if (today > active.plannedTo) hereDue = t('dev.overdueWd', { n: fmtCount(workingDaysBetween(active.plannedTo, today, cal), lang) });
    else {
      const rem = workingDaysBetween(today, active.plannedTo, cal);
      hereDue = rem <= 0 ? t('dev.dueToday') : t('dev.dueWd', { n: fmtCount(rem, lang) });
    }
  }

  const openWizard = (stageKey: string) => {
    window.location.hash = `#/operator/t/${tender.id}/w/${wizardTypeFor(stageKey)}`;
  };

  const copyCode = () => {
    void writeClipboard(tender.code).then(
      () => toast(t('file.copyDone', { code: tender.code }), { kind: 'success' }),
      () => toast(t('file.copyFail'), { kind: 'error' }),
    );
  };

  /**
   * ت2 — the facts strip. Four figures, every one of them DERIVED here and nowhere stored:
   * the estimate, the stage the sequence says is open, the tender-wide deviation in WORKING days
   * (`tenderDeviationWd`, printed by the same `DevChip` the timeline column uses, so the strip can
   * never disagree with the row it summarises), and the document count for the RUNNING stage only.
   * It is a quiet fact line, not a tile board: a filled counter above a file would out-shout the
   * file, and none of these four numbers is a thing to click.
   */
  const devWd = tenderDeviationWd(tender, today, cal);
  const stageDocs = active ? requiredDocsFor(active.key) : [];
  const docsHave = active ? stageDocs.filter((d) => active.uploadedDocs.includes(d)).length : 0;

  return (
    <div className="op-page op-page--file">
      <a className="file-back" href="#/operator">
        <Icon name="chevronEnd" size={13} strokeWidth={2} className="op-chev-fwd" />
        {t('file.back')}
      </a>

      <div className="file-head">
        <div className="file-head__main">
          <div className="file-head__tags">
            <span className="file-code">
              <span className="file-codechip">{tender.code}</span>
              <button type="button" className="file-copy" onClick={copyCode} title={t('file.copyCode')} aria-label={t('file.copyCode')}>
                <Icon name="copy" size={13} strokeWidth={2} />
              </button>
            </span>
            <PathChip id={tender.methodId} lang={lang} />
            <StatusPill status={status}>{t(`status.${status}`)}</StatusPill>
          </div>
          <h1 className="file-title">{tender.title[lang]}</h1>
          <div className="file-meta">
            <span>{t('file.value')} <b className="op-code">{fmtMoney(tender.estimatedValueUSD)}</b></span>
            <span>{t('file.awardExpected')} <b className="op-code">{award ?? '—'}</b></span>
            <span>{t('file.plannedDuration')} <b>{t('file.days', { n: fmtCount(duration, lang) })}</b></span>
          </div>
        </div>
        <a className="op-btn-ghost" href={`#/operator/t/${tender.id}/report`}>
          <Icon name="download" size={14} />
          {t('file.reportPrint')}
        </a>
      </div>

      <dl className="file-kpi">
        <div className="file-kpi__cell">
          <dt className="file-kpi__l">{t('file.kpi.value')}</dt>
          <dd className="file-kpi__v op-code">{fmtMoney(tender.estimatedValueUSD)}</dd>
        </div>
        <div className="file-kpi__cell">
          <dt className="file-kpi__l">{t('file.kpi.stage')}</dt>
          <dd className="file-kpi__v" dir="auto">{active ? (stageByKey(active.key)?.[lang] ?? active.key) : t('file.kpi.stageAllDone')}</dd>
        </div>
        <div className="file-kpi__cell">
          <dt className="file-kpi__l">{t('file.kpi.dev')}</dt>
          <dd className="file-kpi__v"><DevChip wd={devWd} /></dd>
        </div>
        <div className="file-kpi__cell">
          <dt className="file-kpi__l">{t('file.kpi.docs')}</dt>
          <dd className="file-kpi__v op-code">
            {active ? t('file.kpi.docsOf', { have: fmtCount(docsHave, lang), need: fmtCount(stageDocs.length, lang) }) : t('file.kpi.none')}
          </dd>
        </div>
      </dl>

      {active && (
        <div className="file-here">
          <span className="file-here__label"><span className="file-here__dot" />{t('file.hereLabel')}</span>
          <div className="file-here__body">
            <div className="file-here__stage">{stageByKey(active.key)?.[lang] ?? active.key}</div>
            <div className="file-here__req">
              {t('file.hereRequired', { req: t(`taskAction.${active.key}`) })}{hereDue && <> · <b>{hereDue}</b></>}
            </div>
          </div>
          <button className="op-btn-primary" onClick={() => openWizard(active.key)}>
            {t('file.hereCtaLabel')}
            <Icon name="chevronStart" size={13} strokeWidth={2} className="op-chev-fwd" />
          </button>
        </div>
      )}

      {/* the tab set keeps the whole main column; the ت3/ت4/ت5 cards stand beside it as ONE side
          column rather than being folded into a tab, because they are standing facts about the
          file that stay true whichever tab is open (the grid stacks them below on narrow viewports) */}
      <div className="file-body">
        <div className="file-main">
          <div className="file-tabs" role="tablist" aria-label={t('file.tabsLabel')}>
            {TABS.map((k) => (
              <button
                key={k}
                id={tabId(k)}
                ref={(el) => { tabRefs.current[k] = el; }}
                role="tab"
                type="button"
                aria-selected={tab === k}
                aria-controls={panelId(k)}
                tabIndex={tab === k ? 0 : -1}
                className={`file-tab${tab === k ? ' file-tab--on' : ''}`}
                onClick={() => setTab(k)}
                onKeyDown={onTabKey}
              >
                {t(`file.tabs.${k}`)}
              </button>
            ))}
          </div>

          {/* one panel is rendered at a time; each still names the tab that owns it, so a screen
              reader entering the panel is told which of the four it is inside */}
          {tab === 'timeline' && (
            <div role="tabpanel" id={panelId('timeline')} aria-labelledby={tabId('timeline')}>
              <FileTimeline tender={tender} focus={focus} onFocus={setFocus} onWizard={openWizard} />
            </div>
          )}
          {tab === 'docs' && (
            <div role="tabpanel" id={panelId('docs')} aria-labelledby={tabId('docs')}>
              <FileDocs tender={tender} />
            </div>
          )}
          {tab === 'bidders' && (
            <div role="tabpanel" id={panelId('bidders')} aria-labelledby={tabId('bidders')}>
              <FileBidders tender={tender} />
            </div>
          )}
          {tab === 'log' && (
            <div role="tabpanel" id={panelId('log')} aria-labelledby={tabId('log')}>
              <FileLog tender={tender} />
            </div>
          )}
        </div>

        <FileSide tender={tender} />
      </div>
    </div>
  );
}
