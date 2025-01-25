import type { Context } from 'hono';
import type { UserContext } from './task';

export interface RequestContext extends Context {
  get(key: 'user'): UserContext;
}

export type ApiResponse<T = any> = {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
};
