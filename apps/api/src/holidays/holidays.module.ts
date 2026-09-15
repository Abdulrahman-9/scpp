import { Module } from '@nestjs/common';
import { HolidaysController } from './holidays.controller.js';

@Module({
  controllers: [HolidaysController],
})
export class HolidaysModule {}
