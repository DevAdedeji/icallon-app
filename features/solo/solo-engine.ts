import type { AnswerValues } from '@/lib/game';
import type { CategoryPackId } from '@/features/game/category-packs';

export type SoloDifficulty = 'easy' | 'medium' | 'hard';
export type SoloModeRules = {
  label: string;
  detail: string;
  roundCount: number;
  secondsPerRound: number;
};

export const SOLO_MODE_RULES: Record<SoloDifficulty, SoloModeRules> = {
  easy: { label: 'Relaxed', detail: '3 rounds · 90 seconds each', roundCount: 3, secondsPerRound: 90 },
  medium: { label: 'Classic', detail: '4 rounds · 60 seconds each', roundCount: 4, secondsPerRound: 60 },
  hard: { label: 'Blitz', detail: '5 rounds · 40 seconds each', roundCount: 5, secondsPerRound: 40 },
};
export type SoloRoundScore = {
  playerPoints: number;
  opponentPoints: number;
  playerCategoryPoints: Record<keyof AnswerValues, number>;
  opponentCategoryPoints: Record<keyof AnswerValues, number>;
};

type PackAnswers = Record<string, [string, string, string, string]>;

const ANSWERS: Record<Exclude<CategoryPackId, 'custom'>, PackAnswers> = {
  classic: {
    A: ['Amara', 'Antelope', 'Accra', 'Anchor'], B: ['Bola', 'Bear', 'Berlin', 'Bottle'],
    C: ['Chidi', 'Cat', 'Cairo', 'Camera'], D: ['Dayo', 'Dog', 'Dublin', 'Drum'],
    E: ['Emma', 'Eagle', 'Enugu', 'Envelope'], F: ['Femi', 'Fox', 'Florence', 'Fork'],
    G: ['Grace', 'Goat', 'Geneva', 'Guitar'], H: ['Hassan', 'Horse', 'Havana', 'Hammer'],
    L: ['Lola', 'Lion', 'Lagos', 'Lamp'], M: ['Musa', 'Monkey', 'Madrid', 'Mirror'],
    P: ['Peter', 'Panda', 'Paris', 'Pencil'], S: ['Sarah', 'Snake', 'Seoul', 'Spoon'],
    T: ['Tobi', 'Tiger', 'Tokyo', 'Table'],
  },
  world: {
    A: ['Angola', 'Abuja', 'Arc de Triomphe', 'Arabic'], B: ['Brazil', 'Boston', 'Big Ben', 'Bengali'],
    C: ['Canada', 'Cairo', 'Colosseum', 'Chinese'], D: ['Denmark', 'Dubai', 'Disneyland', 'Dutch'],
    E: ['Egypt', 'Edinburgh', 'Eiffel Tower', 'English'], F: ['France', 'Florence', 'Forbidden City', 'French'],
    G: ['Ghana', 'Geneva', 'Golden Gate Bridge', 'German'], H: ['Hungary', 'Havana', 'Hollywood Sign', 'Hindi'],
    L: ['Lebanon', 'Lagos', 'London Eye', 'Latin'], M: ['Mexico', 'Madrid', 'Mount Rushmore', 'Malay'],
    P: ['Portugal', 'Paris', 'Petra', 'Polish'], S: ['Spain', 'Seoul', 'Stonehenge', 'Spanish'],
    T: ['Thailand', 'Tokyo', 'Taj Mahal', 'Turkish'],
  },
  food: {
    A: ['Apple pie', 'Apple juice', 'Avocado', 'Amala Skye'], B: ['Burger', 'Bubble tea', 'Basil', 'Burger King'],
    C: ['Curry', 'Coffee', 'Cinnamon', 'Chipotle'], D: ['Doughnut', 'Daiquiri', 'Dill', 'Dominos'],
    E: ['Egusi', 'Espresso', 'Egg', 'Eat n Go'], F: ['Fries', 'Fanta', 'Flour', 'Five Guys'],
    G: ['Granola', 'Ginger ale', 'Garlic', 'Gusto'], H: ['Hotdog', 'Horchata', 'Honey', 'Hard Rock Cafe'],
    L: ['Lasagna', 'Lemonade', 'Lentil', 'Leon'], M: ['Meat pie', 'Milkshake', 'Mint', 'McDonalds'],
    P: ['Pizza', 'Punch', 'Pepper', 'Pizza Hut'], S: ['Suya', 'Smoothie', 'Salt', 'Subway'],
    T: ['Tacos', 'Tea', 'Thyme', 'Tantalizers'],
  },
  entertainment: {
    A: ['Avatar', 'Africa', 'Adele', 'Aladdin'], B: ['Barbie', 'Believe', 'Burna Boy', 'Batman'],
    C: ['Casablanca', 'Calm Down', 'Cardi B', 'Cinderella'], D: ['Dune', 'Diamonds', 'Drake', 'Deadpool'],
    E: ['Encanto', 'Easy on Me', 'Ed Sheeran', 'Elsa'], F: ['Frozen', 'Flowers', 'Fireboy', 'Frodo'],
    G: ['Gladiator', 'Gods Plan', 'Genevieve Nnaji', 'Groot'], H: ['Home Alone', 'Halo', 'Harry Styles', 'Hulk'],
    L: ['Lion King', 'Last Last', 'Lupita Nyongo', 'Loki'], M: ['Moana', 'Monalisa', 'Michael Jackson', 'Mario'],
    P: ['Parasite', 'Perfect', 'Phyno', 'Peter Pan'], S: ['Shrek', 'Shake It Off', 'Seyi Vibez', 'Superman'],
    T: ['Titanic', 'Thriller', 'Tems', 'Thor'],
  },
};

