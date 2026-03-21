import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateBackboneAttributesDto {
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
