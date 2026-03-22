import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApprovalService } from './approval.service';
import { RejectApprovalDto } from './dto';

@Controller('api/v1/nodes/:nodeId')
@UseGuards(JwtAuthGuard)
export class ApprovalController {
  constructor(private readonly approvalService: ApprovalService) {}

  @Post('submit')
  submit(
    @Param('nodeId') nodeId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.approvalService.submitForApproval(nodeId, userId);
  }

  @Post('approve')
  @UseGuards(RolesGuard)
  @Roles('ADMIN' as any, 'MANAGER' as any)
  approve(
    @Param('nodeId') nodeId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.approvalService.approveNode(nodeId, userId);
  }

  @Post('reject')
  @UseGuards(RolesGuard)
  @Roles('ADMIN' as any, 'MANAGER' as any)
  reject(
    @Param('nodeId') nodeId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: RejectApprovalDto,
  ) {
    return this.approvalService.rejectNode(nodeId, userId, dto.reason);
  }

  @Post('unlock-approval')
  @UseGuards(RolesGuard)
  @Roles('ADMIN' as any, 'MANAGER' as any)
  unlockApproval(@Param('nodeId') nodeId: string) {
    return this.approvalService.unlockApproval(nodeId);
  }

  @Get('approval-history')
  getHistory(@Param('nodeId') nodeId: string) {
    return this.approvalService.getApprovalHistory(nodeId);
  }
}

@Controller('api/v1/sequences/:seqId/approval-status')
@UseGuards(JwtAuthGuard)
export class SequenceApprovalController {
  constructor(private readonly approvalService: ApprovalService) {}

  @Get()
  getApprovalStatus(@Param('seqId') seqId: string) {
    return this.approvalService.getSequenceApprovalStatus(seqId);
  }
}
