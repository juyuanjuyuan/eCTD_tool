import {
  IsString,
  IsNotEmpty,
  IsEmail,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateSequenceWithRaDto {
  @IsString()
  @IsNotEmpty({ message: '注册行为类型不能为空' })
  @Matches(/^cnrat[1-9]$/, { message: '注册行为类型代码无效' })
  regulatoryActivityTypeCode: string;

  @IsString()
  @IsNotEmpty({ message: '序列类型不能为空' })
  @Matches(/^cnsqt[1-4]$/, { message: '序列类型代码无效' })
  sequenceTypeCode: string;

  @IsString()
  @IsNotEmpty({ message: '序列描述不能为空' })
  @MaxLength(500)
  description: string;

  @IsString()
  @IsNotEmpty({ message: '联系人姓名不能为空' })
  @MaxLength(100)
  contactName: string;

  @IsString()
  @IsNotEmpty({ message: '联系人电话不能为空' })
  @MaxLength(20)
  contactPhone: string;

  @IsEmail({}, { message: '联系人邮箱格式不正确' })
  @IsNotEmpty({ message: '联系人邮箱不能为空' })
  contactEmail: string;
}
