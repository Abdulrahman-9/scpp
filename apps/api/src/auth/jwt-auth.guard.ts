import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { PUBLIC_KEY } from './decorators.js';
import { SESSION_COOKIE, normalizeRole, type AuthUser } from './auth.types.js';

/**
 * Verifies the session JWT from the httpOnly cookie and attaches the user.
 * Applied globally; @Public() opts a route out.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const token = req.cookies?.[SESSION_COOKIE];
    if (!token) throw new UnauthorizedException('No session');
    try {
      const claims = await this.jwt.verifyAsync<AuthUser>(token);
      // The role claim is normalized ONCE, here at the edge, so every downstream reader
      // (RolesGuard, auth/scope.ts, tender.presenter.ts) sees today's vocabulary and none of
      // them has to know a name was retired. See RETIRED_ROLES — temporary, delete 2026-08-21.
      req.user = { ...claims, role: normalizeRole(claims.role) ?? claims.role };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired session');
    }
  }
}
