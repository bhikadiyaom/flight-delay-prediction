import { useQuery } from '@tanstack/react-query';
import { flightApi } from '../api/flightApi.js';
import { analyticsApi } from '../api/analyticsApi.js';
import { useDebounce } from './useDebounce.js';

export const normalizeFlight = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const isFlightCode = (s) => /^[A-Z0-9]{2}\d{1,4}[A-Z]?$/.test(normalizeFlight(s));

/** Live status + weather for a flight code. Disabled until the code looks valid; cached per normalised code. */
export function useFlightLookup(code) {
  const c = normalizeFlight(code);
  return useQuery({ queryKey: ['flight', c], queryFn: () => flightApi.live(c), enabled: isFlightCode(c) });
}

export function useRouteFlights(origin, destination, enabled = true) {
  return useQuery({
    queryKey: ['route', origin, destination],
    queryFn: () => flightApi.route(origin, destination),
    enabled: enabled && /^[A-Z]{3}$/.test(origin ?? '') && /^[A-Z]{3}$/.test(destination ?? ''),
  });
}

/** Debounced airport autocomplete (code, city or name). */
export function useAirportSearch(query) {
  const q = useDebounce(String(query ?? '').trim(), 200);
  return useQuery({ queryKey: ['airports', q], queryFn: () => flightApi.airports(q), staleTime: 60 * 60 * 1000 });
}

export function useHistoricalSearch(params, enabled) {
  return useQuery({ queryKey: ['historical', params], queryFn: () => flightApi.historical(params), enabled });
}

export const useOverview = () => useQuery({ queryKey: ['overview'], queryFn: analyticsApi.overview });
export const useTrends = (params) => useQuery({ queryKey: ['trends', params], queryFn: () => analyticsApi.trends(params), placeholderData: (prev) => prev });
export const useRiskMap = (minFlights) => useQuery({ queryKey: ['riskmap', minFlights], queryFn: () => analyticsApi.riskMap(minFlights) });
export const useModelsCompare = () => useQuery({ queryKey: ['models-compare'], queryFn: analyticsApi.modelsCompare });
