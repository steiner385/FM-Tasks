import { describe, test, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import {
  prisma,
  setupTaskTest,
  cleanupTaskTest,
  type TaskTestContext
} from '../../../__tests__/core/utils/task-test-setup.js';
import { TaskStatus, TaskPriority } from '../../../types/task.js';
import { UserRole } from '../../../types/user-role.js';
import { generateToken } from '../../../utils/auth.js';

let context: TaskTestContext;

describe('Task Deletion Endpoints', () => {
  beforeAll(async () => {
    try {
      await cleanupTaskTest(); // Ensure clean state
      context = await setupTaskTest();
    } catch (error) {
      console.error('Test setup error:', error);
      await cleanupTaskTest(); // Cleanup on error
      throw error;
    }
  }, 10000);

  afterAll(async () => {
    try {
      await cleanupTaskTest();
    } catch (error) {
      console.error('Test cleanup error:', error);
    }
  }, 10000);

  beforeEach(async () => {
    try {
      // Reset test context
      await cleanupTaskTest();
      context = await setupTaskTest();

      // Verify family and users exist
      const family = await prisma.family.findUnique({
        where: { id: context.familyId },
        include: { members: true }
      });
      console.log('Family:', family);

      const parent = await prisma.user.findUnique({
        where: { id: context.parentId }
      });
      console.log('Parent:', parent);

      const member = await prisma.user.findUnique({
        where: { id: context.memberId }
      });
      console.log('Member:', member);

      // Create a test task directly using Prisma
      const task = await prisma.task.create({
        data: {
          title: 'Test Task',
          description: 'Test Description',
          status: TaskStatus.PENDING,
          priority: TaskPriority.MEDIUM,
          dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          familyId: context.familyId,
          userId: context.parentId,
          assignedToId: context.memberId
        }
      });

      context.taskId = task.id;
    } catch (error) {
      console.error('beforeEach error:', error);
      throw error;
    }
  }, 10000);

  it('should delete task as parent', async () => {
    const response = await context.agent
      .delete(`/api/tasks/${context.taskId}`)
      .set('Authorization', `Bearer ${context.parentToken}`)
      .timeout(5000);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('message');

    // Verify task is deleted
    const verifyResponse = await context.agent
      .get(`/api/tasks/${context.taskId}`)
      .set('Authorization', `Bearer ${context.parentToken}`)
      .timeout(5000);

    expect(verifyResponse.status).toBe(404);
  }, 10000);

  it('should not delete task as regular member', async () => {
    const response = await context.agent
      .delete(`/api/tasks/${context.taskId}`)
      .set('Authorization', `Bearer ${context.memberToken}`)
      .timeout(5000);

    expect(response.status).toBe(403);
    expect(response.body).toHaveProperty('error');

    // Verify task still exists
    const verifyResponse = await context.agent
      .get(`/api/tasks/${context.taskId}`)
      .set('Authorization', `Bearer ${context.memberToken}`)
      .timeout(5000);

    expect(verifyResponse.status).toBe(200);
    expect(verifyResponse.body).toHaveProperty('id', context.taskId);
  }, 10000);

  it('should not delete task without family membership', async () => {
    // Create outsider user
    const outsiderUser = await prisma.user.create({
      data: {
        email: `outsider_${Date.now()}@test.com`,
        password: 'TestPass123!',
        firstName: 'Outsider',
        lastName: 'User',
        role: UserRole.MEMBER,
        username: `outsider_${Date.now()}`
      }
    });

    const outsiderToken = await generateToken({
      userId: outsiderUser.id,
      email: outsiderUser.email,
      role: outsiderUser.role
    });

    // Attempt to delete as outsider
    const response = await context.agent
      .delete(`/api/tasks/${context.taskId}`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .timeout(5000);

    expect(response.status).toBe(403);
    expect(response.body).toHaveProperty('error');

    // Verify task still exists
    const verifyResponse = await context.agent
      .get(`/api/tasks/${context.taskId}`)
      .set('Authorization', `Bearer ${context.memberToken}`)
      .timeout(5000);

    expect(verifyResponse.status).toBe(200);
    expect(verifyResponse.body).toHaveProperty('id', context.taskId);
  }, 10000);
});
