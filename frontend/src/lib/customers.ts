import { api, ApiError } from './api';

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  createdAt: string;
  hasAccount: boolean;
  isProfessional: boolean;
  profession: string | null;
  commissionPercentBps: number;
}

export interface CustomerPage {
  total: number;
  page: number;
  pageSize: number;
  items: Customer[];
}

/**
 * Lista os clientes da loja do usuário. Quando `onlyProfessionals` está ativo,
 * usa o filtro do servidor; se a API ainda não conhecer o parâmetro (400),
 * filtra a página localmente para o filtro não quebrar a tela.
 */
export async function fetchCustomersPage(options: { search?: string; onlyProfessionals?: boolean } = {}): Promise<CustomerPage> {
  const { search, onlyProfessionals = false } = options;
  const base = `/customers?pageSize=50${search ? `&search=${encodeURIComponent(search)}` : ''}`;
  if (!onlyProfessionals) return api<CustomerPage>(base);
  try {
    return await api<CustomerPage>(`${base}&professional=true`);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 400) throw error;
    const page = await api<CustomerPage>(base);
    const items = page.items.filter((customer) => customer.isProfessional);
    return { ...page, items, total: items.length };
  }
}
