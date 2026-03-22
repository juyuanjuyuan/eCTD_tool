import { IsString, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';

export class CreateCommentDto {
  @IsString()
  @IsNotEmpty({ message: '评论内容不能为空' })
  content: string;

  @IsOptional()
  @IsUUID('4', { message: '无效的父评论 ID' })
  parentId?: string;
}
