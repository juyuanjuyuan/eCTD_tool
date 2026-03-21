import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { RegulatoryActivityService } from './regulatory-activity.service';
import { CreateRegulatoryActivityDto } from './dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('api/v1/applications/:appId/regulatory-activities')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RegulatoryActivityController {
  constructor(
    private readonly raService: RegulatoryActivityService,
  ) {}

  @Post()
  @Roles(Role.ADMIN, Role.MANAGER, Role.EDITOR)
  create(
    @Param('appId') appId: string,
    @Body() dto: CreateRegulatoryActivityDto,
  ) {
    return this.raService.create(appId, dto);
  }

  @Get()
  findAll(@Param('appId') appId: string) {
    return this.raService.findAllByApplication(appId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.raService.findOne(id);
  }
}
