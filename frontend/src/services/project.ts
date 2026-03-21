import api from './api';
import type { Project, PaginatedData, ProjectMember } from '../types';

export const projectApi = {
  list: (params?: { page?: number; pageSize?: number; search?: string; status?: string }) =>
    api.get<any, PaginatedData<Project>>('/projects', { params }),

  detail: (id: string) =>
    api.get<any, Project & { members: ProjectMember[] }>(`/projects/${id}`),

  create: (data: { name: string; description?: string }) =>
    api.post<any, Project>('/projects', data),

  update: (id: string, data: { name?: string; description?: string; status?: string }) =>
    api.patch<any, Project>(`/projects/${id}`, data),

  archive: (id: string) =>
    api.delete<any, Project>(`/projects/${id}`),

  addMember: (projectId: string, data: { userId: string; role: string }) =>
    api.post<any, ProjectMember>(`/projects/${projectId}/members`, data),

  removeMember: (projectId: string, userId: string) =>
    api.delete(`/projects/${projectId}/members/${userId}`),
};
