import { z } from 'zod';

export const ROUND_OPTIONS = [3, 5, 7, 10] as const;
export const TIMER_OPTIONS = [30, 60, 90, 120] as const;

export const roomSettingsSchema = z.object({
  maxRounds: z.number().int().refine(
    (value) => ROUND_OPTIONS.includes(value as (typeof ROUND_OPTIONS)[number]),
    'Choose a supported number of rounds',
  ),
  timePerRound: z.number().int().refine(
    (value) => TIMER_OPTIONS.includes(value as (typeof TIMER_OPTIONS)[number]),
    'Choose a supported round timer',
  ),
});

export const roomCodeSchema = z.string()
  .trim()
  .toUpperCase()
  .regex(/^[A-HJ-NP-Z2-9]{6}$/, 'Enter a valid 6-character room code');

export type RoomSettings = z.infer<typeof roomSettingsSchema>;
