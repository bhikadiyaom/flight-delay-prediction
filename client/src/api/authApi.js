import { api } from './axiosClient.js';

export const authApi = {
  register: (body) => api.post('/auth/register', body).then((r) => r.data),
  login: (body) => api.post('/auth/login', body).then((r) => r.data),
  me: () => api.get('/users/me').then((r) => r.data.user),
  updateMe: (body) => api.patch('/users/me', body).then((r) => r.data.user),
};
