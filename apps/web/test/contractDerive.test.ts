import { describe, expect, it } from 'vitest';
import { seedState } from '../src/store';
import {
  actualDelivery,
  contractProgress,
  plannedDelivery,
  plannedProgressPct,
  scheduleVariancePct,
} from '../src/admin/contractDerive';

const contract = (id: string) => seedState().contracts.find((x) => x.id === id)!;

describe('contract schedule derivations', () => {
  it('planned delivery = signing date + the contract term', () => {
    expect(plannedDelivery(contract('c4'))).toBe('2026-04-05'); // 2025-03-01 + 400 days
  });

  it('actual delivery is undefined until every stage is closed', () => {
    expect(actualDelivery(contract('c1'))).toBeUndefined();
  });

  it('reports on-track when actual progress keeps pace with the plan', () => {
    expect(scheduleVariancePct(contract('c1'), '2026-07-16')).toBe(0);
  });

  it('reports a negative variance when a due stage is not yet completed', () => {
    // by 2026-08-01, c2's mobilization (planned 2026-07-25) is due but not done
    expect(plannedProgressPct(contract('c2'), '2026-08-01')).toBe(43);
    expect(contractProgress(contract('c2')).pct).toBe(29);
    expect(scheduleVariancePct(contract('c2'), '2026-08-01')).toBe(-14);
  });
});
