export const money = (cents = 0) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);

export const date = (value?: string | Date | null) => {
  if (!value) return '—';
  const raw = typeof value === 'string' ? value : value.toISOString();
  const d = raw.slice(0, 10).split('-');
  return d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : raw;
};

export const dateTime = (value?: string | Date | null) => {
  if (!value) return '—';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
};

export const percent = (bps: number) => `${(bps / 100).toLocaleString('pt-BR')}%`;

export const initials = (name = '') =>
  name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');

export const expiryLabel = (value?: string | Date | null) => {
  if (!value) return '';
  const days = Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000);
  if (days <= 0) return 'expirado';
  if (days === 1) return 'vence amanhã (1 dia restante)';
  return `${days} dias restantes`;
};
