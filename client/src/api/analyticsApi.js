import { api } from './axiosClient.js';

export const analyticsApi = {
  overview: () => api.get('/analytics/overview').then((r) => r.data),
  trends: (params) => api.get('/analytics/trends', { params }).then((r) => r.data),
  riskMap: (minFlights = 3000) => api.get('/analytics/risk-map', { params: { minFlights } }).then((r) => r.data),
  modelsCompare: () => api.get('/analytics/models/compare').then((r) => r.data),
};
