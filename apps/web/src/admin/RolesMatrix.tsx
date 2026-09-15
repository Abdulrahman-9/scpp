import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { fmtCount } from '../operator/derive';
import { Icon } from '../operator/Icon';
import { API_ROLES, type ApiRole } from '../session';
import { todayIso, useStore } from '../store';
import { cellState, holdersOf, roleKey, specConflicts, type CellState } from './access';
import {
  CAPABILITIES, CAP_EXTRACTED_ON, CAP_REV, COUNTED, COUNTED_DOMAINS, type Capability,
} from './capabilities';

/** Every role in the universe, in ladder order — a column per role, never a curated subset. */
const ROLES: readonly ApiRole[] = API_ROLES;

const GLYPH: Record<CellState, string> = { yes: '✓', scoped: '✓⌐', open: '○', no: '—', session: '⊘', conflict: '⚠' };
const LEGEND: { state: CellState; key: string }[] = [
  { state: 'yes', key: 'legendYes' },
  { state: 'scoped', key: 'legendScoped' },
  { state: 'open', key: 'legendOpen' },
  { state: 'no', key: 'legendNo' },
  { state: 'session', key: 'legendSession' },
  { state: 'conflict', key: 'legendConflict' },
];

const daysSince = (iso: string, today: string): number =>
  Math.round((Date.parse(today) - Date.parse(iso)) / 86_400_000);

/**
 * The REFERENCE MATRIX tab of «الوصول والأدوار» (client request 20) — every endpoint × every role.
 *
 * It kept its place instead of being simplified away: the role cards answer «who is this and what
 * may they approve», which is what the client asked for, but an auditor's question is «show me the
 * whole surface and let me reconcile it», and only a full 46-row grid answers that. The former
 * «حسب الدور» sub-tab is gone — the role cards replaced it, and two role views would have been two
 * answers to one question.
 */
