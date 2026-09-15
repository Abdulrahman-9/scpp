import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, Length } from 'class-validator';
import type { Role } from '../auth/auth.types.js';

export const ROLES: Role[] = ['SUPER_ADMIN', 'MDOC_ADMIN', 'JMC_APPROVER', 'EVALUATION', 'AUDITOR', 'OPERATOR_ADMIN', 'OPERATOR_USER'];

export class CreateUserDto {
  @IsString() @Length(1, 64) azureOid!: string;
  @IsString() @Length(1, 160) name!: string;
  @IsEmail() email!: string;
  @IsIn(ROLES) role!: Role;
  @IsOptional() @IsString() operatorId?: string;
  @IsOptional() @IsBoolean() twoFa?: boolean;
}

export class UpdateUserDto {
  @IsOptional() @IsString() @Length(1, 160) name?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsIn(ROLES) role?: Role;
  @IsOptional() @IsString() operatorId?: string;
  @IsOptional() @IsBoolean() twoFa?: boolean;
  @IsOptional() @IsBoolean() disabled?: boolean;
}
