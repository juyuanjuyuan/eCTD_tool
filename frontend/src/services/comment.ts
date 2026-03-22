import api from './api';
import type { Comment } from '../types';

export const commentApi = {
  create: (nodeId: string, content: string, parentId?: string) =>
    api.post<never, Comment>(`/nodes/${nodeId}/comments`, { content, parentId }),

  list: (nodeId: string) =>
    api.get<never, Comment[]>(`/nodes/${nodeId}/comments`),

  delete: (nodeId: string, commentId: string) =>
    api.delete(`/nodes/${nodeId}/comments/${commentId}`),
};
