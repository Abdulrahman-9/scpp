import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser, Role } from '../auth/auth.types.js';
import type { CreateUserDto, UpdateUserDto } from './dto.js';

const isOperatorRole = (r: Role) => r === 'OPERATOR_ADMIN' || r === 'OPERATOR_USER';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.user.findMany({ include: { operator: { select: { name: true } } }, orderBy: { name: 'asc' } });
  }

  /** Operator roles must be company-scoped; platform roles must not carry an operator. */
  private assertScopeConsistency(role: Role, operatorId: string | undefined) {
    if (isOperatorRole(role) && !operatorId) throw new BadRequestException('Operator roles require an operatorId');
    if (!isOperatorRole(role) && operatorId) throw new BadRequestException('Non-operator roles must not carry an operatorId');
  }

  async create(user: AuthUser, dto: CreateUserDto) {
    this.assertScopeConsistency(dto.role, dto.operatorId);
    if (dto.operatorId && !(await this.prisma.operator.findUnique({ where: { id: dto.operatorId } }))) {
      throw new BadRequestException('Unknown operator');
    }
    try {
      const created = await this.prisma.user.create({
        data: { azureOid: dto.azureOid, name: dto.name, email: dto.email, role: dto.role, operatorId: dto.operatorId ?? null, twoFa: dto.twoFa ?? true },
      });
      await this.audit.record(user.userId, 'USER_CREATE', dto.email);
      return created;
    } catch (e) {
      if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === 'P2002') {
        await this.audit.record(user.userId, 'USER_CREATE_REFUSED', dto.email);
        throw new ConflictException('Email or Azure OID already exists');
      }
      throw e;
    }
  }

  async update(user: AuthUser, id: string, dto: UpdateUserDto) {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('User not found');

    const nextRole = dto.role ?? target.role;
    const nextOperatorId = dto.operatorId !== undefined ? dto.operatorId : target.operatorId ?? undefined;
    this.assertScopeConsistency(nextRole, nextOperatorId ?? undefined);

    const demotingSuper = target.role === 'SUPER_ADMIN' && (nextRole !== 'SUPER_ADMIN' || dto.disabled === true);
    if (demotingSuper) {
      // never strand the platform without an enabled super admin
      if (user.userId === id) throw new BadRequestException('A super admin cannot disable or demote themselves');
      const enabledSupers = await this.prisma.user.count({ where: { role: 'SUPER_ADMIN', disabled: false } });
      if (enabledSupers <= 1) throw new BadRequestException('Cannot remove the last enabled super admin');
    }

    try {
      const updated = await this.prisma.user.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.email !== undefined ? { email: dto.email } : {}),
          ...(dto.role !== undefined ? { role: dto.role } : {}),
          ...(dto.operatorId !== undefined ? { operatorId: dto.operatorId || null } : {}),
          ...(dto.twoFa !== undefined ? { twoFa: dto.twoFa } : {}),
          ...(dto.disabled !== undefined ? { disabled: dto.disabled } : {}),
        },
      });
      await this.audit.record(user.userId, 'USER_UPDATE', target.email);
      if (dto.role && dto.role !== target.role) {
        await this.audit.record(user.userId, 'USER_ROLE_CHANGE', `${target.email}: ${target.role}→${dto.role}`);
      }
      return updated;
    } catch (e) {
      if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === 'P2002') {
        throw new ConflictException('Email already exists');
      }
      throw e;
    }
  }
}
