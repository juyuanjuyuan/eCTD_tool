import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PaginationDto } from '../common/dto/pagination.dto';
import { ActivityLogService } from './activity-log.service';

@Controller('api/v1')
@UseGuards(JwtAuthGuard)
export class ActivityLogController {
  constructor(private readonly activityLogService: ActivityLogService) {}

  @Get('sequences/:seqId/activity-log')
  getActivityLog(
    @Param('seqId') seqId: string,
    @Query() query: PaginationDto,
  ) {
    return this.activityLogService.getBySequence(
      seqId,
      query.page,
      query.pageSize,
    );
  }

  @Get('projects/:projectId/members/:userId/activity')
  getMemberActivity(
    @Param('projectId') projectId: string,
    @Param('userId') userId: string,
    @Query() query: PaginationDto,
  ) {
    return this.activityLogService.getMemberActivity(
      projectId,
      userId,
      query.page,
      query.pageSize,
    );
  }
}
