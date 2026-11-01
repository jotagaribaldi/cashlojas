import { Navigate, Outlet } from 'react-router-dom';
import { useAuth, type Role } from '../auth/AuthContext';
import { LoadingState } from './ui';

export function ProtectedRoute({ roles }: { roles?: Role[] }) {
  const { user, ready } = useAuth();
  if (!ready) return <div className="auth-loading"><LoadingState label="Preparando seu espaço…" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <Outlet />;
}
