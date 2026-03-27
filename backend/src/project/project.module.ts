import { Module } from '@nestjs/common';
import { ProjectController, InvitationController } from './project.controller';
import { ProjectService } from './project.service';
import { ActivityLogModule } from '../activity-log/activity-log.module';

@Module({
  imports: [ActivityLogModule],
  controllers: [ProjectController, InvitationController],
  providers: [ProjectService],
  exports: [ProjectService],
})
export class ProjectModule {}
