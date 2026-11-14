export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); this.name = 'HttpError'; }
}
export const badRequest = (code: string, msg: string) => new HttpError(400, code, msg);
export const unauthorized = (msg = 'Sign in first.') => new HttpError(401, 'unauthorized', msg);
export const forbidden = (msg = 'You do not have permission to do that.') => new HttpError(403, 'forbidden', msg);
export const notFound = (what = 'That') => new HttpError(404, 'not_found', `${what} was not found.`);
export const conflict = (code: string, msg: string) => new HttpError(409, code, msg);
export const unprocessable = (code: string, msg: string) => new HttpError(422, code, msg);
