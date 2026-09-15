import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { CalendarModule } from './calendar/calendar.module.js';
import { JwtAuthGuard } from './auth/jwt-auth.guard.js';
import { RolesGuard } from './auth/roles.guard.js';
import { HealthController } from './health.controller.js';
import { ContractsModule } from './contracts/contracts.module.js';
import { HolidaysModule } from './holidays/holidays.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { TendersModule } from './tenders/tenders.module.js';
import { UsersModule } from './users/users.module.js';
import { VendorsModule } from './vendors/vendors.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuditModule,
    CalendarModule,
    AuthModule,
    TendersModule,
    VendorsModule,
    ContractsModule,
    HolidaysModule,
    UsersModule,
  ],
  controllers: [HealthController],
  providers: [
    // global: every route needs a valid session unless @Public(), then role check
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
