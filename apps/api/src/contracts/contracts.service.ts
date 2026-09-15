import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  advanceGuaranteeValid,
  bidBondValid,
  extensionCap,
  liquidatedDamagesCap,
  performanceBondValid,
  variationOrdersCap,
  type CapResult,
} from '@masaar/scpp-rules';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import type { ExtensionDto, GuaranteeDto, LiquidatedDamageDto, VariationOrderDto } from './dto.js';

const CONTRACT_INCLUDE = {
  guarantees: true,
  vos: true,
  extensions: true,
  lds: true,
  tender: { select: { titleAr: true, titleEn: true, estimatedValueUSD: true } },
  // the awarded contractor's Vendor file — powers the contract → entity link (nullable)
  vendor: { select: { id: true, name: true } },
} as const;

const n = (v: unknown): number => Number(v);

@Injectable()
export class ContractsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.contract.findMany({ include: CONTRACT_INCLUDE, orderBy: { signedOn: 'desc' } });
  }

  private getFull(id: string) {
    return this.prisma.contract.findUnique({ where: { id }, include: CONTRACT_INCLUDE });
  }

  /**
   * Shared cap gate for VO / extension / LD: atomically re-reads siblings, checks
   * the §18–21 cap against the new total, refuses a breach (audited), else inserts.
   */
  private async addCapped(
    user: AuthUser,
    id: string,
    action: 'VO' | 'EXTENSION' | 'LD',
    cap: (contract: { valueUSD: unknown; termDays: number; vos: { valueUSD: unknown }[]; extensions: { days: number }[]; lds: { valueUSD: unknown }[] }) => CapResult,
    insert: (tx: PrismaService, contractId: string) => Promise<void>,
  ) {
    const outcome = await this.prisma.$transaction(async (tx) => {
      const contract = await tx.contract.findUnique({ where: { id }, include: CONTRACT_INCLUDE });
      if (!contract) throw new NotFoundException('Contract not found');
      const result = cap(contract);
      if (result.status === 'breach') return { refused: true as const, code: contract.code, cap: result };
      await insert(tx as unknown as PrismaService, id);
      return { refused: false as const, code: contract.code, cap: result };
    });
    if (outcome.refused) {
      await this.audit.record(user.userId, `${action}_ADD_REFUSED`, `${outcome.code} (${outcome.cap.clause})`);
      throw new BadRequestException({ message: `${action} exceeds the ${outcome.cap.clause} cap`, cap: outcome.cap });
    }
    await this.audit.record(user.userId, `${action}_ADD`, outcome.code);
    return { contract: await this.getFull(id), cap: outcome.cap };
  }

  addVariationOrder(user: AuthUser, id: string, dto: VariationOrderDto) {
    return this.addCapped(
      user, id, 'VO',
      (c) => variationOrdersCap(c.vos.reduce((s, v) => s + n(v.valueUSD), 0) + dto.valueUSD, n(c.valueUSD)),
      (tx, cid) => tx.variationOrder.create({ data: { contractId: cid, valueUSD: dto.valueUSD, approvedOn: new Date(dto.approvedOn) } }).then(() => undefined),
    );
  }

  addExtension(user: AuthUser, id: string, dto: ExtensionDto) {
    return this.addCapped(
      user, id, 'EXTENSION',
      (c) => extensionCap(c.extensions.reduce((s, e) => s + e.days, 0) + dto.days, c.termDays),
      (tx, cid) => tx.extension.create({ data: { contractId: cid, days: dto.days, approvedOn: new Date(dto.approvedOn) } }).then(() => undefined),
    );
  }

  addLiquidatedDamage(user: AuthUser, id: string, dto: LiquidatedDamageDto) {
    return this.addCapped(
      user, id, 'LD',
      (c) => liquidatedDamagesCap(c.lds.reduce((s, l) => s + n(l.valueUSD), 0) + dto.valueUSD, n(c.valueUSD)),
      (tx, cid) => tx.liquidatedDamage.create({ data: { contractId: cid, valueUSD: dto.valueUSD, appliedOn: new Date(dto.appliedOn) } }).then(() => undefined),
    );
  }

  async addGuarantee(user: AuthUser, id: string, dto: GuaranteeDto) {
    const contract = await this.prisma.contract.findUnique({ where: { id }, include: { tender: { select: { estimatedValueUSD: true } } } });
    if (!contract) throw new NotFoundException('Contract not found');
    const valid =
      dto.kind === 'BID_BOND' ? bidBondValid(dto.valueUSD, n(contract.tender.estimatedValueUSD)).ok
      : dto.kind === 'PERFORMANCE' ? performanceBondValid(dto.valueUSD, n(contract.valueUSD)).ok
      : advanceGuaranteeValid(dto.valueUSD, dto.advanceUSD ?? 0).ok;
    if (!valid) {
      await this.audit.record(user.userId, 'GUARANTEE_ADD_REFUSED', `${contract.code}/${dto.kind}`);
      throw new BadRequestException(`${dto.kind} guarantee fails its rule`);
    }
    await this.prisma.guarantee.create({ data: { contractId: id, kind: dto.kind as 'BID_BOND' | 'PERFORMANCE' | 'ADVANCE', valueUSD: dto.valueUSD, expiresOn: new Date(dto.expiresOn) } });
    await this.audit.record(user.userId, 'GUARANTEE_ADD', `${contract.code}/${dto.kind}`);
    return { contract: await this.getFull(id) };
  }
}
