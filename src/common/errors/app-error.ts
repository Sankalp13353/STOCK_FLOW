export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(message: string, statusCode: number = 500, code: string = 'INTERNAL_ERROR', details?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found', code: string = 'NOT_FOUND') {
    super(message, 404, code);
  }
}

export class BadRequestError extends AppError {
  constructor(message: string = 'Bad request', code: string = 'BAD_REQUEST', details?: unknown) {
    super(message, 400, code, details);
  }
}

export class ConflictError extends AppError {
  constructor(message: string = 'Resource conflict', code: string = 'CONFLICT') {
    super(message, 409, code);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized', code: string = 'UNAUTHORIZED') {
    super(message, 401, code);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden resource access', code: string = 'FORBIDDEN') {
    super(message, 403, code);
  }
}

export class UnprocessableEntityError extends AppError {
  constructor(message: string = 'Unprocessable entity', code: string = 'UNPROCESSABLE_ENTITY', details?: unknown) {
    super(message, 422, code, details);
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message: string = 'Too many requests, please try again later', code: string = 'TOO_MANY_REQUESTS', details?: unknown) {
    super(message, 429, code, details);
  }
}

