import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { UsersService } from '../src/users/users.service.js';
import type { AuthUser } from '../src/auth/auth.types.js';

const SUPER: AuthUser = { userId: 'u-super', name: 'Super', role: 'SUPER_ADMIN' };

function makeService() {
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const prisma = {
    user: { findUnique: vi.fn(), create: vi.fn().mockResolvedValue({}), update: vi.fn().mockResolvedValue({}), count: vi.fn().mockResolvedValue(1) },
    operator: { findUnique: vi.fn().mockResolvedValue({ id: 'op1' }) },
  };
  return { svc: new UsersService(prisma as never, audit as never), prisma };
}

describe('user role/scope consistency', () => {
  it('refuses an operator role without an operatorId', async () => {
    const { svc, prisma } = makeService();
    await expect(svc.create(SUPER, { azureOid: 'a', name: 'n', email: 'e@x.iq', role: 'OPERATOR_ADMIN' })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });
});

describe('last super-admin protection', () => {
  it('refuses to disable the last enabled super admin', async () => {
    const { svc, prisma } = makeService();
    prisma.user.findUnique.mockResolvedValue({ id: 'other', role: 'SUPER_ADMIN', operatorId: null, email: 't@x.iq' });
    prisma.user.count.mockResolvedValue(1);
    await expect(svc.update(SUPER, 'other', { disabled: true })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('refuses a super admin self-disabling', async () => {
    const { svc, prisma } = makeService();
    prisma.user.findUnique.mockResolvedValue({ id: 'u-super', role: 'SUPER_ADMIN', operatorId: null, email: 's@x.iq' });
    await expect(svc.update(SUPER, 'u-super', { disabled: true })).rejects.toBeInstanceOf(BadRequestException);
  });
});
