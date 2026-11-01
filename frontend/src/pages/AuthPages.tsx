import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Eye, EyeOff, LockKeyhole, TicketPercent } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';
import { Button, Field, Input, Select } from '../components/ui';

interface StoreOption { id: string; name: string; segment: string; group: { name: string } }

function AuthFrame({ children, title, subtitle }: { children: React.ReactNode; title: string; subtitle: string }) {
  return <div className="auth-page"><div className="auth-visual"><div className="auth-visual-top"><Link to="/login" className="brand brand-light"><span className="brand-mark"><TicketPercent size={20} /></span><span className="brand-name">cash<span>lojas</span></span></Link><div className="auth-visual-pill"><i /> Cashback que aproxima</div></div><div className="auth-visual-content"><span className="auth-orbit orbit-one" /><span className="auth-orbit orbit-two" /><div className="auth-highlight-card"><span className="highlight-spark">✳</span><small>SEU SALDO EM TODA A REDE</small><strong>Um benefício.<br /><em>muitas possibilidades.</em></strong><div className="highlight-bottom"><span className="highlight-icon"><TicketPercent size={18} /></span><span>Cashback que volta para você.<br />Simples assim.</span><ArrowRight size={17} /></div></div></div><div className="auth-visual-footer"><span>Compra feita, benefício garantido.</span><span>01 / 04</span></div></div><div className="auth-form-side"><div className="auth-mobile-brand"><span className="brand-mark"><TicketPercent size={20} /></span><span className="brand-name">cash<span>lojas</span></span></div><div className="auth-form-wrap"><div className="auth-overline"><span className="auth-line" /> SUA CONTA, DO SEU JEITO</div><h1>{title}</h1><p className="auth-subtitle">{subtitle}</p>{children}</div><div className="auth-legal">© {new Date().getFullYear()} CashLojas <span>·</span> Privacidade <span>·</span> Termos</div></div></div>;
}

