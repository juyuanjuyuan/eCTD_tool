import { Module } from '@nestjs/common';
import { EditLockController } from './edit-lock.controller';
import { EditLockService } from './edit-lock.service';
import { AssignmentModule } from '../assignment/assignment.module';

@Module({
  imports: [AssignmentModule],
  controllers: [EditLockController],
  providers: [EditLockService],
  exports: [EditLockService],
})
export class EditLockModule {}
