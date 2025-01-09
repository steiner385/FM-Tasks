import { describe, test, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import type { Response } from 'supertest';
import {
  TaskTestContext,
  setupTaskTest,
  cleanupTaskTest,
  prisma
} from '../../../__tests__/core/utils/task-test-setup';
import { TaskStatus, TaskPriority } from '../types';

let context: TaskTestContext;

describe('Advanced Task Filtering', () => {
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
      // Clean up existing tasks
      await prisma.task.deleteMany();

      // Create test tasks with different properties
      const tasks = [
        {
          title: 'Urgent Task',
          description: 'Due soon',
          status: TaskStatus.PENDING,
          priority: TaskPriority.URGENT,
          dueDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString() // Tomorrow
        },
        {
          title: 'Medium Priority Task',
          description: 'Due next week',
          status: TaskStatus.IN_PROGRESS,
          priority: TaskPriority.MEDIUM,
          dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // In 7 days
        },
        {
          title: 'Low Priority Task',
          description: 'Due next month',
          status: TaskStatus.PENDING,
          priority: TaskPriority.LOW,
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // In 30 days
        }
      ];

      // Create tasks sequentially
      for (const task of tasks) {
        await context.agent
          .post('/api/tasks')
          .set('Authorization', `Bearer ${context.memberToken}`)
          .send(task)
          .timeout(5000);
      }
    } catch (error) {
      console.error('Test setup error:', error);
      throw error;
    }
  });

  describe('Filter by Due Date', () => {
    it('should filter tasks due before specific date', async () => {
      const futureDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000); // 15 days from now
      
      const response = await context.agent
        .get(`/api/families/${context.familyId}/tasks`)
        .query({ dueBefore: futureDate.toISOString() })
        .set('Authorization', `Bearer ${context.memberToken}`)
        .timeout(5000);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(2); // Should only include tasks due within 15 days
      
      // Verify all returned tasks are due before the specified date
      response.body.forEach((task: any) => {
        expect(new Date(task.dueDate).getTime()).toBeLessThan(futureDate.getTime());
      });
    });

    it('should filter tasks due after specific date', async () => {
      const futureDate = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000); // 20 days from now
      
      const response = await context.agent
        .get(`/api/families/${context.familyId}/tasks`)
        .query({ dueAfter: futureDate.toISOString() })
        .set('Authorization', `Bearer ${context.memberToken}`)
        .timeout(5000);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(1); // Should only include tasks due after 20 days
      
      // Verify all returned tasks are due after the specified date
      response.body.forEach((task: any) => {
        expect(new Date(task.dueDate).getTime()).toBeGreaterThan(futureDate.getTime());
      });
    });
  });

  describe('Filter by Creation Date', () => {
    it('should filter tasks created after specific date', async () => {
      const pastDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000); // Yesterday
      
      const response = await context.agent
        .get(`/api/families/${context.familyId}/tasks`)
        .query({ createdAfter: pastDate.toISOString() })
        .set('Authorization', `Bearer ${context.memberToken}`)
        .timeout(5000);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(3); // Should include all recently created tasks
      
      // Verify all returned tasks were created after the specified date
      response.body.forEach((task: any) => {
        expect(new Date(task.createdAt).getTime()).toBeGreaterThan(pastDate.getTime());
      });
    });
  });

  describe('Filter by Assignee', () => {
    it('should filter tasks by assignee', async () => {
      const response = await context.agent
        .get(`/api/families/${context.familyId}/tasks`)
        .query({ assigneeId: context.memberId })
        .set('Authorization', `Bearer ${context.memberToken}`)
        .timeout(5000);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      
      // Verify all returned tasks are assigned to the specified user
      response.body.forEach((task: any) => {
        expect(task.userId).toBe(context.memberId);
      });
    });
  });

  describe('Complex Filtering', () => {
    it('should combine multiple filters', async () => {
      const futureDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000); // 10 days from now
      
      const response = await context.agent
        .get(`/api/families/${context.familyId}/tasks`)
        .query({
          dueBefore: futureDate.toISOString(),
          priority: TaskPriority.URGENT,
          assigneeId: context.memberId
        })
        .set('Authorization', `Bearer ${context.memberToken}`)
        .timeout(5000);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      
      // Verify all returned tasks match all criteria
      response.body.forEach((task: any) => {
        expect(new Date(task.dueDate).getTime()).toBeLessThan(futureDate.getTime());
        expect(task.priority).toBe(TaskPriority.URGENT);
        expect(task.userId).toBe(context.memberId);
      });
    });
  });

  describe('Sorting', () => {
    it('should sort tasks by priority in descending order', async () => {
      const response = await context.agent
        .get(`/api/families/${context.familyId}/tasks`)
        .query({ 
          sortBy: 'priority',
          order: 'desc'
        })
        .set('Authorization', `Bearer ${context.memberToken}`)
        .timeout(5000);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      
      // Verify tasks are sorted by priority (URGENT -> HIGH -> MEDIUM -> LOW)
      const priorities = response.body.map((task: any) => task.priority);
      expect(priorities[0]).toBe(TaskPriority.URGENT);
      expect(priorities[priorities.length - 1]).toBe(TaskPriority.LOW);
    });

    it('should sort tasks by due date in ascending order', async () => {
      const response = await context.agent
        .get(`/api/families/${context.familyId}/tasks`)
        .query({ 
          sortBy: 'dueDate',
          order: 'asc'
        })
        .set('Authorization', `Bearer ${context.memberToken}`)
        .timeout(5000);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      
      // Verify tasks are sorted by due date (earliest first)
      const dueDates = response.body.map((task: any) => new Date(task.dueDate).getTime());
      expect(dueDates).toEqual([...dueDates].sort((a, b) => a - b));
    });
  });
});
