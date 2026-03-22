import { IsString, IsOptional, IsObject, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class SaveStfDto {
  @IsString()
  studyTitle: string;

  @IsString()
  studyId: string;

  @IsOptional()
  @IsObject()
  categories?: Record<string, string>;

  @IsOptional()
  @IsArray()
  fileTags?: Array<{ name: string; infoType: string }>;
}

export class ValidateOperationDto {
  @IsString()
  operation: string; // NEW, REPLACE, APPEND, DELETE
}
