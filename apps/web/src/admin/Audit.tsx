import { StatusPill } from '@masaar/ui';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fmtCount } from '../operator/derive';
import { FilterChips, type FilterChip } from '../registry/FilterChips';
import { loadSession } from '../session';
import { byName, byOid, useStore } from '../store';

/** Append-only audit log (8.1-e) — newest first; no edit or delete exists. */
export default function Audit() {
  const { t: tr, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const { state } = useStore();
  const session = loadSession();
  const entries = useMemo(() => [...state.audit].reverse(), [state.audit]);

  /**
   * س‌ل5/ل4 — «سجل قراراتي», built as a FILTER on the trail rather than as a screen.
   *
   * The reference kept a «decisions this session» panel in memory: the right question with an
   * implementation that evaporates on reload, and that could only ever show what happened since
   * sign-in. The durable answer was already on file the moment د8 gave this table its actor column
   * — every governance row carries the immutable `Actor`, so «which of these did I do?» is a
   * narrowing of the permanent log, not a second store.
   *
   * Matched on the OID, never on the display name: two people may share a name, one person may
   * change theirs, and a name-matched «my decisions» would quietly attribute somebody else's
   * refusal to the reader. Rows written before attribution (and rows hydrated from the API, which
   * carry only a name on the wire) hold no oid and therefore never match — they are not mine
   * merely because they cannot say whose they are.
   */
  const [mine, setMine] = useState(false);
  /** No oid on the session (nothing to match) ⇒ no control: a chip that could only ever count 0
   *  is a filter promising a view it cannot produce. */
  const oid = session?.oid;
  const mineRows = useMemo(
    () => (oid ? entries.filter((e) => e.by && byOid(e.by) === oid) : []),
    [entries, oid],
  );
  const rows = mine ? mineRows : entries;

  const chips: FilterChip[] = [
    { key: 'all', label: tr('audit.chipAll'), count: entries.length, active: !mine },
    { key: 'mine', label: tr('audit.chipMine'), count: mineRows.length, active: mine, title: tr('audit.chipMineHint') },
  ];

  return (
    <section className="card">
      <h2>{tr('audit.title')}</h2>
      <p className="hint">{tr('audit.hint')}</p>
      {oid && entries.length > 0 && (
        <div className="acc-filters" data-noprint="1">
          <FilterChips chips={chips} onSelect={(key) => setMine(key === 'mine')} lang={lang} />
        </div>
      )}
      {entries.length === 0 ? (
        <StatusPill status="planned">{tr('audit.empty')}</StatusPill>
      ) : rows.length === 0 ? (
        // «nothing matches» and «nothing exists» are different sentences, and only one is true here
        <StatusPill status="planned">{tr('audit.emptyMine')}</StatusPill>
      ) : (
        <table className="dtable">
          <thead>
            <tr>
              <th>{tr('audit.ts')}</th>
              <th>{tr('audit.action')}</th>
              <th>{tr('audit.target')}</th>
              <th>{tr('audit.by')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e, i) => (
              <tr key={`${e.ts}-${i}`}>
                <td className="mono" style={{ fontSize: 11.5 }}>{e.ts.replace('T', ' ').slice(0, 19)}</td>
                <td className="mono" style={{ fontSize: 11.5 }}>{e.action}</td>
                <td className="mono">{e.target}</td>
                {/* D6 — the stored actor, read through the shape-tolerant byName/byOid (Actor row
                    or legacy/API string row); rows written before attribution honestly show the
                    `audit.byNone` dash — the ONE key both audit tables read, so the file log and
                    this log cannot drift into two different ways of saying «nobody was recorded» */}
                <td dir="auto" title={e.by ? byOid(e.by) : undefined}>{e.by ? byName(e.by) : tr('audit.byNone')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {mine && rows.length > 0 && (
        <p className="hint" style={{ marginBlockStart: 10 }}>
          {tr('audit.mineNote', { n: fmtCount(mineRows.length, lang) })}
        </p>
      )}
    </section>
  );
}
