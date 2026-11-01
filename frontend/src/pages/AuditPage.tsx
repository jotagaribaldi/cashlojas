import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileClock, ShieldCheck } from 'lucide-react';
import { Card, EmptyState, ErrorMessage, LoadingState, PageTitle, SearchBox, Table } from '../components/ui';
import { api } from '../lib/api';
import { dateTime } from '../lib/format';

interface AuditItem { id: string; action: string; entity: string; entityId?: string | null; ip?: string | null; metadata?: Record<string, unknown> | null; createdAt: string; user?: { name: string; email: string } | null }
interface Page { total: number; items: AuditItem[] }
export function AuditPage() {
  const [search, setSearch] = useState('');
  const query = useQuery({ queryKey: ['audit-logs', search], queryFn: () => api<Page>(`/admin/audit-logs?pageSize=100${search ? `&search=${encodeURIComponent(search)}` : ''}`) });
  return <><PageTitle eyebrow="SEGURANÇA E CONFORMIDADE" title="Trilha de auditoria" description="Registro de atividades administrativas e alterações relevantes." /><Card className="table-card"><div className="table-toolbar"><div><strong>Eventos registrados</strong><small>{query.data?.total ?? '—'} eventos</small></div><SearchBox value={search} onChange={setSearch} placeholder="Ação ou entidade" /></div>{query.isLoading ? <LoadingState /> : query.isError ? <ErrorMessage message="Falha ao carregar auditoria." onRetry={() => void query.refetch()} /> : query.data?.items.length ? <Table><thead><tr><th>DATA E HORA</th><th>USUÁRIO</th><th>AÇÃO</th><th>ENTIDADE</th><th>ENDEREÇO IP</th></tr></thead><tbody>{query.data.items.map((item) => <tr key={item.id}><td>{dateTime(item.createdAt)}</td><td><div className="table-primary">{item.user?.name ?? 'Sistema'}</div><div className="table-secondary">{item.user?.email ?? '—'}</div></td><td><span className="role-pill"><ShieldCheck size={13} />{item.action}</span></td><td>{item.entity}{item.entityId ? <div className="table-secondary mono">{item.entityId}</div> : null}</td><td className="mono">{item.ip ?? '—'}</td></tr>)}</tbody></Table> : <EmptyState title="Nenhum evento encontrado" description="As ações relevantes serão registradas automaticamente." icon={<FileClock size={22} />} />}</Card></>;
}
