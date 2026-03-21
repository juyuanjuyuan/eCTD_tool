import { create } from 'zustand';
import type { User } from '../types';
import { authApi } from '../services/auth';

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { email: string; password: string; name: string; phone?: string }) => Promise<void>;
  logout: () => void;
  fetchProfile: () => Promise<void>;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  loading: false,

  login: async (email, password) => {
    set({ loading: true });
    try {
      const result = await authApi.login({ email, password });
      localStorage.setItem('accessToken', result.accessToken);
      localStorage.setItem('refreshToken', result.refreshToken);
      set({ user: result.user as User, loading: false });
    } catch (error) {
      set({ loading: false });
      throw error;
    }
  },

  register: async (data) => {
    set({ loading: true });
    try {
      const result = await authApi.register(data);
      localStorage.setItem('accessToken', result.accessToken);
      localStorage.setItem('refreshToken', result.refreshToken);
      set({ user: result.user as User, loading: false });
    } catch (error) {
      set({ loading: false });
      throw error;
    }
  },

  logout: () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    set({ user: null });
  },

  fetchProfile: async () => {
    try {
      const user = await authApi.getProfile();
      set({ user });
    } catch {
      set({ user: null });
    }
  },

  isAuthenticated: () => {
    return !!get().user || !!localStorage.getItem('accessToken');
  },
}));
