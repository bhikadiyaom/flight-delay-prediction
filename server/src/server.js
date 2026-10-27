import { createApp } from './app.js';
import { connectDB, disconnectDB } from './config/db.js';
import { env } from './config/env.js';
import { startRiskAlertJob } from './jobs/riskAlertJob.js';
import { logger } from './utils/logger.js';

async function main() {
  await connectDB();
  const app = createApp();
  const server = app.listen(env.PORT, () => logger.info('server listening', { port: env.PORT, env: env.NODE_ENV }));
  const job = env.ALERTS_ENABLED && !env.isTest ? startRiskAlertJob() : null;

  const shutdown = (signal) => {
    logger.info('shutting down', { signal });
    job?.stop();
    server.close(async () => {
      await disconnectDB();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  // env.js throws "Missing or invalid env: ..." with the list of problems; Mongo errors land here too
  console.error(err.message);
  process.exit(1);
});
