import { api } from './client';

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  tenantId: string;
  tier: string;
}

export interface AuthResponse {
  token: string;
  refreshToken: string;
  user: AuthUser;
}

export const authApi = {
  register: (email: string, password: string, name: string) =>
    api.post<AuthResponse>('/auth/register', { email, password, name }),

  login: (email: string, password: string) =>
    api.post<AuthResponse>('/auth/login', { email, password }),

  refresh: (refreshToken: string) =>
    api.post<AuthResponse>('/auth/refresh', { refreshToken }),

  me: () => api.get<{ userId: number; tenantId: string; tier: string; email: string; name: string }>('/auth/me'),
};
