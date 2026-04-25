import api from './api';

export type LicenseInvalidReason =
  | 'malformed'
  | 'bad-signature'
  | 'fingerprint-mismatch'
  | 'expired'
  | 'not-yet-valid';

export interface LicenseStatus {
  activated: boolean;
  enforced: boolean;
  machineId: string;
  license?: {
    customer: string;
    issuedAt: string;
    expiresAt: string;
    daysRemaining: number;
    valid: boolean;
    reason?: LicenseInvalidReason;
  };
}

export const licenseApi = {
  status: () => api.get<unknown, LicenseStatus>('/license/status'),
  activate: (code: string) =>
    api.post<unknown, LicenseStatus>('/license/activate', { code }),
};
