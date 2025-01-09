import { Context } from 'hono';
import { TaskError } from '../errors';
import { ApiResponse } from '../types/http';

export function successResponse<T>(c: Context, data: T, status: 200 | 201 = 200) {
  const response: ApiResponse<T> = {
    success: true,
    data
  };
  return c.json(response, status);
}

export function errorResponse(c: Context, error: Error | TaskError) {
  const status = error instanceof TaskError ? error.statusCode as 400 | 401 | 403 | 404 | 500 : 500;
  const response: ApiResponse = {
    success: false,
    error: error instanceof TaskError ? {
      code: error.code,
      message: error.message,
      details: error.details
    } : {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected error occurred'
    }
  };
  return c.json(response, status);
}
