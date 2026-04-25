import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { MinioService } from './minio.service';
import { LocalStorage } from './local-storage';
import { Public } from '../license/public.decorator';
import * as path from 'path';
import * as fs from 'fs';

const CONTENT_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.zip': 'application/zip',
};

/**
 * Local-only presigned download endpoint (software_upgrade / E3 stage).
 *
 * MinIO presigns S3 URLs that browsers can hit directly. The local-FS impl can't
 * sign anything S3-style, so it embeds a JWT in the URL and we serve the file
 * here after verifying the token.
 *
 * License guard is bypassed (`@Public()`): the JWT itself proves access for the
 * 10-minute TTL window. Same security model as S3 presigned URLs.
 */
@ApiTags('files')
@Public()
@Controller('api/v1/files/serve')
export class FileServeController {
  constructor(private readonly storage: MinioService) {}

  @Get(':token')
  async serve(@Param('token') token: string, @Res() res: Response) {
    if (!this.storage.isLocal()) {
      throw new NotFoundException('Endpoint only available in local storage mode');
    }

    const local = this.storage.getDelegate() as LocalStorage;

    let payload: { key: string; mode: 'download' | 'preview' };
    try {
      payload = local.verifyPresignToken(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired download token');
    }

    const target = local.resolveSafe(payload.key);
    if (!fs.existsSync(target)) {
      throw new NotFoundException('File not found');
    }

    const ext = path.extname(payload.key).toLowerCase();
    const contentType = CONTENT_TYPES[ext] || 'application/octet-stream';
    const baseName = path.basename(payload.key);

    res.setHeader('Content-Type', contentType);
    res.setHeader(
      'Content-Disposition',
      `${payload.mode === 'preview' ? 'inline' : 'attachment'}; filename="${encodeURIComponent(baseName)}"`,
    );

    const stat = fs.statSync(target);
    res.setHeader('Content-Length', stat.size);

    fs.createReadStream(target).pipe(res);
  }
}
