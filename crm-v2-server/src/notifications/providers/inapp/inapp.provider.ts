import { Injectable } from "@nestjs/common";

@Injectable()
export class InAppNotificationProvider {
  sendNotification(userId: string, message: string): void {
    // Logic to send in-app notification
    console.log(`In-app notification sent to user ${userId}: ${message}`);
  }

  async createNotification(): Promise<void> {
    // TODO: Implement notification creation logic
  }

  async findAll(): Promise<any[]> {
    // TODO: Implement find all notifications logic
    return [];
  } 
}