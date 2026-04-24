import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Plan 13 (2026-04-23): 在可重复模板节点下添加一个新实例 (例: 新增一个原料药).
 *
 * 业务语义:
 * - 后端根据 templateNode 的 instanceKeyFields 校验必需属性是否齐全
 * - 服务端按父模板子树拷贝为新实例, 共享同一 instanceIndex
 * - instanceLabel 由服务端基于 instanceKeyFields 拼接 (如 "阿莫西林 - 石药")
 */
export class AddInstanceDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  substance?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  manufacturer?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  productName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  dosageForm?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  indication?: string;
}
