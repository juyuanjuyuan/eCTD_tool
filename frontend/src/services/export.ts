import api from './api';
import axios from 'axios';

export interface ComplianceIssue {
  ruleId: string;
  severity: 'error' | 'warning';
  message: string;
  detail?: string;
}

export interface ComplianceResult {
  isCompliant: boolean;
  errors: ComplianceIssue[];
  warnings: ComplianceIssue[];
  summary: {
    pdfVersion: string;
    pageCount: number;
    hasBookmarks: boolean;
    hasEncryption: boolean;
    fileSizeMB: number;
  };
}

export interface BatchTaskResult {
  taskId: string;
}

export interface TaskStatus {
  status: string;
  progress: number;
  result?: any;
  error?: string;
}

export interface BatchDownloadUrl {
  url: string;
}

const token = () => localStorage.getItem('accessToken');

export const exportApi = {
  // Export single chapter as Word — returns blob
  exportWord: async (seqId: string, nodeId: string): Promise<Blob> => {
    const res = await axios.post(
      `/api/v1/sequences/${seqId}/export/word`,
      { nodeId },
      {
        responseType: 'blob',
        headers: { Authorization: `Bearer ${token()}` },
      },
    );
    return res.data;
  },

  // Export single chapter as PDF — returns blob or compliance error JSON
  exportPdf: async (
    seqId: string,
    nodeId: string,
  ): Promise<{ blob?: Blob; complianceError?: { complianceResult: ComplianceResult; removedLinks: string[] } }> => {
    const res = await axios.post(
      `/api/v1/sequences/${seqId}/export/pdf`,
      { nodeId },
      {
        responseType: 'blob',
        headers: { Authorization: `Bearer ${token()}` },
      },
    );

    // Check if response is JSON (compliance error) or blob (file)
    const contentType = res.headers['content-type'];
    if (contentType?.includes('application/json')) {
      const text = await (res.data as Blob).text();
      const json = JSON.parse(text);
      return { complianceError: json };
    }

    return { blob: res.data };
  },

  // Batch export
  exportWordBatch: (seqId: string, nodeIds: string[]) =>
    api.post<never, BatchTaskResult>(`/sequences/${seqId}/export/word/batch`, { nodeIds }),

  exportPdfBatch: (seqId: string, nodeIds: string[]) =>
    api.post<never, BatchTaskResult>(`/sequences/${seqId}/export/pdf/batch`, { nodeIds }),

  // Task status
  getTaskStatus: (seqId: string, taskId: string) =>
    api.get<never, TaskStatus>(`/sequences/${seqId}/export/status/${taskId}`),

  // Batch result download url
  getDownloadUrl: (seqId: string, taskId: string) =>
    api.get<never, BatchDownloadUrl>(`/sequences/${seqId}/export/download/${taskId}`),
};
