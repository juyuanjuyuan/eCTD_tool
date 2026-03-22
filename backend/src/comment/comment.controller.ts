import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CommentService } from './comment.service';
import { CreateCommentDto } from './dto';

@Controller('api/v1/nodes/:nodeId/comments')
@UseGuards(JwtAuthGuard)
export class CommentController {
  constructor(private readonly commentService: CommentService) {}

  @Post()
  createComment(
    @Param('nodeId') nodeId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateCommentDto,
  ) {
    return this.commentService.createComment(nodeId, userId, dto);
  }

  @Get()
  getComments(@Param('nodeId') nodeId: string) {
    return this.commentService.getComments(nodeId);
  }

  @Delete(':commentId')
  deleteComment(
    @Param('commentId') commentId: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.commentService.deleteComment(commentId, user.id, user.role);
  }
}
