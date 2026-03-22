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

@Controller('api/v1/sequences/:seqId/activity-log')
@UseGuards(JwtAuthGuard)
export class ActivityLogController {
  constructor(private readonly activityLogService: ActivityLogService) {}

  @Get()
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
}
