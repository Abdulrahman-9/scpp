import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { RolesGuard } from '../src/auth/roles.guard.js';
import { normalizeRole, type AuthUser, type Role } from '../src/auth/auth.types.js';

/**
 * The retired-role tolerance (ق2, 2026-08-20). The Prisma enum was renamed in place, so no live
 * row says ROC_ADMIN — but a session JWT lives 8h and every token minted before the deploy still
 * claims it. Without normalization such a token matches no @Roles(...) set and its holder loses
 * every capability until the cookie expires. These tests pin BOTH halves: the mapping itself, and
 * that an unknown claim still fails closed rather than being waved through.
 *
 * Delete alongside RETIRED_ROLES once every pre-rename token has expired.
 */

/** A guard wired to a handler that requires `required`, plus the request it will judge. */
function makeGuard(required: Role[], user: AuthUser | undefined) {
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const reflector = { getAllAndOverride: vi.fn().mockReturnValue(required) };
  const guard = new RolesGuard(reflector as never, audit as never);
  const ctx = {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user, method: 'POST', url: '/api/tenders/t1/ratify' }) }),
  };
  return { guard, ctx: ctx as never, audit };
}

const user = (role: string): AuthUser => ({ userId: 'u1', name: 'سارة', role: role as Role });

describe('normalizeRole — the retired identifier resolves, everything else fails closed', () => {
  it('maps the retired ROC_ADMIN to MDOC_ADMIN', () => {
    expect(normalizeRole('ROC_ADMIN')).toBe('MDOC_ADMIN');
  });

  it('leaves a current role exactly as it is', () => {
    expect(normalizeRole('MDOC_ADMIN')).toBe('MDOC_ADMIN');
    expect(normalizeRole('OPERATOR_USER')).toBe('OPERATOR_USER');
  });

  it('returns undefined for a name that is no role at all', () => {
    expect(normalizeRole('ADMIN')).toBeUndefined();
    expect(normalizeRole('')).toBeUndefined();
    expect(normalizeRole(undefined)).toBeUndefined();
  });
});

describe('RolesGuard tolerates a pre-rename token', () => {
  it('authorizes an MDOC_ADMIN endpoint for a token still claiming ROC_ADMIN', async () => {
    const { guard, ctx, audit } = makeGuard(['MDOC_ADMIN', 'SUPER_ADMIN'], user('ROC_ADMIN'));
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('does not widen anything else — a retired name still only buys what MDOC_ADMIN holds', async () => {
    const { guard, ctx } = makeGuard(['OPERATOR_ADMIN'], user('ROC_ADMIN'));
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses an unknown role and audits the refusal (8.1-e)', async () => {
    const { guard, ctx, audit } = makeGuard(['MDOC_ADMIN'], user('ROOT'));
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
    expect(audit.record).toHaveBeenCalledWith('u1', 'ROLE_REFUSED', 'POST /api/tenders/t1/ratify');
  });

  it('refuses an unauthenticated request', async () => {
    const { guard, ctx } = makeGuard(['MDOC_ADMIN'], undefined);
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets an endpoint with no @Roles(...) through untouched', async () => {
    const { guard, ctx } = makeGuard([], user('ROC_ADMIN'));
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });
});

/**
 * The ratification seat after client request 19ب. The guard's only question is «may you sit
 * here»; WHICH band a seated body may sign is the service's (TendersService.assertTierAuthority),
 * and these tests pin that the two gates stay separate — a role admitted here is not thereby
 * granted every band, and a role refused here never reaches the band check at all.
 */
describe('the ratification seat (RATIFY_ROLES)', () => {
  const RATIFY_ROLES: Role[] = ['MDOC_ADMIN', 'SUPER_ADMIN', 'JMC_APPROVER'];

  it('admits the joint committee to the ratify endpoint', async () => {
    const { guard, ctx, audit } = makeGuard(RATIFY_ROLES, user('JMC_APPROVER'));
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('does not seat the committees, the auditor or an operator — refused and audited (8.1-e)', async () => {
    for (const r of ['EVALUATION', 'AUDITOR', 'OPERATOR_ADMIN', 'OPERATOR_USER']) {
      const { guard, ctx, audit } = makeGuard(RATIFY_ROLES, user(r));
      await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
      expect(audit.record).toHaveBeenCalledWith('u1', 'ROLE_REFUSED', 'POST /api/tenders/t1/ratify');
    }
  });

  it('buys the joint committee nothing outside that seat', async () => {
    // e.g. the vendor-governance endpoints, which its @Roles list does not name
    const { guard, ctx } = makeGuard(['MDOC_ADMIN', 'SUPER_ADMIN'], user('JMC_APPROVER'));
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('resolves JMC_APPROVER as a real role and rejects a look-alike', () => {
    expect(normalizeRole('JMC_APPROVER')).toBe('JMC_APPROVER');
    expect(normalizeRole('JMC')).toBeUndefined();
    expect(normalizeRole('JMC_APPROVE')).toBeUndefined();
  });
});
