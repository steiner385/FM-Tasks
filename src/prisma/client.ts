import { PrismaClient } from '@prisma/client';
import { TaskError } from '../errors';
import { CreateTaskInput, UpdateTaskInput, TaskFilters } from '../types/task';
import { Task, TaskWhereInput } from '../types/prisma';

export class CustomPrismaClient extends PrismaClient {
  async findTaskById(id: string): Promise<Task | null> {
    return this.task.findUnique({
      where: { id }
    });
  }

  async findTasksByUser(userId: string): Promise<Task[]> {
    return this.task.findMany({
      where: {
        OR: [
          { userId },
          { assignedToId: userId }
        ]
      },
      orderBy: [
        { priority: 'asc' },
        { dueDate: 'asc' }
      ]
    });
  }

  async findTasksByFamily(familyId: string, filters?: TaskFilters): Promise<Task[]> {
    const where: TaskWhereInput = {
      familyId,
      ...(filters?.status && { status: { in: filters.status } }),
      ...(filters?.priority && { priority: { in: filters.priority } }),
      ...(filters?.assignedToId && { assignedToId: filters.assignedToId }),
      ...(filters?.tags && { tags: { contains: filters.tags.join(',') } }),
      ...(filters?.parentTaskId && { parentTaskId: filters.parentTaskId }),
      ...(filters?.hasSubtasks !== undefined && {
        subTasks: filters.hasSubtasks ? { some: {} } : { none: {} }
      }),
      ...(filters?.dueDate && {
        dueDate: {
          ...(filters.dueDate.start && { gte: filters.dueDate.start }),
          ...(filters.dueDate.end && { lte: filters.dueDate.end })
        }
      })
    };

    return this.task.findMany({
      where,
      orderBy: [
        { priority: 'asc' },
        { dueDate: 'asc' }
      ],
      include: {
        subTasks: true
      }
    });
  }

  async createTask(data: CreateTaskInput & { userId: string; familyId: string }): Promise<Task> {
    try {
      // Check for circular dependencies if parentTaskId is provided
      if (data.parentTaskId) {
        const parentTask = await this.findTaskById(data.parentTaskId);
        if (!parentTask) {
          throw new TaskError({
            code: 'TASK_NOT_FOUND',
            message: 'Parent task not found'
          });
        }

        // Prevent circular dependencies
        if (await this.hasCircularDependency(data.parentTaskId, [])) {
          throw new TaskError({
            code: 'SUBTASK_CYCLE',
            message: 'Circular dependency detected in subtasks'
          });
        }
      }

      return this.task.create({
        data: {
          ...data,
          tags: data.tags?.join(',')
        }
      });
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'P2002') {
        throw new TaskError({
          code: 'VALIDATION_ERROR',
          message: 'Task with this ID already exists'
        });
      }
      throw error;
    }
  }

  async updateTask(id: string, data: UpdateTaskInput): Promise<Task> {
    try {
      // Check if task exists
      const existingTask = await this.findTaskById(id);
      if (!existingTask) {
        throw new TaskError({
          code: 'TASK_NOT_FOUND',
          message: 'Task not found'
        });
      }

      // If changing parent task, check for circular dependencies
      if (data.parentTaskId && data.parentTaskId !== existingTask.parentTaskId) {
        if (await this.hasCircularDependency(data.parentTaskId, [id])) {
          throw new TaskError({
            code: 'SUBTASK_CYCLE',
            message: 'Circular dependency detected in subtasks'
          });
        }
      }

      return this.task.update({
        where: { id },
        data: {
          ...data,
          tags: data.tags?.join(',')
        }
      });
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'P2025') {
        throw new TaskError({
          code: 'TASK_NOT_FOUND',
          message: 'Task not found'
        });
      }
      throw error;
    }
  }

  async deleteTask(id: string): Promise<void> {
    try {
      await this.task.delete({
        where: { id }
      });
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'P2025') {
        throw new TaskError({
          code: 'TASK_NOT_FOUND',
          message: 'Task not found'
        });
      }
      throw error;
    }
  }

  private async hasCircularDependency(taskId: string, visited: string[]): Promise<boolean> {
    if (visited.includes(taskId)) {
      return true;
    }

    const task = await this.findTaskById(taskId);
    if (!task || !task.parentTaskId) {
      return false;
    }

    return this.hasCircularDependency(task.parentTaskId, [...visited, taskId]);
  }
}
