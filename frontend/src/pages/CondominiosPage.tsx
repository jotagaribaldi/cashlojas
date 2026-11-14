import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Home, Link2, Plus, UserPlus } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { api, jsonBody } from '../lib/api';
import { date, percent } from '../lib/format';
import {
  Badge, Button, Card, EmptyState, ErrorMessage, Field, Input, LoadingState, Modal,
  PageTitle, SearchBox, Select, Table, useToast,
} from '../components/ui';

interface Administradora { id: string; cnpj: string; name: string; email: string; active: boolean; _count: { condominios: number; users: number } }
interface Condominio {
  id: string; cnpj: string; name: string; commissionPercentBps: number; active: boolean; createdAt: string;
  administradora: { id: string; name: string };
  _count: { unidades: number; moradias: number; sindicos: number };
}
interface CondominioPage { total: number; page: number; pageSize: number; items: Condominio[] }
interface Morador { id: string; startedAt: string; unidade: { id: string; label: string }; customer: { id: string; name: string; phone: string; cpf: string; email: string } }
interface Unidade { id: string; label: string; _count: { moradias: number } }
interface Sindico { id: string; startedAt: string; user: { id: string; name: string; email: string; active: boolean; lastLoginAt: string | null } }
interface CondominioDetail {
  id: string; cnpj: string; name: string; commissionPercentBps: number; active: boolean;
  administradora: { id: string; name: string; email: string };
  unidades: Unidade[];
  sindicos: Sindico[];
}

function AdministradoraModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [error, setError] = useState('');
  const mutation = useMutation({
    mutationFn: (values: { cnpj: string; name: string; email: string }) => api('/condominios/administradoras', { method: 'POST', body: jsonBody(values) }),
    onSuccess: () => { onSaved(); onClose(); },
    onError: (e) => setError(e instanceof Error ? e.message : 'Não foi possível cadastrar a administradora.'),
  });
  return <Modal title="Nova administradora" onClose={onClose}><form className="modal-form" onSubmit={(e) => {
    e.preventDefault(); setError('');
    const f = new FormData(e.currentTarget);
    mutation.mutate({ cnpj: String(f.get('cnpj') ?? ''), name: String(f.get('name') ?? ''), email: String(f.get('email') ?? '') });
  }}>
    <Field label="CNPJ" hint="14 dígitos, com dígito verificador válido."><Input name="cnpj" placeholder="11.222.333/0001-81" required /></Field>
    <Field label="Razão social"><Input name="name" placeholder="Administradora Exemplo Ltda" minLength={3} maxLength={160} required /></Field>
    <Field label="E-mail de contato"><Input name="email" type="email" placeholder="contato@administradora.com.br" required /></Field>
    {error && <ErrorMessage message={error} />}
    <div className="modal-actions"><Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" loading={mutation.isPending}>Cadastrar</Button></div>
  </form></Modal>;
}

