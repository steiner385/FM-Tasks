import { describe, test, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import type { Response } from 'supertest';
import { 
  prisma,
  setupTestContext,
  connectDB,
  disconnectDB,
  cleanupDatabase,
  type TestContext
} from '../utils/jest-setup.js';
import { TaskStatus, TaskPriority } from '../../types/task.js';
import { UserRole } from '../../types/user-role.js';
import { createTestUser } from '../utils/test-utils.js';
import { hashPassword, generateToken } from '../../utils/auth.js';

// Test users
const testUsers = {
  parent: {
    email: 'parent@test.com',
    password: 'Parent123!',
    firstName: 'Parent',
    lastName: 'User',
    role: UserRole.PARENT,
    username: 'parent_test_user'
  },
  member: {
    email: 'member@test.com',
    password: 'Member123!',
    firstName: 'Member',
    lastName: 'User',
    role: UserRole.MEMBER,
    username: 'member_test_user'
  }
};

interface TaskTestContext extends TestContext {
  parentToken: string;
  memberToken: string;
  familyId: string;
  taskId?: string;
  memberId: string;
  parentId: string;
}

let context: TaskTestContext;

describe('Task Creation Endpoints', () => {
  beforeAll(async () => {
    try {
      await connectDB();
      await cleanupDatabase();
      const baseContext = await setupTestContext();
      context = {
        ...baseContext,
        parentToken: '',
        memberToken: '',
        familyId: '',
        memberId: '',  // Add required property
        parentId: ''   // Add required property
      };

      // Create users via Prisma directly
      const parent = await prisma.user.create({
        data: {
          email: 'testparent@test.com',
          password: await hashPassword('TestPass123!'),
          firstName: 'Test',
          lastName: 'Parent',
          role: UserRole.PARENT,
          username: 'testparent_' + Date.now()
        }
      });

      const member = await prisma.user.create({
        data: {
          email: 'testmember@test.com',
          password: await hashPassword('TestPass123!'),
          firstName: 'Test',
          lastName: 'Member',
          role: UserRole.MEMBER,
          username: 'testmember_' + Date.now()
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
      context.parentToken = await generateToken({
        userId: parent.id,
        email: parent.email,
        role: parent.role
      });

      context.memberToken = await generateToken({
        userId: member.id,
        email: member.email,
        role: member.role
      });

      context.familyId = family.id;
      context.memberId = member.id;
      context.parentId = parent.id;

      console.log('Test setup completed successfully');
    } catch (error) {
      console.error('Test setup error:', error);
      throw error;
    }
  }, 30000); // 30 second timeout for setup

  afterAll(async () => {
    try {
      await context.cleanup();
      await disconnectDB();
    } catch (error) {
      console.error('Test cleanup error:', error);
      throw error;
    }
  });

  beforeEach(async () => {
    // Clean up tasks before each test
    await prisma.task.deleteMany();
  });

  it('should create a new task as a family member', async () => {
    const taskData = {
      title: 'Test Task',
      description: 'Test Description',
      status: TaskStatus.PENDING,
      priority: TaskPriority.MEDIUM,
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    };

    const response: Response = await context.agent
      .post('/api/tasks')
      .set('Authorization', `Bearer ${context.memberToken}`)
      .send(taskData)
      .timeout(5000);

    expect(response.status).toBe(201);
    expect(response.body.title).toBe(taskData.title);
    expect(response.body.description).toBe(taskData.description);
    expect(response.body.status).toBe(taskData.status);
    expect(response.body.priority).toBe(taskData.priority);
    expect(response.body.familyId).toBe(context.familyId);
  });

  it('should not create task without family membership', async () => {
    // Create a new user that is not part of any family
    const outsiderResponse = await createTestUser({
      email: 'outsider@test.com',
      password: 'Outsider123!',
      firstName: 'Outsider',
      lastName: 'User',
      role: UserRole.MEMBER,
      username: 'outsider_test_user'
    });

    const taskData = {
      title: 'Test Task',
      description: 'Test Description',
      status: TaskStatus.PENDING,
      priority: TaskPriority.MEDIUM,
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    };

    const response: Response = await context.agent
      .post('/api/tasks')
      .set('Authorization', `Bearer ${outsiderResponse.token}`)
      .send(taskData)
      .timeout(5000);

    expect(response.status).toBe(403);
    expect(response.body.error).toBeDefined();
  });

  it('should validate task data', async () => {
    const invalidTaskData = {
      title: '', // Empty title should fail validation
      status: 'INVALID_STATUS',
      priority: 'INVALID_PRIORITY'
    };

    const response: Response = await context.agent
      .post('/api/tasks')
      .set('Authorization', `Bearer ${context.memberToken}`)
      .send(invalidTaskData)
      .timeout(5000);

    expect(response.status).toBe(400);
    expect(response.body.error).toBeDefined();
  });
});
