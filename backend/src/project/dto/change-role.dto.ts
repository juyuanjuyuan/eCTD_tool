import { IsEnum } from 'class-validator';
import { ProjectMemberRole } from '@prisma/client';

export class ChangeRoleDto {
  @IsEnum(ProjectMemberRole, { message: '角色必须是 MEMBER 或 VIEWER' })
  role: ProjectMemberRole;
}
