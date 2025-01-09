import type { Response } from 'supertest';
import { describe, test, it, expect, beforeAll, afterAll, beforeEach } from '../../../__tests__/core/utils/jest-globals.js';
import {
  TaskTestContext,
  setupTaskTest,
  cleanupTaskTest,
  prisma
} from '../../../__tests__/core/utils/task-test-setup.js';
import { TaskStatus, TaskPriority } from '../types.js';
import { UserRole } from '../../../types/user-role.js';

// Increase timeout for all tests in this file
jest.setTimeout(60000);

describe('Task Listing Endpoints', () => {
  let context: TaskTestContext;

  beforeAll(async () => {
    try {
      context = await setupTaskTest();
    } catch (error) {
      console.error('Test setup error:', error);
      throw error;
    }
  });

  afterAll(async () => {
    try {
      await cleanupTaskTest();
    } catch (error) {
      console.error('Test cleanup error:', error);
      throw error;
    }
  });

  beforeEach(async () => {
    try {
      // Clean up tasks, preserve users and family
      await prisma.task.deleteMany();
      
      // Create test tasks with different priorities
      const tasks = [
        {
          title: 'High Priority Task',
          description: 'This is a high priority task',
          status: TaskStatus.PENDING,
          priority: TaskPriority.HIGH,
          dueDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString()
        },
        {
          title: 'Medium Priority Task', 
          description: 'This is a medium priority task',
          status: TaskStatus.IN_PROGRESS,
          priority: TaskPriority.MEDIUM,
          dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
        },
        {
          title: 'Low Priority Task',
          description: 'This is a low priority task', 
          status: TaskStatus.COMPLETED,
          priority: TaskPriority.LOW,
          dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        }
      ];

      // Create tasks sequentially with proper error handling
      for (const task of tasks) {
        const response = await context.agent
          .post('/api/tasks')
          .set('Authorization', `Bearer ${context.memberToken}`)
          .set('Content-Type', 'application/json')
          .send(task)
          .timeout(30000); // Increased timeout for task creation

        if (response.status !== 201) {
          console.error('Failed to create test task:', response.status, response.body);
          throw new Error(`Failed to create test task ${task.title}: ${response.status} ${JSON.stringify(response.body)}`);
        }
      }
    } catch (error) {
      console.error('beforeEach error:', error);
      throw error;
    }
  });

  describe('List All Tasks', () => {
    it('should list all tasks for the family', async () => {
      const response: Response = await context.agent
        .get('/api/tasks')
        .set('Authorization', `Bearer ${context.memberToken}`)
        .timeout(30000);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('tasks');
      expect(response.body.tasks).toHaveLength(3);
      expect(response.body).toHaveProperty('count', 3);
      expect(response.body).toHaveProperty('timing');
    });

    it('should not list tasks without authentication', async () => {
      const response: Response = await context.agent
        .get('/api/tasks')
        .timeout(5000);

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    it('should not list tasks for non-family member', async () => {
      // Create an outsider user and get their token
      // Create an outsider user with unique username
      const registerResponse = await context.agent
        .post('/api/users/register')
        .send({
          email: `outsider_${Date.now()}@test.com`, // Make email unique
          password: 'Outsider123!',
          firstName: 'Outsider',
          lastName: 'User',
          role: UserRole.MEMBER,
          username: `outsider_test_user_${Date.now()}` // Make username unique
        })
        .timeout(5000);
      
      expect(registerResponse.status).toBe(201);
      const outsiderToken = registerResponse.body.token;
      expect(outsiderToken).toBeTruthy();

      // Try to access tasks with the outsider's token
      const response: Response = await context.agent
        .get('/api/tasks')
        .set('Authorization', `Bearer ${outsiderToken}`)
        .timeout(5000);

      // Should get forbidden since they're authenticated but not in the family
      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('List Tasks By Family', () => {
    it('should list all tasks for specific family', async () => {
      const response: Response = await context.agent
        .get(`/api/families/${context.familyId}/tasks`)
        .set('Authorization', `Bearer ${context.memberToken}`)
        .timeout(5000);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(3);
      
      // Verify tasks belong to the correct family
      response.body.forEach((task: any) => {
        expect(task.familyId).toBe(context.familyId);
      });
    });

    it('should order tasks by priority', async () => {
      const response: Response = await context.agent
        .get(`/api/families/${context.familyId}/tasks`)
        .set('Authorization', `Bearer ${context.memberToken}`)
        .timeout(5000);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);

      const priorities = response.body.map((task: any) => task.priority);
      expect(priorities[0]).toBe(TaskPriority.HIGH);
      expect(priorities[priorities.length - 1]).toBe(TaskPriority.LOW);
    });

    it('should not list tasks for non-existent family', async () => {
      const response: Response = await context.agent
        .get('/api/families/non-existent-id/tasks')
        .set('Authorization', `Bearer ${context.memberToken}`)
        .timeout(5000);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Task List Response Format', () => {
    it('should include all required task fields', async () => {
      const response: Response = await context.agent
        .get('/api/tasks')
        .set('Authorization', `Bearer ${context.memberToken}`)
        .timeout(5000);

      expect(response.status).toBe(200);
      expect(response.body.tasks[0]).toMatchObject({
        id: expect.any(String),
        title: expect.any(String),
        description: expect.any(String),
        status: expect.any(String),
        priority: expect.any(String),
        familyId: context.familyId,
        userId: expect.any(String),
        createdAt: expect.any(String),
        updatedAt: expect.any(String)
      });
    });

    it('should format dates correctly', async () => {
      const response: Response = await context.agent
        .get('/api/tasks')
        .set('Authorization', `Bearer ${context.memberToken}`)
        .timeout(5000);

      expect(response.status).toBe(200);
      response.body.tasks.forEach((task: any) => {
        expect(new Date(task.createdAt)).toBeInstanceOf(Date);
        expect(new Date(task.updatedAt)).toBeInstanceOf(Date);
        if (task.dueDate) {
          expect(new Date(task.dueDate)).toBeInstanceOf(Date);
        }
      });
    });
  });

  describe('Task List Performance', () => {
    it('should include timing information', async () => {
      const response: Response = await context.agent
        .get('/api/tasks')
        .set('Authorization', `Bearer ${context.memberToken}`)
        .timeout(5000);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('timing');
      expect(typeof response.body.timing).toBe('string');
      expect(response.body.timing).toMatch(/\d+ms/);
    });

    it('should handle empty task list', async () => {
      // Delete all tasks
      await prisma.task.deleteMany();

      const response: Response = await context.agent
        .get('/api/tasks')
        .set('Authorization', `Bearer ${context.memberToken}`)
        .timeout(5000);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        tasks: [],
        count: 0
      });
    });
  });
});
