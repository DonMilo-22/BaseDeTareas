import { AppError } from './errors.js';
import { config } from './config.js';

export const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function requireSameOrigin(req, _res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.headers.origin;
  if (!origin || !config.isProduction || origin === config.appUrl) return next();
  throw new AppError(403, 'Origen de petición no permitido.', 'INVALID_ORIGIN');
}

export function notFoundHandler(_req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ruta no encontrada.' } });
}

export function errorHandler(error, _req, res, _next) {
  const status = Number(error.status || 500);
  if (status >= 500) console.error(error);
  const message = error instanceof AppError ? error.message : 'Ocurrió un error interno.';
  res.status(status).json({
    error: {
      code: error.code || 'INTERNAL_ERROR',
      message,
      ...(error.details ? { details: error.details } : {}),
    },
  });
}
