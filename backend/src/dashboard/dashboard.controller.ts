import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { DashboardService } from './dashboard.service';

@Controller('api/v1')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('dashboard/my-tasks')
  getMyTasks(@CurrentUser('id') userId: string) {
    return this.dashboardService.getMyTasks(userId);
  }

  @Get('dashboard/recent-edits')
  getRecentEdits(@CurrentUser('id') userId: string) {
    return this.dashboardService.getRecentEdits(userId);
  }

  @Get('projects/:id/collaboration/progress')
  getProjectProgress(@Param('id') projectId: string) {
    return this.dashboardService.getProjectProgress(projectId);
  }

  @Get('projects/:id/collaboration/workload')
  getProjectWorkload(@Param('id') projectId: string) {
    return this.dashboardService.getProjectWorkload(projectId);
  }
}
