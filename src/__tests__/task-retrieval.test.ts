import type { Response } from 'supertest';
import { describe, test, it, expect, beforeAll, afterAll, beforeEach } from '../utils/jest-globals';
import { hashPassword, generateToken } from '../../../utils/auth';
import {
  TaskTestContext,
  setupTaskTest,
  cleanupTaskTest,
  prisma
} from '../../../__tests__/core/utils/task-test-setup.js';

describe('Task Retrieval Endpoints', () => {
  let context: TaskTestContext;
  let testTaskId: string;

  // Set up test environment
  beforeAll(async () => {
    try {
      context = await setupTaskTest();
    } catch (error) {
      console.error('Test setup error:', error);
      throw error;
    }
  });

  // Clean up after all tests
  afterAll(async () => {
    try {
      await cleanupTaskTest();
    } catch (error) {
      console.error('Test cleanup error:', error);
      throw error;
    }
  });

  // Clean up and create test task before each test
  beforeEach(async () => {
    try {
      // Clean up all test data
      await prisma.$transaction([
        prisma.task.deleteMany(),
        prisma.user.updateMany({
          where: { familyId: { not: null } },
          data: { familyId: null }
        }),
        prisma.user.deleteMany(),
        prisma.family.deleteMany()
      ]);

      // Set up fresh test context
      context = await setupTaskTest();

      // Create a test task
      const taskData = {
        title: 'Test Task',
        description: 'Test Description',
        status: 'PENDING',
        priority: 'MEDIUM',
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        familyId: context.familyId
      };

      const response: Response = await context.agent
        .post('/api/tasks')
        .set('Authorization', `Bearer ${context.memberToken}`)
        .send(taskData)
        .timeout(5000);

      if (!response.body?.id) {
        throw new Error('Failed to create test task');
      }

      testTaskId = response.body.id;
    } catch (error) {
      console.error('Test task creation error:', error);
      throw error;
    }
  });

  it('should get task details as a family member', async () => {
    try {
      const response: Response = await context.agent
        .get(`/api/tasks/${testTaskId}`)
        .set('Authorization', `Bearer ${context.memberToken}`)
        .timeout(5000);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id', testTaskId);
      expect(response.body).toHaveProperty('title', 'Test Task');
      expect(response.body).toHaveProperty('description', 'Test Description');
      expect(response.body).toHaveProperty('status', 'PENDING');
      expect(response.body).toHaveProperty('priority', 'MEDIUM');
      expect(response.body).toHaveProperty('familyId', context.familyId);
    } catch (error) {
      console.error('Test error:', error);
      throw error;
    }
  });

  it('should not get task without family membership', async () => {
    try {
      const outsiderEmail = `outsider_${Date.now()}@test.com`;
      const outsiderPassword = 'Outsider123!';
      const outsiderUsername = `outsider_${Date.now()}`;

      console.log('Creating outsider user...');
      
      // Create outsider user directly with prisma
      const outsiderUser = await prisma.user.create({
        data: {
          email: outsiderEmail,
          password: await hashPassword(outsiderPassword),
          firstName: 'Outsider',
          lastName: 'User',
          role: 'MEMBER',
          username: outsiderUsername
        }
      });

      // Generate token for outsider using the same function used in setup
      const token = await generateToken({
        userId: outsiderUser.id,
        email: outsiderUser.email,
        role: outsiderUser.role
      });

      // Use the token to attempt accessing the task
      const response: Response = await context.agent
        .get(`/api/tasks/${testTaskId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('error');
    } catch (error) {
      console.error('Test error:', error);
      throw error;
    }
  });

  it('should return 404 for non-existent task', async () => {
    try {
      const nonExistentTaskId = '00000000-0000-0000-0000-000000000000';

      const response: Response = await context.agent
        .get(`/api/tasks/${nonExistentTaskId}`)
        .set('Authorization', `Bearer ${context.memberToken}`)
        .timeout(5000);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
    } catch (error) {
      console.error('Test error:', error);
      throw error;
    }
  });
});
