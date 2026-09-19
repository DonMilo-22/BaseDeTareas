export class AppError extends Error {
  constructor(status, message, code = 'APP_ERROR', details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const notFound = (message = 'Recurso no encontrado.') => new AppError(404, message, 'NOT_FOUND');
export const forbidden = (message = 'No tienes permiso para realizar esta acción.') => new AppError(403, message, 'FORBIDDEN');
export const badRequest = (message, details) => new AppError(400, message, 'BAD_REQUEST', details);
