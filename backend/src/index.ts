import { createServer } from 'http';
import { env } from './config/env.js';
import { createApp } from './app.js';
import { initSocketServer } from './sockets/socket.js';
import { pool } from './config/db.js';
import { otpService } from './services/otp.service.js';
import { startExpirySweep } from './services/expiry.service.js';

const app = createApp();
const server = createServer(app);

// Initialize Socket.IO on top of HTTP server
const io = initSocketServer(server);

const PORT = env.PORT;

server.listen(PORT, () => {
  console.log(`🚀 Plugy backend [${env.NODE_ENV}] & WebSocket server running on port ${PORT}`);
  console.log(`🏥 Health check at http://localhost:${PORT}/api/health`);

  if (env.isProduction && !otpService.isSmsConfigured()) {
    console.warn(
      '⚠️  TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_PHONE_NUMBER are not set: ' +
        'phone verification codes cannot be delivered, so new users cannot register.'
    );
  }

  startExpirySweep();
});

// Graceful shutdown handling
let shuttingDown = false;

const shutdown = async (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n🛑 Received ${signal}. Gracefully shutting down Plugy server...`);

  // Force exit after 10s timeout
  setTimeout(() => {
    console.error('Force shutdown after timeout.');
    process.exit(1);
  }, 10000).unref();

  // Disconnect WebSocket clients and close the HTTP server (open sockets would otherwise keep it alive)
  io.close(async () => {
    console.log('HTTP & WebSocket servers closed.');
    await pool.end();
    console.log('Database pool connections closed.');
    process.exit(0);
  });

  // Drop idle keep-alive connections so close completes promptly
  server.closeIdleConnections();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
