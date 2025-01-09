type TaskErrorCode = 
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'TASK_NOT_FOUND'
  | 'USER_NOT_FOUND'
  | 'FAMILY_NOT_FOUND'
  | 'INVALID_STATUS'
  | 'INVALID_PRIORITY'
  | 'INVALID_ASSIGNMENT'
  | 'PAST_DUE_DATE'
  | 'INTERNAL_ERROR'
  | 'SUBTASK_CYCLE'  // New error for circular subtask references
  | 'MAX_SUBTASKS';  // New error for too many subtasks

interface TaskErrorParams {
  code: TaskErrorCode;
  message: string;
  entity?: string;
  details?: unknown;
}

export class TaskError extends Error {
  readonly code: TaskErrorCode;
  readonly entity: string;
  readonly details?: unknown;
  readonly statusCode: number;

  constructor({ code, message, entity = 'TASK', details }: TaskErrorParams) {
    super(message);
    this.name = 'TaskError';
    this.code = code;
    this.entity = entity;
    this.details = details;

    // Map error codes to HTTP status codes
    this.statusCode = {
      'VALIDATION_ERROR': 400,
      'UNAUTHORIZED': 401,
      'FORBIDDEN': 403,
      'NOT_FOUND': 404,
      'TASK_NOT_FOUND': 404,
      'USER_NOT_FOUND': 404,
      'FAMILY_NOT_FOUND': 404,
      'INVALID_STATUS': 400,
      'INVALID_PRIORITY': 400,
      'INVALID_ASSIGNMENT': 400,
      'PAST_DUE_DATE': 400,
      'SUBTASK_CYCLE': 400,
      'MAX_SUBTASKS': 400,
      'INTERNAL_ERROR': 500
    }[code];

    // Capture stack trace if available
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TaskError);
    }
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      entity: this.entity,
      details: this.details,
      statusCode: this.statusCode
    };
  }

  // Helper methods for common errors
  static notFound(message = 'Task not found', details?: unknown) {
    return new TaskError({
      code: 'TASK_NOT_FOUND',
      message,
      details
    });
  }

  static unauthorized(message = 'Unauthorized access', details?: unknown) {
    return new TaskError({
      code: 'UNAUTHORIZED',
      message,
      details
    });
  }

  static forbidden(message = 'Operation not allowed', details?: unknown) {
    return new TaskError({
      code: 'FORBIDDEN',
      message,
      details
    });
  }

  static validation(message: string, details?: unknown) {
    return new TaskError({
      code: 'VALIDATION_ERROR',
      message,
      details
    });
  }

  static subtaskCycle(message = 'Circular subtask reference detected', details?: unknown) {
    return new TaskError({
      code: 'SUBTASK_CYCLE',
      message,
      details
    });
  }

  static maxSubtasks(message = 'Maximum number of subtasks reached', details?: unknown) {
    return new TaskError({
      code: 'MAX_SUBTASKS',
      message,
      details
    });
  }
}
