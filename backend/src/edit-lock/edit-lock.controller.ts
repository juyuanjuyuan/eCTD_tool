import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { EditLockService } from './edit-lock.service';

@Controller('api/v1/nodes/:nodeId/lock')
@UseGuards(JwtAuthGuard)
export class EditLockController {
  constructor(private readonly editLockService: EditLockService) {}

  @Post()
  acquireLock(
    @Param('nodeId') nodeId: string,
    @CurrentUser() user: { id: string; name: string },
  ) {
    return this.editLockService.acquireLock(nodeId, user.id, user.name);
  }

  @Delete()
  releaseLock(
    @Param('nodeId') nodeId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.editLockService.releaseLock(nodeId, userId);
  }

  @Get()
  queryLock(@Param('nodeId') nodeId: string) {
    return this.editLockService.queryLock(nodeId);
  }

  @Delete('force')
  @UseGuards(RolesGuard)
  @Roles('ADMIN' as any, 'MANAGER' as any)
  forceUnlock(@Param('nodeId') nodeId: string) {
    return this.editLockService.forceUnlock(nodeId);
  }

  @Post('heartbeat')
  heartbeat(
    @Param('nodeId') nodeId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.editLockService.heartbeat(nodeId, userId);
  }
}
