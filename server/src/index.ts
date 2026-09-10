import { createApp } from './app.js';
import { config } from './config.js';
import { closePool } from './db.js';

const app = createApp();
const server = app.listen(config.port, () => {
  console.log(`Cognate Bridge API listening on http://localhost:${config.port} (${config.env})`);
});

async function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`);
  server.close(() => {
    void closePool().then(() => process.exit(0));
  });
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
