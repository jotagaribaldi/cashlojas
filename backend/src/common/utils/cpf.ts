export function normalizeCpf(input: string): string | null {
  const digits = (input ?? '').replace(/\D/g, '');
  return digits.length === 11 ? digits : null;
}

export function isValidCpf(input: string): boolean {
  const cpf = normalizeCpf(input);
  if (!cpf) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  const digits = cpf.split('').map(Number);
  for (const position of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < position; i += 1) sum += digits[i] * (position + 1 - i);
    const check = (sum * 10) % 11;
    if ((check === 10 ? 0 : check) !== digits[position]) return false;
  }
  return true;
}

export function maskCpf(cpf: string | null | undefined): string {
  const digits = (cpf ?? '').replace(/\D/g, '');
  if (digits.length !== 11) return '***';
  return `***.***.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

export function formatCpf(cpf: string): string {
  const digits = (cpf ?? '').replace(/\D/g, '');
  if (digits.length !== 11) return cpf;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}
