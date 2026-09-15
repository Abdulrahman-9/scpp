import { describe, expect, it } from 'vitest';
import {
  rocParticipation,
  scheduleCompliancePct,
  stageCanClose,
  stageDeviationDays,
  stageDeviationWorkingDays,
} from '@masaar/scpp-rules';

describe('rocParticipation — tiers (6.5 / 12.2)', () => {
  const FA = 5_000_000;

  it('above FA → witness + validate, nominate ≤ 14 calendar days (12.2.2)', () => {
    const r = rocParticipation(6_000_000, FA, '2026-06-01');
    expect(r.tier).toBe('witness-validate');
    expect(r.clause).toBe('12.2.2');
    expect(r.nominationDeadline).toBe('2026-06-15');
  });

  it('> max($2M, 25% FA) → observer, nominate ≤ 5 WD (12.2.3)', () => {
    const r = rocParticipation(2_500_000, FA, '2026-06-01'); // Monday
    expect(r.tier).toBe('observer');
    expect(r.clause).toBe('12.2.3');
    expect(r.nominationDeadline).toBe('2026-06-08'); // 5 WD over the Fri/Sat weekend
  });

  it('the observer threshold uses the higher of $2M and 25% of FA', () => {
    // FA = $10M → threshold = $2.5M, so $2.2M stays information-only
    expect(rocParticipation(2_200_000, 10_000_000).tier).toBe('information-only');
    expect(rocParticipation(2_600_000, 10_000_000).tier).toBe('observer');
  });

  it('within FA and under threshold → information only (6.5)', () => {
    const r = rocParticipation(1_000_000, FA);
    expect(r.tier).toBe('information-only');
    expect(r.clause).toBe('6.5');
    expect(r.nominationDeadline).toBeUndefined();
  });
});

describe('deviation engine', () => {
  it('deviation = actual − planned (positive = late)', () => {
    expect(stageDeviationDays('2026-06-01', '2026-06-05')).toBe(4);
    expect(stageDeviationDays('2026-06-05', '2026-06-01')).toBe(-4);
    expect(stageDeviationDays('2026-06-05', '2026-06-05')).toBe(0);
  });

  it('compliance % counts only closed stages', () => {
    expect(
      scheduleCompliancePct([
        { plannedEnd: '2026-06-01', actualEnd: '2026-06-01' }, // on time
        { plannedEnd: '2026-06-01', actualEnd: '2026-06-09' }, // late
        { plannedEnd: '2026-07-01' }, // still open — ignored
      ]),
    ).toBe(50);
  });

  it('no closed stages → 100%', () => {
    expect(scheduleCompliancePct([{ plannedEnd: '2026-07-01' }])).toBe(100);
  });

  it('working-day deviation excludes the Fri/Sat weekend, signed', () => {
    // Thu 2026-06-04 → Mon 2026-06-08 crosses the Fri+Sat weekend → Sun+Mon = +2 WD late
    expect(stageDeviationWorkingDays('2026-06-04', '2026-06-08')).toBe(2);
    // early by the same span is negative
    expect(stageDeviationWorkingDays('2026-06-08', '2026-06-04')).toBe(-2);
    expect(stageDeviationWorkingDays('2026-06-08', '2026-06-08')).toBe(0);
    // Mon 2026-06-01 → Thu 2026-06-04, no weekend crossed → 3 WD
    expect(stageDeviationWorkingDays('2026-06-01', '2026-06-04')).toBe(3);
  });

  it('stages cannot close without required documents', () => {
    const r = stageCanClose(['minutes', 'evaluation-report'], ['minutes']);
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual(['evaluation-report']);
    expect(stageCanClose(['minutes'], ['minutes', 'extra']).ok).toBe(true);
  });
});
