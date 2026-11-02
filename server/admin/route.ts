import type http from 'node:http';
import type { Kept } from '../kept';
import type { Lobby } from '../lobby';
import { Refused } from '../refused';

// What every route of the admin API gets, and the errors a route throws for the router (index.ts) to answer.

/** A body past SERVER.adminBody (answered 413). */
export class TooBig extends Refused {
  constructor() {
    super('too big');
  }
}

/** No memory for what was asked (answered 503). */
export class Full extends Error {}

/** The route is there but not for this method (answered 405). */
export class WrongMethod extends Error {
  constructor(readonly method: string) {
    super(method);
  }
}

export interface Ctx {
  lobby: Lobby;
  kept: Kept;
  req: http.IncomingMessage;
  res: http.ServerResponse;
  method: string;
  /** The path past the first part: GET /sessions/ABCDE/paint is ['ABCDE', 'paint'] to the sessions route. */
  rest: string[];
  q: URLSearchParams;
  /** The request's JSON body, at most SERVER.adminBody bytes. */
  body(): Promise<unknown>;
}

/** A route: what it answers as JSON (200), or nothing if it wrote the answer itself (a stream, a download). Throws Refused, Missing, Busy, Full or WrongMethod. */
export type Route = (c: Ctx) => Promise<unknown>;

/** The request must be `method`. */
export function only(c: Ctx, method: 'GET' | 'POST') {
  if (c.method !== method) throw new WrongMethod(method);
}

/** The request's JSON body as an object's fields: none for a body that is no object. */
export async function fields(c: Ctx): Promise<Record<string, unknown>> {
  const b = await c.body();
  return typeof b === 'object' && b && !Array.isArray(b) ? (b as Record<string, unknown>) : {};
}

/** `x` is a whole number from 1 to `most` (at most 999). */
export const upTo = (x: string, most: number) => /^\d{1,3}$/.test(x) && +x >= 1 && +x <= most;
