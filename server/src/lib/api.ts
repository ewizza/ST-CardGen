export function ok(res: any, payload?: Record<string, any>, status = 200) {
  const body = payload ? { ok: true, ...payload } : { ok: true };
  return res.status(status).json(body);
}

export function fail(
  res: any,
  status: number,
  code: string,
  message: string,
  details?: any,
) {
  const error = details !== undefined ? { code, message, details } : { code, message };
  return res.status(status).json({ ok: false, error });
}

export function wrap(
  handler: (req: any, res: any, next: any) => any,
) {
  return async (req: any, res: any, next: any) => {
    try {
      await handler(req, res, next);
    } catch (err) {
      if (res.headersSent) return;
      return next(err);
    }
  };
}
