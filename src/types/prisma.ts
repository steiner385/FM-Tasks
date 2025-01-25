import { Prisma } from '@prisma/client';

export type Task = {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: Date | null;
  userId: string;
  familyId: string;
  assignedToId: string | null;
  completedAt: Date | null;
  tags: string | null;
  parentTaskId: string | null;
  subTasks?: Task[];
};

export type TaskWhereInput = {
  id?: string;
  userId?: string;
  familyId?: string;
  assignedToId?: string;
  status?: { in: string[] };
  priority?: { in: string[] };
  tags?: { contains: string };
  parentTaskId?: string;
  subTasks?: { some: {} } | { none: {} };
  dueDate?: {
    gte?: Date;
    lte?: Date;
  };
  OR?: TaskWhereInput[];
};
