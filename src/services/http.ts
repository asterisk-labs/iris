/**
 * Shared bits for the segmentation API clients: the base URLs (set once
 * at start-up from the page) and typed errors.
 */

export interface AppUrls {
  main: string;
  segmentation: string;
  user: string;
  admin: string;
}

let urls: AppUrls = {
  main: '/',
  segmentation: '/segmentation/',
  user: '/user/',
  admin: '/admin/',
};

export function setAppUrls(next: AppUrls): void {
  urls = { ...next };
}

export function appUrls(): AppUrls {
  return urls;
}

/** The session has expired or the user is not logged in. */
export class AuthError extends Error {
  constructor() {
    super('Not logged in');
    this.name = 'AuthError';
  }
}

/** A non-success response; `body` is the server's error text. */
export class HttpError extends Error {
  constructor(readonly status: number, readonly body: string) {
    super(`Request failed with status ${status}`);
    this.name = 'HttpError';
  }
}

/** Throw AuthError on 403 and HttpError on other failures. */
export async function ensureOk(response: Response): Promise<Response> {
  if (response.status === 403) throw new AuthError();
  if (!response.ok) throw new HttpError(response.status, await response.text());
  return response;
}

export async function readBytes(response: Response): Promise<Uint8Array> {
  return new Uint8Array(await response.arrayBuffer());
}
