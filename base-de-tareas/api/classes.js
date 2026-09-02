import { db, initDatabase } from "./_db.js";
import { verifyToken, logActivity } from "./_auth.js";

export default async function handler(req, res) {
  await initDatabase();

  const userAuth = verifyToken(req);

  // 1. OBTENER TODAS LAS CLASES (GET)
  if (req.method === "GET") {
    try {
      const classesRes = await db.execute(`
        SELECT c.*, u.name as creator_name, u.avatar_url as creator_avatar 
        FROM classes c
        LEFT JOIN users u ON c.created_by = u.id
        ORDER BY c.created_at ASC;
      `);

      const classes = [];
      const currentUserId = userAuth?.id || null;

      for (const row of classesRes.rows) {
        // Tareas en esta clase
        const tasksRes = await db.execute({
          sql: "SELECT id FROM tasks WHERE class_id = ?;",
          args: [row.id],
        });
        const taskIds = tasksRes.rows.map(t => t.id);
        const totalTasks = taskIds.length;

        let myCompletedTasks = 0;
        let groupTotalCompletions = 0;

        if (totalTasks > 0) {
          // Si el usuario actual está logueado, cuántas completó
          if (currentUserId) {
            const myCompRes = await db.execute({
              sql: `SELECT COUNT(*) as count FROM task_completions 
                    WHERE user_id = ? AND completed = 1 AND task_id IN (${taskIds.map(() => '?').join(',')});`,
              args: [currentUserId, ...taskIds],
            });
            myCompletedTasks = Number(myCompRes.rows[0]?.count || 0);
          }

          // Total grupal de completados
          const groupCompRes = await db.execute({
            sql: `SELECT COUNT(*) as count FROM task_completions 
                  WHERE completed = 1 AND task_id IN (${taskIds.map(() => '?').join(',')});`,
            args: taskIds,
          });
          groupTotalCompletions = Number(groupCompRes.rows[0]?.count || 0);
        }

        const myProgressPercent = totalTasks > 0 ? Math.round((myCompletedTasks / totalTasks) * 100) : 0;

        let topics = ["Tema 1", "Tema 2", "Tema 3"];
        try {
          if (row.topics) {
            topics = typeof row.topics === "string" ? JSON.parse(row.topics) : row.topics;
          }
        } catch (e) {
          topics = ["Tema 1", "Tema 2", "Tema 3"];
        }

        classes.push({
          ...row,
          topics,
          total_tasks: totalTasks,
          my_completed_tasks: myCompletedTasks,
          my_progress_percent: myProgressPercent,
          group_total_completions: groupTotalCompletions,
        });
      }

      return res.status(200).json({ classes });
    } catch (error) {
      console.error("Error en classes GET:", error);
      return res.status(500).json({ error: "Error al obtener clases: " + error.message });
    }
  }

  // Las operaciones de escritura requieren sesión
  if (!userAuth) {
    return res.status(401).json({ error: "Debes iniciar sesión para realizar esta acción." });
  }

  // 2. CREAR CLASE (POST)
  if (req.method === "POST") {
    try {
      const { name, code, teacher, schedule, color, icon, topics } = req.body || {};

      if (!name) {
        return res.status(400).json({ error: "El nombre de la clase es obligatorio." });
      }

      const classId = "cls_" + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
      const classColor = color || "#6366f1";
      const classIcon = icon || "📚";
      const topicsJson = JSON.stringify(Array.isArray(topics) && topics.length > 0 ? topics : ["Tema 1", "Tema 2", "Tema 3"]);

      await db.execute({
        sql: `INSERT INTO classes (id, name, code, teacher, schedule, color, icon, topics, created_by)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        args: [
          classId,
          name.trim(),
          (code || "").trim(),
          (teacher || "").trim(),
          (schedule || "").trim(),
          classColor,
          classIcon,
          topicsJson,
          userAuth.id,
        ],
      });

      // Log activity
      await logActivity(db, {
        userId: userAuth.id,
        actionType: "CREAR_CLASE",
        targetType: "class",
        targetId: classId,
        targetTitle: name.trim(),
        details: `Creó la materia "${name.trim()}" con código ${code || "N/A"}.`,
      });

      return res.status(201).json({
        message: "Clase creada exitosamente.",
        classId,
      });
    } catch (error) {
      console.error("Error en classes POST:", error);
      return res.status(500).json({ error: "Error al crear la clase: " + error.message });
    }
  }

  // 3. EDITAR CLASE (PUT)
  if (req.method === "PUT") {
    try {
      const { id, name, code, teacher, schedule, color, icon, topics } = req.body || {};

      if (!id || !name) {
        return res.status(400).json({ error: "El ID y el nombre de la clase son obligatorios." });
      }

      const topicsJson = JSON.stringify(Array.isArray(topics) && topics.length > 0 ? topics : ["Tema 1", "Tema 2", "Tema 3"]);

      await db.execute({
        sql: `UPDATE classes SET name = ?, code = ?, teacher = ?, schedule = ?, color = ?, icon = ?, topics = ?
              WHERE id = ?;`,
        args: [
          name.trim(),
          (code || "").trim(),
          (teacher || "").trim(),
          (schedule || "").trim(),
          color || "#6366f1",
          icon || "📚",
          topicsJson,
          id,
        ],
      });

      // Log activity
      await logActivity(db, {
        userId: userAuth.id,
        actionType: "EDITAR_CLASE",
        targetType: "class",
        targetId: id,
        targetTitle: name.trim(),
        details: `Actualizó los detalles y temas de la clase "${name.trim()}".`,
      });

      return res.status(200).json({ message: "Clase actualizada exitosamente." });
    } catch (error) {
      console.error("Error en classes PUT:", error);
      return res.status(500).json({ error: "Error al actualizar la clase: " + error.message });
    }
  }

  // 4. ELIMINAR CLASE (DELETE)
  if (req.method === "DELETE") {
    try {
      const { id } = req.query || req.body || {};

      if (!id) {
        return res.status(400).json({ error: "Se requiere el ID de la clase a eliminar." });
      }

      // Obtener nombre antes de borrar
      const clsRes = await db.execute({
        sql: "SELECT name FROM classes WHERE id = ?;",
        args: [id],
      });
      const clsName = clsRes.rows[0]?.name || "Clase";

      await db.execute({
        sql: "DELETE FROM classes WHERE id = ?;",
        args: [id],
      });

      // Log activity
      await logActivity(db, {
        userId: userAuth.id,
        actionType: "ELIMINAR_CLASE",
        targetType: "class",
        targetId: id,
        targetTitle: clsName,
        details: `Eliminó la clase "${clsName}" y sus tareas asociadas.`,
      });

      return res.status(200).json({ message: "Clase eliminada exitosamente." });
    } catch (error) {
      console.error("Error en classes DELETE:", error);
      return res.status(500).json({ error: "Error al eliminar la clase: " + error.message });
    }
  }

  return res.status(405).json({ error: "Método no permitido." });
}
