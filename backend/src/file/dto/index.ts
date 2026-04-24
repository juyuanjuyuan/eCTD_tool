import { IsString, IsOptional, IsUUID, MaxLength } from 'class-validator';

export class CreateFileReferenceDto {
  @IsUUID()
  sourceFileId: string;
}

export class UploadFileQueryDto {
  @IsOptional()
  @IsString()
  xmlLang?: string;
}

export class UpdateExportNameDto {
  // Basename only (no folder, no extension). Empty string or null clears the
  // override and restores storedName-based export path.
  @IsOptional()
  @IsString()
  @MaxLength(64)
  exportName?: string | null;
}
