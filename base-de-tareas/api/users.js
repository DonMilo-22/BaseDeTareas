import { db, initDatabase } from "./_db.js";

export default async function handler(req, res) {
  await initDatabase();

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Método no permitido. Utilice GET." });
  }

  try {
    const totalTasksRes = await db.execute("SELECT COUNT(*) as count FROM tasks;");
    const totalTasks = Number(totalTasksRes.rows[0]?.count || 0);

    const usersRes = await db.execute(`
      SELECT u.id, u.name, u.email, u.avatar_url, u.created_at,
             (SELECT COUNT(*) FROM task_completions tc WHERE tc.user_id = u.id AND tc.completed = 1) as completed_tasks
      FROM users u
      ORDER BY completed_tasks DESC, u.name ASC;
    `);

    const users = usersRes.rows.map(u => ({
      ...u,
      completed_tasks: Number(u.completed_tasks || 0),
      total_tasks: totalTasks,
      progress_percent: totalTasks > 0 ? Math.round((Number(u.completed_tasks || 0) / totalTasks) * 100) : 0,
    }));

    return res.status(200).json({ users });
  } catch (error) {
    console.error("Error en users GET:", error);
    return res.status(500).json({ error: "Error al obtener compañeros: " + error.message });
  }
}
