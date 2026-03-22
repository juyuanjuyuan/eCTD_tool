import { Module } from '@nestjs/common';
import { ApprovalController, SequenceApprovalController } from './approval.controller';
import { ApprovalService } from './approval.service';

@Module({
  controllers: [ApprovalController, SequenceApprovalController],
  providers: [ApprovalService],
  exports: [ApprovalService],
})
export class ApprovalModule {}
