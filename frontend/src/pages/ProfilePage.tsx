import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { LockKeyhole, ShieldCheck, UserRound } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { Button, Card, ErrorMessage, Field, Input, PageTitle, useToast } from '../components/ui';
import { api, jsonBody } from '../lib/api';

function CustomerDataCard({ onSaved }: { onSaved: (message: string) => void }) {
  const { refreshMe } = useAuth();
  const { data } = useQuery({ queryKey: ['customer-profile'], queryFn: () => api<{ name: string; phone: string; email: string; rg: string }>('/me/profile') });
  const [form, setForm] = useState({ name: '', email: '', rg: '' });
  const [error, setError] = useState('');
  useEffect(() => { if (data) setForm({ name: data.name, email: data.email, rg: data.rg }); }, [data]);
  const mutation = useMutation({ mutationFn: () => api('/me/profile', { method: 'PATCH', body: jsonBody(form) }), onSuccess: () => { setError(''); void refreshMe(); onSaved('Dados atualizados.'); }, onError: (e) => setError(e instanceof Error ? e.message : 'Falha ao salvar.') });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });
  return <Card><div className="card-heading"><div><span className="eyebrow">MEUS DADOS</span><h2>Complementar cadastro</h2></div><span className="profile-card-icon"><UserRound size={18} /></span></div><form className="password-change-form" onSubmit={(e) => { e.preventDefault(); setError(''); mutation.mutate(); }}><Field label="Nome completo"><Input value={form.name} onChange={set('name')} minLength={3} maxLength={120} required /></Field><Field label="Celular" hint="Para alterar o celular, procure uma loja participante."><Input value={data?.phone ?? ''} disabled readOnly /></Field><Field label="E-mail"><Input type="email" value={form.email} onChange={set('email')} maxLength={160} required /></Field><Field label="RG"><Input value={form.rg} onChange={set('rg')} minLength={5} maxLength={20} required /></Field>{error && <ErrorMessage message={error} />}<Button type="submit" loading={mutation.isPending} disabled={!data}>Salvar dados</Button></form></Card>;
}

export function ProfilePage() {
  const { user, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const { toast, show, close } = useToast();
  const mutation = useMutation({ mutationFn: () => api('/auth/change-password', { method: 'POST', body: jsonBody({ currentPassword, newPassword }) }), onSuccess: () => { setCurrentPassword(''); setNewPassword(''); setError(''); show('Senha atualizada.'); void logout(); }, onError: (e) => setError(e instanceof Error ? e.message : 'Falha ao alterar senha.') });
  function submit(e: FormEvent) { e.preventDefault(); setError(''); mutation.mutate(); }
  return <><PageTitle eyebrow="CONFIGURAÇÕES" title="Meu perfil" description="Informações da conta e segurança de acesso." /><div className="profile-grid"><Card><div className="card-heading"><div><span className="eyebrow">DADOS DA CONTA</span><h2>Informações pessoais</h2></div><span className="profile-card-icon"><UserRound size={18} /></span></div><div className="profile-details"><div><span>Nome</span><strong>{user?.name}</strong></div><div><span>E-mail</span><strong>{user?.email}</strong></div><div><span>Perfil de acesso</span><strong>{user?.role === 'ROOT' ? 'Administrador Root' : user?.role === 'MANAGER' ? 'Gerente' : user?.role === 'CASHIER' ? 'Operador de caixa' : 'Cliente'}</strong></div>{user?.store && <div><span>Loja</span><strong>{user.store.name}</strong></div>}</div></Card><Card><div className="card-heading"><div><span className="eyebrow">SEGURANÇA</span><h2>Alterar senha</h2></div><span className="profile-card-icon"><ShieldCheck size={18} /></span></div><form className="password-change-form" onSubmit={submit}><Field label="Senha atual"><Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required autoComplete="current-password" /></Field><Field label="Nova senha" hint="Mínimo 10 caracteres, maiúscula, minúscula, número e símbolo."><Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={10} autoComplete="new-password" /></Field>{error && <ErrorMessage message={error} />}<Button type="submit" loading={mutation.isPending}><LockKeyhole size={15} /> Atualizar senha</Button></form></Card>{user?.role === 'CUSTOMER' && <CustomerDataCard onSaved={show} />}</div>{toast && <div className="toast-holder"><div className="toast toast-success">{toast.message}<button onClick={close}>×</button></div></div>}</>;
}
