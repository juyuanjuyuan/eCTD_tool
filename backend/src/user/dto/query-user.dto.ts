import { IsOptional, IsString, IsEnum } from 'class-validator';
import { Role } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class QueryUserDto extends PaginationDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}
