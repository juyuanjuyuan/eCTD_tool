import api from './api';
import type { EditLockInfo } from '../types';

export const editLockApi = {
  acquire: (nodeId: string) =>
    api.post<never, EditLockInfo>(`/nodes/${nodeId}/lock`),

  release: (nodeId: string) =>
    api.delete(`/nodes/${nodeId}/lock`),

  query: (nodeId: string) =>
    api.get<never, EditLockInfo | null>(`/nodes/${nodeId}/lock`),

  forceUnlock: (nodeId: string) =>
    api.delete(`/nodes/${nodeId}/lock/force`),

  heartbeat: (nodeId: string) =>
    api.post<never, EditLockInfo | null>(`/nodes/${nodeId}/lock/heartbeat`),
};
