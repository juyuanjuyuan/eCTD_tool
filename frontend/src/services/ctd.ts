import api from './api';
import type {
  CtdTemplateNode,
  SequenceNode,
  CompletenessResult,
  ExtensionOption,
} from '../types';

export const ctdApi = {
  // Template tree
  getTemplateTree: () => api.get<never, CtdTemplateNode[]>('/ctd-templates/tree'),

  getTemplateTreeWithRules: (appType: string, ratType: string) =>
    api.get<never, CtdTemplateNode[]>('/ctd-templates/tree', {
      params: { appType, ratType },
    }),

  getExtensionOptions: () =>
    api.get<never, ExtensionOption[]>('/ctd-templates/extension-options'),

  // Sequence node operations
  initializeSequence: (seqId: string) =>
    api.post<never, { message: string; nodeCount: number }>(
      `/sequences/${seqId}/initialize`,
    ),

  getSequenceNodeTree: (seqId: string) =>
    api.get<never, SequenceNode[]>(`/sequences/${seqId}/nodes/tree`),

  updateSequenceNode: (
    seqId: string,
    nodeId: string,
    data: { status?: string; operation?: string; title?: string },
  ) => api.patch<never, SequenceNode>(`/sequences/${seqId}/nodes/${nodeId}`, data),

  updateBackboneAttributes: (
    seqId: string,
    nodeId: string,
    data: Record<string, string>,
  ) =>
    api.patch<never, SequenceNode>(
      `/sequences/${seqId}/nodes/${nodeId}/attributes`,
      data,
    ),

  createExtensionNode: (
    seqId: string,
    parentNodeId: string,
    extensionType: string,
  ) =>
    api.post<never, SequenceNode>(
      `/sequences/${seqId}/nodes/${parentNodeId}/extensions`,
      { extensionType },
    ),

  deleteExtensionNode: (seqId: string, nodeId: string) =>
    api.delete(`/sequences/${seqId}/nodes/${nodeId}/extension`),

  // Plan 13 (2026-04-23): 多实例节点 — 同一申请多个原料药/制剂/适应症
  listInstances: (seqId: string, templateNodeId: string) =>
    api.get<never, SequenceNode[]>(
      `/sequences/${seqId}/template-nodes/${templateNodeId}/instances`,
    ),

  addInstance: (
    seqId: string,
    templateNodeId: string,
    data: {
      substance?: string;
      manufacturer?: string;
      productName?: string;
      dosageForm?: string;
      indication?: string;
    },
  ) =>
    api.post<never, SequenceNode>(
      `/sequences/${seqId}/template-nodes/${templateNodeId}/instances`,
      data,
    ),

  removeInstance: (seqId: string, instanceRootNodeId: string) =>
    api.delete<never, { message: string }>(
      `/sequences/${seqId}/instances/${instanceRootNodeId}`,
    ),

  checkCompleteness: (seqId: string) =>
    api.get<never, CompletenessResult>(`/sequences/${seqId}/completeness`),

  previewRequired: (seqId: string) =>
    api.get<never, {
      applicationTypeCode: string;
      regulatoryActivityTypeCode: string;
      requiredSections: Array<{ section: string; title: string; module: number; severity: string }>;
      forbiddenSections: Array<{ section: string; title: string; module: number }>;
      totalRequired: number;
    }>(`/sequences/${seqId}/preview-required`),
};
