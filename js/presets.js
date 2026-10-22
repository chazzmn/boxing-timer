// Built-in sessions. Times in seconds.
export const BUILT_IN = [
  { id: 'amateur', name: 'Amateur 3 × 3', rounds: 3, work: 180, rest: 60 },
  { id: 'pro', name: 'Pro 12 × 3', rounds: 12, work: 180, rest: 60 },
  { id: 'womens', name: "Women's pro 10 × 2", rounds: 10, work: 120, rest: 60 },
  { id: 'kids', name: 'Kids 3 × 1:30', rounds: 3, work: 90, rest: 60 },
  { id: 'sparring', name: 'Sparring 6 × 3', rounds: 6, work: 180, rest: 60 },
  { id: 'bag', name: 'Heavy bag 5 × 3', rounds: 5, work: 180, rest: 30 },
  { id: 'shadow', name: 'Shadowboxing 3 × 3', rounds: 3, work: 180, rest: 30, restLabel: 'Breathe' },
  { id: 'skip', name: 'Skipping 3 × 3', rounds: 3, work: 180, rest: 30 },
  { id: 'hiit', name: 'HIIT 8 × 30', rounds: 8, work: 30, rest: 15, clapper: 5, secondsOut: 5 }
].map(p => Object.assign({ builtIn: true, prepare: 10, clapper: 10, secondsOut: 10, marker: 0, warmup: 0, cooldown: 0, restLabel: '' }, p));
