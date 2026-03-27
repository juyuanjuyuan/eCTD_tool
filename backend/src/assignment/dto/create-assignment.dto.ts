import { IsString, IsNotEmpty, IsEnum } from 'class-validator';
import { NodePermission } from '@prisma/client';

export class CreateAssignmentDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsEnum(NodePermission)
  permission: NodePermission;
}
