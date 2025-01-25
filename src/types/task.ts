export enum TaskStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED'
}

export enum TaskPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT'
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: string | Date;
  assignedToId?: string;
  parentTaskId?: string;
  tags?: string[];
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: string | Date;
  assignedToId?: string;
  completedAt?: string | Date;
  parentTaskId?: string;
  tags?: string[];
}

export interface TaskFilters {
  status?: TaskStatus[];
  priority?: TaskPriority[];
  assignedToId?: string;
  dueDate?: {
    start?: Date;
    end?: Date;
  };
  tags?: string[];
  parentTaskId?: string;
  hasSubtasks?: boolean;
}

export interface UserContext {
  id: string;
  role: string;
  familyId: string;
}
