import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, CheckCircle2, Clock3, Gift, Handshake, HardHat, ShoppingBag, Sparkles, Trophy, UserPlus, UserRound, Users } from 'lucide-react';
import { Badge, Button, Card, EmptyState, ErrorMessage, Field, Input, LoadingState, Modal, PageTitle, SearchBox, Select, Table, useToast } from '../components/ui';
import { useAuth } from '../auth/AuthContext';
import { api, jsonBody } from '../lib/api';
import { date, expiryLabel, money, percent } from '../lib/format';

interface Customer { id: string; name: string; phone: string; email: string; createdAt: string; hasAccount: boolean; isProfessional: boolean; profession: string | null; commissionPercentBps: number }
interface CustomerPage { total: number; page: number; pageSize: number; items: Customer[] }
interface Credit { id: string; source: 'PURCHASE' | 'SIGNUP_BONUS'; amountCents: number; remainingCents: number; expiresAt: string; status: string; earnedAt: string; store: { name: string }; purchase: { purchaseDate: string; amountCents: number; fiscalDocument: string } | null }

function NewCustomerModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ name: '', phone: '', rg: '', email: '' });
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const mutation = useMutation({
    mutationFn: () => api<{ alreadyRegistered?: boolean; message?: string; bonusCents?: number }>('/customers', { method: 'POST', body: jsonBody(form) }),
    onSuccess: (r) => { const bonus = r.bonusCents ? ` Bônus de ${money(r.bonusCents)} creditado.` : ''; setDone(r.alreadyRegistered && r.message ? `${r.message}${bonus}` : `Cliente cadastrado na sua loja.${bonus} Uma mensagem de boas-vindas com o link de acesso foi enviada por WhatsApp.`); onCreated(); },
    onError: (e) => setError(e instanceof Error ? e.message : 'Não foi possível cadastrar o cliente.'),
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });
  if (done) return <Modal title="Novo cliente" onClose={onClose}><div className="modal-form"><p role="status"><CheckCircle2 size={18} /> {done}</p><div className="modal-actions"><Button onClick={onClose}>Fechar</Button></div></div></Modal>;
  return <Modal title="Novo cliente" onClose={onClose}><form className="form-grid" onSubmit={(e) => { e.preventDefault(); setError(''); mutation.mutate(); }}>
    <Field label="Nome completo"><Input value={form.name} onChange={set('name')} minLength={3} maxLength={120} required autoFocus /></Field>
    <Field label="Celular (com DDD)"><Input value={form.phone} onChange={set('phone')} inputMode="tel" placeholder="(63) 99999-9999" required /></Field>
    <Field label="RG"><Input value={form.rg} onChange={set('rg')} minLength={5} maxLength={20} required /></Field>
    <Field label="E-mail"><Input type="email" value={form.email} onChange={set('email')} maxLength={160} required /></Field>
    {error && <div style={{ gridColumn: '1 / -1' }}><ErrorMessage message={error} /></div>}
    <Button type="submit" loading={mutation.isPending} style={{ gridColumn: '1 / -1' }}>Cadastrar cliente</Button>
  </form></Modal>;
}

const PROFESSIONS = ['Pintor', 'Mecânico', 'Eletricista', 'Marceneiro', 'Pedreiro', 'Encanador', 'Gesseiro', 'Serralheiro', 'Vidraceiro', 'Arquiteto', 'Designer de interiores'];

