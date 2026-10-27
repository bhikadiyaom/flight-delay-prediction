import { Bookmark, Plus } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { getErrorMessage } from '../api/axiosClient.js';
import { savedSearchApi } from '../api/savedSearchApi.js';
import Button from '../components/common/Button.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import Input from '../components/common/Input.jsx';
import Modal from '../components/common/Modal.jsx';
import PageHeader from '../components/common/PageHeader.jsx';
import QueryState from '../components/common/QueryState.jsx';
import Select from '../components/common/Select.jsx';
import Tabs from '../components/common/Tabs.jsx';
import { useToast } from '../components/common/Toast.jsx';
import AirportInput from '../components/flights/AirportInput.jsx';
import SavedSearchList from '../components/flights/SavedSearchList.jsx';
import { isFlightCode, normalizeFlight } from '../hooks/useFlightLookup.js';

const FILTERS = [{ value: 'all', label: 'All' }, { value: 'favorites', label: 'Favourites' }, { value: 'route', label: 'Routes' }, { value: 'flight', label: 'Flights' }, { value: 'airport', label: 'Airports' }];
const TYPES = [{ value: 'route', label: 'Route' }, { value: 'flight', label: 'Flight' }, { value: 'airport', label: 'Airport' }];
const blank = { type: 'route', label: '', origin: '', destination: '', flightNumber: '', alert: false, threshold: 0.5 };

function CreateModal({ open, onClose, onCreate, busy }) {
  const [v, setV] = useState(blank);
  const [errors, setErrors] = useState({});
  const set = (patch) => setV((c) => ({ ...c, ...patch }));

  const submit = (e) => {
    e.preventDefault();
    const errs = {};
    if (v.type === 'route') {
      if (!v.origin) errs.origin = 'Pick the departure airport';
      if (!v.destination) errs.destination = 'Pick the arrival airport';
      if (v.origin && v.origin === v.destination) errs.destination = 'Must differ from the origin';
    }
    if (v.type === 'flight' && !isFlightCode(v.flightNumber)) errs.flightNumber = 'Enter a flight like AA100';
    if (v.type === 'airport' && !v.origin) errs.origin = 'Pick an airport';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const label = v.label.trim() || (v.type === 'route' ? `${v.origin} to ${v.destination}` : v.type === 'flight' ? `Flight ${normalizeFlight(v.flightNumber)}` : `${v.origin} airport`);
    const body = { type: v.type, label };
    if (v.type === 'route') Object.assign(body, { origin: v.origin, destination: v.destination });
    if (v.type === 'flight') body.flightNumber = normalizeFlight(v.flightNumber);
    if (v.type === 'airport') body.origin = v.origin;
    if (v.type !== 'airport' && v.alert) body.alert = { enabled: true, threshold: v.threshold };
    onCreate(body, () => { setV(blank); setErrors({}); });
  };

  return (
    <Modal open={open} onClose={onClose} title="New saved search" description="Save a route, flight or airport to run it again in one click."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="saved-form" loading={busy}>Save</Button></>}>
      <form id="saved-form" onSubmit={submit} noValidate className="space-y-4">
        <Tabs tabs={TYPES} value={v.type} onChange={(type) => { set({ type }); setErrors({}); }} label="What to save" idBase="saved-type" />
        <div role="tabpanel" id="saved-type-panel" aria-labelledby={`saved-type-${v.type}`} className="space-y-4">
          {v.type === 'route' && <div className="grid gap-4 sm:grid-cols-2">
            <AirportInput label="From" required value={v.origin} onChange={(origin) => set({ origin })} error={errors.origin} />
            <AirportInput label="To" required value={v.destination} onChange={(destination) => set({ destination })} error={errors.destination} placeholder="City or code, e.g. LAX" />
          </div>}
          {v.type === 'flight' && <Input label="Flight number" required placeholder="e.g. AA100" value={v.flightNumber} className="code uppercase placeholder:normal-case" error={errors.flightNumber} onChange={(e) => set({ flightNumber: e.target.value })} />}
          {v.type === 'airport' && <AirportInput label="Airport" required value={v.origin} onChange={(origin) => set({ origin })} error={errors.origin} />}
        </div>
        <Input label="Name (optional)" maxLength={80} value={v.label} placeholder="e.g. Commute home" onChange={(e) => set({ label: e.target.value })} />
        {v.type !== 'airport' && (
          <fieldset className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <legend className="px-1 text-sm font-semibold">Email alert</legend>
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input type="checkbox" checked={v.alert} onChange={(e) => set({ alert: e.target.checked })} className="h-5 w-5 rounded border-slate-400 text-brand-700" />
              Email me when the delay risk is high
            </label>
            {v.alert && <Select label="Alert when the chance of delay is at least" value={v.threshold} onChange={(e) => set({ threshold: Number(e.target.value) })} wrapperClassName="mt-2"
              options={[0.3, 0.4, 0.5, 0.6, 0.7].map((t) => ({ value: t, label: `${Math.round(t * 100)}%` }))} />}
          </fieldset>
        )}
      </form>
    </Modal>
  );
}

