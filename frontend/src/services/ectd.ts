import api from './api';
import axios from 'axios';

const token = () => localStorage.getItem('accessToken');

export const ectdApi = {
  // XML Preview
  previewCnRegionalXml: (seqId: string) =>
    api.get(`/sequences/${seqId}/xml/cn-regional`),
  previewIndexXml: (seqId: string) =>
    api.get(`/sequences/${seqId}/xml/index`),

  // STF v1 endpoints removed in Plan 12. Use studyApi from `services/study.ts`
  // and cvApi.getStfCategories / cvApi.getStfFileTags from `services/cv.ts`.

  // Lifecycle
  validateOperation: (seqId: string, nodeId: string, operation: string) =>
    api.post(`/sequences/${seqId}/nodes/${nodeId}/validate-operation`, { operation }),
  checkParallelConflicts: (seqId: string) =>
    api.get(`/sequences/${seqId}/parallel-conflicts`),
  previewWithdraw: (seqId: string) =>
    api.post(`/sequences/${seqId}/withdraw-preview`),

  // Validation
  runValidation: (seqId: string) => api.post(`/sequences/${seqId}/validate`),
  getLatestReport: (seqId: string) =>
    api.get(`/sequences/${seqId}/validate/latest`),
  getReport: (seqId: string, reportId: string) =>
    api.get(`/sequences/${seqId}/validate/report/${reportId}`),

  // Package
  previewPackage: (seqId: string) =>
    api.get(`/sequences/${seqId}/export/ectd-preview`),
  exportPackage: async (seqId: string): Promise<Blob> => {
    const res = await axios.post(
      `/api/v1/sequences/${seqId}/export/ectd-package`,
      {},
      {
        responseType: 'blob',
        headers: { Authorization: `Bearer ${token()}` },
      },
    );
    return res.data;
  },
};
