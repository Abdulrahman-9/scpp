/**
 * Registry layer (batch 1) — the 0–100 score bar, lifted verbatim from
 * Vendors.tsx:7-17 (also duplicated in EntityProfile) so both can share one copy.
 * Colour thresholds map to the closed status vocabulary: ≥75 done, ≥60 risk, else delayed.
 */
export function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="score">
      <span className="score__l">{label}</span>
      <span className="score__track">
        <span
          className="score__fill"
          style={{ width: `${value}%`, background: value >= 75 ? 'var(--status-done)' : value >= 60 ? 'var(--status-risk)' : 'var(--status-delayed)' }}
        />
      </span>
      <span className="mono score__v">{value}</span>
    </div>
  );
}
