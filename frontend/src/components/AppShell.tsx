import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowUpRight, Bell, ChevronDown, CircleHelp, CreditCard, LayoutDashboard,
  LogOut, Menu, Settings2, ShieldCheck, Store, TicketPercent, Users, Wallet, X,
} from 'lucide-react';
import { useAuth, type Role } from '../auth/AuthContext';
import { initials } from '../lib/format';

interface NavItem { label: string; to: string; icon: typeof LayoutDashboard; roles: Role[]; end?: boolean }
const links: NavItem[] = [
  { label: 'Visão geral', to: '/', icon: LayoutDashboard, roles: ['ROOT', 'MANAGER', 'CUSTOMER'], end: true },
  { label: 'Caixa', to: '/cashier', icon: CreditCard, roles: ['CASHIER', 'MANAGER'] },
  { label: 'Compras', to: '/purchases', icon: Wallet, roles: ['ROOT', 'CASHIER', 'MANAGER'] },
  { label: 'Resgates', to: '/redemptions', icon: TicketPercent, roles: ['ROOT', 'CASHIER', 'MANAGER', 'CUSTOMER'] },
  { label: 'Meus créditos', to: '/credits', icon: Wallet, roles: ['CUSTOMER'] },
  { label: 'Lojas participantes', to: '/stores', icon: Store, roles: ['CUSTOMER'] },
  { label: 'Clientes', to: '/customers', icon: Users, roles: ['ROOT', 'CASHIER', 'MANAGER'] },
  { label: 'Lojas e grupos', to: '/admin/stores', icon: Store, roles: ['ROOT'] },
  { label: 'Auditoria', to: '/admin/audit', icon: ShieldCheck, roles: ['ROOT'] },
  { label: 'Equipe', to: '/admin/users', icon: ShieldCheck, roles: ['ROOT', 'MANAGER'] },
  { label: 'Relatórios', to: '/reports', icon: LayoutDashboard, roles: ['ROOT', 'MANAGER'] },
];

const titles: Record<string, string> = {
  '/': 'Visão geral', '/cashier': 'Frente de caixa', '/purchases': 'Compras registradas',
  '/redemptions': 'Resgates de cashback', '/customers': 'Clientes', '/admin/stores': 'Lojas e grupos', '/admin/audit': 'Auditoria',
  '/admin/users': 'Equipe e acessos', '/reports': 'Relatórios', '/profile': 'Meu perfil',
};

export function AppShell() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const roleName: Record<Role, string> = { ROOT: 'Administrador', MANAGER: 'Gerente', CASHIER: 'Operador de caixa', CUSTOMER: 'Cliente' };
  const visibleLinks = links.filter((link) => link.roles.includes(user!.role));
  const title = titles[location.pathname] ?? (location.pathname.startsWith('/admin') ? 'Administração' : 'Detalhes');

  async function signOut() {
    await logout();
    navigate('/login');
  }

  return <div className="app-shell">
    {mobileOpen && <button className="mobile-scrim" aria-label="Fechar menu" onClick={() => setMobileOpen(false)} />}
    <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
      <div className="brand"><span className="brand-mark"><TicketPercent size={20} strokeWidth={2.3} /></span><span className="brand-name">cash<span>lojas</span></span><button className="mobile-close icon-button" onClick={() => setMobileOpen(false)} aria-label="Fechar menu"><X size={18} /></button></div>
      <div className="workspace"><span className="workspace-avatar">{user?.role === 'ROOT' ? <ShieldCheck size={17} /> : <Store size={17} />}</span><span className="workspace-copy"><strong>{user?.role === 'ROOT' ? 'Rede CashLojas' : user?.store?.name ?? 'Minha conta'}</strong><small>{user?.role === 'ROOT' ? 'Painel corporativo' : user?.store?.group?.name ?? roleName[user!.role]}</small></span><ChevronDown size={14} className="workspace-chevron" /></div>
      <div className="nav-label">MENU PRINCIPAL</div>
      <nav className="side-nav">{visibleLinks.map(({ label, to, icon: Icon, end }) => <NavLink key={to} to={to} end={end} onClick={() => setMobileOpen(false)} className={({ isActive }) => `nav-link ${isActive ? 'nav-active' : ''}`}><Icon size={18} strokeWidth={1.9} /><span>{label}</span>{to === '/redemptions' && user?.role === 'MANAGER' && <span className="nav-badge">Novo</span>}</NavLink>)}</nav>
      <div className="sidebar-bottom"><div className="help-card"><div className="help-icon"><CircleHelp size={17} /></div><strong>Precisa de ajuda?</strong><p>Consulte nossa central de suporte.</p><button onClick={() => window.open('mailto:suporte@cashlojas.com.br')}>Falar com suporte <ArrowUpRight size={14} /></button></div><button className="side-settings" onClick={() => navigate('/profile')}><Settings2 size={17} /><span>Minha conta</span></button></div>
    </aside>
    <div className="main-area">
      <header className="topbar"><div className="topbar-left"><button className="menu-toggle icon-button" aria-label="Abrir menu" onClick={() => setMobileOpen(true)}><Menu size={20} /></button><div className="breadcrumbs"><span>CashLojas</span><span className="crumb-slash">/</span><strong>{title}</strong></div></div><div className="topbar-right"><div className="date-chip"><span className="online-dot" /> Sistema operacional</div><button className="notification-button icon-button" aria-label="Notificações"><Bell size={18} /><i /></button><div className="top-divider" /><button className="profile-button" onClick={() => navigate('/profile')}><span className="avatar">{initials(user?.name)}</span><span className="profile-copy"><strong>{user?.name}</strong><small>{roleName[user!.role]}</small></span><ChevronDown size={14} /></button><button title="Sair da conta" aria-label="Sair da conta" className="icon-button signout-button" onClick={signOut}><LogOut size={17} /></button></div></header>
      <main className="content"><Outlet /></main>
      <footer className="app-footer"><span>© {new Date().getFullYear()} CashLojas</span><span>Plataforma de relacionamento e cashback</span><span className="footer-status"><i /> Todos os sistemas operacionais</span></footer>
    </div>
  </div>;
}
