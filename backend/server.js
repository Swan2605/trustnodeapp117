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

const DEFAULT_FRONTEND_ORIGIN = 'https://trustnode117-2m38g664p-suhani-jaiswals-projects.vercel.app';
const VERCEL_PREVIEW_ORIGIN_PATTERN = /^https:\/\/trustnode117-[a-z0-9-]+-suhani-jaiswals-projects\.vercel\.app$/i;

const normalizeOrigin = (origin = '') => String(origin || '').trim().replace(/\/+$/, '');

const configuredOrigins = String(process.env.FRONTEND_URLS || '')
  .split(',')
  .map((origin) => normalizeOrigin(origin))
  .filter(Boolean);

const singleFrontendOrigin = normalizeOrigin(process.env.FRONTEND_URL || '');
if (singleFrontendOrigin) {
  configuredOrigins.push(singleFrontendOrigin);
}

const allowedOrigins = new Set(
  [DEFAULT_FRONTEND_ORIGIN, ...configuredOrigins]
    .map((origin) => normalizeOrigin(origin))
    .filter(Boolean)
);

const isAllowedOrigin = (origin) => {
  if (!origin) return true; // Non-browser clients / server-to-server calls

  const normalized = normalizeOrigin(origin);
  if (allowedOrigins.has(normalized)) return true;
  if (VERCEL_PREVIEW_ORIGIN_PATTERN.test(normalized)) return true;
  return false;
};

const corsOptions = {
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

const io = new Server(server, {
  cors: {
    origin(origin, callback) {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST'],
    credentials: true
  }
});
app.use(morgan('combined', { stream: { write: msg => logger.info(msg.trim()) } }));
app.use(express.json({ limit: '10mb' }));
app.use('/images', express.static(path.join(__dirname, 'public/images')));
app.use('/public/images', express.static(path.join(__dirname, 'public/images')));

// Routes
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

// Store io instance globally so controllers can access it
global.io = io;

// Socket.io for E2EE chat
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Join a conversation room
  socket.on('join-conversation', (userId) => {
    const room = `chat-${userId}`;
    socket.join(room);
    console.log(`👤 User ${userId} joined room: ${room}`);
    console.log(`📊 Current rooms:`, Array.from(io.sockets.adapter.rooms.keys()));
  });

  // Typing indicator
  socket.on('typing', (data) => {
    console.log('⌨️ Typing:', data.from, '->', data.to, data.isTyping);
    const recipientRoom = `chat-${data.to}`;
    io.to(recipientRoom).emit('typing', data);
  });

  // Send message via Socket.IO (for real-time notification only, don't save again)
  socket.on('send-message', async (data) => {
    console.log('📨 Backend received send-message via Socket.IO:', {
      from: data.from,
      to: data.to,
      _id: data._id,
      encrypted: Boolean(data.encryptedMsg && data.encryptedAesKey && data.iv)
    });

    try {
      // Message is already saved by REST API, just forward to recipient for real-time notification
      // Emit to recipient's room
      const recipientRoom = `chat-${data.to}`;
      console.log('📤 Emitting to recipient room:', recipientRoom);
      const room = io.sockets.adapter.rooms.get(recipientRoom);
      console.log('📊 Recipients in room:', room ? room.size : 0);
      io.to(recipientRoom).emit('receive-message', {
        _id: data._id,
        from: data.from,
        to: data.to,
        message: data.message || '',
        encryptedMsg: data.encryptedMsg || '',
        encryptedAesKey: data.encryptedAesKey || '',
        iv: data.iv || '',
        e2eeVersion: Number(data.e2eeVersion || 0),
        isEncrypted: Boolean(data.encryptedMsg && data.encryptedAesKey && data.iv),
        timestamp: data.timestamp
      });

      console.log('✅ Real-time notification sent to recipient');
    } catch (error) {
      console.error('❌ Socket send-message error:', error);
      socket.emit('message-error', { msg: error.message });
    }
  });

  // Mark messages as read
  socket.on('mark-read', async (data) => {
    try {
      const Message = require('./models/Message');
      await Message.updateMany(
        { from: data.from, to: data.to, read: false },
        { read: true }
      );
      io.emit('messages-read', { from: data.from, to: data.to });
    } catch (error) {
      console.error('Mark read error:', error);
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Anomaly detection middleware on all routes
app.use('/api', require('./controllers/monitoringController').logAccess);
app.use('/api', require('./controllers/monitoringController').checkAnomaly);

// Schedule automatic cleanup of inactive accounts (no login for 90 days)
const cron = require('node-cron');
const { deleteInactiveUsers } = require('./utils/cleanupScheduler');

// Run cleanup every day at 00:00 (midnight)
cron.schedule('0 0 * * *', () => {
  console.log('\n⏰ Scheduled cleanup task starting...');
  deleteInactiveUsers();
});

// Also run cleanup on server start (after 5 seconds to ensure DB is connected) - non-blocking
setTimeout(() => {
  console.log('\n Running initial cleanup on server start...');
  deleteInactiveUsers().catch(err => console.error('Cleanup error:', err));
}, 5000);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => logger.info(`Server running on port ${PORT}`));

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    logger.error(`Port ${PORT} is already in use. Stop the other process or set a different PORT.`);
  } else {
    logger.error('Server error:', error);
  }
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection:', reason);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  process.exit(1);
});
