import { db, initDatabase } from "../_db.js";
import { verifyToken, logActivity } from "../_auth.js";

export default async function handler(req, res) {
  await initDatabase();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido. Utilice POST." });
  }

  const userAuth = verifyToken(req);
  if (!userAuth) {
    return res.status(401).json({ error: "Debes iniciar sesión para marcar tus tareas." });
  }

  try {
    const { task_id, completed } = req.body || {};

    if (!task_id) {
      return res.status(400).json({ error: "El ID de la tarea es obligatorio." });
    }

    // Obtener información de la tarea
    const taskRes = await db.execute({
      sql: "SELECT title FROM tasks WHERE id = ?;",
      args: [task_id],
    });

    if (taskRes.rows.length === 0) {
      return res.status(404).json({ error: "Tarea no encontrada." });
    }

    const taskTitle = taskRes.rows[0].title;
    const isCompleted = completed === 1 || completed === true || completed === "1";
    const compId = `cmp_${task_id}_${userAuth.id}`;

    if (isCompleted) {
      // Marcar como completada
      await db.execute({
        sql: `INSERT INTO task_completions (id, task_id, user_id, completed, completed_at)
              VALUES (?, ?, ?, 1, ?)
              ON CONFLICT(task_id, user_id) DO UPDATE SET completed = 1, completed_at = ?;`,
        args: [compId, task_id, userAuth.id, new Date().toISOString(), new Date().toISOString()],
      });

      await logActivity(db, {
        userId: userAuth.id,
        actionType: "COMPLETAR_TAREA",
        targetType: "task",
        targetId: task_id,
        targetTitle: taskTitle,
        details: `Completó la tarea "${taskTitle}".`,
      });
    } else {
      // Marcar como pendiente
      await db.execute({
        sql: `DELETE FROM task_completions WHERE task_id = ? AND user_id = ?;`,
        args: [task_id, userAuth.id],
      });

      await logActivity(db, {
        userId: userAuth.id,
        actionType: "DESMARCAR_TAREA",
        targetType: "task",
        targetId: task_id,
        targetTitle: taskTitle,
        details: `Marcó la tarea "${taskTitle}" como pendiente.`,
      });
    }

    return res.status(200).json({
      message: isCompleted ? "¡Tarea completada! Gran trabajo." : "Tarea marcada como pendiente.",
      task_id,
      completed: isCompleted ? 1 : 0,
    });
  } catch (error) {
    console.error("Error en tasks/status:", error);
    return res.status(500).json({ error: "Error al actualizar estado: " + error.message });
  }
}
