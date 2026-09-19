import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import {
  ensureLegacyGroupForUser,
  generateId,
  tableHasColumn,
} from "./_db.js";

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || "base_de_tareas_super_secret_jwt_key_2026_vercel";

export function createToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      avatar_url: user.avatar_url,
    },
    JWT_SECRET,
    { expiresIn: "30d" }
  );
}

export function verifyToken(req) {
  let authHeader = req.headers?.authorization || req.headers?.Authorization;
  if (!authHeader && req.cookies) {
    authHeader = req.cookies.token;
  }
  if (!authHeader) return null;

  const token = authHeader.startsWith("Bearer ") ? authHeader.substring(7) : authHeader;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

export async function hashPassword(password) {
  return await bcrypt.hash(password, 10);
}

export async function comparePassword(password, hash) {
  return await bcrypt.compare(password, hash);
}

export async function logActivity(db, { userId, actionType, targetType, targetId, targetTitle, details }) {
  try {
    if (await tableHasColumn("activity_logs", "group_id")) {
      const groupId = await ensureLegacyGroupForUser(userId);
      return await db.execute({
        sql: `INSERT INTO activity_logs
              (id, group_id, user_id, action, entity_type, entity_id, summary,
               metadata_json, action_type, target_type, target_id, target_title, details, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        args: [
          generateId("act"),
          groupId,
          String(userId),
          actionType,
          targetType,
          targetId,
          details || targetTitle || actionType,
          "{}",
          actionType,
          targetType,
          targetId,
          targetTitle,
          details,
          new Date().toISOString(),
        ],
      });
    }

    return await db.execute({
      sql: `INSERT INTO activity_logs (user_id, action_type, target_type, target_id, target_title, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?);`,
      args: [userId, actionType, targetType, targetId, targetTitle, details, new Date().toISOString()],
    });
  } catch (error) {
    // La acción principal no debe fallar solo porque el historial esté desactualizado.
    console.error("No se pudo registrar la actividad:", error);
    return null;
  }
}
