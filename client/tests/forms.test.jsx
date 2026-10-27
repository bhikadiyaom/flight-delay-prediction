import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { flightApi } from '../src/api/flightApi.js';
import BulkUploadPanel, { checkCsvFile, TEMPLATE_CSV } from '../src/components/prediction/BulkUploadPanel.jsx';
import PredictionForm, { buildPredictionPayload, defaultValues, validatePredictionForm } from '../src/components/prediction/PredictionForm.jsx';
import { csvCell, resultsToCsv } from '../src/pages/BulkPredictionPage.jsx';
import { validateRegistration } from '../src/pages/RegisterPage.jsx';

vi.mock('../src/api/flightApi.js', () => ({ flightApi: { airports: vi.fn() } }));
const AIRPORTS = [
  { iata: 'JFK', name: 'John F Kennedy International', city: 'New York', state: 'NY' },
  { iata: 'LGA', name: 'LaGuardia', city: 'New York', state: 'NY' },
  { iata: 'LAX', name: 'Los Angeles International', city: 'Los Angeles', state: 'CA' },
];
flightApi.airports.mockImplementation(async (q) => AIRPORTS.filter((a) => !q || `${a.iata} ${a.city} ${a.name}`.toLowerCase().includes(q.toLowerCase())));

const wrap = (ui) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>);

describe('prediction form logic', () => {
  const valid = () => defaultValues({ airline: 'DL', origin: 'ATL', destination: 'JFK', date: '2026-12-22', time: '09:30' });

  it('builds the API body: IATA airline, local ISO departure, only the weather that was filled in', () => {
    const v = valid();
    v.originWeather = { temp: '-4', rain: '12.5', wind: '', snow: '9' };
    v.distance = '760';
    expect(buildPredictionPayload(v)).toEqual({
      airline: 'DL', origin: 'ATL', destination: 'JFK', scheduledDeparture: '2026-12-22T09:30:00', distanceMiles: 760,
      originWeather: { temperatureC: -4, precipitationMm: 12.5, snowfallCm: 9 },
    });
    expect(buildPredictionPayload(valid())).toEqual({ airline: 'DL', origin: 'ATL', destination: 'JFK', scheduledDeparture: '2026-12-22T09:30:00' });
  });

  it('a temperature of 0 is a real value, not "empty"', () => {
    const v = valid();
    v.destWeather = { temp: '0', rain: '', wind: '', snow: '' };
    expect(buildPredictionPayload(v).destWeather).toEqual({ temperatureC: 0 });
  });

  it('validates required fields, identical airports, ranges', () => {
    expect(validatePredictionForm(valid())).toEqual({});
    expect(Object.keys(validatePredictionForm(defaultValues({ date: '', time: '' })))).toEqual(expect.arrayContaining(['airline', 'origin', 'destination', 'date', 'time']));
    expect(validatePredictionForm({ ...valid(), destination: 'ATL' }).destination).toMatch(/differ/);
    expect(validatePredictionForm({ ...valid(), distance: '99999' }).distance).toBeTruthy();
    expect(validatePredictionForm({ ...valid(), distance: '0' }).distance).toBeTruthy();
    const bad = { ...valid(), originWeather: { temp: '500', rain: '-1', wind: 'abc', snow: '' } };
    expect(Object.keys(validatePredictionForm(bad))).toEqual(['originWeather.temp', 'originWeather.rain', 'originWeather.wind']);
  });
});

