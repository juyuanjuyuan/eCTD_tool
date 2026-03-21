import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { SequenceService } from './sequence.service';
import { CreateSequenceDto, UpdateSequenceDto } from './dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('api/v1/regulatory-activities/:raId/sequences')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SequenceController {
  constructor(private readonly sequenceService: SequenceService) {}

  @Post()
  @Roles(Role.ADMIN, Role.MANAGER, Role.EDITOR)
  create(
    @Param('raId') raId: string,
    @Body() dto: CreateSequenceDto,
  ) {
    return this.sequenceService.create(raId, dto);
  }

  @Get()
  findAll(@Param('raId') raId: string) {
    return this.sequenceService.findAllByRegulatoryActivity(raId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.sequenceService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.MANAGER, Role.EDITOR)
  update(@Param('id') id: string, @Body() dto: UpdateSequenceDto) {
    return this.sequenceService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  remove(@Param('id') id: string) {
    return this.sequenceService.remove(id);
  }
}