export function LoginPage() {
  const { user, ready, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  if (ready && user) return <Navigate to="/" replace />;

  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setLoading(true);
    try { await login({ email: email.trim(), password }); navigate('/'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível entrar.'); }
    finally { setLoading(false); }
  }
  return <AuthFrame title="Bom ter você de volta." subtitle="Acesse sua conta para continuar de onde parou."><form className="auth-form" onSubmit={submit}>
    {error && <div className="auth-error">{error}</div>}
    <Field label="E-mail"><Input type="email" autoComplete="email" placeholder="voce@exemplo.com.br" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
    <Field label="Senha"><div className="password-field"><Input type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Digite sua senha" value={password} onChange={(e) => setPassword(e.target.value)} required /><button type="button" className="password-toggle" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></Field>
    <div className="form-between"><span><LockKeyhole size={13} /> Acesso protegido e criptografado</span><a href="mailto:suporte@cashlojas.com.br?subject=Recuperar%20senha">Esqueci minha senha</a></div>
    <Button type="submit" className="auth-submit" loading={loading}>Entrar na minha conta <ArrowRight size={17} /></Button>
    <div className="auth-divider"><span /> ou <span /></div>
    <p className="auth-signup">Ainda não tem conta? <Link to="/register">Criar minha conta <ArrowRight size={14} /></Link></p>
  </form></AuthFrame>;
}

export function RegisterPage() {
  const { user, ready, register } = useAuth();
  const navigate = useNavigate();
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [values, setValues] = useState({ name: '', email: '', phone: '', rg: '', password: '', storeId: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { api<StoreOption[]>('/stores/public').then(setStores).catch(() => undefined); }, []);
  if (ready && user) return <Navigate to="/" replace />;
  function field(key: keyof typeof values) { return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setValues((v) => ({ ...v, [key]: e.target.value })); }
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setLoading(true);
    try { await register({ name: values.name, email: values.email.trim(), phone: values.phone, rg: values.rg, password: values.password, storeIds: values.storeId ? [values.storeId] : [] }); navigate('/'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível criar sua conta.'); }
    finally { setLoading(false); }
  }
  return <AuthFrame title="Seu cashback começa aqui." subtitle="Crie sua conta para acompanhar cada benefício da rede."><form className="auth-form register-form" onSubmit={submit}>
    {error && <div className="auth-error">{error}</div>}
    <Field label="Nome completo"><Input autoComplete="name" placeholder="Como podemos te chamar?" value={values.name} onChange={field('name')} minLength={3} maxLength={120} required /></Field>
    <div className="auth-two-col"><Field label="Celular"><Input type="tel" autoComplete="tel" placeholder="(11) 99999-0000" value={values.phone} onChange={field('phone')} required /></Field><Field label="RG"><Input placeholder="Somente números" value={values.rg} onChange={field('rg')} required /></Field></div>
    <Field label="E-mail"><Input type="email" autoComplete="email" placeholder="voce@exemplo.com.br" value={values.email} onChange={field('email')} required /></Field>
    <Field label="Loja favorita" hint="Você também pode participar de outras lojas depois."><Select value={values.storeId} onChange={field('storeId')}><option value="">Escolha uma loja (opcional)</option>{stores.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.segment}</option>)}</Select></Field>
    <Field label="Crie uma senha" hint="10+ caracteres, maiúscula, minúscula, número e símbolo."><Input type="password" autoComplete="new-password" placeholder="Use uma senha forte" value={values.password} onChange={field('password')} minLength={10} required /></Field>
    <p className="register-terms">Ao criar sua conta, você concorda com nossos <a href="#termos">Termos de Uso</a> e <a href="#privacidade">Política de Privacidade</a>.</p>
    <Button type="submit" className="auth-submit" loading={loading}>Criar minha conta <ArrowRight size={17} /></Button>
    <p className="auth-signup"><Link to="/login"><ArrowLeft size={14} /> Já tenho uma conta</Link></p>
  </form></AuthFrame>;
}

export function ActivatePage() {
  const { user, ready, activate } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [info, setInfo] = useState<{ name: string; email: string } | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!token) { setError('Link de acesso incompleto. Use o link enviado por WhatsApp.'); setChecking(false); return; }
    api<{ name: string; email: string }>('/auth/activation/check', { method: 'POST', body: JSON.stringify({ token }) })
      .then(setInfo)
      .catch((e) => setError(e instanceof Error ? e.message : 'Link inválido ou expirado.'))
      .finally(() => setChecking(false));
  }, [token]);
  if (ready && user) return <Navigate to="/" replace />;
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    if (password !== confirm) { setError('As senhas não conferem.'); return; }
    setLoading(true);
    try { await activate(token, password); navigate('/'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível criar sua senha.'); }
    finally { setLoading(false); }
  }
  return <AuthFrame title="Ative seu acesso." subtitle="Crie sua senha para acompanhar seu saldo de cashback, prazos de validade e histórico de resgates.">
    {checking ? <p>Verificando seu link...</p> : !info ? <div className="auth-form">{error && <div className="auth-error">{error}</div>}<p className="auth-signup">Já tem senha? <Link to="/login">Entrar na minha conta <ArrowRight size={14} /></Link></p></div> : <form className="auth-form" onSubmit={submit}>
      {error && <div className="auth-error">{error}</div>}
      <p>Olá, <strong>{info.name.split(' ')[0]}</strong>! Seu e-mail de acesso será <strong>{info.email}</strong>.</p>
      <Field label="Crie uma senha" hint="10+ caracteres, maiúscula, minúscula, número e símbolo."><div className="password-field"><Input type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={10} required /><button type="button" className="password-toggle" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></Field>
      <Field label="Repita a senha"><Input type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={10} required /></Field>
      <Button type="submit" className="auth-submit" loading={loading}>Criar senha e entrar <ArrowRight size={17} /></Button>
    </form>}
  </AuthFrame>;
}
