export const LANDING_STAGE_COPY = {
  protocol: '[ON_AIR // READY]',
  primaryAction: 'TIME TO PLAY',
  secondaryAction: 'CAN U WIN?',
} as const;

export const LATENCY_READOUT = {
  minMs: 8,
  maxMs: 20,
  initialMs: 12,
  updateIntervalMs: 2500,
} as const;
