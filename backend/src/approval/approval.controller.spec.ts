import { ApprovalController, SequenceApprovalController } from './approval.controller';

describe('ApprovalController', () => {
  let controller: ApprovalController;
  let service: Record<string, any>;

  beforeEach(() => {
    service = {
      submitForApproval: jest.fn().mockResolvedValue({ approvalStatus: 'SUBMITTED' }),
      approveNode: jest.fn().mockResolvedValue({ approvalStatus: 'APPROVED' }),
      rejectNode: jest.fn().mockResolvedValue({ approvalStatus: 'REJECTED' }),
      unlockApproval: jest.fn().mockResolvedValue({ approvalStatus: 'DRAFT' }),
      getApprovalHistory: jest.fn().mockResolvedValue({ status: 'APPROVED' }),
    };
    controller = new ApprovalController(service as any);
  });

  it('should submit for approval', async () => {
    const result = await controller.submit('node-1', 'user-1');
    expect(result.approvalStatus).toBe('SUBMITTED');
    expect(service.submitForApproval).toHaveBeenCalledWith('node-1', 'user-1');
  });

  it('should approve node', async () => {
    const result = await controller.approve('node-1', 'user-1');
    expect(result.approvalStatus).toBe('APPROVED');
  });

  it('should reject node', async () => {
    const result = await controller.reject('node-1', 'user-1', { reason: '格式错误' } as any);
    expect(service.rejectNode).toHaveBeenCalledWith('node-1', 'user-1', '格式错误');
  });

  it('should unlock approval', async () => {
    const result = await controller.unlockApproval('node-1');
    expect(result.approvalStatus).toBe('DRAFT');
  });

  it('should get history', async () => {
    const result = await controller.getHistory('node-1');
    expect(result.status).toBe('APPROVED');
  });
});

describe('SequenceApprovalController', () => {
  it('should get approval status', async () => {
    const service = {
      getSequenceApprovalStatus: jest.fn().mockResolvedValue({ total: 10, approved: 5 }),
    };
    const controller = new SequenceApprovalController(service as any);

    const result = await controller.getApprovalStatus('seq-1');

    expect(result.total).toBe(10);
  });
});
