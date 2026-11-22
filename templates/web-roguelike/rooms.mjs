export const ROOM_TEMPLATES = [
  {
    id: 'entry',
    name: 'Entry Hall',
    reward: 5,
    shop: false,
    event: 'none',
    enemies: [
      { x: 10, y: 5 },
      { x: 17, y: 7 },
      { x: 7, y: 10 },
    ],
  },
  {
    id: 'market',
    name: 'Ash Market',
    reward: 6,
    shop: true,
    event: 'cache',
    enemies: [
      { x: 6, y: 6 },
      { x: 12, y: 5 },
      { x: 18, y: 8 },
      { x: 9, y: 10 },
    ],
  },
  {
    id: 'vault',
    name: 'Vault',
    reward: 8,
    shop: false,
    event: 'ambush',
    enemies: [
      { x: 5, y: 4 },
      { x: 14, y: 6 },
      { x: 20, y: 9 },
      { x: 8, y: 9 },
      { x: 18, y: 4 },
    ],
  },
];

export const RELICS = [
  { id: 'ember', name: 'Ember', cost: 5, maxHp: 0, score: 2, moveDelay: 0 },
  { id: 'ward', name: 'Ward', cost: 5, maxHp: 20, score: 0, moveDelay: 0 },
  { id: 'swift', name: 'Swift', cost: 5, maxHp: 0, score: 0, moveDelay: 0.02 },
];

export function buildRooms(seed = 42) {
  const offset = Math.abs(Math.trunc(Number(seed) || 42)) % ROOM_TEMPLATES.length;
  return [0, 1, 2].map((index) => ({
    ...ROOM_TEMPLATES[(offset + index) % ROOM_TEMPLATES.length],
    difficulty: index + 1,
  }));
}

export function roomShop(room) {
  if (!room?.shop) return [];
  return RELICS.map((relic) => ({ ...relic }));
}
