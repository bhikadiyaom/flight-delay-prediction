import cron from 'node-cron';
import { env } from '../config/env.js';
import { evaluateAlerts } from '../services/alertService.js';
import { logger } from '../utils/logger.js';

let running = false;

export async function runOnce() {
  if (running) return null; // never overlap runs
  running = true;
  try {
    const summary = await evaluateAlerts();
    logger.info('risk alert job finished', summary);
    return summary;
  } catch (err) {
    logger.error('risk alert job failed', { err: err.message });
    return null;
  } finally {
    running = false;
  }
}

/** Starts the schedule (ALERTS_CRON, default every 30 min). Returns the task so it can be stopped on shutdown. */
export function startRiskAlertJob() {
  if (!cron.validate(env.ALERTS_CRON)) throw new Error(`invalid ALERTS_CRON: ${env.ALERTS_CRON}`);
  logger.info('risk alert job scheduled', { cron: env.ALERTS_CRON });
  return cron.schedule(env.ALERTS_CRON, runOnce);
}
