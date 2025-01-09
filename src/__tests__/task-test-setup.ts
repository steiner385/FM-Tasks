import type { SuperTest, Test } from 'supertest';
import type { Hono } from 'hono';
import type { PrismaClient } from '@prisma/client';
import { 
  setupTestContext, 
  type TestContext,
  hashPassword,
  generateToken,
  UserRole,
  PluginManager,
  pluginRegistry
} from './utils/test-setup';
import { prisma } from '../prisma/client';
import { authMiddleware } from '../middleware/auth';
import { TaskController } from '../controllers/TaskController';

export interface TaskTestContext extends TestContext {
  parentToken: string;
  memberToken: string;
  familyId: string;
  taskId?: string;
  memberId: string;
  parentId: string;
  server: import('http').Server;
  agent: SuperTest<Test> & { timeout: (ms: number) => SuperTest<Test> };
  app: Hono;
}

async function cleanupDatabase(): Promise<void> {
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

async function initializeDatabase(): Promise<void> {
  try {
    await cleanupDatabase();
    await prisma.$connect();
  } catch (error) {
    console.error('Database initialization error:', error);
    throw error;
  }
}

export async function setupTaskTest(): Promise<TaskTestContext> {
  const baseContext = await setupTestContext() as TaskTestContext;
  // Create Hono app instance
  const app = baseContext.app;

  // Initialize database and plugin
  await initializeDatabase();

  const timestamp = Date.now();
  
  // Create users via Prisma directly
  const parent = await prisma.user.create({
    data: {
      email: `testparent_${timestamp}@test.com`,
      password: await hashPassword('TestPass123!'),
      firstName: 'Test',
      lastName: 'Parent',
      role: UserRole.PARENT,
      username: `testparent_${timestamp}`
    }
  });

  const member = await prisma.user.create({
    data: {
      email: `testmember_${timestamp}@test.com`,
      password: await hashPassword('TestPass123!'),
      firstName: 'Test',
      lastName: 'Member',
      role: UserRole.MEMBER,
      username: `testmember_${timestamp}`
    }
  });

  // Create family with relationships in a transaction
  const family = await prisma.$transaction(async (tx) => {
    const newFamily = await tx.family.create({
      data: {
        name: 'Test Family',
        members: {
          connect: [{ id: parent.id }, { id: member.id }]
        }
      }
    });

    // Update both users with familyId
    await tx.user.updateMany({
      where: { id: { in: [parent.id, member.id] } },
      data: { familyId: newFamily.id }
    });

    return newFamily;
  });

  // Generate tokens
  const parentToken = await generateToken({
    userId: parent.id,
    email: parent.email,
    role: parent.role,
    familyId: family.id
  });

  const memberToken = await generateToken({
    userId: member.id,
    email: member.email,
    role: member.role,
    familyId: family.id
  });

  // Initialize task controller
  const taskController = new TaskController(prisma);

  // Add user context middleware
  app.use('*', async (c, next) => {
    const authHeader = c.req.header('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      
      // Set user context based on token
      if (token === memberToken) {
        c.set('user', {
          id: member.id,
          role: member.role,
          familyId: family.id
        });
      } else if (token === parentToken) {
        c.set('user', {
          id: parent.id,
          role: parent.role,
          familyId: family.id
        });
      } else {
        // For any other token, verify and look up user
        const { verifyToken } = await import('../../../core/utils/auth');
        try {
          const payload = verifyToken(token);
          if (payload?.userId) {
            const user = await prisma.user.findUnique({
              where: { id: payload.userId }
            });

            if (user && payload.familyId) {
              c.set('user', {
                id: user.id,
                role: user.role,
                familyId: payload.familyId
              });
            }
          }
        } catch (error) {
          console.error('Token verification error:', error);
        }
      }
    }
    await next();
  });

  // Register routes directly
  app.get('/tasks', authMiddleware, async (c) => {
    console.log('GET /tasks called');
    return taskController.getTasks(c);
  });

  app.post('/tasks', authMiddleware, async (c) => {
    console.log('POST /tasks called');
    return taskController.createTask(c);
  });

  app.get('/tasks/family/:familyId', authMiddleware, async (c) => {
    console.log('GET /tasks/family/:familyId called');
    return taskController.getTasksByFamily(c);
  });

  app.get('/tasks/:taskId', authMiddleware, async (c) => {
    console.log('GET /tasks/:taskId called');
    return taskController.getTaskById(c);
  });

  app.put('/tasks/:taskId', authMiddleware, async (c) => {
    console.log('PUT /tasks/:taskId called');
    return taskController.updateTask(c);
  });

  app.delete('/tasks/:taskId', authMiddleware, async (c) => {
    console.log('DELETE /tasks/:taskId called');
    return taskController.deleteTask(c);
  });

  // Create HTTP server for testing
  const { createServer } = require('http');
  const server = createServer(async (req: import('http').IncomingMessage, res: import('http').ServerResponse) => {
    const url = `http://localhost${req.url}`;
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value !== undefined) {
        if (Array.isArray(value)) {
          value.forEach(v => headers.append(key, v));
        } else {
          headers.set(key, value);
        }
      }
    }
    
    let body: string | undefined;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const chunks: Buffer[] = [];
      await new Promise<void>((resolve, reject) => {
        req.on('data', chunk => chunks.push(chunk));
        req.on('end', () => resolve());
        req.on('error', reject);
      });
      body = Buffer.concat(chunks).toString('utf8');
    }

    const request = new Request(url, {
      method: req.method,
      headers: headers,
      body: body
    });
    
    try {
      console.log(`Handling ${req.method} ${req.url}`);
      const response = await app.fetch(request);
      console.log(`Response status: ${response.status}`);
      
      // Convert response body to string
      let responseBody = '';
      if (response.body) {
        const reader = response.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          responseBody += new TextDecoder().decode(value);
        }
      }

      // Set response headers
      response.headers.forEach((value: string, key: string) => {
        res.setHeader(key, value);
      });
      res.statusCode = response.status;

      // Write response body
      if (responseBody) {
        res.write(responseBody);
      }
      res.end();
    } catch (error) {
      console.error('Error handling request:', error);
      res.statusCode = 500;
      res.end(JSON.stringify({ error: 'Internal Server Error' }));
    }
  });
  
  // Start server on a random port
  await new Promise<void>((resolve) => {
    server.listen(0, resolve);
  });
  
  // Configure test agent
  const request = require('supertest');
  baseContext.agent = request.agent(server);
  baseContext.agent.timeout(10000); // Increase timeout to 10 seconds
  
  return {
    ...baseContext,
    server,
    parentToken,
    memberToken,
    familyId: family.id,
    memberId: member.id,
    parentId: parent.id
  };
}

export async function cleanupTaskTest(): Promise<void> {
  try {
    await cleanupDatabase();
    await prisma.$disconnect();
  } catch (error) {
    console.error('Task test cleanup error:', error);
    throw error;
  }
}
