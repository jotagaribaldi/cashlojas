export function normalizeCnpj(input: string): string | null {
  const digits = (input ?? '').replace(/\D/g, '');
  return digits.length === 14 ? digits : null;
}

export function isValidCnpj(input: string): boolean {
  const cnpj = normalizeCnpj(input);
  if (!cnpj) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  const digits = cnpj.split('').map(Number);
  const weights = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  for (const position of [12, 13]) {
    let sum = 0;
    for (let i = 0; i < position; i += 1) sum += digits[i] * weights[weights.length - position + i];
    const rest = sum % 11;
    const check = rest < 2 ? 0 : 11 - rest;
    if (check !== digits[position]) return false;
  }
  return true;
}

export function formatCnpj(cnpj: string): string {
  const digits = (cnpj ?? '').replace(/\D/g, '');
  if (digits.length !== 14) return cnpj;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}
