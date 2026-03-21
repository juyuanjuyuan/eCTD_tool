import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { ProjectService } from './project.service';
import {
  CreateProjectDto,
  UpdateProjectDto,
  AddMemberDto,
  QueryProjectDto,
} from './dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('api/v1/projects')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  @Post()
  @Roles(Role.ADMIN, Role.MANAGER, Role.EDITOR)
  create(@Body() dto: CreateProjectDto, @CurrentUser('id') userId: string) {
    return this.projectService.create(dto, userId);
  }

  @Get()
  findAll(
    @Query() query: QueryProjectDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.projectService.findAll(query, userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.projectService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.MANAGER, Role.EDITOR)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProjectDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.projectService.update(id, dto, userId);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.MANAGER, Role.EDITOR)
  archive(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.projectService.archive(id, userId);
  }

  @Post(':id/members')
  @Roles(Role.ADMIN, Role.MANAGER, Role.EDITOR)
  addMember(
    @Param('id') id: string,
    @Body() dto: AddMemberDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.projectService.addMember(id, dto, userId);
  }

  @Delete(':id/members/:userId')
  @Roles(Role.ADMIN, Role.MANAGER, Role.EDITOR)
  removeMember(
    @Param('id') id: string,
    @Param('userId') targetUserId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.projectService.removeMember(id, targetUserId, userId);
  }
}
