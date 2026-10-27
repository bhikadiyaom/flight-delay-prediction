import { api } from './axiosClient.js';

export const savedSearchApi = {
  list: (params) => api.get('/saved-searches', { params }).then((r) => r.data.items),
  create: (body) => api.post('/saved-searches', body).then((r) => r.data.item),
  patch: (id, body) => api.patch(`/saved-searches/${id}`, body).then((r) => r.data.item),
  remove: (id) => api.delete(`/saved-searches/${id}`).then(() => id),
};
