import { db, initDatabase } from "./_db.js";
import { verifyToken } from "./_auth.js";

export default async function handler(req, res) {
  await initDatabase();

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Método no permitido. Utilice GET." });
  }

  try {
    const userAuth = verifyToken(req);
    const currentUserId = userAuth?.id || null;

    // Total de tareas
    const totalTasksRes = await db.execute("SELECT COUNT(*) as count FROM tasks;");
    const totalTasks = Number(totalTasksRes.rows[0]?.count || 0);

    // Total de clases
    const totalClassesRes = await db.execute("SELECT COUNT(*) as count FROM classes;");
    const totalClasses = Number(totalClassesRes.rows[0]?.count || 0);

    // Total de compañeros
    const totalUsersRes = await db.execute("SELECT COUNT(*) as count FROM users;");
    const totalStudents = Number(totalUsersRes.rows[0]?.count || 0);

    // Mis tareas completadas
    let myCompletedTasks = 0;
    if (currentUserId) {
      const myCompRes = await db.execute({
        sql: "SELECT COUNT(*) as count FROM task_completions WHERE user_id = ? AND completed = 1;",
        args: [currentUserId],
      });
      myCompletedTasks = Number(myCompRes.rows[0]?.count || 0);
    }

    const myPendingTasks = Math.max(0, totalTasks - myCompletedTasks);
    const myProgressPercent = totalTasks > 0 ? Math.round((myCompletedTasks / totalTasks) * 100) : 0;

    // Tareas urgentes o próximas a vencer (en las próximas 48h)
    const now = new Date();
    const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();
    const urgentTasksRes = await db.execute({
      sql: `SELECT COUNT(*) as count FROM tasks WHERE due_date <= ?;`,
      args: [in48h],
    });
    const urgentTasksCount = Number(urgentTasksRes.rows[0]?.count || 0);

    // Progreso grupal total
    const totalPossibleCompletions = totalTasks * totalStudents;
    const allCompletionsRes = await db.execute("SELECT COUNT(*) as count FROM task_completions WHERE completed = 1;");
    const totalCompletions = Number(allCompletionsRes.rows[0]?.count || 0);
    const groupProgressPercent = totalPossibleCompletions > 0 
      ? Math.round((totalCompletions / totalPossibleCompletions) * 100) 
      : 0;

    return res.status(200).json({
      totalTasks,
      totalClasses,
      totalStudents,
      myCompletedTasks,
      myPendingTasks,
      myProgressPercent,
      urgentTasksCount,
      groupProgressPercent,
    });
  } catch (error) {
    console.error("Error en stats GET:", error);
    return res.status(500).json({ error: "Error al obtener estadísticas: " + error.message });
  }
}
