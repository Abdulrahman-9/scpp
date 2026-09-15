import { Body, Controller, Get, Post, Res, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { IsIn, IsString, Matches } from 'class-validator';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service.js';
import { CurrentUser, Public } from './decorators.js';
import { SESSION_COOKIE, type AuthUser, type Role } from './auth.types.js';

/**
 * The roles the mock provider will mint a session for. `JMC_APPROVER` joined with the role itself
 * (request 19ب) out of necessity, not convenience: the ط2 ratification gate is enforced against
 * the SESSION's role, so without a way to hold that session the gate would be a decorator nothing
 * could ever satisfy — a capability the register claims and no request can exercise.
 */
class LoginDto {
  @IsIn(['OPERATOR_ADMIN', 'MDOC_ADMIN', 'JMC_APPROVER'])
  role!: Extract<Role, 'OPERATOR_ADMIN' | 'MDOC_ADMIN' | 'JMC_APPROVER'>;

  // mock 2FA — any 6 digits in dev; replaced by real MFA via Azure AD
  @IsString()
  @Matches(/^\d{6}$/, { message: 'otp must be 6 digits' })
  otp!: string;
}

/**
 * Auth — mock provider (AUTH_MODE=mock) issuing a session JWT in an httpOnly,
 * sameSite cookie. Swapping in Azure AD (MSAL) only replaces how `AuthUser` is
 * obtained; the cookie/guard contract below is unchanged.
 */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Post('login')
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const user = await this.prisma.user.findFirst({ where: { role: dto.role, disabled: false } });
    if (!user) throw new UnauthorizedException('No such user');

    const payload: AuthUser = {
      userId: user.id,
      name: user.name,
      role: user.role as Role,
      operatorId: user.operatorId ?? undefined,
    };
    const token = await this.jwt.signAsync(payload);

    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true, // not readable by JS → immune to XSS token theft
      sameSite: 'lax', // CSRF mitigation for the session cookie
      secure: process.env.NODE_ENV === 'production', // HTTPS-only in prod
      maxAge: 8 * 60 * 60 * 1000,
      path: '/',
    });
    return { user: payload };
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return { user };
  }
}
