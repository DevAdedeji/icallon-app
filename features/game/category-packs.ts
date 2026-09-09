import type { AnswerValues } from '@/lib/game';

export type CategoryKey = keyof AnswerValues;
export type CategoryPackId = 'classic' | 'world' | 'food' | 'entertainment' | 'custom';

export type CategoryPack = {
  id: Exclude<CategoryPackId, 'custom'>;
  name: string;
  description: string;
  labels: [string, string, string, string];
};

export const CATEGORY_KEYS: CategoryKey[] = ['name', 'animal', 'place', 'thing'];

export const CATEGORY_PACKS: CategoryPack[] = [
  { id: 'classic', name: 'Classic', description: 'The original quick-thinking mix.', labels: ['Name', 'Animal', 'Place', 'Thing'] },
  { id: 'world', name: 'Around the world', description: 'Geography, culture, and travel.', labels: ['Country', 'City', 'Landmark', 'Language'] },
  { id: 'food', name: 'Food fight', description: 'For hungry and creative groups.', labels: ['Food', 'Drink', 'Ingredient', 'Restaurant'] },
  { id: 'entertainment', name: 'Pop culture', description: 'Movies, music, stars, and stories.', labels: ['Movie', 'Song', 'Celebrity', 'Character'] },
];

export const DEFAULT_CATEGORY_LABELS = CATEGORY_PACKS[0].labels;

export function categoryLabels(
  packId: string | null | undefined,
  storedLabels: unknown,
): [string, string, string, string] {
  if (packId === 'custom' && Array.isArray(storedLabels) && storedLabels.length === 4) {
    const labels = storedLabels.map((label) => String(label).trim());
    if (labels.every((label) => label.length > 0 && label.length <= 24)) {
      return labels as [string, string, string, string];
    }
  }
  return CATEGORY_PACKS.find((pack) => pack.id === packId)?.labels ?? DEFAULT_CATEGORY_LABELS;
}

export function categoryEntries(
  packId: string | null | undefined,
  storedLabels: unknown,
): Array<{ key: CategoryKey; label: string }> {
  const labels = categoryLabels(packId, storedLabels);
  return CATEGORY_KEYS.map((key, index) => ({ key, label: labels[index] }));
}

export function categoryPackName(packId: string | null | undefined): string {
  if (packId === 'custom') return 'Custom mix';
  return CATEGORY_PACKS.find((pack) => pack.id === packId)?.name ?? 'Classic';
}
