import { UserPlus } from 'lucide-react';
import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { getErrorMessage } from '../api/axiosClient.js';
import Button from '../components/common/Button.jsx';
import Input from '../components/common/Input.jsx';
import { useAuth } from '../hooks/useAuth.js';

/** Same rules as the server: 8-72 characters with at least one letter and one digit. */
export function validateRegistration({ name, email, password, confirm }) {
  const e = {};
  if (name.trim().length < 2) e.name = 'Enter your name (at least 2 characters)';
  if (!/^\S+@\S+\.\S+$/.test(email.trim())) e.email = 'Enter a valid email address';
  if (password.length < 8) e.password = 'At least 8 characters';
  else if (password.length > 72) e.password = 'At most 72 characters';
  else if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) e.password = 'Use at least one letter and one digit';
  if (confirm !== password) e.confirm = 'Passwords do not match';
  return e;
}

export default function RegisterPage() {
  const { register, user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from;
  const target = from ? `${from.pathname}${from.search ?? ''}` : '/predict';
  const [v, setV] = useState({ name: '', email: '', password: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setV((cur) => ({ ...cur, [k]: e.target.value }));

  if (!loading && user) return <Navigate to={target} replace />;

  const submit = async (e) => {
    e.preventDefault();
    const errs = validateRegistration(v);
    setErrors(errs);
    setFormError('');
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await register(v.name.trim(), v.email.trim(), v.password);
      navigate(target, { replace: true });
    } catch (err) {
      setFormError(getErrorMessage(err, 'Could not create the account. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <h1 className="text-2xl font-semibold">Create your account</h1>
      <p className="muted mt-1 text-sm">Free. Save routes, get alerts, upload CSVs of up to 500 flights.</p>
      <form onSubmit={submit} noValidate className="mt-6 space-y-4">
        {formError && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm font-medium text-red-900 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200">{formError}</p>}
        <Input label="Name" autoComplete="name" required value={v.name} error={errors.name} onChange={set('name')} />
        <Input label="Email" type="email" autoComplete="email" required value={v.email} error={errors.email} onChange={set('email')} />
        <Input label="Password" type="password" autoComplete="new-password" required value={v.password} error={errors.password} hint="8+ characters with a letter and a digit" onChange={set('password')} />
        <Input label="Confirm password" type="password" autoComplete="new-password" required value={v.confirm} error={errors.confirm} onChange={set('confirm')} />
        <Button type="submit" size="lg" icon={UserPlus} loading={busy} className="w-full">Create account</Button>
      </form>
      <p className="muted mt-6 text-center text-sm">Already registered? <Link to="/login" state={location.state} className="font-semibold text-brand-800 hover:underline dark:text-brand-300">Log in</Link></p>
    </div>
  );
}
