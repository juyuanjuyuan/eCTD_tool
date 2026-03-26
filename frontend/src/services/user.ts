import api from './api';

export interface UserSearchResult {
  id: string;
  name: string;
  email: string;
}

export const userApi = {
  search: (q: string) =>
    api.get<never, UserSearchResult[]>('/users/search', { params: { q } }),
};
