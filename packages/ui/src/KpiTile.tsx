import { type ReactNode } from 'react';
import { useCountUp } from './useCountUp';

export interface KpiTileProps {
  label: ReactNode;
  value: number;
  /** rendered inside the value, e.g. "%" or a unit */
  suffix?: ReactNode;
  /** count up over 600 ms on first reveal (disabled under prefers-reduced-motion) */
  countUp?: boolean;
}

export function KpiTile({ label, value, suffix, countUp = true }: KpiTileProps) {
  // the hook used to live inline here; it is now shared with `.ad-kpi` (spec §2-1). Behaviour is
  // unchanged, including the reduced-motion jump — `format` defaults to String, as it did.
  const ref = useCountUp(value, { enabled: countUp });
  return (
    <div className="m-kpi">
      <div className="m-kpi__l">{label}</div>
      <div className="m-kpi__v">
        <span ref={ref}>{countUp ? 0 : value}</span>
        {suffix != null && <small>{suffix}</small>}
      </div>
    </div>
  );
}
