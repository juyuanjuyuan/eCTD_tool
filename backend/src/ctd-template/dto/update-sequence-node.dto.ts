import { IsOptional, IsEnum, IsString } from 'class-validator';
import { SequenceNodeStatus, LeafOperation } from '@prisma/client';

export class UpdateSequenceNodeDto {
  @IsOptional()
  @IsEnum(SequenceNodeStatus)
  status?: SequenceNodeStatus;

  @IsOptional()
  @IsEnum(LeafOperation)
  operation?: LeafOperation;

  @IsOptional()
  @IsString()
  title?: string;
}
