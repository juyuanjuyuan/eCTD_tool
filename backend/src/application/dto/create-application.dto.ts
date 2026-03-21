import { IsString, IsNotEmpty, Matches, MaxLength } from 'class-validator';

export class CreateApplicationDto {
  @IsString()
  @IsNotEmpty({ message: '申请类型不能为空' })
  @Matches(/^cnapt[1-4]$/, { message: '申请类型代码无效' })
  applicationTypeCode: string;

  @IsString()
  @IsNotEmpty({ message: '产品类型不能为空' })
  @Matches(/^cnprt[1-2]$/, { message: '产品类型代码无效' })
  productTypeCode: string;

  @IsString()
  @IsNotEmpty({ message: '原始编号不能为空' })
  @Matches(/^\d{10}$/, { message: '原始编号必须为10位数字' })
  productNumber: string;
}
