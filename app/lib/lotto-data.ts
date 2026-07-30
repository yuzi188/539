export type Draw = {
  period: string;
  date: string;
  numbers: number[];
  source?: string;
};

export const seedHistory: Draw[] = [
  { period: "115000184", date: "2026/07/30", numbers: [4, 7, 8, 16, 38], source: "seed" },
  { period: "115000183", date: "2026/07/29", numbers: [5, 14, 32, 33, 36], source: "seed" },
  { period: "115000182", date: "2026/07/28", numbers: [5, 8, 13, 23, 31], source: "seed" },
  { period: "115000181", date: "2026/07/27", numbers: [2, 9, 11, 17, 30], source: "seed" },
  { period: "115000180", date: "2026/07/26", numbers: [6, 15, 18, 25, 39], source: "seed" },
  { period: "115000179", date: "2026/07/25", numbers: [1, 12, 19, 28, 35], source: "seed" },
  { period: "115000178", date: "2026/07/23", numbers: [12, 14, 19, 25, 26], source: "seed" },
  { period: "115000177", date: "2026/07/22", numbers: [3, 10, 16, 21, 37], source: "seed" },
  { period: "115000176", date: "2026/07/21", numbers: [7, 11, 20, 24, 32], source: "seed" },
  { period: "115000175", date: "2026/07/20", numbers: [4, 9, 18, 27, 34], source: "seed" },
  { period: "115000174", date: "2026/07/19", numbers: [6, 13, 22, 29, 38], source: "seed" },
  { period: "115000173", date: "2026/07/18", numbers: [8, 15, 17, 26, 33], source: "seed" },
  { period: "115000172", date: "2026/07/17", numbers: [2, 10, 21, 30, 36], source: "seed" },
  { period: "115000171", date: "2026/07/16", numbers: [1, 5, 14, 23, 31], source: "seed" },
  { period: "115000170", date: "2026/07/15", numbers: [3, 12, 20, 28, 39], source: "seed" },
  { period: "115000169", date: "2026/07/14", numbers: [7, 16, 24, 29, 35], source: "seed" },
  { period: "115000168", date: "2026/07/13", numbers: [9, 18, 22, 27, 34], source: "seed" },
  { period: "115000167", date: "2026/07/12", numbers: [6, 11, 15, 25, 37], source: "seed" },
  { period: "115000166", date: "2026/07/11", numbers: [4, 13, 19, 30, 32], source: "seed" },
  { period: "115000165", date: "2026/07/10", numbers: [2, 8, 17, 26, 38], source: "seed" },
];

export function normalizeDraws(draws: Draw[]) {
  return draws
    .map((draw) => ({
      ...draw,
      numbers: [...draw.numbers].sort((a, b) => a - b),
    }))
    .sort((a, b) => b.date.localeCompare(a.date) || b.period.localeCompare(a.period));
}
