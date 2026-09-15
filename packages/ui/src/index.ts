import './ui.css';

export { CapMeter, type CapMeterProps, type Lang } from './CapMeter';
export { KpiTile, type KpiTileProps } from './KpiTile';
export { PathBadge, type PathBadgeProps } from './PathBadge';
export { StatusPill, type StatusPillProps } from './StatusPill';
export { Stepper, type StepperProps } from './Stepper';
export { useCountUp, COUNT_UP_MS, type CountUpOpts } from './useCountUp';
export { VerdictStrip, type VerdictStripProps } from './VerdictStrip';
export { WdRail, type WdRailProps, type WdRailMarker } from './WdRail';

/**
 * Skin wrapper class names — one system, two skins.
 *
 * «The Operations Room» left with DESIGN-V2-SPEC §4-ط: it was a navy inversion mixed by hand, and
 * the product now ships a real dark theme. Keeping the key alive would have named a class that no
 * longer exists in ui.css — a skin that renders as the default and says so to nobody.
 */
export const SKINS = {
  ledger: 'm-skin',
  blueprint: 'm-skin m-skin--blueprint',
} as const;

export type SkinKey = keyof typeof SKINS;
