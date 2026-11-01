import { useState } from 'react';
import './receipt.css';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, FileText, Printer, TicketPercent } from 'lucide-react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Badge, Button, Card, EmptyState, ErrorMessage, LoadingState, PageTitle, SearchBox, Table, useToast } from '../components/ui';
import { api } from '../lib/api';
import { date, dateTime, money } from '../lib/format';

interface PurchaseItem { id: string; customer: { id: string; name: string; phone: string }; cashier: { name: string }; fiscalDocument: string; amountCents: number; cashbackCents: number; purchaseDate: string; credit?: { expiresAt: string; status: string; remainingCents: number } | null }
interface RedemptionItem { id: string; authorizationCode?: string | null; status?: string; customer?: { id: string; name: string; phone: string }; store?: { name: string }; cashier?: { name: string }; manager?: { name: string } | null; fiscalDocument?: string; purchaseAmountCents?: number; discountCents: number; createdAt?: string; decidedAt?: string | null }
interface Page<T> { total: number; page: number; pageSize: number; items: T[] }

export function PurchasesPage() {
  const [search, setSearch] = useState('');
  const { user } = useAuth();
  const query = useQuery({ queryKey: ['purchases', search], queryFn: () => api<Page<PurchaseItem>>(`/purchases?pageSize=50${search ? `&search=${encodeURIComponent(search)}` : ''}`) });
  return <><PageTitle eyebrow="MOVIMENTAÇÕES" title="Compras registradas" description="Acompanhe vendas, créditos gerados e validade do cashback." action={user?.role !== 'ROOT' ? <Link to="/cashier" className="btn btn-primary">Abrir caixa <ArrowRight size={15} /></Link> : undefined} /><Card className="table-card"><div className="table-toolbar"><div><strong>Histórico de compras</strong><small>{query.data?.total ?? '—'} registros encontrados</small></div><SearchBox value={search} onChange={setSearch} placeholder="Cliente, celular ou nota fiscal" /></div>{query.isLoading ? <LoadingState /> : query.isError ? <ErrorMessage message="Falha ao carregar compras." onRetry={() => void query.refetch()} /> : query.data?.items.length ? <Table><thead><tr><th>CLIENTE</th><th>NOTA FISCAL</th><th>DATA</th><th>VALOR DA COMPRA</th><th>CASHBACK GERADO</th><th>VALIDADE</th></tr></thead><tbody>{query.data.items.map((p) => <tr key={p.id}><td><div className="table-primary">{p.customer.name}</div><div className="table-secondary">{p.customer.phone}</div></td><td><span className="mono">{p.fiscalDocument}</span></td><td>{date(p.purchaseDate)}</td><td className="amount-cell">{money(p.amountCents)}</td><td><span className="amount-positive">+{money(p.cashbackCents)}</span></td><td>{p.credit ? <Badge tone={p.credit.status === 'ACTIVE' ? 'green' : p.credit.status === 'EXPIRED' ? 'red' : 'neutral'}>{p.credit.status === 'ACTIVE' ? `Até ${date(p.credit.expiresAt)}` : p.credit.status === 'EXPIRED' ? 'Expirado' : 'Utilizado'}</Badge> : <span className="muted">—</span>}</td></tr>)}</tbody></Table> : <EmptyState title="Nenhuma compra encontrada" description="As compras registradas aparecerão aqui." icon={<FileText size={22} />} />}</Card></>;
}

const statusLabel: Record<string, string> = { PENDING: 'Pendente', APPROVED: 'Aprovado', REJECTED: 'Recusado', CANCELLED: 'Cancelado' };
const statusTone: Record<string, 'green' | 'amber' | 'red' | 'neutral'> = { PENDING: 'amber', APPROVED: 'green', REJECTED: 'red', CANCELLED: 'neutral' };

