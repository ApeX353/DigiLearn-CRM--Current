import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The bell asks "how many unread for this person" on every poll. The only
 * index on user_notifications was the primary key (userId, notificationId),
 * so each count walked every row the person ever received and re-checked
 * isRead on the heap (Tanya: 172k rows). A partial index on the unread rows
 * answers the count and the group summary from the index alone.
 */
export class UserNotificationsUnreadIndex1797000000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE INDEX IF NOT EXISTS "idx_user_notifications_unread"
      ON user_notifications ("userId", "notificationId") WHERE "isRead" = 0`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "idx_user_notifications_unread"`);
  }
}
