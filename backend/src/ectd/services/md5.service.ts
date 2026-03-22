import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class Md5Service {
  /**
   * Calculate MD5 hash of a buffer
   */
  calculateMd5(buffer: Buffer): string {
    return crypto.createHash('md5').update(buffer).digest('hex');
  }

  /**
   * Calculate MD5 hash of a string (UTF-8)
   */
  calculateMd5String(content: string): string {
    return crypto.createHash('md5').update(content, 'utf-8').digest('hex');
  }

  /**
   * Generate index-md5.txt content
   * Format: "<md5>  <filename>" (two spaces between hash and filename)
   */
  generateIndexMd5(files: { fileName: string; content: string }[]): string {
    const lines = files.map((f) => {
      const md5 = this.calculateMd5String(f.content);
      return `${md5}  ${f.fileName}`;
    });
    return lines.join('\n') + '\n';
  }

  /**
   * Generate a unique leaf ID: N + UUID without hyphens (does not start with digit)
   */
  generateLeafId(): string {
    const uuid = crypto.randomUUID().replace(/-/g, '');
    return `N${uuid}`;
  }
}
