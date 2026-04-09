import api from './api';
import type { ControlledVocabulary } from '../types';

export interface StfCategoryGroup {
  name: string; // e.g. "species", "route-of-admin"
  values: Array<{ value: string; realm: string }>;
}

export interface StfFileTag {
  value: string;
  realm: string;
}

export const cvApi = {
  getApplicationTypes: () =>
    api.get<any, ControlledVocabulary[]>('/cv/application-types'),

  getProductTypes: () =>
    api.get<any, ControlledVocabulary[]>('/cv/product-types'),

  getRegulatoryActivityTypes: (appType?: string) =>
    api.get<any, ControlledVocabulary[]>('/cv/regulatory-activity-types', {
      params: { appType },
    }),

  getSequenceTypes: (appType?: string, ratType?: string) =>
    api.get<any, ControlledVocabulary[]>('/cv/sequence-types', {
      params: { appType, ratType },
    }),

  // ----- Plan 12: STF controlled vocabularies -----
  getStfCategories: () =>
    api.get<any, StfCategoryGroup[]>('/cv/stf/categories'),

  getStfCategoryValues: (name: string) =>
    api.get<any, Array<{ value: string; realm: string }>>(
      `/cv/stf/categories/${encodeURIComponent(name)}`,
    ),

  getStfFileTags: (module: 'm4' | 'm5') =>
    api.get<any, StfFileTag[]>('/cv/stf/file-tags', { params: { module } }),
};
