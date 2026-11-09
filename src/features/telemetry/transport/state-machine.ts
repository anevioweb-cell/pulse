import type { ConnectionState } from '../model/connection';

/**
 * Allowed transitions of the WebSocket connection state machine. Anything not listed is a bug:
 * `assertTransition` throws, so an illegal transition can never happen silently.
 *
 *   idle ─connect─▶ connecting ─open─▶ open
 *   idle ─invalid URL─▶ failed
 *   connecting ─error/close/timeout─▶ reconnecting | failed (attempts exhausted)
 *   open ─close/heartbeat timeout─▶ reconnecting
 *   reconnecting ─timer─▶ connecting
 *   reconnecting ─attempts exhausted─▶ failed
 *   connecting | open | reconnecting ─disconnect─▶ closed
 *   closed | failed ─connect─▶ connecting
 */
export const TRANSITIONS: ReadonlyMap<ConnectionState, readonly ConnectionState[]> = new Map<
  ConnectionState,
  readonly ConnectionState[]
>([
  ['idle', ['connecting', 'failed']],
  ['connecting', ['open', 'reconnecting', 'failed', 'closed']],
  ['open', ['reconnecting', 'closed']],
  ['reconnecting', ['connecting', 'failed', 'closed']],
  ['closed', ['connecting', 'failed']],
  ['failed', ['connecting']],
]);

export function canTransition(from: ConnectionState, to: ConnectionState): boolean {
  return TRANSITIONS.get(from)?.includes(to) ?? false;
}

export function assertTransition(from: ConnectionState, to: ConnectionState): void {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal connection state transition: ${from} -> ${to}`);
  }
}
