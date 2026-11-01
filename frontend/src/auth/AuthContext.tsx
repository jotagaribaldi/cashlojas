import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, jsonBody, setAccessToken } from '../lib/api';

export type Role = 'ROOT' | 'MANAGER' | 'CASHIER' | 'CUSTOMER';
export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  storeId: string | null;
  store?: { id: string; name: string; segment?: string; group?: { id: string; name: string } } | null;
}
interface Credentials { email: string; password: string }
interface Registration extends Credentials { name: string; phone: string; rg: string; storeIds?: string[] }
interface AuthResponse { accessToken: string; user: User }
interface AuthValue {
  user: User | null;
  ready: boolean;
  login: (credentials: Credentials) => Promise<void>;
  register: (values: Registration) => Promise<void>;
  activate: (token: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  const accept = useCallback((response: AuthResponse) => {
    setAccessToken(response.accessToken);
    setUser(response.user);
  }, []);

  const refreshMe = useCallback(async () => {
    try {
      const me = await api<User>('/auth/me');
      setUser(me);
    } catch {
      setUser(null);
      setAccessToken(null);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    api<AuthResponse>('/auth/refresh', { method: 'POST', headers: { 'X-CSRF-Token': document.cookie.split('; ').find((v) => v.startsWith('cl_csrf='))?.split('=').slice(1).join('=') ?? '' } })
      .then(async (response) => {
        if (!mounted) return;
        accept(response);
        const currentUser = await api<User>('/auth/me');
        if (mounted) setUser(currentUser);
      })
      .catch(() => {
        if (mounted) {
          setUser(null);
          setAccessToken(null);
        }
      })
      .finally(() => mounted && setReady(true));
    return () => { mounted = false; };
  }, [accept]);

  const login = useCallback(async (credentials: Credentials) => {
    const response = await api<AuthResponse>('/auth/login', { method: 'POST', body: jsonBody(credentials) });
    accept(response);
    setUser(await api<User>('/auth/me'));
  }, [accept]);

  const register = useCallback(async (values: Registration) => {
    const response = await api<AuthResponse>('/auth/register', { method: 'POST', body: jsonBody(values) });
    accept(response);
    setUser(await api<User>('/auth/me'));
  }, [accept]);

  const activate = useCallback(async (token: string, password: string) => {
    const response = await api<AuthResponse>('/auth/activate', { method: 'POST', body: jsonBody({ token, password }) });
    accept(response);
    setUser(await api<User>('/auth/me'));
  }, [accept]);

  const logout = useCallback(async () => {
    const token = document.cookie.split('; ').find((v) => v.startsWith('cl_csrf='))?.split('=').slice(1).join('=') ?? '';
    try { await api('/auth/logout', { method: 'POST', headers: { 'X-CSRF-Token': decodeURIComponent(token) } }); } catch { /* encerra localmente mesmo indisponível */ }
    setAccessToken(null);
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, ready, login, register, activate, logout, refreshMe }), [user, ready, login, register, activate, logout, refreshMe]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return context;
}
