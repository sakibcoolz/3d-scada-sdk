import { createTransportProvider, type LinkOptions, type TransportProvider } from './link.js';
import { checkFeedUrl } from './observations.js';

// WebSocket (ADR-0029 §4). Read only: nothing is ever sent on the socket. Each text message is a JSON
// batch; binary messages are dropped as NOT_TEXT.

/** The parts of the browser's WebSocket used here. */
export interface WebSocketLike {
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  close(code?: number, reason?: string): void;
}
export type WebSocketFactory = new (url: string, protocols?: string | string[]) => WebSocketLike;

export interface WebSocketProviderOptions extends LinkOptions {
  /** ws: or wss: */
  url: string | URL;
  protocols?: string | string[];
  /** Default the global WebSocket. */
  WebSocket?: WebSocketFactory;
}

export function createWebSocketProvider(options: WebSocketProviderOptions): TransportProvider {
  const url = checkFeedUrl(options.url, ['ws:', 'wss:']);
  const Socket = options.WebSocket ?? (globalThis as { WebSocket?: WebSocketFactory }).WebSocket;
  if (!Socket) throw new Error('WebSocket is not available here.');
  return createTransportProvider(({ opened, message, failed }) => {
    const socket = new Socket(url.href, options.protocols);
    socket.onopen = () => opened();
    socket.onmessage = (event) => message(event.data);
    socket.onerror = () => failed('socket error');
    socket.onclose = (event) => failed(`socket closed (${event.code})`);
    return () => {
      socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null;
      socket.close(1000);
    };
  }, options);
}
