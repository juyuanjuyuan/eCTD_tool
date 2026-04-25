import { create } from 'zustand';
import { licenseApi, type LicenseStatus } from '../services/license';

interface LicenseState {
  status: LicenseStatus | null;
  loading: boolean;
  error: string | null;
  fetch: () => Promise<LicenseStatus | null>;
  activate: (code: string) => Promise<LicenseStatus>;
  reset: () => void;
}

export const useLicenseStore = create<LicenseState>((set) => ({
  status: null,
  loading: false,
  error: null,

  fetch: async () => {
    set({ loading: true, error: null });
    try {
      const status = await licenseApi.status();
      set({ status, loading: false });
      return status;
    } catch (err: any) {
      set({ loading: false, error: err?.message || '获取激活状态失败' });
      return null;
    }
  },

  activate: async (code) => {
    set({ loading: true, error: null });
    try {
      const status = await licenseApi.activate(code);
      set({ status, loading: false });
      return status;
    } catch (err: any) {
      set({ loading: false, error: err?.message || '激活失败' });
      throw err;
    }
  },

  reset: () => set({ status: null, error: null }),
}));

export const isLicenseBlocking = (status: LicenseStatus | null): boolean => {
  if (!status) return false;
  if (!status.enforced) return false;
  if (!status.activated) return true;
  return status.license?.valid !== true;
};
