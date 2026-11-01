export function normalizePhone(input: string): string | null {
  const digits = (input ?? '').replace(/\D/g, '');
  let full = digits;
  if (digits.length === 10 || digits.length === 11) full = `55${digits}`;
  if (!/^55\d{10,11}$/.test(full)) return null;
  return full;
}

export function maskPhone(phone: string): string {
  if (phone.length < 6) return '****';
  return `${phone.slice(0, 4)}*****${phone.slice(-4)}`;
}

export function formatPhone(phone: string): string {
  const local = phone.startsWith('55') ? phone.slice(2) : phone;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return phone;
}
