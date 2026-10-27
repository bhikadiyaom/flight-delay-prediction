import { z } from 'zod';

const email = z.string().trim().toLowerCase().email().max(254);

export const registerSchema = {
  body: z.object({
    name: z.string().trim().min(2).max(60),
    email,
    // 8-72 chars (bcrypt truncates at 72 bytes), at least one letter and one digit
    password: z.string().min(8).max(72).regex(/[A-Za-z]/, 'must contain a letter').regex(/\d/, 'must contain a digit'),
  }),
};

export const loginSchema = {
  body: z.object({ email, password: z.string().min(1).max(72) }),
};

export const updateMeSchema = {
  body: z
    .object({
      name: z.string().trim().min(2).max(60).optional(),
      preferences: z
        .object({ theme: z.enum(['light', 'dark', 'system']).optional(), alertsEnabled: z.boolean().optional() })
        .optional(),
    })
    .refine((b) => b.name !== undefined || b.preferences !== undefined, { message: 'nothing to update' }),
};
