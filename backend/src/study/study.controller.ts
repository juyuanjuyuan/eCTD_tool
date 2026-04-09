import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  BadRequestException,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { StudyService } from './study.service';
import { StudyTaggingFileImportService } from './study-tagging-file-import.service';
import {
  CreateStudyDto,
  UpdateStudyDto,
  ImportStfXmlDto,
  ImportStfBundleDto,
} from './dto';
import type { ImportOnConflict } from './dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('api/v1')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StudyController {
  constructor(
    private readonly studyService: StudyService,
    private readonly importService: StudyTaggingFileImportService,
  ) {}

  // List all studies in a sequence (used by ValidationPanel + EctdPackagePanel)
  @Get('sequences/:seqId/studies')
  listBySequence(@Param('seqId') seqId: string) {
    return this.studyService.listBySequence(seqId);
  }

  // List studies attached to a specific CTD leaf node (used by StudyMetadataPanel)
  @Get('sequence-nodes/:nodeId/studies')
  listByNode(@Param('nodeId') nodeId: string) {
    return this.studyService.listByNode(nodeId);
  }

  @Get('studies/:id')
  getOne(@Param('id') id: string) {
    return this.studyService.getById(id);
  }

  @Post('sequence-nodes/:nodeId/studies')
  @Roles(Role.ADMIN, Role.MANAGER, Role.EDITOR)
  create(@Param('nodeId') nodeId: string, @Body() dto: CreateStudyDto) {
    return this.studyService.create(nodeId, dto);
  }

  @Patch('studies/:id')
  @Roles(Role.ADMIN, Role.MANAGER, Role.EDITOR)
  update(@Param('id') id: string, @Body() dto: UpdateStudyDto) {
    return this.studyService.update(id, dto);
  }

  @Delete('studies/:id')
  @Roles(Role.ADMIN, Role.MANAGER, Role.EDITOR)
  remove(@Param('id') id: string) {
    return this.studyService.delete(id);
  }

  @Post('studies/:id/regenerate-xml')
  @Roles(Role.ADMIN, Role.MANAGER, Role.EDITOR)
  regenerateXml(@Param('id') id: string) {
    return this.studyService.regenerateXml(id);
  }

  // ==================== STF XML import (Plan 12 §3.6) ====================

  /**
   * Import an STF XML string into an existing SequenceNode. PDFs referenced
   * by the XML must already exist as FileAttachment rows on the same node
   * (matched by basename). Any unresolved href becomes a warning.
   */
  @Post('sequence-nodes/:nodeId/studies/import-xml')
  @Roles(Role.ADMIN, Role.MANAGER, Role.EDITOR)
  importStfXml(
    @Param('nodeId') nodeId: string,
    @Body() dto: ImportStfXmlDto,
  ) {
    return this.importService.importStfXml(nodeId, dto.xml, {
      onConflict: dto.onConflict,
    });
  }

  /**
   * Import an STF XML + the PDF files it references via a JSON payload
   * containing base64-encoded file buffers. Brand-new FileAttachment rows
   * are created on the node for any attached file whose basename matches a
   * document href in the XML.
   *
   * TODO: for very large batches the frontend should switch to the
   * multipart endpoint below to avoid the base64 size penalty.
   */
  @Post('sequence-nodes/:nodeId/studies/import-bundle')
  @Roles(Role.ADMIN, Role.MANAGER, Role.EDITOR)
  importStfBundleJson(
    @Param('nodeId') nodeId: string,
    @Body() dto: ImportStfBundleDto,
  ) {
    const attached = (dto.files ?? []).map((f) => ({
      originalName: f.originalName,
      buffer: Buffer.from(f.base64, 'base64'),
      md5: f.md5,
    }));
    return this.importService.importStfBundle(nodeId, {
      xmlString: dto.xml,
      attachedFiles: attached,
      onConflict: dto.onConflict,
    });
  }

  /**
   * Multipart flavour of the bundle endpoint. Expects two form fields:
   *   - `xml`  — the STF XML file (a single .xml upload)
   *   - `files` — the referenced PDFs (up to 50 PDFs)
   * plus an optional `onConflict` text field.
   */
  @Post('sequence-nodes/:nodeId/studies/import-bundle-multipart')
  @Roles(Role.ADMIN, Role.MANAGER, Role.EDITOR)
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'xml', maxCount: 1 },
        { name: 'files', maxCount: 50 },
      ],
      {
        limits: { fileSize: 512 * 1024 * 1024 }, // 512MB per file
      },
    ),
  )
  async importStfBundleMultipart(
    @Param('nodeId') nodeId: string,
    @UploadedFiles()
    uploaded: {
      xml?: Express.Multer.File[];
      files?: Express.Multer.File[];
    },
    @Body('onConflict') onConflict?: ImportOnConflict,
  ) {
    const xmlFile = uploaded?.xml?.[0];
    if (!xmlFile) {
      throw new BadRequestException('缺少 xml 字段（STF XML 文件）');
    }
    const xmlString = xmlFile.buffer.toString('utf8');

    const attached = (uploaded?.files ?? []).map((f) => ({
      originalName: f.originalname,
      buffer: f.buffer,
    }));
    return this.importService.importStfBundle(nodeId, {
      xmlString,
      attachedFiles: attached,
      onConflict,
    });
  }
}
