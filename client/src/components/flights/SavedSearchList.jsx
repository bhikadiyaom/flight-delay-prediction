import { Bell, BellOff, MapPin, PlaneTakeoff, Play, Route, Star, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '../../utils/cn.js';
import Badge from '../common/Badge.jsx';
import Button from '../common/Button.jsx';
import Card from '../common/Card.jsx';

const TYPE = { route: { icon: Route, label: 'Route' }, flight: { icon: PlaneTakeoff, label: 'Flight' }, airport: { icon: MapPin, label: 'Airport' } };
const THRESHOLDS = [0.3, 0.4, 0.5, 0.6, 0.7];

/** Where "Run" goes for each saved search type. */
export function runLink(s) {
  if (s.type === 'flight') return `/live?flight=${encodeURIComponent(s.flightNumber)}`;
  if (s.type === 'route') return `/live?origin=${s.origin}&destination=${s.destination}`;
  return `/historical?origin=${s.origin}`;
}

function describe(s) {
  if (s.type === 'flight') return s.flightNumber;
  if (s.type === 'route') return `${s.origin} → ${s.destination}${s.airline ? ` · ${s.airline}` : ''}`;
  return s.origin;
}

/** items from GET /saved-searches. Handlers get the item (and the new value where relevant). */
export default function SavedSearchList({ items, onFavorite, onAlert, onThreshold, onDelete, busyId }) {
  return (
    <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {items.map((s) => {
        const T = TYPE[s.type];
        const canAlert = s.type !== 'airport';
        return (
          <li key={s.id}>
            <Card as="article" className={cn('flex h-full flex-col gap-4 p-4', busyId === s.id && 'opacity-60')} aria-label={s.label}>
              <div className="flex items-start gap-3">
                <span className="rounded-lg bg-brand-50 p-2 text-brand-700 dark:bg-brand-950 dark:text-brand-300"><T.icon size={18} aria-hidden="true" /></span>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-semibold">{s.label}</h3>
                  <p className="code muted truncate text-sm">{describe(s)}</p>
                </div>
                <button type="button" onClick={() => onFavorite(s)} aria-pressed={s.isFavorite} aria-label={s.isFavorite ? `Remove ${s.label} from favourites` : `Add ${s.label} to favourites`}
                  className="-mr-1 inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                  <Star size={19} aria-hidden="true" className={s.isFavorite ? 'fill-amber-500 text-amber-500' : 'text-slate-500 dark:text-slate-400'} />
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Badge icon={T.icon}>{T.label}</Badge>
                {s.alert?.enabled && <Badge tone="brand" icon={Bell}>Alert at {Math.round(s.alert.threshold * 100)}%{s.alert.lastRiskLevel ? ` · last ${s.alert.lastRiskLevel}` : ''}</Badge>}
              </div>

              {canAlert && (
                <div className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
                  <button type="button" role="switch" aria-checked={Boolean(s.alert?.enabled)} onClick={() => onAlert(s, !s.alert?.enabled)}
                    className="inline-flex min-h-11 items-center gap-2 text-sm font-medium">
                    <span className={cn('relative inline-flex h-6 w-11 items-center rounded-full transition-colors', s.alert?.enabled ? 'bg-brand-700 dark:bg-brand-500' : 'bg-slate-400 dark:bg-slate-600')} aria-hidden="true">
                      <span className={cn('inline-block h-5 w-5 rounded-full bg-white shadow transition-transform', s.alert?.enabled ? 'translate-x-5' : 'translate-x-0.5')} />
                    </span>
                    {s.alert?.enabled ? <Bell size={15} aria-hidden="true" /> : <BellOff size={15} aria-hidden="true" />}
                    Email alert
                  </button>
                  {s.alert?.enabled && (
                    <label className="flex items-center gap-2 text-sm">
                      <span className="muted">when risk ≥</span>
                      <select value={s.alert.threshold} onChange={(e) => onThreshold(s, Number(e.target.value))} aria-label={`Alert threshold for ${s.label}`}
                        className="min-h-9 rounded-md border border-slate-300 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900">
                        {THRESHOLDS.map((t) => <option key={t} value={t}>{Math.round(t * 100)}%</option>)}
                      </select>
                    </label>
                  )}
                </div>
              )}

              <div className="mt-auto flex gap-2">
                <Button as={Link} to={runLink(s)} size="md" icon={Play} className="flex-1">Run</Button>
                <Button variant="secondary" size="md" icon={Trash2} onClick={() => onDelete(s)} aria-label={`Delete ${s.label}`} className="text-red-700 dark:text-red-400" />
              </div>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
