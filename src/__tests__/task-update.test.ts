import { describe, test, it, expect, beforeAll, afterAll, beforeEach } from '../../../__tests__/core/utils/jest-globals';
import type { Response } from 'supertest';
import {
  prisma,
  setupTaskTest,
  cleanupTaskTest,
  type TaskTestContext
} from '../utils/task-test-setup';
import type { Task } from '../../../types/task';
import { TaskStatus, TaskPriority } from '../../../types/task';
import { UserRole } from '../../../types/user-role';
import { generateToken } from '../../../utils/auth';

let context: TaskTestContext;

describe('Task Update Endpoints', () => {
  beforeAll(async () => {
    await cleanupTaskTest(); // Ensure clean state
    context = await setupTaskTest();
  }, 10000);

  afterAll(async () => {
    await cleanupTaskTest();
  }, 10000);

  beforeEach(async () => {
    // Clean up existing tasks
    await prisma.task.deleteMany();

    // Verify and refresh context
    const family = await prisma.family.findUnique({
      where: { id: context.familyId },
      include: { members: true }
    });

    if (!family) {
      // Re-setup test context if family not found
      await cleanupTaskTest();
      context = await setupTaskTest();
    }

    // Create a test task directly using Prisma
    const task = await prisma.task.create({
      data: {
        title: 'Test Task',
        description: 'Test Description',
        status: 'PENDING',
        priority: 'MEDIUM',
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        familyId: context.familyId,
        userId: context.parentId,
        assignedToId: context.memberId
      }
    });

    context.taskId = task.id;
  }, 10000);

  it('should update task status as assigned member', async () => {
    const updateData = {
      status: TaskStatus.COMPLETED
    };

    const response = await context.agent
      .put(`/api/tasks/${context.taskId}`)
      .set('Authorization', `Bearer ${context.memberToken}`)
      .set('Content-Type', 'application/json')
      .send(updateData)
      .timeout(5000);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('id', context.taskId);
    expect(response.body).toHaveProperty('status', TaskStatus.COMPLETED);
    expect(response.body).toHaveProperty('familyId', context.familyId);
  }, 10000);

  it('should not update task without family membership', async () => {
    // Create outsider user
    const outsiderUser = await prisma.user.create({
      data: {
        email: `outsider_${Date.now()}@test.com`,
        password: 'TestPass123!',
        firstName: 'Outsider',
        lastName: 'User',
        role: 'MEMBER',
        username: `outsider_${Date.now()}`
      }
    });

    const outsiderToken = await generateToken({
      userId: outsiderUser.id,
      email: outsiderUser.email,
      role: outsiderUser.role
    });

    const updateData = {
      status: TaskStatus.COMPLETED
    };

    // Try to update the task with the outsider's token
    const response = await context.agent
      .put(`/api/tasks/${context.taskId}`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .set('Content-Type', 'application/json')
      .send(updateData)
      .timeout(5000);

    expect(response.status).toBe(403);
    expect(response.body).toHaveProperty('error');
  }, 10000);

  it('should validate task update data', async () => {
    const invalidUpdateData = {
      status: 'INVALID_STATUS' // Invalid status should fail validation
    };

    const response = await context.agent
      .put(`/api/tasks/${context.taskId}`)
      .set('Authorization', `Bearer ${context.memberToken}`)
      .set('Content-Type', 'application/json')
      .send(invalidUpdateData)
      .timeout(5000);

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error');
  }, 10000);
});
