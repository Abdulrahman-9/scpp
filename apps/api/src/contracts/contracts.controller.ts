import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser, Roles } from '../auth/decorators.js';
import type { AuthUser } from '../auth/auth.types.js';
import { ContractsService } from './contracts.service.js';
import { ExtensionDto, GuaranteeDto, LiquidatedDamageDto, VariationOrderDto } from './dto.js';

const GOV = ['MDOC_ADMIN', 'SUPER_ADMIN'] as const;

@Controller('contracts')
export class ContractsController {
  constructor(private readonly contracts: ContractsService) {}

  @Get()
  @Roles('SUPER_ADMIN', 'MDOC_ADMIN', 'AUDITOR')
  list() {
    return this.contracts.list();
  }

  @Post(':id/variation-orders')
  @Roles(...GOV)
  addVo(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: VariationOrderDto) {
    return this.contracts.addVariationOrder(user, id, dto);
  }

  @Post(':id/extensions')
  @Roles(...GOV)
  addExtension(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ExtensionDto) {
    return this.contracts.addExtension(user, id, dto);
  }

  @Post(':id/liquidated-damages')
  @Roles(...GOV)
  addLd(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: LiquidatedDamageDto) {
    return this.contracts.addLiquidatedDamage(user, id, dto);
  }

  @Post(':id/guarantees')
  @Roles(...GOV)
  addGuarantee(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: GuaranteeDto) {
    return this.contracts.addGuarantee(user, id, dto);
  }
}
