import { extensionCap, liquidatedDamagesCap, variationOrdersCap } from '@masaar/scpp-rules';
import type { ContractStageKey, ContractState } from '../store';

/** Ordered post-award contract lifecycle stages with bilingual labels. */
export const CONTRACT_STAGES: { key: ContractStageKey; ar: string; en: string }[] = [
  { key: 'sign', ar: 'توقيع العقد', en: 'Contract signing' },
  { key: 'bonds', ar: 'إيداع الضمانات', en: 'Bonds lodged' },
  { key: 'mobilize', ar: 'أمر المباشرة', en: 'Mobilization' },
  { key: 'execute', ar: 'التنفيذ والمستخلصات', en: 'Execution & progress' },
  { key: 'provisional', ar: 'الاستلام الأولي', en: 'Provisional acceptance' },
  { key: 'warranty', ar: 'فترة الصيانة', en: 'Warranty period' },
  { key: 'final', ar: 'الاستلام النهائي', en: 'Final acceptance' },
];

export function stageLabel(key: ContractStageKey, lang: 'ar' | 'en'): string {
  return CONTRACT_STAGES.find((s) => s.key === key)?.[lang] ?? key;
}

/** Index of the current (first not-yet-completed) stage; equals length when fully delivered. */
export function currentStageIndex(c: ContractState): number {
  const i = c.stages.findIndex((s) => !s.actualTo);
  return i === -1 ? c.stages.length : i;
}

export function currentStageKey(c: ContractState): ContractStageKey | undefined {
  return c.stages.find((s) => !s.actualTo)?.key;
}

export function contractProgress(c: ContractState): { done: number; total: number; pct: number } {
  const total = c.stages.length;
  const done = c.stages.filter((s) => s.actualTo).length;
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

const DAY_MS = 86_400_000;
const toIso = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
export const addDays = (iso: string, days: number): string => toIso(Date.parse(iso) + days * DAY_MS);

/** Planned delivery = signing date + the contract term (§ contractual completion). */
export function plannedDelivery(c: ContractState): string {
  return addDays(c.signedOn, c.termDays);
}

/** Actual delivery = the last stage's actual date, once every stage is closed. */
export function actualDelivery(c: ContractState): string | undefined {
  return c.stages.length > 0 && c.stages.every((s) => s.actualTo) ? c.stages[c.stages.length - 1]!.actualTo : undefined;
}

/** Planned progress = share of stages whose planned date has passed as of `today`. */
export function plannedProgressPct(c: ContractState, today: string): number {
  const total = c.stages.length;
  if (!total) return 0;
  return Math.round((c.stages.filter((s) => s.plannedTo && s.plannedTo <= today).length / total) * 100);
}

/** Schedule variance in percentage points: actual − planned progress (negative = behind). */
export function scheduleVariancePct(c: ContractState, today: string): number {
  return contractProgress(c).pct - plannedProgressPct(c, today);
}

/** Worst cap status across VO / extension / LD — drives the registry health pill. */
export type CapHealth = 'ok' | 'risk' | 'breach';
export function capHealth(c: ContractState): CapHealth {
  const statuses = [
    variationOrdersCap(c.voTotalUSD, c.valueUSD).status,
    extensionCap(c.extensionDays, c.termDays).status,
    liquidatedDamagesCap(c.ldTotalUSD, c.valueUSD).status,
  ];
  if (statuses.includes('breach')) return 'breach';
  if (statuses.includes('risk')) return 'risk';
  return 'ok';
}
