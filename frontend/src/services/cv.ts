import api from './api';
import type { ControlledVocabulary } from '../types';

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
};
