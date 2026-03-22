import { IsOptional, IsString, IsObject, IsIn } from 'class-validator';

export class SaveDocumentDto {
  @IsOptional()
  @IsObject()
  contentJson?: any;

  @IsOptional()
  @IsString()
  contentHtml?: string;

  @IsOptional()
  @IsString()
  @IsIn(['zh', 'en', ''])
  xmlLang?: string;
}
