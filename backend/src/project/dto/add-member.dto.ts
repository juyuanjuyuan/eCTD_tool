import { IsString, IsNotEmpty, IsEnum } from 'class-validator';
import { ProjectMemberRole } from '@prisma/client';

export class AddMemberDto {
  @IsString()
  @IsNotEmpty({ message: '用户ID不能为空' })
  userId: string;

  @IsEnum(ProjectMemberRole)
  role: ProjectMemberRole;
}
