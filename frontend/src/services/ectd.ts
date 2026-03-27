import api from './api';
import axios from 'axios';

const token = () => localStorage.getItem('accessToken');

export const ectdApi = {
  // XML Preview
  previewCnRegionalXml: (seqId: string) =>
    api.get(`/sequences/${seqId}/xml/cn-regional`),
  previewIndexXml: (seqId: string) =>
    api.get(`/sequences/${seqId}/xml/index`),

  // STF
  getStf: (nodeId: string) => api.get(`/nodes/${nodeId}/stf`),
  saveStf: (nodeId: string, data: any) => api.put(`/nodes/${nodeId}/stf`, data),
  getStfCategories: () => api.get('/stf/categories'),
  getStfFileTags: () => api.get('/stf/file-tags'),

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
