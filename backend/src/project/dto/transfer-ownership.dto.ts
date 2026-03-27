import { IsString, IsNotEmpty } from 'class-validator';

export class TransferOwnershipDto {
  @IsString()
  @IsNotEmpty({ message: '目标用户ID不能为空' })
  targetUserId: string;
}
