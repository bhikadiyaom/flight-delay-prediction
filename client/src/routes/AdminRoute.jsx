import { ShieldOff } from 'lucide-react';
import { Link, Outlet } from 'react-router-dom';
import Button from '../components/common/Button.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import { useAuth } from '../hooks/useAuth.js';

/** Nest inside <ProtectedRoute>. Non-admins see a clear "admins only" page (the API enforces it too). */
export default function AdminRoute() {
  const { isAdmin } = useAuth();
  if (!isAdmin) {
    return (
      <EmptyState icon={ShieldOff} title="Admins only" description="Your account does not have access to this page."
        action={<Button as={Link} to="/" variant="secondary">Go home</Button>} className="mx-auto mt-12 max-w-lg" />
    );
  }
  return <Outlet />;
}
