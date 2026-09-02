import { db, initDatabase } from "./_db.js";
import { verifyToken, logActivity } from "./_auth.js";

export default async function handler(req, res) {
  await initDatabase();

  const userAuth = verifyToken(req);
  const currentUserId = userAuth?.id || null;

  // 1. OBTENER TAREAS (GET)
  if (req.method === "GET") {
    try {
      const { class_id, status, priority, topic, search } = req.query || {};

      let query = `
        SELECT t.*, 
               c.name as class_name, c.color as class_color, c.icon as class_icon, c.code as class_code,
               u_cr.name as creator_name, u_cr.avatar_url as creator_avatar,
               u_up.name as updater_name, u_up.avatar_url as updater_avatar
        FROM tasks t
        JOIN classes c ON t.class_id = c.id
        LEFT JOIN users u_cr ON t.created_by = u_cr.id
        LEFT JOIN users u_up ON t.updated_by = u_up.id
        WHERE 1=1
      `;
      const args = [];

      if (class_id && class_id !== "todas") {
        query += " AND t.class_id = ?";
        args.push(class_id);
      }

      if (topic && topic !== "todos") {
        query += " AND t.topic = ?";
        args.push(topic);
      }

      if (priority && priority !== "todas") {
        query += " AND t.priority = ?";
        args.push(priority);
      }

      if (search && search.trim()) {
        query += " AND (LOWER(t.title) LIKE ? OR LOWER(t.description) LIKE ?)";
        const term = `%${search.trim().toLowerCase()}%`;
        args.push(term, term);
      }

      query += " ORDER BY t.due_date ASC;";

      const tasksRes = await db.execute({ sql: query, args });

      // Obtener todos los usuarios registrados para calcular el estado de todos los compañeros
      const allUsersRes = await db.execute("SELECT id, name, avatar_url FROM users ORDER BY name ASC;");
      const allUsers = allUsersRes.rows;
      const totalStudents = allUsers.length;

      // Obtener todos los completions para las tareas encontradas
      const taskIds = tasksRes.rows.map(t => t.id);
      let allCompletions = [];
      if (taskIds.length > 0) {
        const placeholders = taskIds.map(() => '?').join(',');
        const compRes = await db.execute({
          sql: `SELECT * FROM task_completions WHERE task_id IN (${placeholders}) AND completed = 1;`,
          args: taskIds,
        });
        allCompletions = compRes.rows;
      }

      let tasks = tasksRes.rows.map(task => {
        let photos = [];
        try {
          photos = typeof task.photos === "string" ? JSON.parse(task.photos || "[]") : (task.photos || []);
        } catch (e) {
          photos = [];
        }

        // Completions para esta tarea específica
        const taskCompMap = new Map();
        allCompletions
          .filter(c => c.task_id === task.id)
          .forEach(c => taskCompMap.set(c.user_id, c.completed_at));

        const completedByMe = currentUserId ? (taskCompMap.has(currentUserId) ? 1 : 0) : 0;

        // Lista de compañeros con su estado en esta tarea
        const completionsList = allUsers.map(user => {
          const isCompleted = taskCompMap.has(user.id);
          return {
            user_id: user.id,
            name: user.name,
            avatar_url: user.avatar_url,
            completed: isCompleted ? 1 : 0,
            completed_at: isCompleted ? taskCompMap.get(user.id) : null,
          };
        });

        const totalCompleted = completionsList.filter(c => c.completed === 1).length;
        const completionPercent = totalStudents > 0 ? Math.round((totalCompleted / totalStudents) * 100) : 0;

        return {
          ...task,
          topic: task.topic || 'Tema 1',
          photos,
          completed_by_me: completedByMe,
          total_completed: totalCompleted,
          total_students: totalStudents,
          completion_percent: completionPercent,
          completions_list: completionsList,
        };
      });

      // Filtrar por status personal si se solicita (completada / pendiente)
      if (status === "completadas") {
        tasks = tasks.filter(t => t.completed_by_me === 1);
      } else if (status === "pendientes") {
        tasks = tasks.filter(t => t.completed_by_me === 0);
      }

      return res.status(200).json({ tasks });
    } catch (error) {
      console.error("Error en tasks GET:", error);
      return res.status(500).json({ error: "Error al obtener tareas: " + error.message });
    }
  }

  // Las operaciones de escritura requieren sesión
  if (!userAuth) {
    return res.status(401).json({ error: "Debes iniciar sesión para crear o modificar tareas." });
  }

  // 2. CREAR TAREA (POST)
  if (req.method === "POST") {
    try {
      const { class_id, title, topic, description, due_date, priority, photos } = req.body || {};

      if (!class_id || !title || !due_date) {
        return res.status(400).json({ error: "La clase, título y fecha límite son obligatorios." });
      }

      const taskId = "tsk_" + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
      const photosJson = JSON.stringify(Array.isArray(photos) ? photos : []);
      const nowIso = new Date().toISOString();
      const taskTopic = (topic || "Tema 1").trim();

      await db.execute({
        sql: `INSERT INTO tasks (id, class_id, title, topic, description, due_date, priority, photos, created_by, updated_by, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        args: [
          taskId,
          class_id,
          title.trim(),
          taskTopic,
          (description || "").trim(),
          due_date,
          priority || "media",
          photosJson,
          userAuth.id,
          userAuth.id,
          nowIso,
          nowIso,
        ],
      });

      // Obtener nombre de la clase para el log
      const clsRes = await db.execute({ sql: "SELECT name FROM classes WHERE id = ?;", args: [class_id] });
      const className = clsRes.rows[0]?.name || "Clase";

      const photosCount = Array.isArray(photos) ? photos.length : 0;
      const detailsMsg = photosCount > 0
        ? `Añadió nueva tarea en [${taskTopic}] para ${className} con ${photosCount} ${photosCount === 1 ? 'imagen de referencia' : 'imágenes de referencia'}.`
        : `Añadió nueva tarea en [${taskTopic}] para ${className}.`;

      // Log activity
      await logActivity(db, {
        userId: userAuth.id,
        actionType: "CREAR_TAREA",
        targetType: "task",
        targetId: taskId,
        targetTitle: title.trim(),
        details: detailsMsg,
      });

      return res.status(201).json({
        message: "¡Tarea creada exitosamente!",
        taskId,
      });
    } catch (error) {
      console.error("Error en tasks POST:", error);
      return res.status(500).json({ error: "Error al crear la tarea: " + error.message });
    }
  }

  // 3. EDITAR TAREA (PUT)
  if (req.method === "PUT") {
    try {
      const { id, class_id, title, topic, description, due_date, priority, photos } = req.body || {};

      if (!id || !title || !due_date || !class_id) {
        return res.status(400).json({ error: "ID, clase, título y fecha límite son obligatorios." });
      }

      const photosJson = JSON.stringify(Array.isArray(photos) ? photos : []);
      const nowIso = new Date().toISOString();
      const taskTopic = (topic || "Tema 1").trim();

      await db.execute({
        sql: `UPDATE tasks 
              SET class_id = ?, title = ?, topic = ?, description = ?, due_date = ?, priority = ?, photos = ?, updated_by = ?, updated_at = ?
              WHERE id = ?;`,
        args: [
          class_id,
          title.trim(),
          taskTopic,
          (description || "").trim(),
          due_date,
          priority || "media",
          photosJson,
          userAuth.id,
          nowIso,
          id,
        ],
      });

      // Log activity
      await logActivity(db, {
        userId: userAuth.id,
        actionType: "EDITAR_TAREA",
        targetType: "task",
        targetId: id,
        targetTitle: title.trim(),
        details: `Actualizó la información, fecha de entrega o fotos de referencia de la tarea.`,
      });

      return res.status(200).json({ message: "Tarea actualizada exitosamente." });
    } catch (error) {
      console.error("Error en tasks PUT:", error);
      return res.status(500).json({ error: "Error al actualizar la tarea: " + error.message });
    }
  }

  // 4. ELIMINAR TAREA (DELETE)
  if (req.method === "DELETE") {
    try {
      const { id } = req.query || req.body || {};

      if (!id) {
        return res.status(400).json({ error: "Se requiere el ID de la tarea a eliminar." });
      }

      const taskRes = await db.execute({
        sql: "SELECT title FROM tasks WHERE id = ?;",
        args: [id],
      });
      const taskTitle = taskRes.rows[0]?.title || "Tarea";

      await db.execute({
        sql: "DELETE FROM tasks WHERE id = ?;",
        args: [id],
      });

      // Log activity
      await logActivity(db, {
        userId: userAuth.id,
        actionType: "ELIMINAR_TAREA",
        targetType: "task",
        targetId: id,
        targetTitle: taskTitle,
        details: `Eliminó la tarea "${taskTitle}".`,
      });

      return res.status(200).json({ message: "Tarea eliminada exitosamente." });
    } catch (error) {
      console.error("Error en tasks DELETE:", error);
      return res.status(500).json({ error: "Error al eliminar la tarea: " + error.message });
    }
  }

  return res.status(405).json({ error: "Método no permitido." });
}