function ProfessionalModal({ customer, onClose, onSaved }: { customer: Customer; onClose: () => void; onSaved: () => void }) {
  const [error, setError] = useState('');
  const mutation = useMutation({
    mutationFn: (values: { isProfessional: boolean; profession?: string; commissionPercent?: number }) => api(`/customers/${customer.id}/professional`, { method: 'PATCH', body: jsonBody(values) }),
    onSuccess: () => { onSaved(); onClose(); },
    onError: (e) => setError(e instanceof Error ? e.message : 'Não foi possível atualizar o profissional.'),
  });
  return <Modal title={`Profissional indicador · ${customer.name}`} onClose={onClose}><form className="modal-form" onSubmit={(e) => { e.preventDefault(); setError(''); const f = new FormData(e.currentTarget); const isProfessional = f.get('isProfessional') === 'true'; mutation.mutate({ isProfessional, ...(isProfessional ? { profession: String(f.get('profession') ?? ''), commissionPercent: Number(f.get('commissionPercent')) } : {}) }); }}>
    <Field label="Indica clientes para a loja?" hint="Ao ativar, este cliente passa a receber comissão pelas vendas que indicar."><Select name="isProfessional" defaultValue={customer.isProfessional ? 'true' : 'false'}><option value="false">Não</option><option value="true">Sim, é profissional indicador</option></Select></Field>
    <Field label="Profissão"><Input name="profession" list="profession-options" defaultValue={customer.profession ?? ''} placeholder="Ex.: Pintor" minLength={2} maxLength={80} /></Field>
    <datalist id="profession-options">{PROFESSIONS.map((p) => <option key={p} value={p} />)}</datalist>
    <Field label="Comissão por indicação (%)" hint="Percentual sobre o valor de cada compra indicada. Ex.: 5 significa 5%."><Input name="commissionPercent" type="number" min="0" max="100" step="0.01" defaultValue={customer.commissionPercentBps / 100} /></Field>
    {error && <ErrorMessage message={error} />}
    <div className="modal-actions"><Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" loading={mutation.isPending}>Salvar profissional</Button></div>
  </form></Modal>;
}

export function CustomersPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { show, toast, close } = useToast();
  const [creating, setCreating] = useState(false);
  const [professional, setProfessional] = useState<Customer | null>(null);
  const [search, setSearch] = useState('');
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['customers', search], queryFn: () => api<CustomerPage>(`/customers?pageSize=50${search ? `&search=${encodeURIComponent(search)}` : ''}`) });
  const isStaff = user?.role === 'CASHIER' || user?.role === 'MANAGER';
  const requests = useQuery({ queryKey: ['customer-redemption-requests'], enabled: isStaff, queryFn: () => api<{ id: string; createdAt: string; customer: { id: string; name: string; phone: string } }[]>('/customers/redemption-requests') });
  const resend = useMutation({ mutationFn: (id: string) => api(`/customers/${id}/resend-welcome`, { method: 'POST' }), onSuccess: () => show('Link de acesso enviado por WhatsApp.'), onError: (e) => show(e instanceof Error ? e.message : 'Não foi possível reenviar.', 'error') });
  const addButton = user?.role === 'CASHIER' || user?.role === 'MANAGER' ? <Button onClick={() => setCreating(true)}><UserPlus size={15} /> Novo cliente</Button> : undefined;
  const modal = creating && <NewCustomerModal onClose={() => setCreating(false)} onCreated={() => void qc.invalidateQueries({ queryKey: ['customers'] })} />;
  const toastEl = toast && <div className="toast-holder"><div className={`toast toast-${toast.type}`}>{toast.message}<button onClick={close}>×</button></div></div>;
  return <><PageTitle eyebrow="RELACIONAMENTO" title="Clientes" description="Clientes cadastrados e vinculados à sua loja." action={addButton} />{!!requests.data?.length && <Card className="table-card"><div className="table-toolbar"><div><strong>Solicitações de resgate</strong><small>{requests.data.length} aguardando atendimento no caixa</small></div></div><Table><thead><tr><th>CLIENTE</th><th>CELULAR</th><th>SOLICITADO EM</th></tr></thead><tbody>{requests.data.map((r) => <tr key={r.id}><td><div className="table-primary">{r.customer.name}</div></td><td>{r.customer.phone}</td><td>{date(r.createdAt)}</td></tr>)}</tbody></Table></Card>}<Card className="table-card"><div className="table-toolbar"><div><strong>Base de clientes</strong><small>{data?.total ?? '—'} clientes</small></div><SearchBox value={search} onChange={setSearch} placeholder="Nome, celular ou e-mail" /></div>{isLoading ? <LoadingState /> : isError ? <ErrorMessage message="Falha ao carregar clientes." onRetry={() => void refetch()} /> : data?.items.length ? <Table><thead><tr><th>CLIENTE</th><th>CELULAR</th><th>E-MAIL</th><th>CADASTRO</th><th>ACESSO</th><th>PROFISSIONAL</th><th>AÇÕES</th></tr></thead><tbody>{data.items.map((c) => <tr key={c.id}><td><div className="table-primary">{c.name}</div></td><td>{c.phone}</td><td>{c.email}</td><td>{date(c.createdAt)}</td><td>{c.hasAccount ? <span className="customer-tag"><UserRound size={13} /> Ativo</span> : user?.role === 'ROOT' ? <span className="table-secondary">Pendente</span> : <button className="btn btn-secondary btn-sm" disabled={resend.isPending} onClick={() => resend.mutate(c.id)}>Reenviar link</button>}</td><td>{c.isProfessional ? <><span className="customer-tag"><HardHat size={13} /> {c.profession}</span><div className="table-secondary">{percent(c.commissionPercentBps)} por indicação</div></> : <span className="table-secondary">—</span>}</td><td>{user?.role === 'MANAGER' ? <Button size="sm" variant="secondary" onClick={() => setProfessional(c)}><Handshake size={14} /> Profissional</Button> : <span className="muted">—</span>}</td></tr>)}</tbody></Table> : <EmptyState title="Nenhum cliente encontrado" description="Os clientes vinculados à sua loja aparecerão aqui." icon={<Users size={22} />} />}</Card>{modal}{professional && <ProfessionalModal customer={professional} onClose={() => setProfessional(null)} onSaved={() => { void qc.invalidateQueries({ queryKey: ['customers'] }); show('Cadastro profissional atualizado.'); }} />}{toastEl}</>;
}

