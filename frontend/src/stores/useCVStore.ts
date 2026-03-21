import { create } from 'zustand';
import type { ControlledVocabulary } from '../types';
import { cvApi } from '../services/cv';

interface CVState {
  applicationTypes: ControlledVocabulary[];
  productTypes: ControlledVocabulary[];
  regulatoryActivityTypes: ControlledVocabulary[];
  sequenceTypes: ControlledVocabulary[];

  fetchApplicationTypes: () => Promise<void>;
  fetchProductTypes: () => Promise<void>;
  fetchRegulatoryActivityTypes: (appType?: string) => Promise<void>;
  fetchSequenceTypes: (appType?: string, ratType?: string) => Promise<void>;
  getCvLabel: (code: string) => string;
}

export const useCVStore = create<CVState>((set, get) => ({
  applicationTypes: [],
  productTypes: [],
  regulatoryActivityTypes: [],
  sequenceTypes: [],

  fetchApplicationTypes: async () => {
    const data = await cvApi.getApplicationTypes();
    set({ applicationTypes: data });
  },

  fetchProductTypes: async () => {
    const data = await cvApi.getProductTypes();
    set({ productTypes: data });
  },

  fetchRegulatoryActivityTypes: async (appType) => {
    const data = await cvApi.getRegulatoryActivityTypes(appType);
    set({ regulatoryActivityTypes: data });
  },

  fetchSequenceTypes: async (appType, ratType) => {
    const data = await cvApi.getSequenceTypes(appType, ratType);
    set({ sequenceTypes: data });
  },

  getCvLabel: (code: string) => {
    const state = get();
    const all = [
      ...state.applicationTypes,
      ...state.productTypes,
      ...state.regulatoryActivityTypes,
      ...state.sequenceTypes,
    ];
    const found = all.find((cv) => cv.code === code);
    return found?.descriptionZh || code;
  },
}));
