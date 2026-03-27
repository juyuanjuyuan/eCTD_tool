import api from './api';
import type { ActivityLog, PaginatedData } from '../types';

export const activityLogApi = {
  getBySequence: (seqId: string, page = 1, pageSize = 20) =>
    api.get<never, PaginatedData<ActivityLog>>(
      `/sequences/${seqId}/activity-log`,
      { params: { page, pageSize } },
    ),

  getMemberActivity: (projectId: string, userId: string, page = 1, pageSize = 20) =>
    api.get<never, PaginatedData<ActivityLog>>(
      `/projects/${projectId}/members/${userId}/activity`,
      { params: { page, pageSize } },
    ),
};
