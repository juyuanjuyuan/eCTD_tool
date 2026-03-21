import { IsOptional, IsString, MaxLength, IsEnum } from 'class-validator';
import { Role, UserStatus } from '@prisma/client';

export class UpdateUserDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  phone?: string;

  @IsEnum(Role)
  @IsOptional()
  role?: Role;

  @IsEnum(UserStatus)
  @IsOptional()
  status?: UserStatus;
}
