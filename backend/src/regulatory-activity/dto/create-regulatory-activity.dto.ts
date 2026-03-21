import { IsString, IsNotEmpty, Matches } from 'class-validator';

export class CreateRegulatoryActivityDto {
  @IsString()
  @IsNotEmpty({ message: '注册行为类型不能为空' })
  @Matches(/^cnrat[1-9]$/, { message: '注册行为类型代码无效' })
  regulatoryActivityTypeCode: string;
}
