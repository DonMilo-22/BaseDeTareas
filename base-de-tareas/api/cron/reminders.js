import { db, initDatabase } from "../_db.js";
import { resolveRecipients, sendDueReminder } from "../_email.js";

function isAuthorized(req) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return req.headers?.authorization === `Bearer ${secret}`;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Método no permitido. Utilice GET." });
  }

  if (!process.env.CRON_SECRET?.trim()) {
    return res.status(503).json({ error: "CRON_SECRET no está configurada." });
  }

  if (!isAuthorized(req)) {
    return res.status(401).json({ error: "No autorizado." });
  }

  await initDatabase();

  try {
    const now = new Date();
    const limit = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const tasksResult = await db.execute({
      sql: `
        SELECT t.id, t.title, t.topic, t.description, t.due_date, t.priority,
               c.name AS class_name
        FROM tasks t
        LEFT JOIN classes c ON CAST(t.class_id AS NUMERIC) = CAST(c.id AS NUMERIC)
        WHERE datetime(t.due_date) > datetime(?)
          AND datetime(t.due_date) <= datetime(?)
        ORDER BY datetime(t.due_date) ASC;
      `,
      args: [now.toISOString(), limit.toISOString()],
    });

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const task of tasksResult.rows) {
      const pendingResult = await db.execute({
        sql: `
          SELECT u.id, u.name, u.email
          FROM users u
          WHERE u.email IS NOT NULL
            AND TRIM(u.email) <> ''
            AND NOT EXISTS (
              SELECT 1
              FROM task_completions tc
              WHERE tc.task_id = ?
                AND CAST(tc.user_id AS TEXT) = CAST(u.id AS TEXT)
                AND tc.completed = 1
            );
        `,
        args: [task.id],
      });

      const recipients = resolveRecipients(pendingResult.rows);
      for (const recipient of recipients) {
        const recipientId = String(recipient.id);
        const reservation = await db.execute({
          sql: `
            INSERT OR IGNORE INTO email_notifications
              (task_id, user_id, notification_type, recipient_email, created_at)
            VALUES (?, ?, 'due_24h', ?, ?);
          `,
          args: [task.id, recipientId, recipient.email, new Date().toISOString()],
        });

        if (Number(reservation.rowsAffected || 0) === 0) {
          skipped++;
          continue;
        }

        try {
          const result = await sendDueReminder({
            task,
            recipient,
            notificationKey: `due-24h-${task.id}-${recipientId}`,
          });

          if (result.skipped) {
            await db.execute({
              sql: "DELETE FROM email_notifications WHERE task_id = ? AND user_id = ? AND notification_type = 'due_24h';",
              args: [task.id, recipientId],
            });
            skipped++;
            continue;
          }

          await db.execute({
            sql: `
              UPDATE email_notifications
              SET sent_at = ?, provider_id = ?
              WHERE task_id = ? AND user_id = ? AND notification_type = 'due_24h';
            `,
            args: [new Date().toISOString(), result.id || null, task.id, recipientId],
          });
          sent++;
        } catch (error) {
          failed++;
          console.error(`Error enviando recordatorio ${task.id}/${recipientId}:`, error.message);
          await db.execute({
            sql: "DELETE FROM email_notifications WHERE task_id = ? AND user_id = ? AND notification_type = 'due_24h';",
            args: [task.id, recipientId],
          });
        }
      }
    }

    return res.status(200).json({
      success: true,
      tasksDueSoon: tasksResult.rows.length,
      sent,
      skipped,
      failed,
      checkedAt: now.toISOString(),
    });
  } catch (error) {
    console.error("Error en recordatorios programados:", error);
    return res.status(500).json({ error: "No se pudieron procesar los recordatorios." });
  }
}
