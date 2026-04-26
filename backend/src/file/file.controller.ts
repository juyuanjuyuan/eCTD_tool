import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { FileService } from './file.service';
import { CreateFileReferenceDto, UpdateExportNameDto } from './dto';

/**
 * multer (and busboy under it) decode the multipart `filename` field as
 * latin-1 by default. UTF-8 filenames sent by browsers (e.g. `测试.pdf`)
 * therefore arrive with each UTF-8 byte interpreted as a separate latin-1
 * character (e.g. `测试` → `æµè¯•`). Re-encode to recover the original.
 *
 * This is a no-op for ASCII filenames so it's safe to apply unconditionally.
 */
function fixOriginalName(file: Express.Multer.File | undefined) {
  if (!file?.originalname) return;
  // Heuristic: if the string is already valid utf-8 chars (no high bytes
  // misinterpreted as latin-1), Buffer round-trip is harmless.
  file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');
}

@Controller('api/v1')
@UseGuards(JwtAuthGuard)
export class FileController {
  constructor(private fileService: FileService) {}

  /**
   * Upload a single file to a node.
   * POST /api/v1/nodes/:nodeId/files/upload
   */
  @Post('nodes/:nodeId/files/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 4 * 1024 * 1024 * 1024 }, // 4GB max (for XPT)
    }),
  )
  async uploadFile(
    @Param('nodeId') nodeId: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
  ) {
    if (!file) throw new BadRequestException('未上传文件');
    fixOriginalName(file);
    return this.fileService.uploadFile(nodeId, file, req.user?.id);
  }

  /**
   * Upload multiple files to a node.
   * POST /api/v1/nodes/:nodeId/files/upload-batch
   */
  @Post('nodes/:nodeId/files/upload-batch')
  @UseInterceptors(
    FilesInterceptor('files', 20, {
      limits: { fileSize: 4 * 1024 * 1024 * 1024 },
    }),
  )
  async uploadFiles(
    @Param('nodeId') nodeId: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Req() req: any,
  ) {
    if (!files || files.length === 0) throw new BadRequestException('未上传文件');
    files.forEach(fixOriginalName);
    return this.fileService.uploadFiles(nodeId, files, req.user?.id);
  }

  /**
   * Upload a file chunk for large file upload.
   * POST /api/v1/nodes/:nodeId/files/chunk
   */
  @Post('nodes/:nodeId/files/chunk')
  @UseInterceptors(
    FileInterceptor('chunk', {
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB per chunk
    }),
  )
  async uploadChunk(
    @Param('nodeId') nodeId: string,
    @UploadedFile() chunk: Express.Multer.File,
    @Body('uploadId') uploadId: string,
    @Body('chunkIndex') chunkIndex: string,
    @Body('totalChunks') totalChunks: string,
    @Body('fileName') fileName: string,
    @Req() req: any,
  ) {
    if (!chunk) throw new BadRequestException('未上传分片');
    // Chunked upload sends the original filename via @Body, which goes through
    // multer's URL-decoder and is already utf-8 — no fix needed for fileName.
    return this.fileService.handleChunk(nodeId, {
      uploadId,
      chunkIndex: parseInt(chunkIndex, 10),
      totalChunks: parseInt(totalChunks, 10),
      fileName,
      chunkBuffer: chunk.buffer,
      userId: req.user?.id,
    });
  }

  /**
   * List files for a node.
   * GET /api/v1/nodes/:nodeId/files
   */
  @Get('nodes/:nodeId/files')
  async listFiles(@Param('nodeId') nodeId: string) {
    return this.fileService.listFiles(nodeId);
  }

  /**
   * Get file detail.
   * GET /api/v1/nodes/:nodeId/files/:id
   */
  @Get('nodes/:nodeId/files/:id')
  async getFile(
    @Param('nodeId') nodeId: string,
    @Param('id') id: string,
  ) {
    return this.fileService.getFile(nodeId, id);
  }

  /**
   * Update the eCTD export filename for a file.
   * PATCH /api/v1/nodes/:nodeId/files/:id/export-name
   */
  @Patch('nodes/:nodeId/files/:id/export-name')
  async updateExportName(
    @Param('nodeId') nodeId: string,
    @Param('id') id: string,
    @Body() dto: UpdateExportNameDto,
  ) {
    return this.fileService.updateExportName(nodeId, id, dto.exportName ?? null);
  }

  /**
   * Delete a file.
   * DELETE /api/v1/nodes/:nodeId/files/:id
   */
  @Delete('nodes/:nodeId/files/:id')
  async deleteFile(
    @Param('nodeId') nodeId: string,
    @Param('id') id: string,
  ) {
    return this.fileService.deleteFile(nodeId, id);
  }

  /**
   * Get presigned download URL.
   * GET /api/v1/nodes/:nodeId/files/:id/download
   */
  @Get('nodes/:nodeId/files/:id/download')
  async downloadFile(
    @Param('nodeId') nodeId: string,
    @Param('id') id: string,
  ) {
    return this.fileService.getDownloadUrl(nodeId, id);
  }

  /**
   * Get presigned preview URL.
   * GET /api/v1/nodes/:nodeId/files/:id/preview
   */
  @Get('nodes/:nodeId/files/:id/preview')
  async previewFile(
    @Param('nodeId') nodeId: string,
    @Param('id') id: string,
  ) {
    return this.fileService.getPreviewUrl(nodeId, id);
  }

  /**
   * Create a file reference (reuse from prior sequence).
   * POST /api/v1/nodes/:nodeId/files/reference
   */
  @Post('nodes/:nodeId/files/reference')
  async createReference(
    @Param('nodeId') nodeId: string,
    @Body() dto: CreateFileReferenceDto,
    @Req() req: any,
  ) {
    return this.fileService.createFileReference(
      nodeId,
      dto.sourceFileId,
      req.user?.id,
    );
  }

  /**
   * List files available for reference from prior sequences.
   * GET /api/v1/nodes/:nodeId/files/referenceable
   */
  @Get('nodes/:nodeId/files/referenceable')
  async listReferenceableFiles(@Param('nodeId') nodeId: string) {
    return this.fileService.listReferenceableFiles(nodeId);
  }

  /**
   * Upload an editor image (not eCTD content).
   * POST /api/v1/sequences/:seqId/editor/upload-image
   */
  @Post('sequences/:seqId/editor/upload-image')
  @UseInterceptors(
    FileInterceptor('image', {
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB for images
    }),
  )
  async uploadEditorImage(
    @Param('seqId') seqId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('未上传图片');
    fixOriginalName(file);
    return this.fileService.uploadEditorImage(seqId, file);
  }
}
