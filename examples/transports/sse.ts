import { createTransportProvider, type LinkOptions, type TransportProvider } from './link.js';
import { checkFeedUrl } from './observations.js';

// Server-Sent Events (ADR-0029 §4). The browser's own EventSource retry is not used: on an error the
// stream is closed, so reconnection follows the same capped backoff as the other transports.

/** The parts of the browser's EventSource used here. */
export interface EventSourceLike {
  onopen: ((event: Event) => void) | null;
  onerror: ((event: Event) => void) | null;
  addEventListener(type: string, listener: (event: MessageEvent) => void): void;
  close(): void;
}
export type EventSourceFactory = new (url: string, init?: { withCredentials?: boolean }) => EventSourceLike;

export interface SseProviderOptions extends LinkOptions {
  /** http: or https:; each event's data is a JSON batch (see README.md). */
  url: string | URL;
  /** Event name carrying batches. Default "message", the unnamed event. */
  event?: string;
  /** Send cookies to another origin. Default false. */
  withCredentials?: boolean;
  /** Default the global EventSource. */
  EventSource?: EventSourceFactory;
}

export function createSseProvider(options: SseProviderOptions): TransportProvider {
  const url = checkFeedUrl(options.url, ['http:', 'https:']);
  const Source = options.EventSource ?? (globalThis as { EventSource?: EventSourceFactory }).EventSource;
  if (!Source) throw new Error('EventSource is not available here.');
  return createTransportProvider(({ opened, message, failed }) => {
    const source = new Source(url.href, { withCredentials: options.withCredentials ?? false });
    source.onopen = () => opened();
    source.onerror = () => failed('event stream error');
    source.addEventListener(options.event ?? 'message', (event) => message(event.data));
    return () => {
      source.onopen = null;
      source.onerror = null;
      source.close();
    };
  }, options);
}
