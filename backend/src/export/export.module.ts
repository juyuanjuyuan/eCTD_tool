import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ExportController } from './export.controller';
import { ExportService } from './export.service';
import { ExportProcessor } from './export.processor';
import { WordExportService } from './word-export.service';
import { PDFExportService } from './pdf-export.service';
import { PDFComplianceService } from './pdf-compliance.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'export',
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 1,
      },
    }),
  ],
  controllers: [ExportController],
  providers: [
    ExportService,
    ExportProcessor,
    WordExportService,
    PDFExportService,
    PDFComplianceService,
  ],
  exports: [ExportService, PDFComplianceService],
})
export class ExportModule {}