export default function SavedSearchesPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [filter, setFilter] = useState('all');
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const q = useQuery({ queryKey: ['saved'], queryFn: () => savedSearchApi.list() });
  const refresh = () => qc.invalidateQueries({ queryKey: ['saved'] });
  const fail = (title) => (e) => toast.error(title, getErrorMessage(e));

  const create = useMutation({ mutationFn: savedSearchApi.create });
  const patch = useMutation({ mutationFn: ({ id, body }) => savedSearchApi.patch(id, body), onSettled: () => setBusyId(null), onSuccess: refresh, onError: fail('Could not update') });
  const remove = useMutation({ mutationFn: (s) => savedSearchApi.remove(s.id), onSettled: () => setBusyId(null), onSuccess: () => { refresh(); toast.success('Deleted'); }, onError: fail('Could not delete') });

  const doPatch = (s, body) => { setBusyId(s.id); patch.mutate({ id: s.id, body }); };
  const onCreate = (body, reset) => create.mutate(body, {
    onSuccess: () => { reset(); setOpen(false); refresh(); toast.success('Saved', body.label); },
    onError: fail('Could not save'),
  });

  const visible = (items) => items.filter((s) => (filter === 'all' ? true : filter === 'favorites' ? s.isFavorite : s.type === filter));

  return (
    <div>
      <PageHeader icon={Bookmark} title="Saved searches" subtitle="Routes, flights and airports you keep an eye on. Turn on an email alert to hear when the risk changes."
        actions={<Button icon={Plus} onClick={() => setOpen(true)}>New saved search</Button>} />
      <QueryState query={q} skeletonHeight="h-40">
        {(items) => (items.length === 0
          ? <EmptyState icon={Bookmark} title="Nothing saved yet" description="Save a route from the Predict page, a flight from Live flight, or add one here." action={<Button icon={Plus} onClick={() => setOpen(true)}>Save your first search</Button>} />
          : (
            <div className="space-y-5">
              <Tabs tabs={FILTERS} value={filter} onChange={setFilter} label="Filter saved searches" idBase="saved-filter" />
              <div role="tabpanel" id="saved-filter-panel" aria-labelledby={`saved-filter-${filter}`}>
                {visible(items).length === 0 ? <EmptyState title="No matches" description="Nothing in this filter yet." />
                  : <SavedSearchList items={visible(items)} busyId={busyId}
                    onFavorite={(s) => doPatch(s, { isFavorite: !s.isFavorite })}
                    onAlert={(s, enabled) => doPatch(s, { alert: { enabled } })}
                    onThreshold={(s, threshold) => doPatch(s, { alert: { threshold } })}
                    onDelete={(s) => { if (window.confirm(`Delete “${s.label}”?`)) { setBusyId(s.id); remove.mutate(s); } }} />}
              </div>
            </div>
          ))}
      </QueryState>
      <CreateModal open={open} onClose={() => setOpen(false)} onCreate={onCreate} busy={create.isPending} />
    </div>
  );
}
