import { db, initDatabase } from "./_db.js";

export default async function handler(req, res) {
  await initDatabase();

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Método no permitido. Utilice GET." });
  }

  try {
    const limit = parseInt(req.query?.limit || "40", 10);

    const logsRes = await db.execute({
      sql: `
        SELECT a.*, u.name as user_name, u.avatar_url as user_avatar
        FROM activity_logs a
        LEFT JOIN users u ON a.user_id = u.id
        ORDER BY a.created_at DESC
        LIMIT ?;
      `,
      args: [limit],
    });

    return res.status(200).json({ activities: logsRes.rows });
  } catch (error) {
    console.error("Error en activity GET:", error);
    return res.status(500).json({ error: "Error al obtener historial: " + error.message });
  }
}
