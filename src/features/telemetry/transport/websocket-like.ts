/** The subset of the WHATWG WebSocket API the transport uses (browser and Node >= 22 globals). */
export interface WebSocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: 'open' | 'error', listener: () => void): void;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  addEventListener(
    type: 'close',
    listener: (event: { code: number; reason: string }) => void,
  ): void;
}

export type WebSocketConstructor = new (url: string) => WebSocketLike;

/** WHATWG `WebSocket.OPEN`. */
export const WEBSOCKET_READY_STATE_OPEN = 1;
