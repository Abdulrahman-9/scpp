import { APPROVED_ORIGINS, CRITICAL_MATERIALS, rocParticipation } from '@masaar/scpp-rules';
import { StatusPill } from '@masaar/ui';
import { useTranslation } from 'react-i18next';
import { faFor, tenderLocalContentApplies, tenderLocalContentStatus, todayIso, useStore } from '../store';
import { MinistryListsExplainer } from './MinistryLists';

/** Committees & compliance: MDOC nominations (12.2) + §9 local content (derived, never hardcoded). */
export default function Compliance() {
  const { t: tr, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const { state } = useStore();
  const today = todayIso();

  return (
    <>
      <section className="card">
        <h2>{tr('compliance.nomTitle')}</h2>
        <p className="hint">{tr('compliance.nomHint')}</p>
        <table className="dtable">
          <thead>
            <tr>
              <th>{tr('admin.code')}</th>
              <th>{tr('admin.titleCol')}</th>
              <th>{tr('compliance.tier')}</th>
              <th>{tr('compliance.deadline')}</th>
            </tr>
          </thead>
          <tbody>
            {state.tenders.map((t) => {
              const trigger = t.mct?.notifiedOn ?? t.announcement.publishedOn ?? t.createdOn;
              const fa = faFor(state, t);
              // no effective contract → the participation tier is not derivable from any real
              // authority; show that honestly rather than asserting a tier off a fabricated FA of 0.
              const p = fa == null ? null : rocParticipation(t.estimatedValueUSD, fa, trigger);
              const missed = p != null && p.nominationDeadline != null && today > p.nominationDeadline;
              return (
                <tr key={t.id}>
                  <td className="mono">{t.code}</td>
                  <td>{t.title[lang]}</td>
                  <td>
                    {p == null ? (
                      <StatusPill status="blocked">{tr('compliance.noContract')}</StatusPill>
                    ) : (
                      <StatusPill status={p.tier === 'witness-validate' ? 'risk' : p.tier === 'observer' ? 'progress' : 'planned'}>
                        {tr(`compliance.tiers.${p.tier}`)} <span className="m-clause">SCPP {p.clause}</span>
                      </StatusPill>
                    )}
                  </td>
                  <td>
                    {p?.nominationDeadline ? (
                      <span className="vendor-ban">
                        <span className="mono">{p.nominationDeadline}</span>
                        {missed ? (
                          <StatusPill status="delayed">{tr('compliance.missed')}</StatusPill>
                        ) : (
                          <StatusPill status="progress">{tr('compliance.open')}</StatusPill>
                        )}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>{tr('compliance.lcTitle')}</h2>
        <p className="hint">{tr('compliance.lcHint')}</p>
        {/* ق5 — THIS section reads the Article-25 five (participation), and the critical-materials
            section below reads the ministry SUPPLIERS list (C8.7 origin). One label was standing
            for both; the disclosure states which rule reads which, with live counts. */}
        <MinistryListsExplainer />
        {(() => {
          // §9 applies only above authority in a drilling / engineering-construction / heavy-materials
          // scope. The status is DERIVED (C2): the 20% is a proposed figure in the documents, never an
          // automatic breach — a documented decline is a lawful `exempt`, not a violation.
          const rows = state.tenders.filter((t) => tenderLocalContentApplies(state, t));
          if (rows.length === 0) return <p className="hint">{tr('compliance.lcNone')}</p>;
          return (
            <table className="dtable">
              <thead>
                <tr>
                  <th>{tr('admin.code')}</th>
                  <th>{tr('compliance.colScope')}</th>
                  <th>{tr('compliance.colStatus')}</th>
                  <th>{tr('compliance.colResponses')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => {
                  const st = tenderLocalContentStatus(state, t);
                  return (
                    <tr key={t.id}>
                      <td className="mono">{t.code}</td>
                      <td>{tr(`compliance.scope.${t.scope ?? 'OTHER'}`)}</td>
                      <td>
                        <StatusPill status={st === 'violating' ? 'delayed' : st === 'exempt' ? 'risk' : 'done'}>
                          {tr(`compliance.lcStatus.${st}`)} <span className="m-clause">SCPP 25</span>
                        </StatusPill>
                      </td>
                      <td>
                        {(t.stateResponses ?? []).length === 0
                          ? <span className="hint">—</span>
                          : (t.stateResponses ?? []).map((r) => (
                              <span key={r.company} className="lc-resp">
                                <span className="mono">{r.company}</span>: {tr(`compliance.resp.${r.status}`)}
                                {r.status === 'declined' && r.evidence ? ' ✓' : ''}
                              </span>
                            ))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          );
        })()}
      </section>

      <section className="card">
        <h2>{tr('compliance.critTitle')}</h2>
        <p className="hint">{tr('compliance.critHint')}</p>
        <p className="lc-origins">
          <strong>{tr('compliance.approvedOrigins')}:</strong> {APPROVED_ORIGINS.join(' · ')}
          <span className="m-clause" style={{ marginInlineStart: 8 }}>SCPP C8.6</span>
        </p>
        <div className="lc-materials">
          {CRITICAL_MATERIALS.map((m) => (
            <span key={m.id} className="lc-chip">{lang === 'ar' ? m.ar : m.en}</span>
          ))}
        </div>
      </section>
    </>
  );
}
