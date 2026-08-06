/**
 * pokemon-cards-css helpers/Math.js 포팅
 */

export function round(value: number, precision = 3): number {
  return parseFloat(value.toFixed(precision));
}

export function clamp(value: number, min = 0, max = 100): number {
  return Math.min(Math.max(value, min), max);
}