export function CustomerCreditsPage() {
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['customer-credits'], queryFn: () => api<{ items: Credit[]; total: number }>('/me/credits?pageSize=100') });
  return <><PageTitle eyebrow="SEU HISTÓRICO" title="Meus créditos" description="Veja seus créditos de cashback, status e vencimentos." /><Card className="table-card"><div className="table-toolbar"><div><strong>Extrato de cashback</strong><small>{data?.total ?? '—'} créditos</small></div></div>{isLoading ? <LoadingState /> : isError ? <ErrorMessage message="Não foi possível carregar seus créditos." onRetry={() => void refetch()} /> : data?.items.length ? <Table><thead><tr><th>LOJA</th><th>COMPRA</th><th>CRÉDITO GERADO</th><th>SALDO ATUAL</th><th>VENCIMENTO</th><th>STATUS</th></tr></thead><tbody>{data.items.map((c) => <tr key={c.id}><td><div className="table-primary">{c.store.name}</div></td><td>{c.purchase ? <>{date(c.purchase.purchaseDate)}<div className="table-secondary">{c.purchase.fiscalDocument}</div></> : <><span className="customer-tag"><Gift size={12} /> Bônus de cadastro</span><div className="table-secondary">Primeiro vínculo com a loja</div></>}</td><td className="amount-positive">+{money(c.amountCents)}</td><td className="amount-cell">{money(c.remainingCents)}</td><td>{date(c.expiresAt)}{c.status === 'ACTIVE' && <div className="table-secondary">{expiryLabel(c.expiresAt)}</div>}</td><td><span className={`credit-status credit-${c.status.toLowerCase()}`}>{c.status === 'ACTIVE' ? 'Disponível' : c.status === 'CONSUMED' ? 'Utilizado' : 'Expirado'}</span></td></tr>)}</tbody></Table> : <EmptyState title="Seu extrato está vazio" description="Faça sua primeira compra em uma loja participante para começar a acumular cashback." icon={<Gift size={22} />} />}</Card></>;
}

