import api from './api';

export interface DashboardTasks {
  pendingEditNodes: Array<{
    nodeId: string;
    ctdSectionNumber: string;
    title: string;
    status: string;
    approvalStatus: string;
    sequenceId: string;
    projectId: string;
    projectName: string;
  }>;
  pendingReviewNodes: Array<{
    nodeId: string;
    ctdSectionNumber: string;
    title: string;
    submittedBy: string;
    submittedAt: string;
    sequenceId: string;
    projectName: string;
  }>;
  pendingInvitations: number;
}

export interface RecentEdit {
  nodeId: string;
  ctdSectionNumber: string;
  title: string;
  status: string;
  sequenceId: string;
  projectId: string;
  projectName: string;
  editedAt: string;
}

export interface ProjectProgress {
  modules: Record<string, { total: number; approved: number }>;
  totalNodes: number;
  approvedNodes: number;
}

export interface MemberWorkload {
  userId: string;
  name: string;
  role: string;
  assigned: number;
  approved: number;
  editing: number;
  pendingReview: number;
}

export const dashboardApi = {
  getMyTasks: () =>
    api.get<any, DashboardTasks>('/dashboard/my-tasks'),

  getRecentEdits: () =>
    api.get<any, RecentEdit[]>('/dashboard/recent-edits'),

  getProjectProgress: (projectId: string) =>
    api.get<any, ProjectProgress>(`/projects/${projectId}/collaboration/progress`),

  getProjectWorkload: (projectId: string) =>
    api.get<any, MemberWorkload[]>(`/projects/${projectId}/collaboration/workload`),
};
