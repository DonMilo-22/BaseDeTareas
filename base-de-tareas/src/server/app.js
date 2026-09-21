import express from 'express';
import helmet from 'helmet';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import authRoutes from './routes/auth.js';
import groupRoutes from './routes/groups.js';
import classRoutes from './routes/classes.js';
import taskRoutes from './routes/tasks.js';
import collaborationRoutes from './routes/collaboration.js';
import reminderRoutes from './routes/reminders.js';
import extraRoutes from './routes/extras.js';
import cronRoutes from './routes/cron.js';
import announcementRoutes from './routes/announcements.js';
import pushRoutes from './routes/push.js';
import personalReminderRoutes, { deliveryRouter as reminderDeliveryRoutes } from './routes/personal-reminders.js';
import { checkDatabase, ensureRuntimeSchema } from './db.js';
import { asyncRoute, errorHandler, notFoundHandler, requireSameOrigin } from './middleware.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(dirname, '../../public');
const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      manifestSrc: ["'self'"],
    },
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(express.json({
  limit: '1mb',
  verify: (req, _res, buffer) => { req.rawBody = buffer.toString('utf8'); },
}));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(requireSameOrigin);
app.use(asyncRoute(async (_req, _res, next) => {
  await ensureRuntimeSchema();
  next();
}));

app.get('/api/health', async (_req, res, next) => {
  try {
    res.json({ ok: await checkDatabase(), version: '2.6.2' });
  } catch (error) {
    next(error);
  }
});

app.use('/api/cron', cronRoutes);
app.use('/api/reminder-deliveries', reminderDeliveryRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/groups/:groupId/classes', classRoutes);
app.use('/api/groups/:groupId/tasks', taskRoutes);
app.use('/api/groups/:groupId/tasks', collaborationRoutes);
app.use('/api/groups/:groupId/tasks', reminderRoutes);
app.use('/api/groups/:groupId/announcements', announcementRoutes);
app.use('/api/groups/:groupId/personal-reminders', personalReminderRoutes);
app.use('/api/groups/:groupId', extraRoutes);

app.use('/api', notFoundHandler);
app.use(express.static(publicDir, { extensions: ['html'], maxAge: '1h' }));
app.get('*splat', (_req, res) => res.sendFile(path.join(publicDir, 'index.html')));
app.use(errorHandler);

export default app;