describe('<PredictionForm>', () => {
  it('shows errors and does not submit an incomplete form', async () => {
    const onSubmit = vi.fn();
    wrap(<PredictionForm onSubmit={onSubmit} />);
    await userEvent.setup().click(screen.getByRole('button', { name: /Predict delay risk/ }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(await screen.findByText('Choose an airline')).toBeInTheDocument();
    expect(screen.getByText('Pick the departure airport')).toBeInTheDocument();
    expect(screen.getByLabelText(/Airline/)).toBeInvalid();
  });

  it('submits a valid form: airline select + airport autocomplete by keyboard + weather disclosure', async () => {
    const onSubmit = vi.fn();
    wrap(<PredictionForm onSubmit={onSubmit} initial={{ date: '2026-12-22', time: '09:30' }} />);
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText(/Airline/), 'DL');

    const from = screen.getByRole('combobox', { name: /From/ });
    await user.type(from, 'new y');
    expect(await screen.findByRole('listbox')).toBeInTheDocument();
    await user.keyboard('{ArrowDown}{Enter}'); // 2nd option: LGA
    expect(from).toHaveValue('LGA');

    const to = screen.getByRole('combobox', { name: /^To/ });
    await user.type(to, 'lax');
    await waitFor(() => expect(screen.getByRole('option', { name: /LAX/ })).toBeInTheDocument());
    await user.click(screen.getByRole('option', { name: /LAX/ }));
    expect(to).toHaveValue('LAX');

    await user.click(screen.getByRole('button', { name: /Weather conditions/ }));
    await user.type(screen.getAllByLabelText('Rain / precipitation (mm)')[0], '8');
    await user.click(screen.getByRole('button', { name: /Predict delay risk/ }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toEqual({
      airline: 'DL', origin: 'LGA', destination: 'LAX', scheduledDeparture: '2026-12-22T09:30:00', originWeather: { precipitationMm: 8 },
    });
  });

  it('typing a full 3-letter code is accepted without picking from the list', async () => {
    const onSubmit = vi.fn();
    wrap(<PredictionForm onSubmit={onSubmit} initial={{ airline: 'UA', date: '2026-12-22', time: '10:00' }} />);
    const user = userEvent.setup();
    await user.type(screen.getByRole('combobox', { name: /From/ }), 'jfk');
    await user.type(screen.getByRole('combobox', { name: /^To/ }), 'LAX');
    await user.click(screen.getByRole('button', { name: /Predict delay risk/ }));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ origin: 'JFK', destination: 'LAX' });
  });
});

describe('bulk upload', () => {
  const file = (name, size = 100, type = 'text/csv') => new File([new Uint8Array(size)], name, { type });

  it('checks the file before it ever leaves the browser', () => {
    expect(checkCsvFile(file('flights.csv'))).toBeNull();
    expect(checkCsvFile(file('FLIGHTS.CSV'))).toBeNull();
    expect(checkCsvFile(file('flights.xlsx'))).toMatch(/csv/i);
    expect(checkCsvFile(file('virus.exe'))).toMatch(/csv/i);
    expect(checkCsvFile(file('big.csv', 600 * 1024))).toMatch(/too large/);
    expect(checkCsvFile(file('empty.csv', 0))).toMatch(/empty/);
    expect(checkCsvFile(null)).toMatch(/Choose/);
  });

  it('the template has the required columns and parses as valid rows', () => {
    const [head, ...rows] = TEMPLATE_CSV.split('\n');
    expect(head.split(',').slice(0, 4)).toEqual(['airline', 'origin', 'destination', 'scheduled_departure']);
    expect(rows.length).toBeGreaterThanOrEqual(3);
    expect(rows.every((r) => r.split(',').length === head.split(',').length)).toBe(true);
  });

  it('submits only a valid file; rejects a wrong type with an alert', async () => {
    const onSubmit = vi.fn();
    render(<BulkUploadPanel onSubmit={onSubmit} />);
    const user = userEvent.setup({ applyAccept: false });
    const input = screen.getByLabelText(/Browse files/);
    const go = screen.getByRole('button', { name: /Predict all rows/ });
    expect(go).toBeDisabled();

    await user.upload(input, file('notes.txt'));
    expect(screen.getByRole('alert')).toHaveTextContent(/Only .csv/);
    expect(go).toBeDisabled();

    await user.upload(input, file('good.csv', 2048));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(go).toBeEnabled();
    await user.click(go);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0].name).toBe('good.csv');
  });
});

describe('results export', () => {
  it('quotes cells and defuses spreadsheet formulas', () => {
    expect(csvCell('plain')).toBe('"plain"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('=HYPERLINK("http://evil")')).toBe('"\'=HYPERLINK(""http://evil"")"');
    expect(csvCell('+1')).toBe('"\'+1"');
    expect(csvCell('@SUM(A1)')).toBe('"\'@SUM(A1)"');
    expect(csvCell(null)).toBe('""');
    expect(csvCell(0.25)).toBe('"0.25"');
  });

  it('writes ok rows and error rows with the same columns', () => {
    const csv = resultsToCsv([
      { row: 2, status: 'ok', input: { airline: 'DL', origin: 'ATL', destination: 'JFK', scheduledDeparture: '2026-12-22T09:00:00' }, prediction: { riskLevel: 'low', delayProbability: 0.1, cancelProbability: 0.01, predictedDelayMinutes: null, warnings: ['w1', 'w2'] } },
      { row: 3, status: 'error', errors: ['origin: bad'] },
    ]).split('\n');
    expect(csv).toHaveLength(3);
    expect(csv[0].split(',')).toHaveLength(11);
    expect(csv[1]).toContain('"low"');
    expect(csv[1]).toContain('"w1; w2"');
    expect(csv[2]).toContain('"error"');
    expect(csv[2]).toContain('"origin: bad"');
  });
});

describe('registration rules mirror the server', () => {
  const ok = { name: 'Ada Lovelace', email: 'ada@example.com', password: 'Analytical1', confirm: 'Analytical1' };
  it('accepts a good form and rejects each kind of bad input', () => {
    expect(validateRegistration(ok)).toEqual({});
    expect(validateRegistration({ ...ok, name: 'A' }).name).toBeTruthy();
    expect(validateRegistration({ ...ok, email: 'nope' }).email).toBeTruthy();
    expect(validateRegistration({ ...ok, password: 'short1', confirm: 'short1' }).password).toMatch(/8/);
    expect(validateRegistration({ ...ok, password: 'allletters', confirm: 'allletters' }).password).toMatch(/digit/);
    expect(validateRegistration({ ...ok, password: '12345678', confirm: '12345678' }).password).toMatch(/letter/);
    expect(validateRegistration({ ...ok, password: `a1${'x'.repeat(80)}`, confirm: `a1${'x'.repeat(80)}` }).password).toMatch(/72/);
    expect(validateRegistration({ ...ok, confirm: 'different1' }).confirm).toMatch(/match/);
  });
});
