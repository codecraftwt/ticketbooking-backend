import express from 'express';
import http from 'http';
import cors from 'cors';
import morgan from 'morgan';
import helmet from 'helmet';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';

import { connectDB } from './config/db.js';
import { initSocketIO } from './sockets/socketManager.js';

import adminAuthRouter from './routes/adminAuth.js';
import adminVenuesRouter from './routes/adminVenues.js';
import adminHallsRouter from './routes/adminHalls.js';
import adminEventsRouter from './routes/adminEvents.js';
import adminShowsRouter from './routes/adminShows.js';
import adminOperationsRouter from './routes/adminOperations.js';
import eventsRouter from './routes/events.js';
import showsRouter from './routes/shows.js';
import holdsRouter from './routes/holds.js';
import paymentsRouter from './routes/payments.js';
import bookingsRouter from './routes/bookings.js';
import { cleanupExpiredHoldsForShow } from './controllers/holdController.js';

dotenv.config();

// Connect to MongoDB
connectDB();

const app = express();
const httpServer = http.createServer(app);
const PORT = process.env.PORT || 5000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

// Initialize Socket.IO
initSocketIO(httpServer, CLIENT_ORIGIN);

// Security & Middlewares
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(
  cors({
    origin: [CLIENT_ORIGIN, 'http://localhost:5173', 'http://127.0.0.1:5173'],
    credentials: true,
  })
);
app.use(express.json());
app.use(morgan('dev'));

// Rate Limiting for Auth
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 requests per window
  message: { success: false, message: 'Too many login attempts. Please try again later.' },
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    service: 'Ticket Booking Backend API',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Mount Routes
app.use('/api/admin/auth', authLimiter, adminAuthRouter);
app.use('/api/admin/venues', adminVenuesRouter);
app.use('/api/admin/halls', adminHallsRouter);
app.use('/api/admin/events', adminEventsRouter);
app.use('/api/admin/shows', adminShowsRouter);
app.use('/api/admin/operations', adminOperationsRouter);
app.use('/api/events', eventsRouter);
app.use('/api/shows', showsRouter);
app.use('/api/public/holds', holdsRouter);
app.use('/api/public/payments', paymentsRouter);
app.use('/api/bookings', bookingsRouter);

// Background job: Clean up expired seat holds every 15 seconds
setInterval(() => {
  cleanupExpiredHoldsForShow();
}, 15000);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `API route not found: ${req.method} ${req.originalUrl}`,
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'production' ? null : err.message,
  });
});

httpServer.listen(PORT, () => {
  console.log(`🚀 Ticket Booking API is running at http://localhost:${PORT}`);
  console.log(`⚡ Socket.IO initialized for real-time seat synchronization`);
  console.log(`📡 Health Check: http://localhost:${PORT}/api/health`);
  console.log(`🔒 Admin Auth: http://localhost:${PORT}/api/admin/auth/login`);
});

httpServer.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use by another running terminal or process.`);
    console.error(`👉 Close the previous process or run Stop-Process on port ${PORT}.`);
    process.exit(1);
  } else {
    console.error('Server listen error:', err);
  }
});

export { app, httpServer };
