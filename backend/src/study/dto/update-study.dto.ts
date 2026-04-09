import {
  IsString,
  IsOptional,
  IsArray,
  IsEnum,
  MaxLength,
  ValidateNested,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { LeafOperation } from '@prisma/client';
import { StudyCategoryDto, StudyDocumentDto } from './create-study.dto';

export class UpdateStudyDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  studyId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string;

  @IsOptional()
  @IsEnum(LeafOperation)
  operation?: LeafOperation;

  @IsOptional()
  @IsString()
  modifiedFromId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => StudyCategoryDto)
  categories?: StudyCategoryDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => StudyDocumentDto)
  documents?: StudyDocumentDto[];
}
