import { LogIn } from 'lucide-react';
import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { getErrorMessage } from '../api/axiosClient.js';
import Button from '../components/common/Button.jsx';
import Input from '../components/common/Input.jsx';
import { useAuth } from '../hooks/useAuth.js';

export default function LoginPage() {
  const { login, user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from;
  const target = from ? `${from.pathname}${from.search ?? ''}` : '/predict';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!loading && user) return <Navigate to={target} replace />;

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) errs.email = 'Enter a valid email address';
    if (!password) errs.password = 'Enter your password';
    setErrors(errs);
    setFormError('');
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await login(email.trim(), password);
      navigate(target, { replace: true });
    } catch (err) {
      setFormError(getErrorMessage(err, 'Could not log in. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <h1 className="text-2xl font-semibold">Welcome back</h1>
      <p className="muted mt-1 text-sm">{from ? 'Log in to continue.' : 'Log in to save searches, set alerts and upload CSVs.'}</p>
      <form onSubmit={submit} noValidate className="mt-6 space-y-4">
        {formError && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm font-medium text-red-900 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200">{formError}</p>}
        <Input label="Email" type="email" autoComplete="email" required value={email} error={errors.email} onChange={(e) => setEmail(e.target.value)} />
        <Input label="Password" type="password" autoComplete="current-password" required value={password} error={errors.password} onChange={(e) => setPassword(e.target.value)} />
        <Button type="submit" size="lg" icon={LogIn} loading={busy} className="w-full">Log in</Button>
      </form>
      <p className="muted mt-6 text-center text-sm">New here? <Link to="/register" state={location.state} className="font-semibold text-brand-800 hover:underline dark:text-brand-300">Create an account</Link></p>
    </div>
  );
}
