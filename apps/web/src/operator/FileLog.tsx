import { useTranslation } from 'react-i18next';
import { byName, byOid, useStore, type Tender } from '../store';

/**
 * ت1 — the file's fourth tab: THIS tender's slice of the append-only audit record (8.1-e).
 *
 * The record is not re-derived and not re-written here: every row already exists because some
 * dispatch wrote it, and this tab only reads. Two facts govern the filter:
 *
 * 1. HOW A ROW NAMES ITS TENDER. `actionTarget` (store.tsx) resolves a `tenderId` to the tender's
 *    CODE, and falls back to the raw id when the tender was not in state at write time. Both
 *    shapes therefore belong to this file, and matching only one would silently drop rows. The
 *    birth row is the same shape: `CREATE_TENDER` carries no `tenderId`, so `actionTarget` names
 *    it AFTER the reducer mints it, with the code the tender actually got. This filter must NOT be
 *    widened to `budgetCode` to reach it — a budget line is shared, and matching it would show one
 *    tender the birth rows of every request drawn on the same line.
 * 2. THE ACTOR IS READ TOLERANTLY. `by` is absent on rows written before attribution and on rows
 *    hydrated from the API, so it is read through `byName`/`byOid` exactly as the admin Audit
 *    column does (د8-6) — the shared `audit.byNone` dash is the honest answer, never an invented
 *    name, and it is the SAME key the admin log prints so the two cannot drift apart.
 */
export default function FileLog({ tender }: { tender: Tender }) {
  const { t } = useTranslation();
  const { state } = useStore();

  // newest first, like the admin log; `state.audit` is append-only so the source order is oldest→newest
  const rows = state.audit.filter((e) => e.target === tender.code || e.target === tender.id).reverse();

  return (
    <div className="file-card">
      <div className="file-card__head">
        <div>
          <div className="file-card__title">{t('filelog.title')}</div>
          <div className="file-card__sub">{t('filelog.sub')}</div>
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="op-empty">{t('filelog.empty')}</div>
      ) : (
        <table className="op-tbl file-log">
          <thead>
            <tr>
              <th>{t('audit.ts')}</th>
              <th>{t('audit.action')}</th>
              <th>{t('audit.by')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e, i) => (
              <tr key={`${e.ts}-${i}`}>
                <td className="file-log__ts">{e.ts.replace('T', ' ').slice(0, 19)}</td>
                <td className="file-log__act">{e.action}</td>
                <td dir="auto" title={e.by ? byOid(e.by) : undefined}>{e.by ? byName(e.by) : t('audit.byNone')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