function CondominioModal({ administradoras, onClose, onSaved }: { administradoras: Administradora[]; onClose: () => void; onSaved: () => void }) {
  const [error, setError] = useState('');
  const mutation = useMutation({
    mutationFn: (values: { cnpj: string; name: string; administradoraId: string; commissionPercentBps: number }) => api('/condominios', { method: 'POST', body: jsonBody(values) }),
    onSuccess: () => { onSaved(); onClose(); },
    onError: (e) => setError(e instanceof Error ? e.message : 'Não foi possível cadastrar o condomínio.'),
  });
  return <Modal title="Novo condomínio" onClose={onClose}><form className="modal-form" onSubmit={(e) => {
    e.preventDefault(); setError('');
    const f = new FormData(e.currentTarget);
    mutation.mutate({
      cnpj: String(f.get('cnpj') ?? ''),
      name: String(f.get('name') ?? ''),
      administradoraId: String(f.get('administradoraId') ?? ''),
      commissionPercentBps: Math.round(Number(f.get('commissionPercent') ?? 20) * 100),
    });
  }}>
    <Field label="CNPJ" hint="14 dígitos, com dígito verificador válido."><Input name="cnpj" placeholder="11.222.333/0001-81" required /></Field>
    <Field label="Nome do condomínio"><Input name="name" placeholder="Residencial Jardim das Flores" minLength={3} maxLength={160} required /></Field>
    <Field label="Administradora">
      <Select name="administradoraId" required defaultValue="">
        <option value="" disabled>Selecione a administradora</option>
        {administradoras.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </Select>
    </Field>
    <Field label="Comissão do app (%)" hint="Percentual retido sobre o cashback do condomínio. Padrão 20%."><Input name="commissionPercent" type="number" min="0" max="100" step="0.01" defaultValue={20} required /></Field>
    {error && <ErrorMessage message={error} />}
    <div className="modal-actions"><Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" loading={mutation.isPending}>Cadastrar</Button></div>
  </form></Modal>;
}

function InviteModal({ title, endpoint, onClose, onSaved }: { title: string; endpoint: string; onClose: () => void; onSaved: (link: string) => void }) {
  const [error, setError] = useState('');
  const mutation = useMutation({
    mutationFn: (values: { name: string; email: string }) => api<{ inviteLink: string }>(endpoint, { method: 'POST', body: jsonBody(values) }),
    onSuccess: (data) => { onSaved(data.inviteLink); onClose(); },
    onError: (e) => setError(e instanceof Error ? e.message : 'Não foi possível enviar o convite.'),
  });
  return <Modal title={title} onClose={onClose}><form className="modal-form" onSubmit={(e) => {
    e.preventDefault(); setError('');
    const f = new FormData(e.currentTarget);
    mutation.mutate({ name: String(f.get('name') ?? ''), email: String(f.get('email') ?? '') });
  }}>
    <Field label="Nome"><Input name="name" minLength={3} maxLength={120} required /></Field>
    <Field label="E-mail" hint="O convite gera um link para a pessoa definir a senha."><Input name="email" type="email" required /></Field>
    {error && <ErrorMessage message={error} />}
    <div className="modal-actions"><Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" loading={mutation.isPending}>Gerar convite</Button></div>
  </form></Modal>;
}

function UnidadeModal({ condominioId, onClose, onSaved }: { condominioId: string; onClose: () => void; onSaved: () => void }) {
  const [error, setError] = useState('');
  const mutation = useMutation({
    mutationFn: (values: { label: string }) => api(`/condominios/${condominioId}/unidades`, { method: 'POST', body: jsonBody(values) }),
    onSuccess: () => { onSaved(); onClose(); },
    onError: (e) => setError(e instanceof Error ? e.message : 'Não foi possível criar a unidade.'),
  });
  return <Modal title="Nova unidade" onClose={onClose}><form className="modal-form" onSubmit={(e) => {
    e.preventDefault(); setError('');
    const f = new FormData(e.currentTarget);
    mutation.mutate({ label: String(f.get('label') ?? '') });
  }}>
    <Field label="Identificação" hint="Ex.: Bloco A / 302."><Input name="label" maxLength={40} required /></Field>
    {error && <ErrorMessage message={error} />}
    <div className="modal-actions"><Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" loading={mutation.isPending}>Criar unidade</Button></div>
  </form></Modal>;
}

function MoradorModal({ unidades, onClose, onSaved }: { unidades: Unidade[]; onClose: () => void; onSaved: () => void }) {
  const [error, setError] = useState('');
  const [cpf, setCpf] = useState('');
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [lookupError, setLookupError] = useState('');

  const lookup = useMutation({
    mutationFn: () => api<{ customer: { id: string; name: string; phone: string; cpf: string; hasCpf: boolean } }>(`/customers/lookup?cpf=${encodeURIComponent(cpf.replace(/\D/g, ''))}`),
    onSuccess: (data) => { setCustomerId(data.customer.id); setLookupError(''); },
    onError: (e) => { setCustomerId(null); setLookupError(e instanceof Error ? e.message : 'Cliente não encontrado.'); },
  });

  const mutation = useMutation({
    mutationFn: (values: { customerId: string; unidadeId: string }) => api('/condominios/moradias', { method: 'POST', body: jsonBody(values) }),
    onSuccess: () => { onSaved(); onClose(); },
    onError: (e) => setError(e instanceof Error ? e.message : 'Não foi possível vincular o morador.'),
  });

  return <Modal title="Vincular morador" onClose={onClose}>
    <form className="modal-form" onSubmit={(e) => {
      e.preventDefault(); setError('');
      const f = new FormData(e.currentTarget);
      if (!customerId) { setError('Busque o cliente pelo CPF antes de salvar.'); return; }
      mutation.mutate({ customerId, unidadeId: String(f.get('unidadeId') ?? '') });
    }}>
      <Field label="CPF do morador" hint="O cliente precisa ter CPF cadastrado na rede.">
        <div className="input-action">
          <Input value={cpf} onChange={(e) => setCpf(e.target.value)} placeholder="000.000.000-00" required />
          <Button type="button" variant="secondary" loading={lookup.isPending} onClick={() => lookup.mutate()}>Buscar</Button>
        </div>
      </Field>
      {lookupError && <ErrorMessage message={lookupError} />}
      {customerId && <div className="customer-found"><span className="customer-found-icon"><Home size={18} /></span><div className="customer-found-copy"><strong>Cliente localizado</strong><small>CPF conferido na base</small></div><Badge tone="green">Pronto para vincular</Badge></div>}
      <Field label="Unidade">
        <Select name="unidadeId" required defaultValue="">
          <option value="" disabled>Selecione a unidade</option>
          {unidades.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
        </Select>
      </Field>
      {error && <ErrorMessage message={error} />}
      <div className="modal-actions"><Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" loading={mutation.isPending} disabled={!customerId}>Vincular morador</Button></div>
    </form>
  </Modal>;
}

function CondominioDetailModal({ condominioId, canManage, onClose, onChanged }: { condominioId: string; canManage: boolean; onClose: () => void; onChanged: () => void }) {
  const { show } = useToast();
  const [unidadeModal, setUnidadeModal] = useState(false);
  const [moradorModal, setMoradorModal] = useState(false);
  const [sindicoModal, setSindicoModal] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  const detail = useQuery({ queryKey: ['condominio', condominioId], queryFn: () => api<CondominioDetail>(`/condominios/${condominioId}`) });
  const moradores = useQuery({ queryKey: ['condominio-moradores', condominioId], queryFn: () => api<Morador[]>(`/condominios/${condominioId}/moradores`) });

  const refresh = () => { void detail.refetch(); void moradores.refetch(); onChanged(); };

  return <Modal title={detail.data?.name ?? 'Condomínio'} onClose={onClose} wide>
    {detail.isLoading ? <LoadingState /> : detail.isError ? <ErrorMessage message="Falha ao carregar o condomínio." onRetry={() => void detail.refetch()} /> : detail.data && <>
      <div className="approval-summary">
        <div><small>CNPJ</small><strong>{detail.data.cnpj}</strong></div>
        <div><small>ADMINISTRADORA</small><strong>{detail.data.administradora.name}</strong></div>
        <div><small>COMISSÃO DO APP</small><strong className="approval-value">{percent(detail.data.commissionPercentBps)}</strong></div>
        <div><small>UNIDADES</small><strong>{detail.data.unidades.length}</strong></div>
      </div>

      {canManage && <div className="row-actions" style={{ margin: '14px 0' }}>
        <Button size="sm" onClick={() => setUnidadeModal(true)}><Plus size={14} /> Unidade</Button>
        <Button size="sm" variant="secondary" onClick={() => setMoradorModal(true)} disabled={!detail.data.unidades.length}><Home size={14} /> Vincular morador</Button>
        <Button size="sm" variant="secondary" onClick={() => setSindicoModal(true)}><UserPlus size={14} /> Convidar síndico</Button>
      </div>}

      {inviteLink && <div className="approval-note"><Link2 size={14} /><span>Convite gerado: <code>{inviteLink}</code></span></div>}

      <Card className="table-card">
        <div className="table-toolbar"><div><strong>Moradores</strong><small>{moradores.data?.length ?? '—'} vinculados</small></div></div>
        {moradores.isLoading ? <LoadingState /> : moradores.data?.length ? <Table minWidth="560px"><thead><tr><th>MORADOR</th><th>CPF</th><th>UNIDADE</th><th>DESDE</th></tr></thead><tbody>
          {moradores.data.map((m) => <tr key={m.id}><td><div className="table-primary">{m.customer.name}</div><div className="table-secondary">{m.customer.phone}</div></td><td>{m.customer.cpf}</td><td>{m.unidade.label}</td><td>{date(m.startedAt)}</td></tr>)}
        </tbody></Table> : <EmptyState title="Nenhum morador vinculado" description="Vincule um cliente pelo CPF para que o cashback dele vá para a taxa condominial." icon={<Home size={22} />} />}
      </Card>

      <Card className="table-card">
        <div className="table-toolbar"><div><strong>Síndicos</strong><small>{detail.data.sindicos.length} ativos</small></div></div>
        {detail.data.sindicos.length ? <Table minWidth="520px"><thead><tr><th>NOME</th><th>E-MAIL</th><th>ACESSO</th><th>DESDE</th></tr></thead><tbody>
          {detail.data.sindicos.map((s) => <tr key={s.id}><td><div className="table-primary">{s.user.name}</div></td><td>{s.user.email}</td><td>{s.user.lastLoginAt ? <Badge tone="green">Ativo</Badge> : <Badge tone="amber">Convite pendente</Badge>}</td><td>{date(s.startedAt)}</td></tr>)}
        </tbody></Table> : <EmptyState title="Nenhum síndico" description="Convide o síndico para ele acessar os relatórios do condomínio." icon={<UserPlus size={22} />} />}
      </Card>

      <Card className="table-card">
        <div className="table-toolbar"><div><strong>Unidades</strong><small>{detail.data.unidades.length} cadastradas</small></div></div>
        {detail.data.unidades.length ? <Table minWidth="420px"><thead><tr><th>IDENTIFICAÇÃO</th><th>MORADORES</th></tr></thead><tbody>
          {detail.data.unidades.map((u) => <tr key={u.id}><td><div className="table-primary">{u.label}</div></td><td>{u._count.moradias}</td></tr>)}
        </tbody></Table> : <EmptyState title="Nenhuma unidade" description="Cadastre as unidades para vincular moradores." icon={<Building2 size={22} />} />}
      </Card>
    </>}
    {unidadeModal && <UnidadeModal condominioId={condominioId} onClose={() => setUnidadeModal(false)} onSaved={() => { refresh(); show('Unidade criada.'); }} />}
    {moradorModal && detail.data && <MoradorModal unidades={detail.data.unidades} onClose={() => setMoradorModal(false)} onSaved={() => { refresh(); show('Morador vinculado.'); }} />}
    {sindicoModal && <InviteModal title="Convidar síndico" endpoint={`/condominios/${condominioId}/sindicos`} onClose={() => setSindicoModal(false)} onSaved={(link) => { setInviteLink(link); refresh(); show('Convite gerado.'); }} />}
  </Modal>;
}

export function CondominiosPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { show, toast, close } = useToast();
  const isRoot = user?.role === 'ROOT';
  const [search, setSearch] = useState('');
  const [administradoraModal, setAdministradoraModal] = useState(false);
  const [condominioModal, setCondominioModal] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [inviteAdmin, setInviteAdmin] = useState<Administradora | null>(null);

  const administradoras = useQuery({ queryKey: ['administradoras'], enabled: isRoot, queryFn: () => api<Administradora[]>('/condominios/administradoras') });
  const condominios = useQuery({
    queryKey: ['condominios', search],
    queryFn: () => api<CondominioPage>(`/condominios?pageSize=50${search ? `&search=${encodeURIComponent(search)}` : ''}`),
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['condominios'] });
    void qc.invalidateQueries({ queryKey: ['administradoras'] });
  };

  return <>
    <PageTitle
      eyebrow="CONDOMÍNIOS"
      title={isRoot ? 'Condomínios e administradoras' : 'Meus condomínios'}
      description={isRoot ? 'Administradoras gerenciam vários condomínios. Cada condomínio define a comissão retida sobre o cashback.' : 'Condomínios vinculados ao seu acesso, com moradores e unidades.'}
      action={isRoot ? <div className="row-actions"><Button variant="secondary" onClick={() => setAdministradoraModal(true)}><Plus size={15} /> Administradora</Button><Button onClick={() => setCondominioModal(true)} disabled={!administradoras.data?.length}><Plus size={15} /> Condomínio</Button></div> : undefined}
    />

    {isRoot && <Card className="table-card">
      <div className="table-toolbar"><div><strong>Administradoras</strong><small>{administradoras.data?.length ?? '—'} cadastradas</small></div></div>
      {administradoras.isLoading ? <LoadingState /> : administradoras.data?.length ? <Table minWidth="620px"><thead><tr><th>ADMINISTRADORA</th><th>CNPJ</th><th>E-MAIL</th><th>CONDOMÍNIOS</th><th>ACESSOS</th><th>AÇÕES</th></tr></thead><tbody>
        {administradoras.data.map((a) => <tr key={a.id}>
          <td><div className="table-primary">{a.name}</div></td>
          <td>{a.cnpj}</td>
          <td>{a.email}</td>
          <td>{a._count.condominios}</td>
          <td>{a._count.users}</td>
          <td><Button size="sm" variant="secondary" onClick={() => setInviteAdmin(a)}><UserPlus size={14} /> Convidar acesso</Button></td>
        </tr>)}
      </tbody></Table> : <EmptyState title="Nenhuma administradora" description="Cadastre a administradora antes de criar condomínios." icon={<Building2 size={22} />} />}
    </Card>}

    <Card className="table-card">
      <div className="table-toolbar">
        <div><strong>Condomínios</strong><small>{condominios.data?.total ?? '—'} {isRoot ? 'cadastrados' : 'no seu acesso'}</small></div>
        <SearchBox value={search} onChange={setSearch} placeholder="Nome ou CNPJ" />
      </div>
      {condominios.isLoading ? <LoadingState /> : condominios.isError ? <ErrorMessage message="Falha ao carregar condomínios." onRetry={() => void condominios.refetch()} /> : condominios.data?.items.length ? <Table minWidth="720px"><thead><tr><th>CONDOMÍNIO</th><th>CNPJ</th><th>ADMINISTRADORA</th><th>COMISSÃO</th><th>UNIDADES</th><th>MORADORES</th><th>AÇÕES</th></tr></thead><tbody>
        {condominios.data.items.map((c) => <tr key={c.id}>
          <td><div className="table-primary">{c.name}</div>{!c.active && <Badge tone="red">Inativo</Badge>}</td>
          <td>{c.cnpj}</td>
          <td>{c.administradora.name}</td>
          <td>{percent(c.commissionPercentBps)}</td>
          <td>{c._count.unidades}</td>
          <td>{c._count.moradias}</td>
          <td><Button size="sm" variant="secondary" onClick={() => setDetailId(c.id)}>Abrir</Button></td>
        </tr>)}
      </tbody></Table> : <EmptyState title="Nenhum condomínio encontrado" description={isRoot ? 'Cadastre um condomínio para começar.' : 'Nenhum condomínio está vinculado ao seu acesso.'} icon={<Building2 size={22} />} />}
    </Card>

    {administradoraModal && <AdministradoraModal onClose={() => setAdministradoraModal(false)} onSaved={() => { refresh(); show('Administradora cadastrada.'); }} />}
    {condominioModal && administradoras.data && <CondominioModal administradoras={administradoras.data} onClose={() => setCondominioModal(false)} onSaved={() => { refresh(); show('Condomínio cadastrado.'); }} />}
    {inviteAdmin && <InviteModal title={`Convidar acesso · ${inviteAdmin.name}`} endpoint={`/condominios/administradoras/${inviteAdmin.id}/users`} onClose={() => setInviteAdmin(null)} onSaved={(link) => { refresh(); show(`Convite gerado: ${link}`); }} />}
    {detailId && <CondominioDetailModal condominioId={detailId} canManage={isRoot} onClose={() => setDetailId(null)} onChanged={refresh} />}
    {toast && <div className="toast-holder"><div className={`toast toast-${toast.type}`}>{toast.message}<button onClick={close}>×</button></div></div>}
  </>;
}
