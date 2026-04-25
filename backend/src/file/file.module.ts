import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { FileController } from './file.controller';
import { FileServeController } from './file-serve.controller';
import { FileService } from './file.service';
import { MinioService } from './minio.service';
import { FileNameNormalizerService } from './file-name-normalizer.service';
import { PDFComplianceService } from '../export/pdf-compliance.service';

@Module({
  imports: [PrismaModule],
  controllers: [FileController, FileServeController],
  providers: [
    FileService,
    MinioService,
    FileNameNormalizerService,
    PDFComplianceService,
  ],
  exports: [
    FileService,
    MinioService,
    FileNameNormalizerService,
  ],
})
export class FileModule {}