interface Store { id: string; name: string; segment: string; validityDays: number; cashbackPercentBps: number; signupBonusCents: number; enrolled: boolean; group: { name: string } }
export function CustomerStoresPage() {
  const qc = useQueryClient();
  const { show, toast, close } = useToast();
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['customer-stores'], queryFn: () => api<Store[]>('/me/stores') });
  const mutation = useMutation({ mutationFn: (id: string) => api<{ enrolled: boolean; bonusCents: number }>(`/me/stores/${id}`, { method: 'POST' }), onSuccess: (result) => { void qc.invalidateQueries({ queryKey: ['customer-stores'] }); void qc.invalidateQueries({ queryKey: ['customer-summary'] }); show(result.bonusCents > 0 ? `Você agora participa desta loja e recebeu ${money(result.bonusCents)} de bônus!` : 'Você agora participa desta loja.'); }, onError: (e) => show(e instanceof Error ? e.message : 'Não foi possível participar.', 'error') });
  return <><PageTitle eyebrow="BENEFÍCIOS NA REDE" title="Lojas participantes" description="Cadastre-se em uma loja para acumular cashback nas suas compras." />{isLoading ? <LoadingState /> : isError ? <ErrorMessage message="Falha ao carregar lojas." onRetry={() => void refetch()} /> : data?.length ? <div className="store-cards store-cards-wide">{data.map((s, i) => <Card className="participating-store" key={s.id}><span className={`store-card-icon store-icon-${i % 4}`}><Gift size={20} /></span><span className="store-card-group">{s.group.name}</span><h2>{s.name}</h2><span className="store-card-segment">{s.segment}</span><div className="store-perks"><span><Gift size={14} /> {(s.cashbackPercentBps / 100).toLocaleString('pt-BR')}% de cashback</span><span><Clock3 size={14} /> válido por {s.validityDays} dias</span>{s.signupBonusCents > 0 && <span><Sparkles size={14} /> {money(s.signupBonusCents)} de bônus ao participar</span>}</div><Button variant={s.enrolled ? 'secondary' : 'primary'} disabled={s.enrolled || mutation.isPending} loading={mutation.isPending} onClick={() => mutation.mutate(s.id)}>{s.enrolled ? <><CheckCircle2 size={15} /> Você participa</> : <>Participar desta loja <ArrowRight size={15} /></>}</Button></Card>)}</div> : <EmptyState title="Nenhuma loja disponível" description="Volte mais tarde para conferir novas lojas participantes." />}{toast && <div className="toast-holder"><div className={`toast toast-${toast.type}`}>{toast.message}<button onClick={close}>×</button></div></div>}</>;
}

interface PurchaseItem { id: string; purchaseDate: string; amountCents: number; cashbackCents: number; fiscalDocument: string; store: { name: string } }
export function CustomerPurchasesPage() {
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['customer-purchases'], queryFn: () => api<{ items: PurchaseItem[]; total: number }>('/me/purchases?pageSize=100') });
  return <><PageTitle eyebrow="SEU HISTÓRICO" title="Minhas compras" description="Compras registradas e o cashback gerado em cada uma." /><Card className="table-card"><div className="table-toolbar"><div><strong>Histórico de compras</strong><small>{data?.total ?? '—'} compras</small></div></div>{isLoading ? <LoadingState /> : isError ? <ErrorMessage message="Não foi possível carregar suas compras." onRetry={() => void refetch()} /> : data?.items.length ? <Table><thead><tr><th>LOJA</th><th>DATA</th><th>DOCUMENTO</th><th>VALOR</th><th>CASHBACK</th></tr></thead><tbody>{data.items.map((p) => <tr key={p.id}><td><div className="table-primary">{p.store.name}</div></td><td>{date(p.purchaseDate)}</td><td>{p.fiscalDocument}</td><td className="amount-cell">{money(p.amountCents)}</td><td className="amount-positive">+{money(p.cashbackCents)}</td></tr>)}</tbody></Table> : <EmptyState title="Nenhuma compra ainda" description="Suas compras aparecerão aqui." icon={<ShoppingBag size={22} />} />}</Card></>;
}

interface Commission { id: string; amountCents: number; percentBps: number; status: 'PENDING' | 'PAID'; paidAt: string | null; createdAt: string; store: { name: string }; purchase: { fiscalDocument: string; purchaseDate: string; amountCents: number; customer: { name: string } } }

