import { getDb } from './db.js';
import { cancelReminderEmail } from './email.js';

export async function cancelTaskReminders(taskIds) {
  if (!taskIds.length) return;
  const placeholders = taskIds.map(() => '?').join(',');
  const result = await getDb().execute({
    sql: `SELECT id, provider_email_id, status FROM reminders
          WHERE task_id IN (${placeholders}) AND status IN ('pending', 'scheduled')`,
    args: taskIds,
  });
  for (const reminder of result.rows) {
    if (reminder.status === 'scheduled') await cancelReminderEmail(reminder.provider_email_id);
    await getDb().execute({
      sql: `UPDATE reminders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      args: [reminder.id],
    });
  }
}
