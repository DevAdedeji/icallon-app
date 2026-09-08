import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters').max(72, 'Password is too long'),
});

export type LoginFormInputs = z.infer<typeof loginSchema>;

export const signUpSchema = z.object({
  email: z.string().trim().toLowerCase().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters').max(72, 'Password is too long'),
  username: z.string().trim().min(3, 'Username must be at least 3 characters').max(24, 'Username must be at most 24 characters'),
});

export type SignUpFormInputs = z.infer<typeof signUpSchema>;
