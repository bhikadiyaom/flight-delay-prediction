import { api } from './axiosClient.js';

export const flightApi = {
  live: (flight) => api.get('/flights/live', { params: { flight } }).then((r) => r.data),
  route: (origin, destination) => api.get('/flights/live/route', { params: { origin, destination } }).then((r) => r.data),
  historical: (params) => api.get('/flights/historical', { params }).then((r) => r.data),
  airports: (q, limit = 8) => api.get('/flights/airports', { params: { q, limit } }).then((r) => r.data.airports),
};
