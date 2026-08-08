export const NETWORK = {
  presenceSendHz: 15,
  presenceHeartbeatMs: 600,
  worldSnapshotHz: 15,
  bossSimulationHz: 20,
  bossSnapshotHz: 8,
  bossDamageBroadcastHz: 12,
  remoteSmoothRate: 18,
  bossSmoothRate: 16,
  teleportSnapDistance: 420,
  movementEpsilon: .6,
} as const;

export type NetworkPosition = { x: number; y: number };

export function smoothingAlpha(rate: number, deltaSeconds: number) {
  return 1 - Math.exp(-Math.max(0, rate) * Math.max(0, Math.min(.1, deltaSeconds)));
}

export function smoothPosition(current: NetworkPosition, target: NetworkPosition, rate: number, deltaSeconds: number, snapDistance: number = NETWORK.teleportSnapDistance) {
  const dx = target.x - current.x, dy = target.y - current.y;
  if (Math.hypot(dx, dy) >= snapDistance) return { x: target.x, y: target.y, snapped: true };
  const alpha = smoothingAlpha(rate, deltaSeconds);
  return { x: current.x + dx * alpha, y: current.y + dy * alpha, snapped: false };
}

export function positionChanged(previous: NetworkPosition | null, next: NetworkPosition, epsilon: number = NETWORK.movementEpsilon) {
  return !previous || Math.abs(previous.x - next.x) >= epsilon || Math.abs(previous.y - next.y) >= epsilon;
}
