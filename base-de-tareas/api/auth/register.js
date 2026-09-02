import { db, initDatabase } from "../_db.js";
import { createToken, hashPassword, logActivity } from "../_auth.js";

export default async function handler(req, res) {
  await initDatabase();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido. Utilice POST." });
  }

  try {
    const { name, email, password, avatar_url } = req.body || {};

    if (!name || !email || !password) {
      return res.status(400).json({ error: "Nombre, correo y contraseña son obligatorios." });
    }

    if (password.length < 4) {
      return res.status(400).json({ error: "La contraseña debe tener al menos 4 caracteres." });
    }

    // Verificar si el correo ya existe
    const existing = await db.execute({
      sql: "SELECT id FROM users WHERE LOWER(email) = LOWER(?);",
      args: [email.trim()],
    });

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: "Este correo electrónico ya está registrado." });
    }

    const userId = "usr_" + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
    const passwordHash = await hashPassword(password);

    // Avatar por defecto si no se proporcionó
    const defaultAvatar = avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(name)}`;

    const result = await db.execute({
      sql: `INSERT INTO users (name, email, password_hash, avatar_url) VALUES (?, ?, ?, ?);`,
      args: [name.trim(), email.trim().toLowerCase(), passwordHash, defaultAvatar],
    });

    const user = {
      id: result.lastInsertRowid,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      avatar_url: defaultAvatar,
    };

    const token = createToken(user);

    // Registrar actividad
    await logActivity(db, {
      userId,
      actionType: "REGISTRO_USUARIO",
      targetType: "user",
      targetId: userId,
      targetTitle: user.name,
      details: "Se unió al grupo de clases de Base de Tareas.",
    });

    return res.status(201).json({
      message: "¡Cuenta creada exitosamente!",
      token,
      user,
    });
  } catch (error) {
    console.error("Error en registro:", error);
    return res.status(500).json({ error: "Error interno al crear la cuenta: " + error.message });
  }
}
