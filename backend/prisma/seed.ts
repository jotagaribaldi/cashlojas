import dotenv from 'dotenv';
dotenv.config({ path: process.env.ENV_FILE ?? '../.env' });
import { PrismaClient, Role } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{10,128}$/;

function requirePassword(name: string): string {
  const value = process.env[name];
  if (!value || value.startsWith('REPLACE_') || !PASSWORD_REGEX.test(value)) {
    throw new Error(`${name} é obrigatória e deve atender à política de senha (10+ caracteres, maiúscula, minúscula, número e especial)`);
  }
  return value;
}

const hash = (p: string) => argon2.hash(p, { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 });

async function main() {
  const rootEmail = (process.env.SEED_ROOT_EMAIL ?? 'root@cashlojas.local').toLowerCase();
  const rootPassword = requirePassword('SEED_ROOT_PASSWORD');

  await prisma.user.upsert({
    where: { email: rootEmail },
    update: {},
    create: { name: 'Administrador Root', email: rootEmail, role: Role.ROOT, passwordHash: await hash(rootPassword) },
  });
  console.log(`Usuário ROOT pronto: ${rootEmail}`);

  if (process.env.SEED_DEMO !== 'true') return;
  const demoPassword = requirePassword('SEED_DEMO_PASSWORD');
  const demoHash = await hash(demoPassword);

  const group = await prisma.group.upsert({
    where: { slug: 'grupo-construir' },
    update: {},
    create: { name: 'Grupo Construir', slug: 'grupo-construir' },
  });

  const stores = [
    { key: 'ferramentas', name: 'Construir Ferramentas', segment: 'Ferramentas em geral', bps: 500, days: 90 },
    { key: 'pisos', name: 'Construir Pisos & Porcelanatos', segment: 'Pisos e porcelanatos', bps: 300, days: 120 },
    { key: 'eletrica', name: 'Construir Elétrica & Light Design', segment: 'Materiais elétricos e light design', bps: 400, days: 90 },
    { key: 'basico', name: 'Construir Materiais Básicos', segment: 'Materiais de construção básica', bps: 200, days: 30 },
  ];

  for (const s of stores) {
    const existing = await prisma.store.findFirst({ where: { groupId: group.id, name: s.name } });
    const store =
      existing ??
      (await prisma.store.create({
        data: { groupId: group.id, name: s.name, segment: s.segment, cashbackPercentBps: s.bps, validityDays: s.days, maxRedeemPercentBps: 5000 },
      }));
    for (const role of [Role.MANAGER, Role.CASHIER]) {
      const email = `${role === Role.MANAGER ? 'gerente' : 'caixa'}.${s.key}@cashlojas.local`;
      await prisma.user.upsert({
        where: { email },
        update: {},
        create: {
          name: `${role === Role.MANAGER ? 'Gerente' : 'Caixa'} ${s.name.replace('Construir ', '')}`,
          email,
          role,
          storeId: store.id,
          passwordHash: demoHash,
        },
      });
    }
  }

  const customerEmail = 'cliente@cashlojas.local';
  const customerUser = await prisma.user.upsert({
    where: { email: customerEmail },
    update: {},
    create: { name: 'Maria Cliente', email: customerEmail, role: Role.CUSTOMER, passwordHash: demoHash },
  });
  const allStores = await prisma.store.findMany({ where: { groupId: group.id } });
  await prisma.customer.upsert({
    where: { phone: '5511999990000' },
    update: {},
    create: {
      userId: customerUser.id,
      name: 'Maria Cliente',
      phone: '5511999990000',
      rg: '123456789',
      email: customerEmail,
      enrollments: { create: allStores.map((st) => ({ storeId: st.id })) },
    },
  });
  console.log('Dados de demonstração criados (grupo, 4 lojas, gerentes, caixas e cliente).');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
