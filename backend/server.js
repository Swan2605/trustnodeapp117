const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '.env') });

const connectDB = require('./config/db');
const morgan = require('morgan');
const { logger } = require('./controllers/monitoringController');

connectDB();

const app = express();
const server = http.createServer(app);

/* =========================
   ✅ CORS CONFIG
   ========================= */

const LOCALHOST_ORIGIN = 'http://localhost:3000';
const VERCEL_PATTERN = /^https:\/\/.*\.vercel\.app$/;

const normalizeOrigin = (origin = '') =>
  String(origin || '').trim().replace(/\/+$/, '');

const allowedOrigins = new Set([
  normalizeOrigin(LOCALHOST_ORIGIN)
]);

const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  const normalized = normalizeOrigin(origin);
  if (allowedOrigins.has(normalized)) return true;
  if (VERCEL_PATTERN.test(normalized)) return true;
  return false;
};

app.use(cors({
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
    } else {
      console.log("❌ Blocked by CORS:", origin);
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.options('*', cors());

/* =========================
   🔥 IMPORTANT FIX (ADD THIS)
   ========================= */

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (isAllowedOrigin(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
  }

  res.header("Access-Control-Allow-Credentials", "true");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
});

/* =========================
   ✅ SOCKET.IO
   ========================= */

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
      } else {
        console.log("❌ Socket blocked:", origin);
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

global.io = io;

/* =========================
   ✅ MIDDLEWARE
   ========================= */

app.use(morgan('combined', { stream: { write: msg => logger.info(msg.trim()) } }));
app.use(express.json({ limit: '10mb' }));

app.use('/images', express.static(path.join(__dirname, 'public/images')));
app.use('/public/images', express.static(path.join(__dirname, 'public/images')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

/* =========================
   ✅ ROUTES
   ========================= */

app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/privacy', require('./routes/privacyRoutes'));
app.use('/api/upload', require('./routes/uploadRoutes'));
app.use('/api/media', require('./routes/mediaRoutes'));
app.use('/api/recovery', require('./routes/recoveryRoutes'));
app.use('/api/chat', require('./routes/chatRoutes'));
app.use('/api/posts', require('./routes/postRoutes'));
app.use('/api/profile', require('./routes/profileRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));

/* =========================
   ✅ SOCKET EVENTS
   ========================= */

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join-conversation', (userId) => {
    socket.join(`chat-${userId}`);
  });

  socket.on('typing', (data) => {
    io.to(`chat-${data.to}`).emit('typing', data);
  });

  socket.on('send-message', (data) => {
    io.to(`chat-${data.to}`).emit('receive-message', data);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

/* =========================
   ✅ SECURITY + CLEANUP
   ========================= */

app.use('/api', require('./controllers/monitoringController').logAccess);
app.use('/api', require('./controllers/monitoringController').checkAnomaly);

const cron = require('node-cron');
const { deleteInactiveUsers } = require('./utils/cleanupScheduler');

cron.schedule('0 0 * * *', () => {
  console.log('⏰ Running cleanup...');
  deleteInactiveUsers();
});

setTimeout(() => {
  deleteInactiveUsers().catch(err => console.error(err));
}, 5000);

/* =========================
   ✅ SERVER START
   ========================= */

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});

server.on('error', (error) => {
  logger.error('Server error:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection:', reason);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  process.exit(1);
});
