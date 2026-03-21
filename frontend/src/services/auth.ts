import api from './api';
import type { AuthResponse, User } from '../types';

export const authApi = {
  register: (data: { email: string; password: string; name: string; phone?: string }) =>
    api.post<any, AuthResponse>('/auth/register', data),

  login: (data: { email: string; password: string }) =>
    api.post<any, AuthResponse>('/auth/login', data),

  refresh: (refreshToken: string) =>
    api.post<any, { accessToken: string; refreshToken: string }>('/auth/refresh', { refreshToken }),

  getProfile: () =>
    api.get<any, User>('/auth/me'),
};
