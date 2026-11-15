import { z } from 'zod';
import { CATEGORIES, STATES } from './constants';
import { formatGSTIN, validateGSTIN } from './gstin';
export const firmInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    phone: z.string().regex(/^\d{10}$/),
    category: z.enum(CATEGORIES),
    stateCode: z.string().refine((value) => STATES.some((state) => state.code === value)),
    gstin: z
      .string()
      .transform(formatGSTIN)
      .refine((value) => !value || validateGSTIN(value)),
    pan: z
      .string()
      .toUpperCase()
      .refine((value) => !value || /^[A-Z]{5}\d{4}[A-Z]$/.test(value)),
    address: z.string().max(1000),
    email: z.string().refine((value) => !value || z.email().safeParse(value).success),
    bankName: z.string().max(100),
    accountNumber: z.string().regex(/^\d{6,20}$|^$/),
    ifsc: z
      .string()
      .toUpperCase()
      .regex(/^[A-Z]{4}0[A-Z0-9]{6}$|^$/),
    upiId: z.string().regex(/^[\w.-]+@[\w.-]+$|^$/),
    demo: z.boolean(),
  })
  .refine((value) => !value.gstin || value.gstin.slice(0, 2) === value.stateCode, {
    path: ['stateCode'],
  })
  .refine((value) => !value.gstin || !value.pan || value.gstin.slice(2, 12) === value.pan, {
    path: ['pan'],
  });