export function RedemptionsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast, show, close } = useToast();
  const [status, setStatus] = useState('');
  const query = useQuery({ queryKey: ['redemptions-page', status], queryFn: () => api<Page<RedemptionItem>>(`/redemptions?pageSize=50${status ? `&status=${status}` : ''}`) });
  const customerQuery = useQuery({ queryKey: ['my-redemptions'], queryFn: () => api<Page<RedemptionItem>>('/me/redemptions?pageSize=50'), enabled: user?.role === 'CUSTOMER' });
  const data = user?.role === 'CUSTOMER' ? customerQuery.data : query.data;
  const loading = user?.role === 'CUSTOMER' ? customerQuery.isLoading : query.isLoading;
  const error = user?.role === 'CUSTOMER' ? customerQuery.isError : query.isError;
  const decision = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'approve' | 'reject' | 'cancel' }) => api<{ id: string }>(`/redemptions/${id}/${action}`, { method: 'POST', body: JSON.stringify({}) }),
    onSuccess: (result, variables) => {
      void query.refetch();
      void qc.invalidateQueries({ queryKey: ['redemptions'] });
      if (variables.action === 'approve') navigate(`/receipt/${result.id}`);
      else show(variables.action === 'reject' ? 'Solicitação recusada.' : 'Solicitação cancelada.');
    },
    onError: (error) => show(error instanceof Error ? error.message : 'Não foi possível atualizar a solicitação.', 'error'),
  });
  return <><PageTitle eyebrow="HISTÓRICO DE BENEFÍCIOS" title="Resgates de cashback" description={user?.role === 'CUSTOMER' ? 'Veja os descontos que você já utilizou.' : 'Solicitações de desconto e comprovantes de autorização.'} action={user?.role === 'CASHIER' || user?.role === 'MANAGER' ? <Link className="btn btn-primary" to="/cashier"><TicketPercent size={16} /> Novo resgate</Link> : undefined} /><Card className="table-card"><div className="table-toolbar"><div><strong>{user?.role === 'CUSTOMER' ? 'Descontos utilizados' : 'Solicitações de resgate'}</strong><small>{data?.total ?? '—'} registros</small></div>{user?.role !== 'CUSTOMER' && <select className="filter-select" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Todos os status</option><option value="PENDING">Pendentes</option><option value="APPROVED">Aprovados</option><option value="REJECTED">Recusados</option><option value="CANCELLED">Cancelados</option></select>}</div>{loading ? <LoadingState /> : error ? <ErrorMessage message="Falha ao carregar os resgates." onRetry={() => void query.refetch()} /> : data?.items.length ? <Table><thead><tr>{user?.role === 'CUSTOMER' ? <><th>LOJA</th><th>DATA DA AUTORIZAÇÃO</th><th>DESCONTO UTILIZADO</th><th>COMPROVANTE</th></> : <><th>CLIENTE</th><th>NOTA FISCAL</th><th>DATA</th><th>VALOR DO DESCONTO</th><th>STATUS</th><th>APROVAÇÃO</th><th>AÇÕES</th></>}</tr></thead><tbody>{data.items.map((r) => <tr key={r.id}>{user?.role === 'CUSTOMER' ? <><td><div className="table-primary">{r.store?.name ?? 'Loja'}</div></td><td>{dateTime(r.decidedAt)}</td><td className="amount-cell">{money(r.discountCents)}</td><td><Link className="text-link" to={`/receipt/${r.id}`}><span className="mono">{r.authorizationCode}</span> <ArrowRight size={13} /></Link></td></> : <><td><div className="table-primary">{r.customer?.name ?? '—'}</div><div className="table-secondary">{r.customer?.phone ?? ''}</div></td><td><span className="mono">{r.fiscalDocument ?? '—'}</span></td><td>{dateTime(r.decidedAt ?? r.createdAt)}</td><td className="amount-cell">{money(r.discountCents)}</td><td><Badge tone={statusTone[r.status ?? ''] ?? 'neutral'}>{statusLabel[r.status ?? ''] ?? r.status}</Badge></td><td>{r.authorizationCode ? <Link className="text-link" to={`/receipt/${r.id}`}><span className="mono">{r.authorizationCode}</span> <ArrowRight size={13} /></Link> : <span className="muted">{r.manager?.name ?? 'Aguardando gerente'}</span>}</td><td>{r.status === 'PENDING' && user?.role === 'MANAGER' ? <div className="row-actions"><Button size="sm" onClick={() => decision.mutate({ id: r.id, action: 'approve' })} loading={decision.isPending}>Aprovar</Button><Button size="sm" variant="secondary" onClick={() => { if (confirm('Recusar esta solicitação de desconto?')) decision.mutate({ id: r.id, action: 'reject' }); }}>Recusar</Button></div> : r.status === 'PENDING' && user?.role === 'CASHIER' ? <Button size="sm" variant="secondary" onClick={() => { if (confirm('Cancelar esta solicitação pendente?')) decision.mutate({ id: r.id, action: 'cancel' }); }}>Cancelar</Button> : <span className="muted">—</span>}</td></>}</tr>)}</tbody></Table> : <EmptyState title="Nenhum resgate por aqui" description="Quando um cliente usar cashback, as solicitações aparecerão nesta lista." icon={<TicketPercent size={22} />} />}</Card>    {toast && <div className="toast-holder"><div className={`toast toast-${toast.type}`}>{toast.message}<button onClick={close}>×</button></div></div>}
  </>;
}

