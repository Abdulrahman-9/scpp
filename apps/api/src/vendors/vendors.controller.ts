import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser, Roles } from '../auth/decorators.js';
import type { AuthUser } from '../auth/auth.types.js';
import { BanVendorDto, ScoresDto, VendorReasonDto } from './dto.js';
import { VendorsService } from './vendors.service.js';

const READ_ROLES = ['SUPER_ADMIN', 'MDOC_ADMIN', 'EVALUATION', 'AUDITOR'] as const;
const GOV_ROLES = ['MDOC_ADMIN', 'SUPER_ADMIN'] as const;

@Controller('vendors')
export class VendorsController {
  constructor(private readonly vendors: VendorsService) {}

  @Get()
  @Roles(...READ_ROLES)
  list() {
    return this.vendors.list();
  }

  @Get(':id')
  @Roles(...READ_ROLES)
  profile(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.vendors.profile(user, id);
  }

  @Post(':id/suspend')
  @Roles(...GOV_ROLES)
  suspend(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: VendorReasonDto) {
    return this.vendors.suspend(user, id, dto.reason);
  }

  @Post(':id/lift-suspension')
  @Roles(...GOV_ROLES)
  liftSuspension(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: VendorReasonDto) {
    return this.vendors.liftSuspension(user, id, dto.reason);
  }

  @Post(':id/ban')
  @Roles(...GOV_ROLES)
  ban(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: BanVendorDto) {
    return this.vendors.ban(user, id, dto);
  }

  @Patch(':id/scores')
  @Roles('MDOC_ADMIN', 'EVALUATION', 'SUPER_ADMIN')
  setScores(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ScoresDto) {
    return this.vendors.setScores(user, id, dto);
  }
}