export default function CapabilityMatrix() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const { state } = useStore();

  const stale = daysSince(CAP_EXTRACTED_ON, todayIso());
  const conflicts = specConflicts();
  const sessionRows = CAPABILITIES.filter((c) => c.guard === 'session');

  const authority = (c: Capability) =>
    t('caps.authority', { route: `${c.method} ${c.route}`, roles: c.roles.join(', ') || '—' });

  const exportCsv = () => {
    const head = ['id', 'domain', 'method', 'route', 'guard', 'scoped', 'clause', ...ROLES];
    const body = CAPABILITIES.map((c) => [
      c.id, c.domain, c.method, c.route, c.guard, String(c.scoped), c.clause,
      ...ROLES.map((r) => cellState(c, r)),
    ]);
    const csv = [head, ...body].map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `masaar-capabilities-${CAP_REV}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="acc-tabhead">
        <div className="acc-tabhead__s">
          {t('caps.sub', {
            n: fmtCount(CAPABILITIES.length, lang),
            r: fmtCount(ROLES.length, lang),
            d: fmtCount(COUNTED_DOMAINS.length, lang),
          })}
        </div>
        <div className="acc-tabhead__a">
          <span className="op-code" style={{ fontSize: 11 }}>{CAP_REV}</span>
          <button className="op-btn-ghost" onClick={exportCsv}>{t('access.exportCsv')}</button>
        </div>
      </div>

      <div className={`wz-note wz-note--${stale > 30 ? 'warn' : 'info'}`}>
        <Icon name="shield" size={14} />{' '}
        {stale > 30 ? t('caps.stale', { n: fmtCount(stale, lang) }) : t('caps.provenance', { rev: CAP_REV, on: CAP_EXTRACTED_ON })}
      </div>

      <div className="acc-legend">
        {LEGEND.map((l) => (
          <span key={l.state}>
            <span className={`acc-cell acc-cell--${l.state}`}>{GLYPH[l.state]}</span>
            {t(`caps.${l.key}`)}
          </span>
        ))}
      </div>

      <div className="op-tablecard">
        {/* only this container scrolls sideways — the page itself never does */}
        <div className="acc-matrix">
          <table className="op-tbl">
            <thead>
              <tr>
                <th style={{ minWidth: 260 }}>{t('caps.colCap')}</th>
                <th style={{ width: 80 }}>{t('caps.colClause')}</th>
                {ROLES.map((r) => (
                  <th key={r} style={{ width: 92, textAlign: 'center' }}>{t(`roles.names.${roleKey(r)}`)}</th>
                ))}
                <th style={{ width: 96 }} className="op-end">{t('caps.colHolders')}</th>
              </tr>
            </thead>
            <tbody>
              {COUNTED_DOMAINS.map((d) => {
                const items = COUNTED.filter((c) => c.domain === d);
                if (items.length === 0) return null;
                return (
                  <Fragment key={d}>
                    <tr className="acc-domain"><td colSpan={ROLES.length + 3}>{t(`caps.dom_${d}`)}</td></tr>
                    {items.map((c) => {
                      const holders = holdersOf(c, state.users).length;
                      return (
                        <tr key={c.id}>
                          <td>
                            <div className="op-tbl__name" dir="auto">{c.label[lang]}</div>
                            <div className="op-tbl__code">{c.id}</div>
                            {c.guard === 'open' && <div className="op-tbl__code" style={{ whiteSpace: 'normal' }}>{t('caps.openNote')}</div>}
                          </td>
                          <td>{c.clause ? <span className="op-scpp">{c.clause}</span> : <span className="op-dev op-dev--none">—</span>}</td>
                          {ROLES.map((r) => {
                            const s = cellState(c, r);
                            const label = t(`caps.${LEGEND.find((l) => l.state === s)!.key}`);
                            return (
                              <td key={r} style={{ textAlign: 'center' }}>
                                <span
                                  className={`acc-cell acc-cell--${s}`}
                                  title={s === 'conflict' ? t('caps.conflictCell') : authority(c)}
                                  aria-label={label}
                                >
                                  {GLYPH[s]}
                                </span>
                              </td>
                            );
                          })}
                          <td className="op-end">
                            <a
                              className={`acc-holders${holders === 0 ? ' acc-holders--none' : ''}`}
                              href="#/admin/users"
                              title={holders === 0 ? t('caps.noHolder') : t('caps.holdersOf')}
                            >
                              {fmtCount(holders, lang)}
                            </a>
                          </td>
                        </tr>
                      );
                    })}
                  </Fragment>
                );
              })}

              {/* excluded from every counter — shown so the 46 reconciles on screen */}
              <tr className="acc-domain"><td colSpan={ROLES.length + 3}>{t('caps.sessionGroup')}</td></tr>
              {sessionRows.map((c) => (
                <tr key={c.id} style={{ opacity: 0.6 }}>
                  <td>
                    <div className="op-tbl__name" dir="auto">{c.label[lang]}</div>
                    <div className="op-tbl__code">{c.id}</div>
                  </td>
                  <td><span className="op-dev op-dev--none">—</span></td>
                  {ROLES.map((r) => (
                    <td key={r} style={{ textAlign: 'center' }}>
                      <span className="acc-cell acc-cell--session" title={authority(c)}>{GLYPH.session}</span>
                    </td>
                  ))}
                  <td className="op-end"><span className="op-dev op-dev--none">—</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {conflicts.length > 0 && (
        <div className="ad-panel" style={{ marginTop: 14 }}>
          <div className="ad-panel__head">
            <div>
              <div className="ad-panel__t">{t('caps.conflictTitle')}</div>
              <div className="ad-panel__s">{t('caps.specSource')}</div>
            </div>
          </div>
          {conflicts.map((c) => (
            <div key={c.id} className="ad-late">
              <div className="ad-late__body">
                <div className="ad-late__t">
                  {c.label[lang]}<span className="acc-refused">{GLYPH.conflict}</span>
                </div>
                <div className="ad-late__s">
                  {t('caps.conflictNote', {
                    cap: c.label[lang],
                    roles: (c.specGrants ?? []).map((r) => t(`roles.names.${roleKey(r)}`)).join(' · '),
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="ad-empty-inline" style={{ marginTop: 10 }}>{t('caps.noSignCapability')}</div>
    </>
  );
}