const KEYS = ['name', 'animal', 'place', 'thing'] as const;

function seededNumber(seed: string): number {
  let value = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    value ^= seed.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

export function soloLetters(pack: Exclude<CategoryPackId, 'custom'>, seed: string, count = 3): string[] {
  const letters = Object.keys(ANSWERS[pack]);
  return [...letters]
    .sort((left, right) => seededNumber(`${seed}:${left}`) - seededNumber(`${seed}:${right}`))
    .slice(0, count);
}

export function computerAnswers(
  pack: Exclude<CategoryPackId, 'custom'>,
  letter: string,
): AnswerValues {
  const row = ANSWERS[pack][letter] ?? ['', '', '', ''];
  return {
    name: row[0],
    animal: row[1],
    place: row[2],
    thing: row[3],
  };
}

function startsWithLetter(value: string, letter: string): boolean {
  return value.trim().slice(0, 1).toLocaleUpperCase() === letter.toLocaleUpperCase();
}

export function scoreSoloRound(player: AnswerValues, opponent: AnswerValues, letter: string): SoloRoundScore {
  const playerCategoryPoints = { name: 0, animal: 0, place: 0, thing: 0 };
  const opponentCategoryPoints = { name: 0, animal: 0, place: 0, thing: 0 };

  for (const key of KEYS) {
    const playerValid = startsWithLetter(player[key], letter);
    const opponentValid = startsWithLetter(opponent[key], letter);
    const duplicate = playerValid && opponentValid
      && player[key].trim().replace(/\s+/g, ' ').toLocaleLowerCase()
       === opponent[key].trim().replace(/\s+/g, ' ').toLocaleLowerCase();
    playerCategoryPoints[key] = playerValid ? (duplicate ? 5 : 10) : 0;
    opponentCategoryPoints[key] = opponentValid ? (duplicate ? 5 : 10) : 0;
  }

  return {
    playerPoints: Object.values(playerCategoryPoints).reduce((sum, points) => sum + points, 0),
    opponentPoints: Object.values(opponentCategoryPoints).reduce((sum, points) => sum + points, 0),
    playerCategoryPoints,
    opponentCategoryPoints,
  };
}
