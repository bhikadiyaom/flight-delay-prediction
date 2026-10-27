import { api } from './axiosClient.js';

export const adminApi = {
  stats: () => api.get('/admin/stats').then((r) => r.data),
  metrics: () => api.get('/admin/metrics').then((r) => r.data.items),
  refreshMetrics: () => api.post('/admin/metrics/refresh').then((r) => r.data),
  predictions: (params) => api.get('/admin/predictions', { params }).then((r) => r.data),
};
