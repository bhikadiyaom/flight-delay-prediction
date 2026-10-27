import { getFlightStatus, getRouteFlights } from '../services/aviationStackService.js';
import { searchAirports } from '../services/airportDirectory.js';
import { searchHistorical } from '../services/historicalQueryService.js';
import { getWeatherForFlight } from '../services/openMeteoService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/** GET /flights/live?flight=AA100 -> live status + weather at both airports. `source` is live | cache | mock. */
export const getLive = asyncHandler(async (req, res) => {
  const f = await getFlightStatus(req.query.flight);
  const weather = await getWeatherForFlight(f.data);
  res.json({
    flight: f.data,
    weather: { origin: weather.origin, destination: weather.destination },
    source: f.source,
    stale: f.stale,
    demo: f.source === 'mock',
    fetchedAt: f.fetchedAt,
  });
});

/** GET /flights/live/route?origin=JFK&destination=LAX */
export const getRoute = asyncHandler(async (req, res) => {
  const r = await getRouteFlights(req.query.origin, req.query.destination);
  res.json({ flights: r.data, source: r.source, stale: r.stale, demo: r.source === 'mock', fetchedAt: r.fetchedAt });
});

/** GET /flights/historical?origin=&dest=&date=&airline= (2023 data, proxied to the ml-service) */
export const getHistorical = asyncHandler(async (req, res) => {
  res.json(await searchHistorical(req.query));
});

/** GET /flights/airports?q=chi */
export const getAirports = asyncHandler(async (req, res) => {
  res.json({ airports: await searchAirports(req.query.q, req.query.limit) });
});
