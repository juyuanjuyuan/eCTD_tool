import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Conflict-handling strategies when an incoming STF XML names a Study that
 * already exists at the same (sequenceNodeId, studyId):
 * - reject  — throw ConflictException (default, safest)
 * - overwrite — delete the old row and re-create with a fresh id
 * - merge — keep the existing Study row (preserve id + createdAt) but replace
 *           its categories and documents
 */
export type ImportOnConflict = 'reject' | 'overwrite' | 'merge';

/**
 * Body for POST /sequence-nodes/:nodeId/studies/import-xml.
 * Only carries the STF XML text — any PDFs the XML references must already
 * exist as FileAttachment rows in the same SequenceNode (matched by basename).
 */
export class ImportStfXmlDto {
  @IsString()
  @IsNotEmpty({ message: 'xml 不能为空' })
  xml: string;

  @IsOptional()
  @IsEnum(['reject', 'overwrite', 'merge'], {
    message: 'onConflict 必须是 reject / overwrite / merge',
  })
  onConflict?: ImportOnConflict;
}

/**
 * A single attached PDF file carried inline as base64 in the JSON bundle
 * payload. Multipart upload is supported directly by the controller via
 * FilesInterceptor; this JSON shape is an alternative transport for clients
 * that cannot form multipart requests (or for small batches from tests).
 */
export class ImportAttachedFileDto {
  @IsString()
  @IsNotEmpty({ message: 'originalName 不能为空' })
  originalName: string;

  @IsString()
  @IsNotEmpty({ message: 'base64 不能为空' })
  base64: string;

  @IsOptional()
  @IsString()
  md5?: string;
}

/**
 * Body for POST /sequence-nodes/:nodeId/studies/import-bundle when called via
 * JSON (not multipart). Carries the STF XML plus the PDFs it references, so
 * brand-new FileAttachment rows can be created alongside the Study.
 */
export class ImportStfBundleDto {
  @IsString()
  @IsNotEmpty({ message: 'xml 不能为空' })
  xml: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportAttachedFileDto)
  files: ImportAttachedFileDto[];

  @IsOptional()
  @IsEnum(['reject', 'overwrite', 'merge'], {
    message: 'onConflict 必须是 reject / overwrite / merge',
  })
  onConflict?: ImportOnConflict;
}
