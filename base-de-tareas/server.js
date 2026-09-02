import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

import registerHandler from "./api/auth/register.js";
import loginHandler from "./api/auth/login.js";
import meHandler from "./api/auth/me.js";
import classesHandler from "./api/classes.js";
import tasksHandler from "./api/tasks.js";
import taskStatusHandler from "./api/tasks/status.js";
import activityHandler from "./api/activity.js";
import statsHandler from "./api/stats.js";
import usersHandler from "./api/users.js";
import { initDatabase } from "./api/_db.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "30mb" }));
app.use(express.urlencoded({ extended: true, limit: "30mb" }));

// Servir archivos estáticos del frontend
app.use(express.static(path.join(__dirname, "public")));

// Wrapper para ejecutar los handlers tipo Serverless en Express
const wrap = (handler) => async (req, res) => {
  try {
    await handler(req, res);
  } catch (err) {
    console.error("Error en endpoint:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Error interno del servidor: " + err.message });
    }
  }
};

// Rutas API
app.all("/api/auth/register", wrap(registerHandler));
app.all("/api/auth/login", wrap(loginHandler));
app.all("/api/auth/me", wrap(meHandler));
app.all("/api/classes", wrap(classesHandler));
app.all("/api/tasks/status", wrap(taskStatusHandler));
app.all("/api/tasks", wrap(tasksHandler));
app.all("/api/activity", wrap(activityHandler));
app.all("/api/stats", wrap(statsHandler));
app.all("/api/users", wrap(usersHandler));

// SPA fallback para servir index.html
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Iniciar servidor e inicializar DB
initDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`\n======================================================`);
      console.log(`🚀 Base de Tareas está corriendo en: http://localhost:${PORT}`);
      console.log(`✨ Estética Glassmorphism UI/UX Pro Max activa`);
      console.log(`💾 Base de datos Turso / LibSQL lista`);
      console.log(`======================================================\n`);
    });
  })
  .catch((err) => {
    console.error("Error al inicializar la base de datos:", err);
  });
