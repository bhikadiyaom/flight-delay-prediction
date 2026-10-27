import { api } from './axiosClient.js';

export const predictionApi = {
  manual: (body) => api.post('/predictions', body).then((r) => r.data),
  live: (flight) => api.post('/predictions/live', { flight }).then((r) => r.data),
  bulk: (file) => {
    const form = new FormData();
    form.append('file', file);
    return api.post('/predictions/bulk', form, { timeout: 60000 }).then((r) => r.data);
  },
  history: (params) => api.get('/predictions/history', { params }).then((r) => r.data),
};
