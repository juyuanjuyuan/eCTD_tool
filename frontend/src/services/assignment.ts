import api from './api';
import type { NodeAssignment } from '../types';

export const assignmentApi = {
  assign: (nodeId: string, data: { userId: string; permission: string } | { userId: string; permission: string }[]) =>
    api.post<any, NodeAssignment[]>(`/nodes/${nodeId}/assignments`, data),

  list: (nodeId: string) =>
    api.get<any, NodeAssignment[]>(`/nodes/${nodeId}/assignments`),

  remove: (nodeId: string, userId: string) =>
    api.delete(`/nodes/${nodeId}/assignments/${userId}`),

  sequenceOverview: (seqId: string) =>
    api.get<any, Array<{
      nodeId: string;
      ctdSectionNumber: string;
      title: string;
      isLeaf: boolean;
      isAssigned: boolean;
      assignees: Array<{ userId: string; name: string; permission: string }>;
    }>>(`/sequences/${seqId}/assignments/overview`),
};
