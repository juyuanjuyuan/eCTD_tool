import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AssignmentService } from './assignment.service';
import { CreateAssignmentDto } from './dto/create-assignment.dto';

@Controller('api/v1')
@UseGuards(JwtAuthGuard)
export class AssignmentController {
  constructor(private readonly assignmentService: AssignmentService) {}

  @Post('nodes/:nodeId/assignments')
  assignNode(
    @Param('nodeId') nodeId: string,
    @Body() body: CreateAssignmentDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.assignmentService.assignNode(nodeId, [body], userId);
  }

  @Get('nodes/:nodeId/assignments')
  getNodeAssignments(@Param('nodeId') nodeId: string) {
    return this.assignmentService.getNodeAssignments(nodeId);
  }

  @Delete('nodes/:nodeId/assignments/:targetUserId')
  removeAssignment(
    @Param('nodeId') nodeId: string,
    @Param('targetUserId') targetUserId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.assignmentService.removeAssignment(nodeId, targetUserId, userId);
  }

  @Get('sequences/:seqId/assignments/overview')
  getSequenceOverview(@Param('seqId') seqId: string) {
    return this.assignmentService.getSequenceAssignmentOverview(seqId);
  }
}
