import {
  Controller,
  Get,
  Put,
  Post,
  Param,
  Body,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { DocumentService } from './document.service';
import { SaveDocumentDto } from './dto';

@Controller('api/v1/nodes/:nodeId/document')
@UseGuards(JwtAuthGuard)
export class DocumentController {
  constructor(private readonly documentService: DocumentService) {}

  @Get()
  getDocument(@Param('nodeId') nodeId: string) {
    return this.documentService.getDocument(nodeId);
  }

  @Put()
  saveDocument(
    @Param('nodeId') nodeId: string,
    @Body() dto: SaveDocumentDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.documentService.saveDocument(nodeId, dto, userId);
  }

  @Get('versions')
  getVersions(@Param('nodeId') nodeId: string) {
    return this.documentService.getVersions(nodeId);
  }

  @Get('versions/:v')
  getVersion(
    @Param('nodeId') nodeId: string,
    @Param('v', ParseIntPipe) v: number,
  ) {
    return this.documentService.getVersion(nodeId, v);
  }

  @Post('versions')
  createVersionSnapshot(
    @Param('nodeId') nodeId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.documentService.createVersionSnapshot(nodeId, userId);
  }

  @Post('restore/:v')
  restoreVersion(
    @Param('nodeId') nodeId: string,
    @Param('v', ParseIntPipe) v: number,
    @CurrentUser('id') userId: string,
  ) {
    return this.documentService.restoreVersion(nodeId, v, userId);
  }
}
