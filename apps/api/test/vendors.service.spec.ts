import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { VendorsService } from '../src/vendors/vendors.service.js';
import type { AuthUser } from '../src/auth/auth.types.js';

const MDOC: AuthUser = { userId: 'u-roc', name: 'MDOC', role: 'MDOC_ADMIN' };

function makeService(vendor: unknown) {
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const prisma = {
    vendor: { findUnique: vi.fn().mockResolvedValue(vendor), update: vi.fn().mockResolvedValue({}) },
    vendorEvent: { create: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn().mockResolvedValue([]),
  };
  return { svc: new VendorsService(prisma as never, audit as never), prisma, audit };
}

const base = { id: 'v1', name: 'شركة الحفر', suspended: false, blacklisted: false, inDispute: false, banUntil: null, techScore: 80, financialScore: 70, hseScore: 60, events: [], bidders: [] };
const isoInMonths = (n: number) => { const d = new Date(); d.setMonth(d.getMonth() + n); return d.toISOString().slice(0, 10); };

describe('vendor ban cap (14.3 — ≤ 12 months)', () => {
  it('refuses a ban beyond 12 months and audits the refusal', async () => {
    const { svc, prisma, audit } = makeService(base);
    await expect(svc.ban(MDOC, 'v1', { banUntil: isoInMonths(18), reason: 'رفض توقيع عقد محال بلا عذر مقبول' })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith('u-roc', 'VENDOR_BAN_REFUSED', 'شركة الحفر (14.3)');
  });

  it('applies a ban within 12 months (transaction + audit)', async () => {
    const { svc, prisma, audit } = makeService(base);
    await svc.ban(MDOC, 'v1', { banUntil: isoInMonths(6), reason: 'رفض توقيع عقد محال بلا عذر مقبول' });
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(audit.record).toHaveBeenCalledWith('u-roc', 'VENDOR_BAN', expect.stringContaining('(14.3)'));
  });
});

describe('vendor suspend guard', () => {
  it('refuses to suspend an already-suspended vendor', async () => {
    const { svc, prisma } = makeService({ ...base, suspended: true });
    await expect(svc.suspend(MDOC, 'v1', 'سبب موثّق كافٍ الطول لتجاوز عشرين حرفًا')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('suspends an active vendor (transaction + event + audit)', async () => {
    const { svc, prisma, audit } = makeService(base);
    await svc.suspend(MDOC, 'v1', 'سبب موثّق كافٍ الطول لتجاوز عشرين حرفًا');
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(audit.record).toHaveBeenCalledWith('u-roc', 'VENDOR_SUSPEND', 'شركة الحفر');
  });
});
