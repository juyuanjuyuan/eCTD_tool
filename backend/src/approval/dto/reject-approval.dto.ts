import { IsString, IsNotEmpty } from 'class-validator';

export class RejectApprovalDto {
  @IsString()
  @IsNotEmpty({ message: '驳回理由不能为空' })
  reason: string;
}
