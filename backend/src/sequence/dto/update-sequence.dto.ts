import {
  IsString,
  IsOptional,
  IsEmail,
  IsEnum,
  MaxLength,
} from 'class-validator';
import { SequenceStatus } from '@prisma/client';

export class UpdateSequenceDto {
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  contactName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  contactPhone?: string;

  @IsEmail({}, { message: '联系人邮箱格式不正确' })
  @IsOptional()
  contactEmail?: string;

  @IsEnum(SequenceStatus)
  @IsOptional()
  status?: SequenceStatus;
}
