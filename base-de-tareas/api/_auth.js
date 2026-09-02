import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

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

export function logActivity(db, { userId, actionType, targetType, targetId, targetTitle, details }) {
  const id = "act_" + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
  return db.execute({
    sql: `INSERT INTO activity_logs (id, user_id, action_type, target_type, target_id, target_title, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
    args: [id, userId, actionType, targetType, targetId, targetTitle, details, new Date().toISOString()],
  });
}
