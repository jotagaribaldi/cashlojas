import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Eye, FileClock } from 'lucide-react';
import { Badge, Button, Card, EmptyState, ErrorMessage, LoadingState, Modal, PageTitle, SearchBox, Table } from '../components/ui';
import { api } from '../lib/api';
import { dateTime } from '../lib/format';

type Outcome = 'SUCCESS' | 'FAILURE' | 'DENIED' | 'ERROR';
interface AuditItem {
  id: string; action: string; entity: string; entityId?: string | null; outcome: Outcome; role?: string | null; storeId?: string | null;
  method?: string | null; path?: string | null; statusCode?: number | null; durationMs?: number | null; error?: string | null;
  ip?: string | null; userAgent?: string | null; metadata?: Record<string, unknown> | null; createdAt: string; user?: { name: string; email: string } | null;
}
interface Page { total: number; page: number; pageSize: number; items: AuditItem[] }
interface StoreOpt { id: string; name: string }

const OUTCOME_LABEL: Record<Outcome, string> = { SUCCESS: 'Sucesso', FAILURE: 'Falhou', DENIED: 'Negado', ERROR: 'Erro' };
const OUTCOME_TONE: Record<Outcome, 'green' | 'amber' | 'red' | 'neutral'> = { SUCCESS: 'green', FAILURE: 'amber', DENIED: 'red', ERROR: 'red' };
const PAGE_SIZE = 50;

