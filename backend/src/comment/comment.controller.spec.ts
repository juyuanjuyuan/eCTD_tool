import { CommentController } from './comment.controller';

describe('CommentController', () => {
  let controller: CommentController;
  let service: Record<string, any>;

  beforeEach(() => {
    service = {
      createComment: jest.fn().mockResolvedValue({ id: 'c1' }),
      getComments: jest.fn().mockResolvedValue([]),
      deleteComment: jest.fn().mockResolvedValue({ message: '评论已删除' }),
    };
    controller = new CommentController(service as any);
  });

  it('should create comment', async () => {
    await controller.createComment('node-1', 'user-1', { content: '评论' } as any);
    expect(service.createComment).toHaveBeenCalledWith('node-1', 'user-1', { content: '评论' });
  });

  it('should get comments', async () => {
    await controller.getComments('node-1');
    expect(service.getComments).toHaveBeenCalledWith('node-1');
  });

  it('should delete comment', async () => {
    await controller.deleteComment('c1', { id: 'user-1', role: 'USER' });
    expect(service.deleteComment).toHaveBeenCalledWith('c1', 'user-1', 'USER');
  });
});
