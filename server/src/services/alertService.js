import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { SavedSearch } from '../models/SavedSearch.js';
import { logger } from '../utils/logger.js';
import { getFlightStatus, getRouteFlights } from './aviationStackService.js';
import { getWeatherForFlight } from './openMeteoService.js';
import { runPrediction } from './predictionService.js';

let transport;
function getTransport() {
  if (!transport) {
    // without SMTP_HOST (local dev) emails are rendered to JSON and logged instead of sent
    transport = env.SMTP_HOST
      ? nodemailer.createTransport({ host: env.SMTP_HOST, port: env.SMTP_PORT, secure: env.SMTP_PORT === 465, auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined })
      : nodemailer.createTransport({ jsonTransport: true });
  }
  return transport;
}

export const setTransport = (t) => { transport = t; }; // test hook

const RANK = { low: 0, medium: 1, high: 2 };

/** The flight to evaluate for a saved search, or null. */
async function pickFlight(search) {
  if (search.type === 'flight') return (await getFlightStatus(search.flightNumber)).data;
  if (search.type === 'route') {
    const { data } = await getRouteFlights(search.origin, search.destination);
    const flights = search.airline ? data.filter((f) => f.airline?.name?.toLowerCase().includes(search.airline.toLowerCase())) : data;
    return flights[0] ?? null;
  }
  return null;
}

export function buildAlertEmail(user, search, flight, prediction) {
  const pct = Math.round(prediction.delayProbability * 100);
  const route = `${flight.origin.iata} -> ${flight.destination.iata}`;
  return {
    from: env.SMTP_FROM,
    to: user.email,
    subject: `Delay risk ${prediction.riskLevel.toUpperCase()} (${pct}%) for ${flight.flightIata} ${route}`,
    text: [
      `Hi ${user.name},`, '',
      `Your saved search "${search.label}" crossed your alert threshold of ${Math.round(search.alert.threshold * 100)}%.`,
      `${flight.flightIata} (${route}) departs ${String(flight.origin.scheduled).replace('T', ' ')}.`,
      `Delay probability: ${pct}%. Cancellation probability: ${Math.round(prediction.cancelProbability * 100)}%.`,
      prediction.predictedDelayMinutes ? `Typical delay if delayed: about ${Math.round(prediction.predictedDelayMinutes)} minutes.` : '',
      flight.demo ? '(Based on demo flight data.)' : '', '',
      'You can turn alerts off in your saved searches or profile.',
    ].filter((l) => l !== undefined).join('\n'),
  };
}

/**
 * Re-score every saved search that has alerts on. An email goes out when the delay probability is at or above the
 * user's threshold AND the risk level changed since the last check (so a stable high risk does not spam).
 */
export async function evaluateAlerts() {
  const searches = await SavedSearch.find({ 'alert.enabled': true, type: { $in: ['flight', 'route'] } }).populate('user', 'name email preferences').lean();
  const summary = { checked: 0, notified: 0, skipped: 0, errors: 0 };
  for (const s of searches) {
    if (!s.user || s.user.preferences?.alertsEnabled === false) { summary.skipped += 1; continue; }
    summary.checked += 1;
    try {
      const flight = await pickFlight(s);
      if (!flight) { summary.skipped += 1; continue; }
      const wx = await getWeatherForFlight(flight);
      const { prediction } = await runPrediction({
        airline: flight.airline.iata ?? flight.airline.name, origin: flight.origin.iata, destination: flight.destination.iata,
        scheduledDeparture: String(flight.origin.scheduled).slice(0, 19), flightNumber: flight.flightIata,
        originWeather: wx.origin ?? undefined, destWeather: wx.destination ?? undefined,
      }, { userId: s.user._id, source: 'live', extra: { alertFor: String(s._id) } });

      const changed = s.alert.lastRiskLevel !== prediction.riskLevel;
      const fire = prediction.delayProbability >= s.alert.threshold && changed && RANK[prediction.riskLevel] >= RANK.medium;
      const update = { 'alert.lastRiskLevel': prediction.riskLevel };
      if (fire) {
        const info = await getTransport().sendMail(buildAlertEmail(s.user, s, flight, prediction));
        logger.info('alert email', { search: String(s._id), level: prediction.riskLevel, preview: env.SMTP_HOST ? undefined : info.message });
        update['alert.lastNotifiedAt'] = new Date();
        summary.notified += 1;
      }
      await SavedSearch.updateOne({ _id: s._id }, { $set: update });
    } catch (err) {
      summary.errors += 1;
      logger.error('alert evaluation failed', { search: String(s._id), err: err.message });
    }
  }
  return summary;
}
