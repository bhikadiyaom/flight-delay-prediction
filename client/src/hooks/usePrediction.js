import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { predictionApi } from '../api/predictionApi.js';

/** Manual what-if prediction (POST /predictions). */
export const useManualPrediction = () => useMutation({ mutationFn: predictionApi.manual });

/** Live prediction for a flight code (POST /predictions/live). */
export const useLivePrediction = () => useMutation({ mutationFn: predictionApi.live });

/** CSV bulk upload; invalidates the caller's history so it shows up in Profile. */
export function useBulkPrediction() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: predictionApi.bulk, onSuccess: () => qc.invalidateQueries({ queryKey: ['history'] }) });
}

export const usePredictionHistory = (params) =>
  useQuery({ queryKey: ['history', params], queryFn: () => predictionApi.history(params), placeholderData: (prev) => prev });
