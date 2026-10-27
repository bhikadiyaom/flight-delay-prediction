import { mlClient } from './mlClientService.js';

const DAY = 24 * 3600 * 1000;
let byIata = null;
let loadedAt = 0;
let loading = null;

/** Airport list (IATA, name, city, state, lat, lon) comes from the ml-service and is memoised for 24 h. */
async function load() {
  if (byIata && Date.now() - loadedAt < DAY) return byIata;
  loading ??= mlClient.airports()
    .then((r) => {
      byIata = new Map(r.airports.map((a) => [a.iata, a]));
      loadedAt = Date.now();
      return byIata;
    })
    .finally(() => { loading = null; });
  try {
    return await loading;
  } catch (err) {
    if (byIata) return byIata; // serve the old list rather than fail autocomplete
    throw err;
  }
}

export async function getAirport(iata) {
  return (await load()).get(iata) ?? null;
}

export async function searchAirports(q, limit = 20) {
  const all = [...(await load()).values()];
  const s = String(q ?? '').trim().toLowerCase();
  if (!s) return all.slice(0, limit);
  const score = (a) => {
    const code = a.iata.toLowerCase();
    if (code === s) return 0;
    if (code.startsWith(s)) return 1;
    if (a.city?.toLowerCase().startsWith(s)) return 2;
    if (`${a.name} ${a.city} ${a.state}`.toLowerCase().includes(s)) return 3;
    return 9;
  };
  return all.map((a) => [score(a), a]).filter(([sc]) => sc < 9).sort((x, y) => x[0] - y[0] || x[1].iata.localeCompare(y[1].iata))
    .slice(0, limit).map(([, a]) => a);
}

/** test hook */
export const resetAirportDirectory = () => { byIata = null; loadedAt = 0; };
