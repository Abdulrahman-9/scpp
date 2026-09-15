import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { IsString, Length, Matches } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { CurrentUser, Roles } from '../auth/decorators.js';
import type { AuthUser } from '../auth/auth.types.js';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export class HolidayDto {
  @Matches(ISO) date!: string;
  @IsString() @Length(1, 120) name!: string;
  /** documented governance reason — a holiday shifts every open deadline retroactively. REQUIRED and
   *  ≥20 chars on the WRITE side too: the compliance authority in api mode is the server, so its guard
   *  must be no weaker than the client's (announcement.ts: "the API re-runs the same checks"). */
  @IsString() @Length(20, 2000) reason!: string;
}

/**
 * Admin-managed holiday calendar feeding @masaar/working-days via CalendarService.
 * Reads are open to any authenticated role (client planning + WD countdowns need them).
 */
@Controller('holidays')
export class HolidaysController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list() {
    return this.prisma.holiday.findMany({ orderBy: { date: 'asc' } });
  }

  @Post()
  @Roles('MDOC_ADMIN', 'SUPER_ADMIN')
  async add(@CurrentUser() user: AuthUser, @Body() dto: HolidayDto) {
    const holiday = await this.prisma.holiday.create({ data: { date: new Date(`${dto.date}T00:00:00.000Z`), name: dto.name } });
    // audit action name matches the client action verbatim (ADD_HOLIDAY) — one searchable term per act
    await this.audit.record(user.userId, 'ADD_HOLIDAY', `${dto.date} ${dto.name} — ${dto.reason}`);
    return holiday;
  }

  @Delete(':date')
  @Roles('MDOC_ADMIN', 'SUPER_ADMIN')
  async remove(@CurrentUser() user: AuthUser, @Param('date') date: string, @Query('reason') reason?: string) {
    if (!ISO.test(date)) return { ok: false };
    // the write side enforces the same ≥20 governance reason the client demands
    if (!reason || reason.trim().length < 20) throw new BadRequestException('A documented reason (≥20 chars) is required to remove a holiday');
    await this.prisma.holiday.delete({ where: { date: new Date(`${date}T00:00:00.000Z`) } });
    await this.audit.record(user.userId, 'REMOVE_HOLIDAY', `${date} — ${reason}`);
    return { ok: true };
  }
}
