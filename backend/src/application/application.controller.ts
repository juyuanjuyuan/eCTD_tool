import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { ApplicationService } from './application.service';
import { CreateApplicationDto } from './dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('api/v1/projects/:projectId/applications')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ApplicationController {
  constructor(private readonly applicationService: ApplicationService) {}

  @Post()
  @Roles(Role.ADMIN, Role.MANAGER, Role.EDITOR)
  create(
    @Param('projectId') projectId: string,
    @Body() dto: CreateApplicationDto,
  ) {
    return this.applicationService.create(projectId, dto);
  }

  @Get()
  findAll(@Param('projectId') projectId: string) {
    return this.applicationService.findAllByProject(projectId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.applicationService.findOne(id);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  remove(@Param('id') id: string) {
    return this.applicationService.remove(id);
  }
}
