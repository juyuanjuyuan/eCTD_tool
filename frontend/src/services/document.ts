import api from './api';
import type { Document, DocumentVersion } from '../types';

export const documentApi = {
  // Get document content for a node
  get: (nodeId: string) =>
    api.get<never, Document>(`/nodes/${nodeId}/document`),

  // Save document content
  save: (nodeId: string, data: { contentJson: any; contentHtml: string; xmlLang?: string }) =>
    api.put<never, Document>(`/nodes/${nodeId}/document`, data),

  // Get version list
  getVersions: (nodeId: string) =>
    api.get<never, DocumentVersion[]>(`/nodes/${nodeId}/document/versions`),

  // Get specific version
  getVersion: (nodeId: string, version: number) =>
    api.get<never, DocumentVersion>(`/nodes/${nodeId}/document/versions/${version}`),

  // Create version snapshot
  createSnapshot: (nodeId: string) =>
    api.post<never, DocumentVersion>(`/nodes/${nodeId}/document/versions`),

  // Restore to specific version
  restore: (nodeId: string, version: number) =>
    api.post<never, Document>(`/nodes/${nodeId}/document/restore/${version}`),
};
