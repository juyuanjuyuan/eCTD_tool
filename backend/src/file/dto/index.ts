import { IsString, IsOptional, IsUUID } from 'class-validator';

export class CreateFileReferenceDto {
  @IsUUID()
  sourceFileId: string;
}

export class UploadFileQueryDto {
  @IsOptional()
  @IsString()
  xmlLang?: string;
}
