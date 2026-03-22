import { Module } from '@nestjs/common';
import { EditLockController } from './edit-lock.controller';
import { EditLockService } from './edit-lock.service';

@Module({
  controllers: [EditLockController],
  providers: [EditLockService],
  exports: [EditLockService],
})
export class EditLockModule {}