export function MyCommissionsPage() {
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['my-commissions'], queryFn: () => api<{ items: Commission[]; total: number; pendingCents: number; paidCents: number }>('/me/commissions?pageSize=100') });
  return <><PageTitle eyebrow="INDICAÇÕES" title="Minhas comissões" description="Comissões recebidas por indicar clientes às lojas." />
    <Card><div className="rank-hero"><div><small>A RECEBER</small><strong>{money(data?.pendingCents ?? 0)}</strong><small>Comissões pendentes de pagamento</small></div><div><small>JÁ RECEBIDO</small><strong>{money(data?.paidCents ?? 0)}</strong><small>Total pago pelas lojas</small></div></div></Card>
    <Card className="table-card"><div className="table-toolbar"><div><strong>Extrato de comissões</strong><small>{data?.total ?? '—'} comissões</small></div></div>{isLoading ? <LoadingState /> : isError ? <ErrorMessage message="Não foi possível carregar suas comissões." onRetry={() => void refetch()} /> : data?.items.length ? <Table><thead><tr><th>LOJA</th><th>CLIENTE INDICADO</th><th>COMPRA</th><th>VALOR DA COMPRA</th><th>COMISSÃO</th><th>STATUS</th></tr></thead><tbody>{data.items.map((c) => <tr key={c.id}><td><div className="table-primary">{c.store.name}</div></td><td>{c.purchase.customer.name}</td><td>{date(c.purchase.purchaseDate)}<div className="table-secondary">{c.purchase.fiscalDocument}</div></td><td className="amount-cell">{money(c.purchase.amountCents)}</td><td className="amount-positive">+{money(c.amountCents)}<div className="table-secondary">{percent(c.percentBps)}</div></td><td><Badge tone={c.status === 'PAID' ? 'green' : 'amber'}>{c.status === 'PAID' ? `Pago em ${date(c.paidAt)}` : 'A receber'}</Badge></td></tr>)}</tbody></Table> : <EmptyState title="Nenhuma comissão ainda" description="Quando um cliente comprar indicado por você, a comissão aparecerá aqui." icon={<Handshake size={22} />} />}</Card></>;
}

interface Ranking { storeName: string; position: number; participants: number; totalCents: number; centsToNextPosition: number; top: { position: number; name: string; totalCents: number; isMe: boolean }[] }
export function RankingPage() {
  const stores = useQuery({ queryKey: ['customer-stores'], queryFn: () => api<Store[]>('/me/stores') });
  const mine = stores.data?.filter((s) => s.enrolled) ?? [];
  const [selected, setSelected] = useState('');
  const storeId = selected || mine[0]?.id || '';
  const ranking = useQuery({ queryKey: ['customer-ranking', storeId], enabled: !!storeId, queryFn: () => api<Ranking>(`/me/ranking/${storeId}`) });
  const r = ranking.data;
  return <><PageTitle eyebrow="GAMIFICAÇÃO" title="Ranking de clientes" description="Veja sua posição entre os clientes da loja. Quanto mais você compra, mais sobe." />
    {stores.isLoading ? <LoadingState /> : !mine.length ? <EmptyState title="Você ainda não participa de lojas" description="Participe de uma loja para entrar no ranking." icon={<Trophy size={22} />} /> : <>
      {mine.length > 1 && <div className="table-toolbar"><select className="filter-select" value={storeId} onChange={(e) => setSelected(e.target.value)}>{mine.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>}
      {ranking.isLoading ? <LoadingState /> : ranking.isError || !r ? <ErrorMessage message="Não foi possível carregar o ranking." onRetry={() => void ranking.refetch()} /> : <>
        <Card><div className="rank-hero"><div><small>SUA POSIÇÃO</small><strong>{r.position}º</strong><small>de {r.participants} clientes em {r.storeName}</small></div><div><small>TOTAL EM COMPRAS</small><strong>{money(r.totalCents)}</strong>{r.position > 1 && <small>Faltam {money(r.centsToNextPosition)} para subir uma posição</small>}{r.position === 1 && <small>Você lidera o ranking!</small>}</div></div></Card>
        <Card className="table-card"><div className="table-toolbar"><div><strong>Top clientes</strong><small>Ranking por valor acumulado em compras</small></div></div><Table><thead><tr><th>POSIÇÃO</th><th>CLIENTE</th><th>TOTAL EM COMPRAS</th></tr></thead><tbody>{r.top.map((t) => <tr key={t.position} className={t.isMe ? 'rank-me' : undefined}><td className="rank-pos">{t.position}º</td><td><div className="table-primary">{t.name} {t.isMe && <Badge tone="green">você</Badge>}</div></td><td className="amount-cell">{money(t.totalCents)}</td></tr>)}</tbody></Table></Card></>}
    </>}</>;
}
