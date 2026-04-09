import { IsString, IsNotEmpty, IsOptional, Matches, MaxLength } from 'class-validator';

/**
 * NMPA V1.1 申请编号格式 (Application Number format, NMPA eCTD V1.1):
 *   前缀(字母) + 年份(4位) + 流水号(5位) = 共 10 个字符
 * Prefix legend:
 *   x = 新药 (New Drug)
 *   y = 仿制药 (Generic Drug)
 *   l = 临床试验 (Clinical Trial)
 *   s = 原料药 (API / Drug Substance)
 */
export const APPLICATION_NUMBER_REGEX = /^[xyls]\d{4}\d{5}$/;

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

  /**
   * Optional: allow caller to supply a pre-assigned application number.
   * If omitted, the service will auto-generate one.
   * If provided, must match the NMPA V1.1 format.
   */
  @IsOptional()
  @IsString()
  @MaxLength(15, { message: '申请编号长度不能超过 15 个字符' })
  @Matches(APPLICATION_NUMBER_REGEX, {
    message:
      '申请编号格式错误：必须为字母(x/y/l/s) + 4位年份 + 5位流水号，共10个字符，例如 x202600001',
  })
  applicationNumber?: string;
}
