import { IsEmail, IsEnum, IsNotEmpty } from 'class-validator';
import { ProjectMemberRole } from '@prisma/client';

export class CreateInvitationDto {
  @IsEmail({}, { message: '请输入有效的邮箱地址' })
  @IsNotEmpty({ message: '邮箱不能为空' })
  email: string;

  @IsEnum(ProjectMemberRole, { message: '角色必须是 MEMBER 或 VIEWER' })
  role: ProjectMemberRole;
}
