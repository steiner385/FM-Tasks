import { Hono } from 'hono';
import { PrismaClient } from '@prisma/client';

export interface TestContext {
  app: Hono;
  agent?: any;
  server?: any;
}

// Create a test Prisma client
export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
});

// Ensure database is clean before tests
export async function cleanupDatabase() {
  try {
    await prisma.$transaction([
      prisma.task.deleteMany(),
      prisma.user.deleteMany(),
      prisma.family.deleteMany()
    ]);
  } catch (error) {
    console.error('Database cleanup error:', error);
    throw error;
  }
}

// Initialize database for tests
export async function initializeDatabase() {
  try {
    await cleanupDatabase();
    await prisma.$connect();
  } catch (error) {
    console.error('Database initialization error:', error);
    throw error;
  }
}

export async function setupTestContext(): Promise<TestContext> {
  await initializeDatabase();
  const app = new Hono();
  
  return {
    app,
  };
}

// Mock auth utilities
export const hashPassword = async (password: string): Promise<string> => {
  return password; // For testing, just return the password as-is
};

export const generateToken = async (payload: any): Promise<string> => {
  const { generateToken: coreGenerateToken } = require('../../../../core/utils/auth');
  return coreGenerateToken(payload);
};

// Mock UserRole enum
export enum UserRole {
  PARENT = 'PARENT',
  MEMBER = 'MEMBER',
  ADMIN = 'ADMIN'
}

// Mock Plugin Manager
export class PluginManager {
  private static instance: PluginManager;
  private plugins: Map<string, any> = new Map();

  static getInstance(): PluginManager {
    if (!PluginManager.instance) {
      PluginManager.instance = new PluginManager();
    }
    return PluginManager.instance;
  }

  initialize(context: any): void {
    // No-op for tests
  }

  async registerPlugin(plugin: any): Promise<void> {
    this.plugins.set(plugin.metadata.name, plugin);
  }
}

// Mock Plugin Registry
export const pluginRegistry = new Map();
