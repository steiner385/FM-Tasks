import { Hono } from 'hono';
import { TaskController } from './controllers/TaskController';
import { CustomPrismaClient } from './prisma/client';

const prisma = new CustomPrismaClient();
const taskController = new TaskController(prisma);

const app = new Hono();

// Task routes
app.get('/tasks', (c) => taskController.getTasks(c));
app.get('/tasks/:id', (c) => taskController.getTaskById(c));
app.get('/tasks/family/:familyId', (c) => taskController.getTasksByFamily(c));
app.post('/tasks', (c) => taskController.createTask(c));
app.put('/tasks/:id', (c) => taskController.updateTask(c));
app.delete('/tasks/:id', (c) => taskController.deleteTask(c));

// Health check
app.get('/health', (c) => c.json({ status: 'ok' }));

export { app };
