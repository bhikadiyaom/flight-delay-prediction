import { Navigate, Outlet, useLocation } from 'react-router-dom';
import Spinner from '../components/common/Spinner.jsx';
import { useAuth } from '../hooks/useAuth.js';

/** Waits for the session to rehydrate before deciding, so a refresh never bounces a logged-in user to /login. */
export default function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="grid min-h-[40vh] place-items-center"><Spinner size={32} label="Checking your session" /></div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}
