import { z } from 'zod';
import { flightCode, iata } from './predictionValidator.js';

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'invalid id');
export const idParams = { params: z.object({ id: objectId }) };

const alert = z.object({ enabled: z.boolean().optional(), threshold: z.number().min(0.05).max(0.95).optional() }).strict();

export const createSavedSearchSchema = {
  body: z
    .object({
      type: z.enum(['route', 'flight', 'airport']),
      label: z.string().trim().min(1).max(80),
      origin: iata.optional(),
      destination: iata.optional(),
      airline: z.string().trim().min(2).max(60).optional(),
      flightNumber: flightCode.optional(),
      isFavorite: z.boolean().optional(),
      alert: alert.optional(),
    })
    .superRefine((b, ctx) => {
      const need = (cond, path, message) => cond || ctx.addIssue({ code: 'custom', path: [path], message });
      if (b.type === 'route') {
        need(b.origin, 'origin', 'required for route searches');
        need(b.destination, 'destination', 'required for route searches');
      }
      if (b.type === 'flight') need(b.flightNumber, 'flightNumber', 'required for flight searches');
      if (b.type === 'airport') need(b.origin, 'origin', 'required for airport searches');
      // alerts evaluate a real upcoming flight, so airport searches cannot have one
      if (b.type === 'airport') need(!b.alert?.enabled, 'alert', 'alerts are only available for route and flight searches');
    }),
};

export const patchSavedSearchSchema = {
  ...idParams,
  body: z
    .object({ label: z.string().trim().min(1).max(80).optional(), isFavorite: z.boolean().optional(), alert: alert.optional() })
    .strict()
    .refine((b) => Object.keys(b).length > 0, { message: 'nothing to update' }),
};

export const listSavedSearchSchema = {
  query: z.object({
    type: z.enum(['route', 'flight', 'airport']).optional(),
    favorite: z.enum(['true', 'false']).optional().transform((v) => (v === undefined ? undefined : v === 'true')),
  }),
};
