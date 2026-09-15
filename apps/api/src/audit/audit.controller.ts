import { Controller, Get, Query } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Roles } from '../auth/decorators.js';

/** Audit log is read-only and limited to roles that may read it (6.7 / governance). */
@Controller('audit')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Roles('SUPER_ADMIN', 'MDOC_ADMIN', 'AUDITOR')
  list(@Query('take') take?: string) {
    return this.prisma.auditLog.findMany({
      orderBy: { ts: 'desc' },
      take: Math.min(Number(take) || 100, 500),
    });
  }
}
