import { describe, expect, it } from 'vitest';
import { contractFinancialAuthority, contractTermYears, serviceContractEffective } from '../src/service-contract';

/** §7.1 — the Service Contract determines the field's Financial Authority; effectiveness
 *  and term are derived (C2), and an unresolvable authority must fail closed. */

const base = { financialAuthorityUSD: 5_000_000, signedOn: '2024-01-01', expiresOn: '2031-01-01' };

describe('serviceContractEffective', () => {
  it('is effective before expiry and not terminated', () => {
    expect(serviceContractEffective(base, new Date('2026-07-25'))).toBe(true);
  });
  it('is not effective after expiry', () => {
    expect(serviceContractEffective(base, new Date('2031-06-01'))).toBe(false);
  });
  it('is not effective once terminated, even before expiry', () => {
    expect(serviceContractEffective({ ...base, terminatedOn: '2026-01-01' }, new Date('2026-07-25'))).toBe(false);
  });
  it('is NOT yet effective before it is signed', () => {
    expect(serviceContractEffective({ ...base, signedOn: '2027-01-01' }, new Date('2026-07-25'))).toBe(false);
  });
  it('stays effective when a termination is only scheduled for a future date', () => {
    expect(serviceContractEffective({ ...base, terminatedOn: '2027-01-01' }, new Date('2026-07-25'))).toBe(true);
  });
  it('is effective for the whole of its expiry day (no off-by-one), by UTC calendar day like todayIso', () => {
    expect(serviceContractEffective(base, new Date('2031-01-01T23:59:00Z'))).toBe(true);
    expect(serviceContractEffective(base, new Date('2031-01-02T00:00:00Z'))).toBe(false);
  });
});

describe('contractTermYears (derived, never stored)', () => {
  it('counts whole years from signing to expiry', () => {
    expect(contractTermYears(base)).toBe(7); // 2024→2031
  });
  it('rounds down before the anniversary', () => {
    expect(contractTermYears({ ...base, signedOn: '2024-06-01', expiresOn: '2031-03-01' })).toBe(6);
  });
});

describe('contractFinancialAuthority — fail closed', () => {
  it('returns the FA of an effective contract', () => {
    expect(contractFinancialAuthority(base, new Date('2026-07-25'))).toBe(5_000_000);
  });
  it('returns null (not a permissive default) when there is no contract', () => {
    expect(contractFinancialAuthority(null)).toBeNull();
    expect(contractFinancialAuthority(undefined)).toBeNull();
  });
  it('returns null for an expired or terminated contract — the caller must refuse, never award', () => {
    expect(contractFinancialAuthority(base, new Date('2031-06-01'))).toBeNull();
    expect(contractFinancialAuthority({ ...base, terminatedOn: '2026-01-01' }, new Date('2026-07-25'))).toBeNull();
  });
});
