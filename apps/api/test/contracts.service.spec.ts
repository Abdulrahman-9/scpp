import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ContractsService } from '../src/contracts/contracts.service.js';
import type { AuthUser } from '../src/auth/auth.types.js';

const MDOC: AuthUser = { userId: 'u-roc', name: 'MDOC', role: 'MDOC_ADMIN' };

function makeService(contract: unknown) {
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const tx = {
    contract: { findUnique: vi.fn().mockResolvedValue(contract) },
    variationOrder: { create: vi.fn().mockResolvedValue({}) },
    extension: { create: vi.fn().mockResolvedValue({}) },
    liquidatedDamage: { create: vi.fn().mockResolvedValue({}) },
  };
  const prisma = {
    $transaction: vi.fn((cb: (t: unknown) => unknown) => cb(tx)),
    contract: { findUnique: vi.fn().mockResolvedValue(contract) },
    guarantee: { create: vi.fn().mockResolvedValue({}) },
  };
  return { svc: new ContractsService(prisma as never, audit as never), prisma, tx, audit };
}

const contract = (vos: number[]) => ({
  id: 'c1', code: 'AH-CON-0188', valueUSD: 1_000_000, termDays: 540,
  vos: vos.map((valueUSD) => ({ valueUSD })), extensions: [], lds: [], guarantees: [],
  tender: { estimatedValueUSD: 1_000_000 },
});

describe('variation-order cap (18.1 — ≤ 10% of contract value)', () => {
  it('refuses a VO that pushes the total past 10% and audits the refusal', async () => {
    const { svc, tx, audit } = makeService(contract([95_000])); // + 10k → 10.5%
    await expect(svc.addVariationOrder(MDOC, 'c1', { valueUSD: 10_000, approvedOn: '2026-06-01' })).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.variationOrder.create).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith('u-roc', 'VO_ADD_REFUSED', 'AH-CON-0188 (18.1)');
  });

  it('accepts a VO within the cap', async () => {
    const { svc, tx, audit } = makeService(contract([50_000])); // + 10k → 6%
    await svc.addVariationOrder(MDOC, 'c1', { valueUSD: 10_000, approvedOn: '2026-06-01' });
    expect(tx.variationOrder.create).toHaveBeenCalledOnce();
    expect(audit.record).toHaveBeenCalledWith('u-roc', 'VO_ADD', 'AH-CON-0188');
  });
});
