import { db, initDatabase } from "../_db.js";
import { createToken, hashPassword, logActivity } from "../_auth.js";

export default async function handler(req, res) {
  await initDatabase();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido. Utilice POST." });
  }

  try {
    const { name, email, password, avatar_url } = req.body || {};
    const normalizedName = typeof name === "string" ? name.trim() : "";
    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";

    if (!normalizedName || !normalizedEmail || typeof password !== "string") {
      return res.status(400).json({ error: "Nombre, correo y contraseña son obligatorios." });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres." });
    }

    if (normalizedName.length > 80 || normalizedEmail.length > 254) {
      return res.status(400).json({ error: "El nombre o el correo exceden la longitud permitida." });
    }

    if (avatar_url && String(avatar_url).length > 1500000) {
      return res.status(413).json({ error: "La imagen de perfil es demasiado grande." });
    }

    // Verificar si el correo ya existe
    const existing = await db.execute({
      sql: "SELECT id FROM users WHERE LOWER(email) = LOWER(?);",
      args: [normalizedEmail],
    });

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: "Este correo electrónico ya está registrado." });
    }

    const userId = "usr_" + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
    const passwordHash = await hashPassword(password);

    // Avatar por defecto si no se proporcionó
    const defaultAvatar = avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(normalizedName)}`;

    await db.execute({
      sql: `INSERT INTO users (id, name, email, password_hash, avatar_url) VALUES (?, ?, ?, ?, ?);`,
      args: [userId, normalizedName, normalizedEmail, passwordHash, defaultAvatar],
    });

    const user = {
      id: userId,
      name: normalizedName,
      email: normalizedEmail,
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
