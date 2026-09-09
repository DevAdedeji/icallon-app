import { z } from 'zod';
import { CATEGORY_PACKS } from '@/features/game/category-packs';

export const ROUND_OPTIONS = [3, 5, 7, 10] as const;
export const TIMER_OPTIONS = [30, 60, 90, 120] as const;
export const CATEGORY_PACK_IDS = [...CATEGORY_PACKS.map((pack) => pack.id), 'custom'] as const;

const categoryLabelSchema = z.string().trim().min(1, 'Enter all four category names').max(24, 'Keep category names under 25 characters');

export const roomSettingsSchema = z.object({
  maxRounds: z.number().int().refine(
    (value) => ROUND_OPTIONS.includes(value as (typeof ROUND_OPTIONS)[number]),
    'Choose a supported number of rounds',
  ),
  timePerRound: z.number().int().refine(
    (value) => TIMER_OPTIONS.includes(value as (typeof TIMER_OPTIONS)[number]),
    'Choose a supported round timer',
  ),
  categoryPack: z.enum(CATEGORY_PACK_IDS),
  categoryLabels: z.array(categoryLabelSchema).length(4),
}).superRefine((settings, context) => {
  if (settings.categoryPack !== 'custom') return;
  const normalized = settings.categoryLabels.map((label) => label.toLocaleLowerCase());
  if (new Set(normalized).size !== 4) {
    context.addIssue({ code: 'custom', path: ['categoryLabels'], message: 'Custom categories must be different' });
  }
});

export const roomCodeSchema = z.string()
  .trim()
  .toUpperCase()
  .regex(/^[A-HJ-NP-Z2-9]{6}$/, 'Enter a valid 6-character room code');

export type RoomSettings = z.infer<typeof roomSettingsSchema>;
