import api from './api';
import type { Application, RegulatoryActivity, Sequence } from '../types';

export const applicationApi = {
  list: (projectId: string) =>
    api.get<any, Application[]>(`/projects/${projectId}/applications`),

  detail: (id: string) =>
    api.get<any, Application & { regulatoryActivities: RegulatoryActivity[] }>(
      `/projects/_/applications/${id}`,
    ),

  create: (projectId: string, data: {
    applicationTypeCode: string;
    productTypeCode: string;
    productNumber: string;
  }) =>
    api.post<any, Application>(`/projects/${projectId}/applications`, data),

  remove: (projectId: string, id: string) =>
    api.delete(`/projects/${projectId}/applications/${id}`),

  createSequenceWithRa: (appId: string, data: {
    regulatoryActivityTypeCode: string;
    sequenceTypeCode: string;
    description: string;
    contactName: string;
    contactPhone: string;
    contactEmail: string;
  }) =>
    api.post<any, Sequence & { regulatoryActivity: RegulatoryActivity }>(
      `/projects/_/applications/${appId}/create-sequence`,
      data,
    ),
};

export const regulatoryActivityApi = {
  list: (appId: string) =>
    api.get<any, RegulatoryActivity[]>(`/applications/${appId}/regulatory-activities`),

  detail: (id: string) =>
    api.get<any, RegulatoryActivity>(`/applications/_/regulatory-activities/${id}`),

  create: (appId: string, data: { regulatoryActivityTypeCode: string }) =>
    api.post<any, RegulatoryActivity>(`/applications/${appId}/regulatory-activities`, data),
};

export const sequenceApi = {
  list: (raId: string) =>
    api.get<any, Sequence[]>(`/regulatory-activities/${raId}/sequences`),

  detail: (id: string) =>
    api.get<any, Sequence>(`/regulatory-activities/_/sequences/${id}`),

  create: (raId: string, data: {
    sequenceTypeCode: string;
    description: string;
    contactName: string;
    contactPhone: string;
    contactEmail: string;
  }) =>
    api.post<any, Sequence>(`/regulatory-activities/${raId}/sequences`, data),

  update: (raId: string, id: string, data: Partial<Sequence>) =>
    api.patch<any, Sequence>(`/regulatory-activities/${raId}/sequences/${id}`, data),

  remove: (raId: string, id: string) =>
    api.delete(`/regulatory-activities/${raId}/sequences/${id}`),
};
