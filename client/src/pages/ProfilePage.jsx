import { LogOut, Save, User } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getErrorMessage } from '../api/axiosClient.js';
import Badge, { RiskBadge } from '../components/common/Badge.jsx';
import Button from '../components/common/Button.jsx';
import Card, { CardBody, CardHeader } from '../components/common/Card.jsx';
import DataTable, { Pager } from '../components/common/DataTable.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import Input from '../components/common/Input.jsx';
import PageHeader from '../components/common/PageHeader.jsx';
import { QueryError } from '../components/common/QueryState.jsx';
import { SkeletonCard } from '../components/common/Skeleton.jsx';
import Select from '../components/common/Select.jsx';
import { useToast } from '../components/common/Toast.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { useTheme } from '../hooks/useTheme.js';
import { usePredictionHistory } from '../hooks/usePrediction.js';
import { formatInstant, formatPct, capitalize } from '../utils/formatters.js';

function History() {
  const [page, setPage] = useState(1);
  const q = usePredictionHistory({ page, limit: 10 });
  if (q.isPending) return <SkeletonCard height="h-48" className="border-0 shadow-none" />;
  if (q.isError) return <QueryError error={q.error} onRetry={q.refetch} />;
  const { items, pages, total, limit } = q.data;
  if (!items.length) return <EmptyState title="No predictions yet" description="Predictions you make while logged in appear here." />;
  const columns = [
    { key: 'createdAt', header: 'When', render: (r) => <span className="whitespace-nowrap">{formatInstant(r.createdAt)}</span> },
    { key: 'source', header: 'Type', render: (r) => <Badge tone={r.source === 'live' ? 'brand' : r.source === 'bulk' ? 'warn' : 'neutral'}>{capitalize(r.source)}</Badge> },
    { key: 'route', header: 'Flight', render: (r) => <span className="code font-medium">{r.input?.origin} → {r.input?.destination}</span> },
    { key: 'risk', header: 'Risk', render: (r) => <RiskBadge level={r.output?.riskLevel} /> },
    { key: 'delay', header: 'Delay chance', align: 'right', render: (r) => formatPct(r.output?.delayProbability) },
  ];
  return (
    <div className="space-y-3">
      <DataTable columns={columns} rows={items} dense caption="Your recent predictions" />
      {pages > 1 && <Pager page={page} pages={pages} total={total} pageSize={limit} onChange={setPage} />}
    </div>
  );
}

export default function ProfilePage() {
  const { user, updateProfile, setTheme, logout } = useAuth();
  const { preference } = useTheme();
  const toast = useToast();
  const navigate = useNavigate();
  const [name, setName] = useState(user.name);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const saveName = async (e) => {
    e.preventDefault();
    if (name.trim().length < 2) { setError('Enter at least 2 characters'); return; }
    setError('');
    setSaving(true);
    try { await updateProfile({ name: name.trim() }); toast.success('Profile updated'); }
    catch (err) { toast.error('Could not update', getErrorMessage(err)); }
    finally { setSaving(false); }
  };

  const toggleAlerts = async (e) => {
    try { await updateProfile({ preferences: { alertsEnabled: e.target.checked } }); }
    catch (err) { toast.error('Could not update', getErrorMessage(err)); }
  };

  return (
    <div className="space-y-6">
      <PageHeader icon={User} title="Your profile" subtitle="Account details, appearance and your recent predictions." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Account" actions={user.role === 'admin' ? <Badge tone="brand">Admin</Badge> : null} />
          <CardBody>
            <form onSubmit={saveName} noValidate className="space-y-4">
              <Input label="Name" value={name} error={error} onChange={(e) => setName(e.target.value)} />
              <Input label="Email" value={user.email} readOnly disabled hint="Your email is your login and cannot be changed here." />
              <Button type="submit" icon={Save} loading={saving} disabled={name.trim() === user.name}>Save changes</Button>
            </form>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Preferences" />
          <CardBody className="space-y-5">
            <Select label="Theme" value={preference} onChange={(e) => setTheme(e.target.value)} hint="Saved to your account, so it follows you across devices."
              options={[{ value: 'system', label: 'Match my device' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
            <label className="flex min-h-11 items-start gap-3 text-sm">
              <input type="checkbox" checked={user.preferences?.alertsEnabled !== false} onChange={toggleAlerts} className="mt-0.5 h-5 w-5 rounded border-slate-400 text-brand-700" />
              <span><span className="font-medium">Email alerts</span><br /><span className="muted">Master switch for the alerts on your saved searches.</span></span>
            </label>
            <Button variant="secondary" icon={LogOut} onClick={() => { logout(); navigate('/'); }}>Log out</Button>
          </CardBody>
        </Card>
      </div>
      <Card>
        <CardHeader title="Recent predictions" subtitle="Newest first" />
        <CardBody><History /></CardBody>
      </Card>
    </div>
  );
}