export function AuditPage() {
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<'business' | 'http' | 'all'>('business');
  const [outcome, setOutcome] = useState('');
  const [action, setAction] = useState('');
  const [storeId, setStoreId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<AuditItem | null>(null);

  const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), kind });
  if (search) params.set('search', search);
  if (outcome) params.set('outcome', outcome);
  if (action) params.set('action', action);
  if (storeId) params.set('storeId', storeId);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const qs = params.toString();

  const query = useQuery({ queryKey: ['audit-logs', qs], queryFn: () => api<Page>(`/admin/audit-logs?${qs}`) });
  const actions = useQuery({ queryKey: ['audit-actions'], queryFn: () => api<string[]>('/admin/audit-logs/actions') });
  const stores = useQuery({ queryKey: ['audit-stores'], queryFn: () => api<{ items: StoreOpt[] }>('/admin/stores?pageSize=100') });
  const storeName = (id?: string | null) => (id ? stores.data?.items.find((s) => s.id === id)?.name ?? '—' : '—');
  const reset = <T,>(setter: (v: T) => void) => (v: T) => { setter(v); setPage(1); };
  const pages = query.data ? Math.max(1, Math.ceil(query.data.total / PAGE_SIZE)) : 1;
  const actionList = (actions.data ?? []).filter((a) => (kind === 'all' ? true : kind === 'http' ? a.startsWith('HTTP_') : !a.startsWith('HTTP_')));

  return <><PageTitle eyebrow="SEGURANÇA E CONFORMIDADE" title="Trilha de auditoria" description="Todos os acessos, ações, tentativas negadas e falhas registrados na aplicação." />
    <Card className="table-card">
      <div className="table-toolbar"><div><strong>Eventos registrados</strong><small>{query.data?.total ?? '—'} eventos</small></div><SearchBox value={search} onChange={reset(setSearch)} placeholder="Usuário, e-mail, ação, IP, erro" /></div>
      <div className="table-toolbar audit-filters">
        <select className="filter-select" value={kind} onChange={(e) => { reset(setKind)(e.target.value as typeof kind); setAction(''); }}><option value="business">Eventos de negócio</option><option value="http">Requisições (acessos)</option><option value="all">Todos</option></select>
        <select className="filter-select" value={outcome} onChange={(e) => reset(setOutcome)(e.target.value)}><option value="">Todos os resultados</option>{Object.entries(OUTCOME_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select className="filter-select" value={action} onChange={(e) => reset(setAction)(e.target.value)}><option value="">Todas as ações</option>{actionList.map((a) => <option key={a} value={a}>{a}</option>)}</select>
        <select className="filter-select" value={storeId} onChange={(e) => reset(setStoreId)(e.target.value)}><option value="">Todas as lojas</option>{stores.data?.items.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <label className="audit-date">De <input className="filter-select" type="date" value={from} onChange={(e) => reset(setFrom)(e.target.value)} /></label>
        <label className="audit-date">Até <input className="filter-select" type="date" value={to} onChange={(e) => reset(setTo)(e.target.value)} /></label>
      </div>
      {query.isLoading ? <LoadingState /> : query.isError ? <ErrorMessage message="Falha ao carregar auditoria." onRetry={() => void query.refetch()} /> : query.data?.items.length ? <>
        <Table minWidth="980px"><thead><tr><th>DATA E HORA</th><th>USUÁRIO</th><th>AÇÃO</th><th>RESULTADO</th><th>LOJA</th><th>ROTA / ENTIDADE</th><th>IP</th><th /></tr></thead><tbody>{query.data.items.map((item) => <tr key={item.id}>
          <td>{dateTime(item.createdAt)}</td>
          <td><div className="table-primary">{item.user?.name ?? (item.role === 'SYSTEM' ? 'Sistema' : 'Anônimo')}</div><div className="table-secondary">{item.user?.email ?? (item.role ?? '—')}</div></td>
          <td><span className="role-pill">{item.action}</span></td>
          <td><Badge tone={OUTCOME_TONE[item.outcome]}>{OUTCOME_LABEL[item.outcome]}{item.statusCode ? ` · ${item.statusCode}` : ''}</Badge>{item.error && <div className="table-secondary audit-error" title={item.error}>{item.error}</div>}</td>
          <td>{storeName(item.storeId)}</td>
          <td>{item.path ? <div className="mono">{item.method} {item.path}</div> : item.entity}{item.entityId ? <div className="table-secondary mono">{item.entityId}</div> : null}</td>
          <td className="mono">{item.ip ?? '—'}</td>
          <td><button className="table-action" title="Ver detalhes" onClick={() => setDetail(item)}><Eye size={15} /></button></td>
        </tr>)}</tbody></Table>
        <div className="table-toolbar"><small>Página {page} de {pages}</small><div className="row-actions"><Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft size={14} /> Anterior</Button><Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Próxima <ChevronRight size={14} /></Button></div></div>
      </> : <EmptyState title="Nenhum evento encontrado" description="Ajuste os filtros ou aguarde novas ações." icon={<FileClock size={22} />} />}
    </Card>
    {detail && <Modal title={`Evento · ${detail.action}`} onClose={() => setDetail(null)} wide>
      <dl className="audit-detail">
        <dt>Data e hora</dt><dd>{dateTime(detail.createdAt)}</dd>
        <dt>Usuário</dt><dd>{detail.user ? `${detail.user.name} (${detail.user.email})` : detail.role === 'SYSTEM' ? 'Sistema' : 'Anônimo'}{detail.role ? ` · ${detail.role}` : ''}</dd>
        <dt>Resultado</dt><dd>{OUTCOME_LABEL[detail.outcome]}{detail.statusCode ? ` (HTTP ${detail.statusCode})` : ''}{detail.durationMs != null ? ` · ${detail.durationMs} ms` : ''}</dd>
        {detail.error && <><dt>Motivo</dt><dd>{detail.error}</dd></>}
        <dt>Loja</dt><dd>{storeName(detail.storeId)}</dd>
        <dt>Entidade</dt><dd className="mono">{detail.entity}{detail.entityId ? ` · ${detail.entityId}` : ''}</dd>
        {detail.path && <><dt>Rota</dt><dd className="mono">{detail.method} {detail.path}</dd></>}
        <dt>IP</dt><dd className="mono">{detail.ip ?? '—'}</dd>
        <dt>Dispositivo</dt><dd className="mono">{detail.userAgent ?? '—'}</dd>
      </dl>
      {detail.metadata && <pre className="audit-json">{JSON.stringify(detail.metadata, null, 2)}</pre>}
    </Modal>}
  </>;
}
