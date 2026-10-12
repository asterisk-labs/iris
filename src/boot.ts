/**
 * Data the Flask templates hand to the page, as JSON in
 * <script type="application/json"> elements:
 *
 *   #iris-urls  (base.html)       application URLs from url_for
 *   #iris-page  (segmentation)    image id and location, debug flag
 */

import { AppUrls, setAppUrls } from './services/http';

export interface PageBoot {
  imageId: string | null;
  imageLocation: [number, number];
  debug: boolean;
}

function readJson<T>(id: string): T | null {
  const element = typeof document !== 'undefined' ? document.getElementById(id) : null;
  if (!element?.textContent) return null;
  try {
    return JSON.parse(element.textContent) as T;
  } catch {
    console.error(`[IRIS] Could not parse #${id}`);
    return null;
  }
}

/** Read the application URLs (if the page provides them) and configure the API clients. */
export function bootUrls(): AppUrls | null {
  const urls = readJson<AppUrls>('iris-urls');
  if (urls) setAppUrls(urls);
  return urls;
}

export function bootPage(): PageBoot {
  const page = readJson<{ image_id?: string | null; image_location?: [number, number]; debug?: boolean }>('iris-page');
  return {
    imageId: page?.image_id ?? null,
    imageLocation: page?.image_location ?? [0, 0],
    debug: !!page?.debug,
  };
}

/**
 * Stores exposed as `window.__IRIS__` for end-to-end tests and debugging
 * in the browser console. Nothing in the application reads it.
 */
export interface DebugHandle {
  segmentationStore: unknown;
  viewManagerStore: unknown;
}

declare global {
  interface Window {
    __IRIS__?: DebugHandle;
  }
}

export function exposeDebugHandle(handle: DebugHandle): void {
  window.__IRIS__ = handle;
}
