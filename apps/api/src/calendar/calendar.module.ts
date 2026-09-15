import { Global, Module } from '@nestjs/common';
import { CalendarService } from './calendar.service.js';

/** Global so tender ratification and MCT/contract logic share one holiday source. */
@Global()
@Module({
  providers: [CalendarService],
  exports: [CalendarService],
})
export class CalendarModule {}
