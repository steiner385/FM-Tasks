import { Context } from 'hono';
import { TaskError } from '../errors';
import { CustomPrismaClient } from '../prisma/client';
import { RequestContext } from '../types/http';
import { TaskStatus, TaskPriority, CreateTaskInput, UpdateTaskInput, TaskFilters } from '../types/task';
import { successResponse, errorResponse } from '../utils/response';

export class TaskController {
  constructor(private readonly prisma: CustomPrismaClient) {}

  async getTasks(c: RequestContext) {
    try {
      const user = c.get('user');
      const tasks = await this.prisma.findTasksByUser(user.id);
      return successResponse(c, tasks);
    } catch (error) {
      console.error('Get tasks error:', error);
      return errorResponse(c, error instanceof Error ? error : new Error('Failed to get tasks'));
    }
  }

  async getTaskById(c: RequestContext) {
    try {
      const user = c.get('user');
      const { id } = c.req.param();

      const task = await this.prisma.findTaskById(id);
      if (!task) {
        throw new TaskError({
          code: 'TASK_NOT_FOUND',
          message: 'Task not found'
        });
      }

      // Verify access
      if (task.userId !== user.id && task.familyId !== user.familyId) {
        throw new TaskError({
          code: 'FORBIDDEN',
          message: 'You do not have access to this task'
        });
      }

      return successResponse(c, task);
    } catch (error) {
      console.error('Get task error:', error);
      return errorResponse(c, error instanceof Error ? error : new Error('Failed to get task'));
    }
  }

  async getTasksByFamily(c: RequestContext) {
    try {
      const user = c.get('user');
      const { familyId } = c.req.param();
      const filters = await this.parseFilters(c);

      // Verify family access
      if (familyId !== user.familyId) {
        throw new TaskError({
          code: 'FORBIDDEN',
          message: 'You do not have access to this family\'s tasks'
        });
      }

      const tasks = await this.prisma.findTasksByFamily(familyId, filters);
      return successResponse(c, tasks);
    } catch (error) {
      console.error('Get family tasks error:', error);
      return errorResponse(c, error instanceof Error ? error : new Error('Failed to get family tasks'));
    }
  }

  async createTask(c: RequestContext) {
    try {
      const user = c.get('user');
      const data = await c.req.json() as CreateTaskInput;

      // Validate required fields
      if (!data.title?.trim()) {
        throw new TaskError({
          code: 'VALIDATION_ERROR',
          message: 'Title is required'
        });
      }

      // Validate status
      if (data.status && !Object.values(TaskStatus).includes(data.status)) {
        throw new TaskError({
          code: 'VALIDATION_ERROR',
          message: 'Invalid status value'
        });
      }

      // Validate priority
      if (data.priority && !Object.values(TaskPriority).includes(data.priority)) {
        throw new TaskError({
          code: 'VALIDATION_ERROR',
          message: 'Invalid priority value'
        });
      }

      // Validate due date
      if (data.dueDate && new Date(data.dueDate) < new Date()) {
        throw new TaskError({
          code: 'VALIDATION_ERROR',
          message: 'Due date cannot be in the past'
        });
      }

      const task = await this.prisma.createTask({
        ...data,
        userId: user.id,
        familyId: user.familyId,
        assignedToId: data.assignedToId ?? user.id
      });

      return successResponse(c, task, 201);
    } catch (error) {
      console.error('Create task error:', error);
      return errorResponse(c, error instanceof Error ? error : new Error('Failed to create task'));
    }
  }

  async updateTask(c: RequestContext) {
    try {
      const user = c.get('user');
      const { id } = c.req.param();
      const data = await c.req.json() as UpdateTaskInput;

      // Verify task exists and user has access
      const existingTask = await this.prisma.findTaskById(id);
      if (!existingTask) {
        throw new TaskError({
          code: 'TASK_NOT_FOUND',
          message: 'Task not found'
        });
      }

      if (existingTask.userId !== user.id && existingTask.familyId !== user.familyId) {
        throw new TaskError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to update this task'
        });
      }

      // Validate status
      if (data.status && !Object.values(TaskStatus).includes(data.status)) {
        throw new TaskError({
          code: 'VALIDATION_ERROR',
          message: 'Invalid status value'
        });
      }

      // Validate priority
      if (data.priority && !Object.values(TaskPriority).includes(data.priority)) {
        throw new TaskError({
          code: 'VALIDATION_ERROR',
          message: 'Invalid priority value'
        });
      }

      // Validate due date
      if (data.dueDate && new Date(data.dueDate) < new Date()) {
        throw new TaskError({
          code: 'VALIDATION_ERROR',
          message: 'Due date cannot be in the past'
        });
      }

      const updatedTask = await this.prisma.updateTask(id, data);
      return successResponse(c, updatedTask);
    } catch (error) {
      console.error('Update task error:', error);
      return errorResponse(c, error instanceof Error ? error : new Error('Failed to update task'));
    }
  }

  async deleteTask(c: RequestContext) {
    try {
      const user = c.get('user');
      const { id } = c.req.param();

      // Verify task exists and user has access
      const task = await this.prisma.findTaskById(id);
      if (!task) {
        throw new TaskError({
          code: 'TASK_NOT_FOUND',
          message: 'Task not found'
        });
      }

      if (task.userId !== user.id && task.familyId !== user.familyId) {
        throw new TaskError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to delete this task'
        });
      }

      await this.prisma.deleteTask(id);
      return successResponse(c, { message: 'Task deleted successfully' });
    } catch (error) {
      console.error('Delete task error:', error);
      return errorResponse(c, error instanceof Error ? error : new Error('Failed to delete task'));
    }
  }

  private async parseFilters(c: Context): Promise<TaskFilters | undefined> {
    const query = c.req.query();
    if (!query) return undefined;

    const filters: TaskFilters = {};

    if (query.status) {
      const statuses = query.status.split(',') as TaskStatus[];
      if (statuses.some(s => !Object.values(TaskStatus).includes(s))) {
        throw new TaskError({
          code: 'VALIDATION_ERROR',
          message: 'Invalid status in filters'
        });
      }
      filters.status = statuses;
    }

    if (query.priority) {
      const priorities = query.priority.split(',') as TaskPriority[];
      if (priorities.some(p => !Object.values(TaskPriority).includes(p))) {
        throw new TaskError({
          code: 'VALIDATION_ERROR',
          message: 'Invalid priority in filters'
        });
      }
      filters.priority = priorities;
    }

    if (query.assignedToId) {
      filters.assignedToId = query.assignedToId;
    }

    if (query.tags) {
      filters.tags = query.tags.split(',');
    }

    if (query.parentTaskId) {
      filters.parentTaskId = query.parentTaskId;
    }

    if (query.hasSubtasks) {
      filters.hasSubtasks = query.hasSubtasks === 'true';
    }

    if (query.dueDate) {
      const [start, end] = query.dueDate.split(',');
      filters.dueDate = {
        ...(start && { start: new Date(start) }),
        ...(end && { end: new Date(end) })
      };
    }

    return filters;
  }
}
