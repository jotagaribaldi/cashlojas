import { Transform } from 'class-transformer';

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const TAGS = /<[^>]*>?/g;

export function sanitizeText(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return value.replace(CONTROL_CHARS, '').replace(TAGS, '').replace(/\s+/g, ' ').trim();
}

export const Sanitize = () => Transform(({ value }) => sanitizeText(value));

export const NormalizeEmail = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value));

export const OnlyDigits = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.replace(/\D/g, '') : value));
