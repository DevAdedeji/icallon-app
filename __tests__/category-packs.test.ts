import { categoryEntries, categoryLabels, categoryPackName } from '@/features/game/category-packs';

describe('category packs', () => {
  it('maps stable answer slots to a selected pack', () => {
    expect(categoryEntries('food', null)).toEqual([
      { key: 'name', label: 'Food' },
      { key: 'animal', label: 'Drink' },
      { key: 'place', label: 'Ingredient' },
      { key: 'thing', label: 'Restaurant' },
    ]);
  });

  it('accepts safe custom labels and falls back for invalid stored data', () => {
    expect(categoryLabels('custom', ['Brand', 'Job', 'Sport', 'App'])).toEqual(['Brand', 'Job', 'Sport', 'App']);
    expect(categoryLabels('custom', ['Only one'])).toEqual(['Name', 'Animal', 'Place', 'Thing']);
  });

  it('provides a friendly pack name', () => {
    expect(categoryPackName('entertainment')).toBe('Pop culture');
    expect(categoryPackName('custom')).toBe('Custom mix');
  });
});
