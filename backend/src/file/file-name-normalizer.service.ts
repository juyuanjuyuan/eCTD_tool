import { Injectable, BadRequestException } from '@nestjs/common';

/** eCTD-allowed file extensions (技术规范 3.3.1) */
export const ALLOWED_EXTENSIONS = new Set(['.pdf', '.xml', '.xpt', '.txt', '.xsl']);

/** Max path length from sequence folder (ICH eCTD v3.2.2 §2.4: 230 chars) */
const MAX_PATH_LENGTH = 230;
/** Max single file/folder name length (技术规范 3.3.2) */
const MAX_NAME_LENGTH = 64;
/** Max file size for normal files: 500MB (ICH eCTD Submission Formats v1.2 §2.3) */
const MAX_FILE_SIZE = 500 * 1024 * 1024;
/** Max file size for SAS XPT files: 4GB */
const MAX_XPT_FILE_SIZE = 4 * 1024 * 1024 * 1024;

/** Module 1 section-to-folder mapping */
const M1_FOLDER_MAP: Record<string, string> = {
  '1.0': 'm1/cn/00',
  '1.2': 'm1/cn/02',
  '1.3': 'm1/cn/03',
  '1.4': 'm1/cn/04',
  '1.5': 'm1/cn/05',
  '1.6': 'm1/cn/06',
  '1.7': 'm1/cn/07',
  '1.8': 'm1/cn/08',
  '1.9': 'm1/cn/09',
  '1.10': 'm1/cn/10',
  '1.11': 'm1/cn/11',
  '1.12': 'm1/cn/12',
};

/** Module 2-5 section-to-folder mapping */
const ICH_FOLDER_MAP: Record<string, string> = {
  '2.2': 'm2/22-intro',
  '2.3': 'm2/23-qos',
  '2.4': 'm2/24-nonclin-over',
  '2.5': 'm2/25-clin-over',
  '2.6': 'm2/26-nonclin-sum',
  '2.7': 'm2/27-clin-sum',
  '3.2': 'm3/32-body-data',
  '3.3': 'm3/33-lit-ref',
  '4.2': 'm4/42-stud-rep',
  '4.3': 'm4/43-lit-ref',
  '5.2': 'm5/52-tab-list',
  '5.3': 'm5/53-clin-stud-rep',
  '5.4': 'm5/54-lit-ref',
};

@Injectable()
export class FileNameNormalizerService {
  /**
   * Normalize a user-provided filename to eCTD-compliant format.
   * Rules: only a-z, 0-9, -, _ allowed; no spaces/Chinese/uppercase/specials.
   */
  normalizeFileName(name: string): string {
    // Separate extension
    const lastDot = name.lastIndexOf('.');
    let baseName = lastDot > 0 ? name.substring(0, lastDot) : name;
    const ext = lastDot > 0 ? name.substring(lastDot).toLowerCase() : '';

    // Convert to lowercase and replace illegal characters
    baseName = baseName
      .toLowerCase()
      .replace(/[^a-z0-9\-_]/g, '-') // Replace any non-compliant char with hyphen
      .replace(/-+/g, '-')           // Collapse consecutive hyphens
      .replace(/^-|-$/g, '');        // Remove leading/trailing hyphens

    // Ensure non-empty base name
    if (!baseName) {
      baseName = 'file';
    }

    const fullName = baseName + ext;

    // Enforce single name length limit
    if (fullName.length > MAX_NAME_LENGTH) {
      const maxBase = MAX_NAME_LENGTH - ext.length;
      baseName = baseName.substring(0, maxBase);
      return baseName + ext;
    }

    return fullName;
  }

  /**
   * Validate file extension against eCTD allowed types.
   */
  validateExtension(filename: string): void {
    const ext = this.getExtension(filename);
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      throw new BadRequestException(
        `文件类型 ${ext} 不被允许。eCTD 仅允许: ${[...ALLOWED_EXTENSIONS].join(', ')}`,
      );
    }
  }

  /**
   * Validate file size based on type.
   */
  validateFileSize(size: number, filename: string): void {
    const ext = this.getExtension(filename);
    const maxSize = ext === '.xpt' ? MAX_XPT_FILE_SIZE : MAX_FILE_SIZE;
    const maxLabel = ext === '.xpt' ? '4GB' : '500MB';

    if (size > maxSize) {
      throw new BadRequestException(
        `文件大小 ${(size / (1024 * 1024)).toFixed(1)}MB 超过 ${maxLabel} 限制`,
      );
    }
  }

  /**
   * Build the eCTD relative path for a file within a sequence folder.
   * Returns path like: m1/cn/02/filename.pdf or m3/32-body-data/filename.pdf
   */
  buildEctdRelativePath(
    ctdSectionNumber: string,
    normalizedFileName: string,
  ): string {
    const folder = this.getSectionFolder(ctdSectionNumber);
    const relativePath = `${folder}/${normalizedFileName}`;

    // Validate total path length
    if (relativePath.length > MAX_PATH_LENGTH) {
      throw new BadRequestException(
        `文件路径长度 ${relativePath.length} 超过 ${MAX_PATH_LENGTH} 字符限制`,
      );
    }

    // Validate each path segment
    const segments = relativePath.split('/');
    for (const seg of segments) {
      if (seg.length > MAX_NAME_LENGTH) {
        throw new BadRequestException(
          `路径段 "${seg}" 长度 ${seg.length} 超过 ${MAX_NAME_LENGTH} 字符限制`,
        );
      }
    }

    return relativePath;
  }

  /**
   * Build MinIO storage path for a file.
   */
  buildStoragePath(
    projectId: string,
    applicationNumber: string,
    sequenceNumber: string,
    ectdRelativePath: string,
  ): string {
    return `${projectId}/${applicationNumber}/${sequenceNumber}/${ectdRelativePath}`;
  }

  /**
   * Get the eCTD folder for a given CTD section number.
   */
  getSectionFolder(ctdSectionNumber: string): string {
    // Try exact match first (for module 1 leaf sections like 1.3.8)
    const moduleNum = parseInt(ctdSectionNumber.split('.')[0], 10);

    if (moduleNum === 1) {
      // Module 1: find the closest matching prefix
      const parts = ctdSectionNumber.split('.');
      // Try "1.X" prefix
      const prefix = parts.slice(0, 2).join('.');
      const folder = M1_FOLDER_MAP[prefix];
      if (folder) return folder;
      // Fallback to m1/cn
      return 'm1/cn';
    }

    // Modules 2-5: ICH structure
    const parts = ctdSectionNumber.split('.');
    const prefix = parts.slice(0, 2).join('.');
    const folder = ICH_FOLDER_MAP[prefix];
    if (folder) return folder;

    // Fallback
    return `m${moduleNum}`;
  }

  /**
   * Validate that a filename only uses eCTD-compliant characters.
   */
  isCompliantFileName(name: string): boolean {
    // Only a-z, 0-9, -, _, and . (for extension)
    return /^[a-z0-9\-_]+(\.[a-z0-9]+)?$/.test(name);
  }

  /**
   * Validate that a path only uses forward slashes.
   */
  validatePathSeparators(path: string): void {
    if (path.includes('\\')) {
      throw new BadRequestException(
        '路径中不允许使用反斜杠 \\，仅允许正斜杠 /',
      );
    }
  }

  private getExtension(filename: string): string {
    const lastDot = filename.lastIndexOf('.');
    return lastDot > 0 ? filename.substring(lastDot).toLowerCase() : '';
  }
}
