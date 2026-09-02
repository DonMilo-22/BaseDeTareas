import { db, initDatabase } from "../_db.js";
import { createToken, comparePassword } from "../_auth.js";

export default async function handler(req, res) {
  await initDatabase();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido. Utilice POST." });
  }

  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: "Por favor ingresa tu correo y contraseña." });
    }

    const result = await db.execute({
      sql: "SELECT id, name, email, password_hash, avatar_url FROM users WHERE LOWER(email) = LOWER(?);",
      args: [email.trim()],
    });

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Credenciales inválidas. Correo o contraseña incorrectos." });
    }

    const userRow = result.rows[0];
    const match = await comparePassword(password, userRow.password_hash);

    if (!match) {
      return res.status(401).json({ error: "Credenciales inválidas. Correo o contraseña incorrectos." });
    }

    const user = {
      id: userRow.id,
      name: userRow.name,
      email: userRow.email,
      avatar_url: userRow.avatar_url,
    };

    const token = createToken(user);

    return res.status(200).json({
      message: "¡Bienvenido de nuevo, " + user.name + "!",
      token,
      user,
    });
  } catch (error) {
    console.error("Error en login:", error);
    return res.status(500).json({ error: "Error interno en el servidor: " + error.message });
  }
}
