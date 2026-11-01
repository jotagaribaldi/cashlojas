require('dotenv').config({ path: process.env.ENV_FILE || '../.env' });
const { PrismaClient, Role } = require('@prisma/client');
const argon2 = require('argon2');

const prisma = new PrismaClient();
const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{10,128}$/;

async function main() {
  const email = (process.env.SEED_ROOT_EMAIL || 'root@cashlojas.local').trim().toLowerCase();
  const password = process.env.SEED_ROOT_PASSWORD;
  if (!password || password.startsWith('REPLACE_') || !passwordPattern.test(password)) {
    throw new Error('Defina SEED_ROOT_PASSWORD com pelo menos 10 caracteres, incluindo maiúscula, minúscula, número e símbolo.');
  }
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  await prisma.user.upsert({
    where: { email },
    update: {},
    create: { name: 'Administrador Root', email, passwordHash, role: Role.ROOT },
  });
  console.log('Usuário ROOT inicializado/verificado.');
}

main().catch((error) => {
  console.error('Falha ao inicializar usuário ROOT:', error instanceof Error ? error.message : 'erro desconhecido');
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