interface Receipt {
  id: string;
  authorizationCode: string;
  approvedAt: string;
  requestedAt: string;
  fiscalDocument: string;
  purchaseAmountCents: number;
  discountCents: number;
  amountDueCents: number;
  note?: string | null;
  store: { name: string; cnpj?: string | null; segment: string; group: string };
  customer: { name: string; phone: string };
  cashier: { name: string };
  manager?: { name: string; email: string } | null;
}

export function ReceiptPage() {
  const { id = '' } = useParams();
  const query = useQuery({ queryKey: ['receipt', id], queryFn: () => api<Receipt>(`/redemptions/${id}/receipt`), enabled: !!id });
  if (query.isLoading) return <LoadingState label="Carregando comprovante…" />;
  if (query.isError || !query.data) return <ErrorMessage message="Comprovante não encontrado ou ainda não aprovado." onRetry={() => void query.refetch()} />;
  const r = query.data;
  return <><PageTitle eyebrow="DOCUMENTO DE AUTORIZAÇÃO" title="Comprovante de desconto" description="Autorização registrada pelo sistema CashLojas." action={<button className="btn btn-secondary" onClick={() => window.print()}><Printer size={15} /> Imprimir comprovante</button>} /><Card className="receipt-card"><div className="receipt-top"><span className="receipt-brand"><span className="brand-mark"><TicketPercent size={18} /></span><span className="brand-name">cash<span>lojas</span></span></span><Badge tone="green">Desconto aprovado</Badge></div><div className="receipt-code"><span>CÓDIGO DE AUTORIZAÇÃO</span><strong>{r.authorizationCode}</strong></div><div className="receipt-amount"><span>DESCONTO CONCEDIDO</span><strong>{money(r.discountCents)}</strong></div><div className="receipt-details"><div><span>Loja</span><strong>{r.store.name}</strong></div><div><span>Grupo</span><strong>{r.store.group}</strong></div><div><span>Cliente</span><strong>{r.customer.name} · {r.customer.phone}</strong></div><div><span>Documento fiscal</span><strong>{r.fiscalDocument}</strong></div><div><span>Valor da compra</span><strong>{money(r.purchaseAmountCents)}</strong></div><div><span>Valor após desconto</span><strong>{money(r.amountDueCents)}</strong></div><div><span>Data e hora da aprovação</span><strong>{dateTime(r.approvedAt)}</strong></div><div><span>Caixa responsável</span><strong>{r.cashier.name}</strong></div><div><span>Gerente autorizador</span><strong>{r.manager?.name ?? '—'}{r.manager?.email ? ` · ${r.manager.email}` : ''}</strong></div></div>{r.note && <div className="receipt-note"><span>Observação</span><p>{r.note}</p></div>}<div className="receipt-footer"><ShieldCheckIcon /> Aprovação registrada e auditada eletronicamente pelo CashLojas.</div></Card><Link className="text-link receipt-back" to="/redemptions"><ArrowLeft size={14} /> Voltar aos resgates</Link></>;
}

function ShieldCheckIcon() { return <TicketPercent size={15} />; }
