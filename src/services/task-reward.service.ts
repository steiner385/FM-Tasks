import { prisma } from '../../lib/prisma';
import { TransactionService } from '../banking/transaction.service';
import { Task, TaskReward } from '@prisma/client';

export class TaskRewardService {
  constructor(private transactionService: TransactionService) {}

  async processTaskCompletion(taskId: string, qualityRating: number): Promise<TaskReward> {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { reward: true }
    });
    if (!task || !task.reward) throw new Error('Task or reward not found');

    let finalAmount = task.reward.amount;

    // Apply quality rating multiplier for variable rewards
    if (task.reward.type === 'VARIABLE') {
      finalAmount *= (qualityRating / 5); // Assuming 5 is max rating
    }

    // Apply streak bonus if applicable
    if (task.reward.conditions?.streakBonus) {
      const streak = await this.calculateUserStreak(task.userId);
      finalAmount += task.reward.conditions.streakBonus * streak;
    }

    // Create reward transaction
    await this.transactionService.requestTransaction({
      fromAccountId: task.familyId, // Assuming family account pays rewards
      toAccountId: task.reward.accountId,
      amount: finalAmount,
      category: 'TASK_REWARD',
      description: `Reward for task: ${task.title}`
    });

    return prisma.taskReward.update({
      where: { id: task.reward.id },
      data: {
        finalAmount,
        paidAt: new Date()
      }
    });
  }

  private async calculateUserStreak(userId: string): Promise<number> {
    const recentTasks = await prisma.task.findMany({
      where: {
        userId,
        status: 'COMPLETED',
        completedAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
        }
      },
      orderBy: { completedAt: 'desc' }
    });

    let streak = 0;
    for (let i = 0; i < recentTasks.length - 1; i++) {
      const dayDiff = Math.abs(
        recentTasks[i].completedAt.getDate() - recentTasks[i + 1].completedAt.getDate()
      );
      if (dayDiff === 1) streak++;
      else break;
    }
    return streak;
  }
}
