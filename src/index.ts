import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { app } from './routes';
import { CustomPrismaClient } from './prisma/client';
import { TaskController } from './controllers/TaskController';

export { TaskController } from './controllers/TaskController';
export { CustomPrismaClient } from './prisma/client';
export * from './types/task';
export * from './types/prisma';
export * from './errors';

export class TasksPlugin {
  private app: Hono;
  private prisma: CustomPrismaClient;
  private controller: TaskController;
  private server: ReturnType<typeof serve> | null = null;

  constructor() {
    this.prisma = new CustomPrismaClient();
    this.controller = new TaskController(this.prisma);
    this.app = app;
  }

  async init() {
    try {
      await this.prisma.$connect();
    } catch (error) {
      console.error('Failed to initialize Tasks plugin:', error);
      throw error;
    }
  }

  async start(port = 3001) {
    try {
      this.server = serve({
        fetch: this.app.fetch,
        port
      });

      console.log(`Tasks plugin server running on port ${port}`);
    } catch (error) {
      console.error('Failed to start Tasks plugin server:', error);
      throw error;
    }
  }

  async stop() {
    try {
      if (this.server) {
        this.server.close();
        this.server = null;
      }
      await this.prisma.$disconnect();
    } catch (error) {
      console.error('Failed to stop Tasks plugin:', error);
      throw error;
    }
  }

  getRoutes() {
    return this.app;
  }

  getController() {
    return this.controller;
  }

  async getHealth() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'healthy' };
    } catch (error) {
      return { status: 'unhealthy', error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
}
