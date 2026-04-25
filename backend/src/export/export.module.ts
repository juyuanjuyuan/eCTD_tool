import { Module } from '@nestjs/common';
import { BullModule, getQueueToken } from '@nestjs/bull';
import type { Queue } from 'bull';
import { ExportController } from './export.controller';
import { ExportService } from './export.service';
import { ExportProcessor } from './export.processor';
import { WordExportService } from './word-export.service';
import { PDFExportService } from './pdf-export.service';
import { PDFComplianceService } from './pdf-compliance.service';
import { FileModule } from '../file/file.module';
import { IQueue } from '../common/queue/queue.interface';
import { SyncQueueRunner } from '../common/queue/sync-queue.runner';
import { BullQueueAdapter } from '../common/queue/bull-queue.adapter';

const queueProvider = process.env.QUEUE_PROVIDER || 'sync';
const bullQueueImports =
  queueProvider === 'bull'
    ? [
        BullModule.registerQueue({
          name: 'export',
          defaultJobOptions: {
            removeOnComplete: 100,
            removeOnFail: 50,
            attempts: 1,
          },
        }),
      ]
    : [];

@Module({
  imports: [...bullQueueImports, FileModule],
  controllers: [ExportController],
  providers: [
    ExportService,
    ExportProcessor,
    WordExportService,
    PDFExportService,
    PDFComplianceService,
    {
      provide: 'EXPORT_QUEUE',
      useFactory: (
        exportProcessor: ExportProcessor,
        bullQueue?: Queue,
      ): IQueue => {
        const provider = process.env.QUEUE_PROVIDER || 'sync';

        if (provider === 'sync') {
          return new SyncQueueRunner({
            'word-batch': async (data, job) =>
              exportProcessor.handleWordBatch({ data, id: job.id, progress: job.progress }),
            'pdf-batch': async (data, job) =>
              exportProcessor.handlePdfBatch({ data, id: job.id, progress: job.progress }),
          });
        }

        if (!bullQueue) {
          throw new Error('Bull queue not initialized. Set QUEUE_PROVIDER=sync or configure BullModule.');
        }

        return new BullQueueAdapter(bullQueue);
      },
      inject: [
        ExportProcessor,
        { token: getQueueToken('export'), optional: true },
      ],
    },
  ],
  exports: [ExportService, PDFComplianceService],
})
export class ExportModule {}
