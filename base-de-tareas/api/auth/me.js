import { db, initDatabase } from "../_db.js";
import { verifyToken, createToken } from "../_auth.js";

export default async function handler(req, res) {
  await initDatabase();

  const userAuth = verifyToken(req);
  if (!userAuth) {
    return res.status(401).json({ error: "Sesión no válida o expirada. Inicia sesión nuevamente." });
  }

  if (req.method === "GET") {
    try {
      const userRes = await db.execute({
        sql: "SELECT id, name, email, avatar_url, created_at FROM users WHERE id = ?;",
        args: [userAuth.id],
      });

      if (userRes.rows.length === 0) {
        return res.status(404).json({ error: "Usuario no encontrado." });
      }

      const user = userRes.rows[0];

      // Estadísticas del usuario
      const totalTasksRes = await db.execute("SELECT COUNT(*) as count FROM tasks;");
      const totalTasks = Number(totalTasksRes.rows[0]?.count || 0);

      const completedRes = await db.execute({
        sql: "SELECT COUNT(*) as count FROM task_completions WHERE user_id = ? AND completed = 1;",
        args: [user.id],
      });
      const completedTasks = Number(completedRes.rows[0]?.count || 0);
      const pendingTasks = Math.max(0, totalTasks - completedTasks);
      const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

      return res.status(200).json({
        user,
        stats: {
          totalTasks,
          completedTasks,
          pendingTasks,
          progressPercent,
        },
      });
    } catch (error) {
      console.error("Error en auth/me GET:", error);
      return res.status(500).json({ error: "Error al obtener perfil: " + error.message });
    }
  }

  if (req.method === "PUT") {
    try {
      const { name, avatar_url } = req.body || {};

      if (!name) {
        return res.status(400).json({ error: "El nombre no puede estar vacío." });
      }

      await db.execute({
        sql: "UPDATE users SET name = ?, avatar_url = ? WHERE id = ?;",
        args: [name.trim(), avatar_url || userAuth.avatar_url, userAuth.id],
      });

      const updatedUser = {
        id: userAuth.id,
        name: name.trim(),
        email: userAuth.email,
        avatar_url: avatar_url || userAuth.avatar_url,
      };

      const newToken = createToken(updatedUser);

      return res.status(200).json({
        message: "Perfil actualizado correctamente.",
        user: updatedUser,
        token: newToken,
      });
    } catch (error) {
      console.error("Error en auth/me PUT:", error);
      return res.status(500).json({ error: "Error al actualizar perfil: " + error.message });
    }
  }

  return res.status(405).json({ error: "Método no permitido." });
}
