import api from './api';
import type { SequenceNode, ApprovalHistory, SequenceApprovalStatus } from '../types';

export const approvalApi = {
  submit: (nodeId: string) =>
    api.post<never, SequenceNode>(`/nodes/${nodeId}/submit`),

  approve: (nodeId: string) =>
    api.post<never, SequenceNode>(`/nodes/${nodeId}/approve`),

  reject: (nodeId: string, reason: string) =>
    api.post<never, SequenceNode>(`/nodes/${nodeId}/reject`, { reason }),

  unlockApproval: (nodeId: string) =>
    api.post<never, SequenceNode>(`/nodes/${nodeId}/unlock-approval`),

  getHistory: (nodeId: string) =>
    api.get<never, ApprovalHistory>(`/nodes/${nodeId}/approval-history`),

  getSequenceStatus: (seqId: string) =>
    api.get<never, SequenceApprovalStatus>(`/sequences/${seqId}/approval-status`),
};
