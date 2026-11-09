// Seedable pseudo-random number generator (mulberry32): tiny, fast, and good enough for
// simulation. Not for cryptography.

const UINT32_RANGE = 0x1_0000_0000; // 2^32
const MULBERRY_INCREMENT = 0x6d2b79f5;
const SHIFT_A = 15;
const SHIFT_B = 7;
const SHIFT_C = 14;
const MIX = 61;
/** Golden-ratio constant used to derive independent per-stream seeds. */
const GOLDEN_RATIO_32 = 0x9e3779b9;

export type Random = () => number;

/** Returns a generator of floats in [0, 1), fully determined by `seed`. */
export function mulberry32(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state = (state + MULBERRY_INCREMENT) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> SHIFT_A), t | 1);
    t ^= t + Math.imul(t ^ (t >>> SHIFT_B), t | MIX);
    return ((t ^ (t >>> SHIFT_C)) >>> 0) / UINT32_RANGE;
  };
}

/** Seed for an independent stream `index` derived from a base seed. */
export function deriveSeed(seed: number, index: number): number {
  return (seed ^ Math.imul(index + 1, GOLDEN_RATIO_32)) >>> 0;
}

/** Uniform float in [min, max). */
export const uniform = (random: Random, min: number, max: number) => min + random() * (max - min);

const TWO = 2;
/** A full turn in radians (2π). */
export const TAU = TWO * Math.PI;

/** Standard normal sample (Box-Muller). */
export function gaussian(random: Random): number {
  const u = 1 - random(); // (0, 1], avoids log(0)
  const v = random();
  return Math.sqrt(-TWO * Math.log(u)) * Math.cos(TAU * v);
}
