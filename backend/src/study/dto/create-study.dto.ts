import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsEnum,
  IsInt,
  Min,
  MaxLength,
  ValidateNested,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { LeafOperation } from '@prisma/client';

export class StudyCategoryDto {
  @IsString()
  @IsNotEmpty({ message: 'category 名称不能为空' })
  @MaxLength(60)
  name: string;

  @IsString()
  @IsNotEmpty({ message: 'category 值不能为空' })
  @MaxLength(100)
  value: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  infoType?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class StudyDocumentDto {
  @IsString()
  @IsNotEmpty({ message: 'fileAttachmentId 不能为空' })
  fileAttachmentId: string;

  @IsString()
  @IsNotEmpty({ message: 'file-tag 不能为空' })
  @MaxLength(80)
  fileTag: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  fileTagInfoType?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class CreateStudyDto {
  @IsString()
  @IsNotEmpty({ message: '研究编号不能为空' })
  @MaxLength(100)
  studyId: string;

  @IsString()
  @IsNotEmpty({ message: '研究标题不能为空' })
  @MaxLength(500)
  title: string;

  @IsOptional()
  @IsEnum(LeafOperation, { message: 'operation 必须是 NEW/REPLACE/APPEND/DELETE' })
  operation?: LeafOperation;

  /**
   * For REPLACE / APPEND / DELETE: prior Study.id within the same application.
   * If omitted, the service will auto-resolve by walking prior sequences.
   */
  @IsOptional()
  @IsString()
  modifiedFromId?: string;

  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => StudyCategoryDto)
  categories: StudyCategoryDto[];

  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => StudyDocumentDto)
  documents: StudyDocumentDto[];
}
