import { createTransportProvider, type LinkOptions, type TransportProvider } from './link.js';
import { checkFeedUrl } from './observations.js';

// REST polling (ADR-0029 §4): GET the feed on an interval. One request at a time; a failed or timed-out
// request takes the link down, and polling resumes after the backoff.

export interface RestProviderOptions extends LinkOptions {
  /** http: or https:, returning a JSON batch (see README.md). */
  url: string | URL;
  /** Wait between the end of one poll and the next. Default 2 s. */
  intervalMs?: number;
  /** Default 5 s. */
  timeoutMs?: number;
  /** Default the global fetch. Wrap it to add authentication headers. */
  fetch?: typeof fetch;
}

export function createRestProvider(options: RestProviderOptions): TransportProvider {
  const url = checkFeedUrl(options.url, ['http:', 'https:']);
  const doFetch = options.fetch ?? ((input, init) => fetch(input, init));
  const intervalMs = options.intervalMs ?? 2_000;
  const timeoutMs = options.timeoutMs ?? 5_000;
  return createTransportProvider(({ opened, message, failed }) => {
    let stopped = false;
    let next: ReturnType<typeof setTimeout> | undefined;
    let abort: AbortController | undefined;
    const poll = async () => {
      const controller = (abort = new AbortController());
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);
      try {
        const response = await doFetch(url, { signal: controller.signal, cache: 'no-store', headers: { accept: 'application/json' } });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const text = await response.text();
        if (stopped) return;
        opened();
        message(text);
        next = setTimeout(poll, intervalMs);
      } catch (error) {
        if (!stopped) failed(timedOut ? `no answer within ${timeoutMs} ms` : error instanceof Error ? error.message : String(error));
      } finally {
        clearTimeout(timer);
      }
    };
    void poll();
    return () => {
      stopped = true;
      if (next !== undefined) clearTimeout(next);
      abort?.abort();
    };
  }, options);
}
