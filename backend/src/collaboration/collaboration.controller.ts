import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CollaborationService } from './collaboration.service';

@Controller('api/v1/projects')
@UseGuards(JwtAuthGuard)
export class CollaborationController {
  constructor(private readonly collaborationService: CollaborationService) {}

  @Get(':id/presence')
  getPresence(@Param('id') projectId: string) {
    return this.collaborationService.getProjectPresence(projectId);
  }
}
