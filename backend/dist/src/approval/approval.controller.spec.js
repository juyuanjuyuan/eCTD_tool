"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const approval_controller_1 = require("./approval.controller");
describe('ApprovalController', () => {
    let controller;
    let service;
    beforeEach(() => {
        service = {
            submitForApproval: jest.fn().mockResolvedValue({ approvalStatus: 'SUBMITTED' }),
            approveNode: jest.fn().mockResolvedValue({ approvalStatus: 'APPROVED' }),
            rejectNode: jest.fn().mockResolvedValue({ approvalStatus: 'REJECTED' }),
            unlockApproval: jest.fn().mockResolvedValue({ approvalStatus: 'DRAFT' }),
            getApprovalHistory: jest.fn().mockResolvedValue({ approvalStatus: 'APPROVED' }),
        };
        controller = new approval_controller_1.ApprovalController(service);
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
        const result = await controller.reject('node-1', 'user-1', { reason: '格式错误' });
        expect(service.rejectNode).toHaveBeenCalledWith('node-1', 'user-1', '格式错误');
    });
    it('should unlock approval', async () => {
        const result = await controller.unlockApproval('node-1');
        expect(result.approvalStatus).toBe('DRAFT');
    });
    it('should get history', async () => {
        const result = await controller.getHistory('node-1');
        expect(result.approvalStatus).toBe('APPROVED');
    });
});
describe('SequenceApprovalController', () => {
    it('should get approval status', async () => {
        const service = {
            getSequenceApprovalStatus: jest.fn().mockResolvedValue({ total: 10, approved: 5 }),
        };
        const controller = new approval_controller_1.SequenceApprovalController(service);
        const result = await controller.getApprovalStatus('seq-1');
        expect(result.total).toBe(10);
    });
});
//# sourceMappingURL=approval.controller.spec.js.map