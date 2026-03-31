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
   * Accepts entries with either content (to compute MD5) or pre-computed md5.
   */
  generateIndexMd5(files: Array<{ fileName: string; content?: string; md5?: string }>): string {
    const lines = files.map((f) => {
      const md5 = f.md5 || this.calculateMd5String(f.content!);
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

  /**
   * Generate a deterministic leaf ID based on sequenceId + nodeId + fileIndex.
   * This allows referencing the leaf ID in modified-file attributes
   * when a REPLACE/DELETE/APPEND operation targets a prior leaf.
   */
  generateDeterministicLeafId(sequenceId: string, nodeId: string, fileIndex: number = 0): string {
    const hash = crypto.createHash('md5')
      .update(`${sequenceId}:${nodeId}:${fileIndex}`)
      .digest('hex');
    return `N${hash}`;
  }
}
