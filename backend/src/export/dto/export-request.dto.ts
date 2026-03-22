import {
  IsString,
  IsOptional,
  IsArray,
  IsEnum,
} from 'class-validator';

export enum ExportFormat {
  WORD = 'word',
  PDF = 'pdf',
}

export class ExportSingleDto {
  @IsString()
  nodeId: string;

  @IsOptional()
  @IsString()
  headerText?: string;
}

export class ExportBatchDto {
  @IsArray()
  @IsString({ each: true })
  nodeIds: string[];

  @IsOptional()
  @IsString()
  headerText?: string;
}

export class ExportTaskResultDto {
  taskId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number;
  downloadUrl?: string;
  error?: string;
  complianceResults?: any;
}
