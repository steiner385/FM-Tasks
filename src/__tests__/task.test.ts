import type { Response } from 'supertest';
import { describe, test, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { TaskTestContext, setupTaskTest, cleanupTaskTest } from './task-test-setup';
import { TaskStatus, TaskPriority } from '@plugins/tasks/types';
import { generateToken } from './utils/test-setup';
import { prisma } from '../prisma/client';

describe('Task Management Endpoints', () => {
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
      await context.server.close();
      await cleanupTaskTest();
    } catch (error) {
      console.error('Test cleanup error:', error);
      throw error;
    }
  });

  beforeEach(async () => {
    try {
      // Clean up any existing tasks
      await prisma.task.deleteMany({
        where: {
          familyId: context.familyId
        }
      });
    } catch (error) {
      console.error('Task cleanup error:', error);
      throw error;
    }
  });

  describe('Task Creation', () => {
    it('should create a task with valid data', async () => {
      const taskData = {
        title: 'Test Task',
        description: 'Test Description',
        status: TaskStatus.PENDING,
        priority: TaskPriority.MEDIUM,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        userId: context.memberId,
        assignedToId: context.memberId,
        familyId: context.familyId
      };

      const response: Response = await context.agent
        .post('/tasks')
        .set('Authorization', `Bearer ${context.memberToken}`)
        .send(taskData)
        .timeout(5000);

      expect(response.status).toBe(201);
      expect(response.body.data).toMatchObject({
        title: taskData.title,
        description: taskData.description,
        status: taskData.status,
        priority: taskData.priority
      });
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data).toHaveProperty('familyId', context.familyId);
    });

    it('should not create a task without authentication', async () => {
      const taskData = {
        title: 'Test Task',
        description: 'Test Description'
      };

      const response: Response = await context.agent
        .post('/tasks')
        .send(taskData)
        .timeout(5000);

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    it('should not create a task without required fields', async () => {
      const response: Response = await context.agent
        .post('/tasks')
        .set('Authorization', `Bearer ${context.memberToken}`)
        .send({})
        .timeout(5000);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Task Retrieval', () => {
    let testTaskId: string;

    beforeEach(async () => {
      const taskData = {
        title: 'Test Task',
        description: 'Test Description',
        status: TaskStatus.PENDING,
        priority: TaskPriority.MEDIUM,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        userId: context.memberId,
        assignedToId: context.memberId,
        familyId: context.familyId
      };

      const response = await context.agent
        .post('/tasks')
        .set('Authorization', `Bearer ${context.memberToken}`)
        .send(taskData)
        .timeout(5000);

      testTaskId = response.body.data.id;
    });

    it('should get a task by ID', async () => {
      const response: Response = await context.agent
        .get(`/tasks/${testTaskId}`)
        .set('Authorization', `Bearer ${context.memberToken}`)
        .timeout(5000);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('id', testTaskId);
    });

    it('should list all family tasks', async () => {
      const response: Response = await context.agent
        .get(`/tasks/family/${context.familyId}`)
        .set('Authorization', `Bearer ${context.memberToken}`)
        .timeout(5000);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.data[0]).toHaveProperty('id', testTaskId);
    });

    it('should not get a task from another family', async () => {
      const timestamp = Date.now();
      
      // Create another family
      const otherFamily = await prisma.family.create({
        data: {
          name: 'Other Family'
        }
      });

      // Create user in the other family
      const outsiderUser = await prisma.user.create({
        data: {
          email: `outsider_${timestamp}@test.com`,
          password: 'Outsider123!',
          firstName: 'Outsider',
          lastName: 'User',
          role: 'MEMBER',
          username: `outsider_${timestamp}`,
          familyId: otherFamily.id
        }
      });

      // Generate token for the outsider user
      const outsiderToken = await generateToken({
        userId: outsiderUser.id,
        email: outsiderUser.email,
        role: outsiderUser.role,
        familyId: otherFamily.id
      });

      const response: Response = await context.agent
        .get(`/tasks/${testTaskId}`)
        .set('Authorization', `Bearer ${outsiderToken}`)
        .timeout(5000);

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Task Updates', () => {
    let testTaskId: string;

    beforeEach(async () => {
      const taskData = {
        title: 'Test Task',
        description: 'Test Description',
        status: TaskStatus.PENDING,
        priority: TaskPriority.MEDIUM,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        userId: context.memberId,
        assignedToId: context.memberId,
        familyId: context.familyId
      };

      const response = await context.agent
        .post('/tasks')
        .set('Authorization', `Bearer ${context.memberToken}`)
        .send(taskData)
        .timeout(5000);

      testTaskId = response.body.data.id;
    });

    it('should update a task with valid data', async () => {
      const updateData = {
        title: 'Updated Task',
        description: 'Updated Description',
        status: TaskStatus.IN_PROGRESS,
        priority: TaskPriority.HIGH
      };

      const response: Response = await context.agent
        .put(`/tasks/${testTaskId}`)
        .set('Authorization', `Bearer ${context.memberToken}`)
        .send(updateData)
        .timeout(5000);

      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject(updateData);
    });

    it('should not update a task without authentication', async () => {
      const updateData = {
        title: 'Updated Task'
      };

      const response: Response = await context.agent
        .put(`/tasks/${testTaskId}`)
        .send(updateData)
        .timeout(5000);

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    it('should not update a non-existent task', async () => {
      const updateData = {
        title: 'Updated Task'
      };

      const response: Response = await context.agent
        .put('/tasks/non-existent-id')
        .set('Authorization', `Bearer ${context.memberToken}`)
        .send(updateData)
        .timeout(5000);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Task List Filtering', () => {
    beforeEach(async () => {
      // Create multiple tasks with different statuses
      const tasks = [
        {
          title: 'Pending Task',
          status: TaskStatus.PENDING,
          priority: TaskPriority.LOW,
          userId: context.memberId,
          assignedToId: context.memberId,
          familyId: context.familyId
        },
        {
          title: 'In Progress Task',
          status: TaskStatus.IN_PROGRESS,
          priority: TaskPriority.MEDIUM,
          userId: context.memberId,
          assignedToId: context.memberId,
          familyId: context.familyId
        },
        {
          title: 'Completed Task',
          status: TaskStatus.COMPLETED,
          priority: TaskPriority.HIGH,
          userId: context.memberId,
          assignedToId: context.memberId,
          familyId: context.familyId
        }
      ];

      for (const task of tasks) {
        await context.agent
          .post('/tasks')
          .set('Authorization', `Bearer ${context.memberToken}`)
          .send(task)
          .timeout(5000);
      }
    });

    it('should list all tasks for the family', async () => {
      const response: Response = await context.agent
        .get('/tasks')
        .set('Authorization', `Bearer ${context.memberToken}`)
        .timeout(5000);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('tasks');
      expect(response.body.data.tasks).toHaveLength(3);
    });

    it('should order tasks by priority and creation date', async () => {
      const response: Response = await context.agent
        .get(`/tasks/family/${context.familyId}`)
        .set('Authorization', `Bearer ${context.memberToken}`)
        .timeout(5000);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data)).toBe(true);
      
      // Verify priority ordering
      const priorities = response.body.data.map((task: any) => task.priority);
      expect(priorities[0]).toBe(TaskPriority.HIGH);
    });
  });
});
