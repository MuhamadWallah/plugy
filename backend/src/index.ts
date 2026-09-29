import { createServer } from 'http';
import { env } from './config/env.js';
import { createApp } from './app.js';
import { initSocketServer } from './sockets/socket.js';
import { pool } from './config/db.js';

const app = createApp();
const server = createServer(app);

// Initialize Socket.IO on top of HTTP server
initSocketServer(server);

const PORT = env.PORT;

server.listen(PORT, () => {
  console.log(`🚀 Plugy backend [${env.NODE_ENV}] & WebSocket server running on port ${PORT}`);
  console.log(`🏥 Health check at http://localhost:${PORT}/api/health`);
});

// Graceful shutdown handling
const shutdown = async (signal: string) => {
  console.log(`\n🛑 Received ${signal}. Gracefully shutting down Plugy server...`);
  server.close(async () => {
    console.log('HTTP server closed.');
    await pool.end();
    console.log('Database pool connections closed.');
    process.exit(0);
  });

  // Force exit after 10s timeout
  setTimeout(() => {
    console.error('Force shutdown after timeout.');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
