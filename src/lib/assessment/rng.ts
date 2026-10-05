/** Детерминированный генератор (mulberry32): попытку можно восстановить по seed. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Хэш строки — чтобы перестановка вариантов задания зависела от seed попытки и id задания. */
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function shuffle<T>(arr: readonly T[], next: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Перестановка индексов 0…n−1 для задания в попытке: одинакова при каждом открытии попытки. */
export function permutation(seed: number, itemId: string, n: number): number[] {
  const idx = Array.from({ length: n }, (_, i) => i);
  let p = shuffle(idx, rng(seed ^ hashString(itemId)));
  // Для порядка и сопоставления не показываем правильную расстановку как стартовую.
  if (n > 1 && p.every((v, i) => v === i)) p = [...p.slice(1), p[0]];
  return p;
}

export const newSeed = () => (Math.random() * 2 ** 32) >>> 0;
