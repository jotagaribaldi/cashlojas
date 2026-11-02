import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth, type Role } from './auth/AuthContext';
import { AppShell } from './components/AppShell';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AdminStoresPage, AdminUsersPage } from './pages/AdminPages';
import { CashierPage } from './pages/CashierPage';
import { CustomersPage, CustomerCreditsPage, CustomerStoresPage, CustomerPurchasesPage, RankingPage } from './pages/CustomerPages';
import { PurchasesPage, ReceiptPage, RedemptionsPage } from './pages/ActivityPages';
import { CustomerDashboard, StaffDashboard } from './pages/DashboardPage';
import { ActivatePage, LoginPage, RegisterPage } from './pages/AuthPages';
import { ProfilePage } from './pages/ProfilePage';
import { ReportsPage } from './pages/ReportsPage';
import { AuditPage } from './pages/AuditPage';
import { LoadingState } from './components/ui';

const all: Role[] = ['ROOT', 'MANAGER', 'CASHIER', 'CUSTOMER'];
const management: Role[] = ['ROOT', 'MANAGER'];

export default function App() {
  const { user, ready } = useAuth();
  if (!ready) return <div className="auth-loading"><LoadingState label="Preparando seu espaço…" /></div>;
  return <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/register" element={<RegisterPage />} />
    <Route path="/cadastro/:storeId" element={<RegisterPage />} />
    <Route path="/ativar" element={<ActivatePage />} />
    <Route element={<ProtectedRoute roles={all} />}>
      <Route element={<AppShell />}>
        <Route index element={user?.role === 'CUSTOMER' ? <CustomerDashboard /> : <StaffDashboard />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="redemptions" element={<RedemptionsPage />} />
        <Route path="receipt/:id" element={<ReceiptPage />} />
      </Route>
    </Route>
    <Route element={<ProtectedRoute roles={['ROOT', 'MANAGER', 'CASHIER']} />}>
      <Route element={<AppShell />}>
        <Route path="cashier" element={<CashierPage />} />
        <Route path="purchases" element={<PurchasesPage />} />
        <Route path="customers" element={<CustomersPage />} />
      </Route>
    </Route>
    <Route element={<ProtectedRoute roles={management} />}>
      <Route element={<AppShell />}>
        <Route path="reports" element={<ReportsPage />} />
        <Route path="admin/users" element={<AdminUsersPage />} />
      </Route>
    </Route>
    <Route element={<ProtectedRoute roles={['ROOT']} />}>
      <Route element={<AppShell />}>
        <Route path="admin/stores" element={<AdminStoresPage />} />
        <Route path="admin/audit" element={<AuditPage />} />
      </Route>
    </Route>
    <Route element={<ProtectedRoute roles={['CUSTOMER']} />}>
      <Route element={<AppShell />}>
        <Route path="credits" element={<CustomerCreditsPage />} />
        <Route path="stores" element={<CustomerStoresPage />} />
        <Route path="my-purchases" element={<CustomerPurchasesPage />} />
        <Route path="ranking" element={<RankingPage />} />
      </Route>
    </Route>
    <Route path="*" element={<Navigate to={user ? '/' : '/login'} replace />} />
  </Routes>;
}
