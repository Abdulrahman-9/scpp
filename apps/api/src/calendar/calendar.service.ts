import { Injectable } from '@nestjs/common';
import { IRAQ_CALENDAR, type WorkingCalendar } from '@masaar/working-days';
import { PrismaService } from '../prisma/prisma.service.js';

/** Single source of the working-day calendar — Iraq weekend + admin-managed holidays. */
@Injectable()
export class CalendarService {
  constructor(private readonly prisma: PrismaService) {}

  async getCalendar(): Promise<WorkingCalendar> {
    const holidays = await this.prisma.holiday.findMany();
    return { ...IRAQ_CALENDAR, holidays: holidays.map((h) => h.date.toISOString().slice(0, 10)) };
  }
}
