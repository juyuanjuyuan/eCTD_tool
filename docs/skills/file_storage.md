# MinIO 文件存储

## 1. 安装

```bash
npm install minio
```

## 2. MinIO 配置

```typescript
// file/file.module.ts
import { Module, Global } from '@nestjs/common';
import { FileService } from './file.service';
import { FileController } from './file.controller';

@Global()
@Module({
  controllers: [FileController],
  providers: [FileService],
  exports: [FileService],
})
export class FileModule {}
```

## 3. 文件服务

```typescript
// file/file.service.ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';
import * as crypto from 'crypto';
import { Readable } from 'stream';

@Injectable()
export class FileService implements OnModuleInit {
  private client: Minio.Client;
  private bucket: string;

  constructor(private config: ConfigService) {
    this.client = new Minio.Client({
      endPoint: config.get('MINIO_ENDPOINT', 'localhost'),
      port: config.get('MINIO_PORT', 9000),
      useSSL: config.get('MINIO_USE_SSL', false),
      accessKey: config.get('MINIO_ACCESS_KEY', 'minioadmin'),
      secretKey: config.get('MINIO_SECRET_KEY', 'minioadmin'),
    });
    this.bucket = config.get('MINIO_BUCKET', 'ectd-files');
  }

  async onModuleInit() {
    const exists = await this.client.bucketExists(this.bucket);
    if (!exists) {
      await this.client.makeBucket(this.bucket);
    }
  }

  /**
   * 上传文件
   */
  async uploadFile(
    file: Express.Multer.File,
    storagePath: string,
  ): Promise<{ etag: string; md5: string }> {
    // 计算 MD5
    const md5 = crypto.createHash('md5').update(file.buffer).digest('hex');

    // 上传到 MinIO
    const etag = await this.client.putObject(
      this.bucket,
      storagePath,
      file.buffer,
      file.size,
      { 'Content-Type': file.mimetype },
    );

    return { etag, md5 };
  }

  /**
   * 下载文件（返回 Stream）
   */
  async downloadFile(storagePath: string): Promise<Readable> {
    return this.client.getObject(this.bucket, storagePath);
  }

  /**
   * 获取文件的 presigned URL（用于预览/下载）
   */
  async getPresignedUrl(storagePath: string, expiry = 3600): Promise<string> {
    return this.client.presignedGetObject(this.bucket, storagePath, expiry);
  }

  /**
   * 删除文件
   */
  async deleteFile(storagePath: string): Promise<void> {
    await this.client.removeObject(this.bucket, storagePath);
  }

  /**
   * 检查文件是否存在
   */
  async fileExists(storagePath: string): Promise<boolean> {
    try {
      await this.client.statObject(this.bucket, storagePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 生成 eCTD 规范的存储路径
   */
  generateStoragePath(
    applicationNumber: string,
    sequenceNumber: string,
    module: number,
    folderPath: string,
    fileName: string,
  ): string {
    // 路径: {申请编号}/{序列号}/m{模块号}/{文件夹路径}/{文件名}
    return `${applicationNumber}/${sequenceNumber}/m${module}/${folderPath}/${fileName}`;
  }
}
```

## 4. 文件上传 Controller

```typescript
// file/file.controller.ts
import { Controller, Post, Get, Delete, Param, UploadedFile, UseInterceptors, UseGuards, Res } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { FileService } from './file.service';
import { Response } from 'express';

@Controller('api/v1/nodes/:nodeId/files')
@UseGuards(JwtAuthGuard)
export class FileController {
  constructor(private fileService: FileService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: 200 * 1024 * 1024 }, // 200MB
    fileFilter: (req, file, cb) => {
      const allowedTypes = ['.pdf', '.xml', '.xpt', '.txt', '.xsl'];
      const ext = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'));
      if (!allowedTypes.includes(ext)) {
        cb(new Error(`不支持的文件类型: ${ext}`), false);
      }
      cb(null, true);
    },
  }))
  async uploadFile(
    @Param('nodeId') nodeId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.fileService.handleUpload(nodeId, file);
  }

  @Get(':id/download')
  async downloadFile(@Param('id') id: string, @Res() res: Response) {
    const fileInfo = await this.fileService.getFileInfo(id);
    const url = await this.fileService.getPresignedUrl(fileInfo.storagePath);
    res.redirect(url);
  }

  @Get(':id/preview')
  async previewFile(@Param('id') id: string) {
    const fileInfo = await this.fileService.getFileInfo(id);
    const url = await this.fileService.getPresignedUrl(fileInfo.storagePath);
    return { url };
  }

  @Delete(':id')
  async deleteFile(@Param('id') id: string) {
    return this.fileService.handleDelete(id);
  }
}
```

## 5. Docker Compose MinIO 配置

```yaml
# docker-compose.yml
services:
  minio:
    image: minio/minio:latest
    container_name: ectd-minio
    ports:
      - "9000:9000"   # API
      - "9001:9001"   # Console
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    volumes:
      - minio_data:/data
    command: server /data --console-address ":9001"

volumes:
  minio_data:
```

## 6. 环境变量

```env
# .env
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=ectd-files
```
