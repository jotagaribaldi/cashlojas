# CashLojas

Plataforma CRM de cashback multiloja/multigrupo para lojas de ferramentas, pisos e porcelanatos, materiais elétricos/light design e construção básica.

## Funcionalidades implementadas

- **Multitenancy:** grupos e lojas independentes, configurações de cashback, validade e teto de resgate por loja.
- **Papéis e permissões no backend:** ROOT, MANAGER, CASHIER e CUSTOMER; as permissões não dependem da interface.
- **Autenticação:** Argon2id, access JWT curto, refresh token rotativo armazenado somente como hash, revogação de sessões, cookie HttpOnly e token CSRF para operações de sessão.
- **Proteções:** DTOs com validação/allowlist, Helmet, CORS configurável, rate limiting, bloqueio após falhas de senha, resposta de erro sem detalhes internos, auditoria e tratamento de duplicidades.
- **Caixa:** busca de clientes cadastrados/vinculados, registro de compra em centavos, cálculo do cashback e notificação da compra.
- **Resgate:** solicitação no caixa, teto por compra e saldo disponível, aprovação/rejeição por gerente, alocação por vencimento (vence primeiro, consome primeiro) e comprovante auditável com código.
- **Cliente:** cadastro web, saldo por loja, extrato de créditos, vencimentos, descontos utilizados e adesão a outras lojas.
- **WhatsApp:** adaptador local de simulação/log, integração com WhatsApp Cloud API da Meta por templates aprovados e suporte a WAHA (instância própria) para o MVP. Falhas são registradas sem desfazer a compra.
- **Root:** dashboard da rede, grupos, lojas, usuários, desativação segura e trilha de auditoria.
- **Interface:** React/TypeScript responsivo para desktop/tablet/celular, estados de carregamento/erro/vazio, formulários e relatórios exportáveis em CSV.

## Tecnologias

- `frontend/`: React 19, TypeScript, Vite, React Router, TanStack Query.
- `backend/`: Node.js, NestJS, TypeScript, Prisma e PostgreSQL.
- `docker-compose.yml`: PostgreSQL, API e Nginx para servir o frontend e encaminhar `/api`.

## Execução com Docker

Requer Docker Engine com Compose v2. O ambiente desta sessão não possui Docker instalado, portanto não foi possível iniciar os contêineres aqui.

1. Crie o arquivo local de configuração e gere segredos únicos:

   ```bash
   cp .env.example .env
   openssl rand -base64 48
   ```

2. Edite `.env`. Substitua `JWT_ACCESS_SECRET`, `POSTGRES_PASSWORD` e `SEED_ROOT_PASSWORD` por valores fortes e exclusivos. Para simplificar a URL de conexão do Compose, prefira senha PostgreSQL URL-safe (letras e números). Nunca versionar `.env`.
3. Inicie o sistema:

   ```bash
   docker compose up --build -d
   docker compose logs -f api
   ```

4. Abra `http://localhost:8080` e entre usando o e-mail/senha ROOT configurados em `.env`. Na primeira inicialização, a API executa as migrations e cria esse usuário ROOT. Em reinicializações, não altera a senha já existente.
5. Crie grupos, lojas e contas de gerente/caixa no painel ROOT. Clientes podem criar a própria conta no webapp.

A senha ROOT é validada por política: 10–128 caracteres, contendo maiúscula, minúscula, número e caractere especial. A imagem usa usuário sem privilégios, instala migrations no startup e persiste PostgreSQL no volume `postgres_data`.

### Deploy estático atrás de Apache

O build do frontend usa rotas do React Router (`/cadastro/:storeId`, `/login`, `/admin/stores` etc.), então o servidor precisa devolver `index.html` para qualquer caminho que não seja um arquivo real. O `frontend/public/.htaccess` é copiado para `dist/` pelo Vite e resolve isso quando o vhost permite `AllowOverride`. Se o vhost estiver com `AllowOverride None`, aplique o fallback direto na configuração do Apache:

```apache
DocumentRoot /caminho/para/frontend/dist
<Directory /caminho/para/frontend/dist>
  Options -MultiViews
  AllowOverride None
  Require all granted
  FallbackResource /index.html
</Directory>

ProxyPass        /api/ http://127.0.0.1:3000/api/
ProxyPassReverse /api/ http://127.0.0.1:3000/api/
```

Confirme com `curl -o /dev/null -w "%{http_code}\n" https://seu-dominio/cadastro/<id-da-loja>`: deve retornar `200` com `content-type: text/html`.

### Dados de demonstração (opcional)

Depois que o banco/API estiver iniciado, defina `SEED_DEMO_PASSWORD` no arquivo local `.env` (não use senha real em argumentos de terminal). No ambiente de desenvolvimento com as dependências instaladas:

```bash
cd backend
SEED_DEMO=true npm run seed
```

A senha é aplicada a contas demo de gerente/caixa/cliente (não ao ROOT). O seed é idempotente e não redefine senhas existentes. Há 4 lojas com validades de 30, 90 e 120 dias.

## Execução sem Docker

Requer Node.js 22+, npm e PostgreSQL 16+. Configure `.env` na raiz. O banco indicado em `DATABASE_URL` deve existir.

```bash
cd backend
npm ci
npx prisma generate
npx prisma migrate deploy
npm run seed:root
npm run start:dev
```

Em outro terminal:

```bash
cd frontend
npm ci
npm run dev
```

Frontend em `http://localhost:5173`, API em `http://localhost:3000/api`. O Vite encaminha `/api` para `http://localhost:3000`; `CORS_ORIGINS` no `.env` já lista os dois endereços usados no desenvolvimento.

Para criar uma migration de desenvolvimento depois de alterar `schema.prisma`:

```bash
cd backend
npx prisma migrate dev --name descricao_da_mudanca
```

A migration inicial está versionada em `backend/prisma/migrations/20261030000000_init/`.

## WhatsApp em produção

O padrão `WHATSAPP_PROVIDER=log` **não envia mensagens**, apenas simula o envio sem imprimir o número completo ou o conteúdo da mensagem. Para envio real, é necessário configurar uma conta Meta WhatsApp Business, `WHATSAPP_META_TOKEN`, `WHATSAPP_META_PHONE_NUMBER_ID` e os nomes de dois templates previamente aprovados:

- `WHATSAPP_META_TEMPLATE_PURCHASE`: 7 variáveis, nesta ordem: primeiro nome, loja, data da compra, valor pago, cashback novo, saldo total na loja e validade.
- `WHATSAPP_META_TEMPLATE_REDEMPTION`: 5 variáveis: primeiro nome, desconto, loja, código de autorização e saldo restante.

Com `WHATSAPP_PROVIDER=meta`, a API não inicia se faltar credencial ou template. Os templates e textos devem ser revisados com o provedor e conforme as regras de consentimento/opt-out aplicáveis.

## WhatsApp via WAHA (MVP / menor custo)

Para homologação e primeiros clientes, é possível usar uma instância própria da **WAHA** (WhatsApp HTTP API), sem custo por mensagem e sem depender de templates aprovados. A integração Meta acima continua disponível e pode ser reativada a qualquer momento apenas trocando `WHATSAPP_PROVIDER`.

```env
WHATSAPP_PROVIDER=waha
WHATSAPP_WAHA_BASE_URL=https://apiwa.exemplo.com.br
WHATSAPP_WAHA_API_KEY=sua-chave
WHATSAPP_WAHA_SESSION=default
```

- `WHATSAPP_PROVIDER=waha` exige `WHATSAPP_WAHA_BASE_URL`; a `WHATSAPP_WAHA_API_KEY` é opcional (enviada como header `X-Api-Key`) e `WHATSAPP_WAHA_SESSION` assume `default`.
- O envio usa `POST {WHATSAPP_WAHA_BASE_URL}/api/sendText` com `chatId` no formato `<número>@c.us` (o telefone já é normalizado para `55` + dígitos pelo backend).
- Não há template: o texto da notificação (compra/resgate) é enviado como mensagem livre.
- A sessão configurada precisa estar **conectada** (QR escaneado no painel da WAHA); se desconectar, os envios são registrados como falha na tabela `Notification` sem interromper a compra ou o resgate.
- Em produção definitiva, prefira a Cloud API oficial da Meta: número dedicado, templates aprovados e conformidade com as políticas de WhatsApp.

## Regras contábeis importantes

- Valores monetários são guardados como inteiros em centavos; taxa de cashback e teto de resgate usam basis points (`500` = 5%).
- Cashback é calculado por compra registrada e associado à loja daquela compra; saldo não é misturado entre lojas.
- A validade é calculada a partir da data da compra e configuração da loja. Compras podem ser registradas até 7 dias retroativos, nunca no futuro.
- Nota/cupom fiscal é único por loja. Também se bloqueia a mesma combinação cliente + loja + dia + valor para reduzir duplicidade acidental.
- O desconto pendente não debita o saldo. O saldo é revalidado, travado por cliente e debitado atomicamente no momento em que o gerente aprova.
- Os créditos são consumidos por vencimento mais próximo. Créditos expirados não são resgatáveis.
- Loja com histórico financeiro não pode ser removida fisicamente; deve ser desativada para preservar o histórico e a auditoria.

## Rotas principais

Todas as rotas usam prefixo `/api`.

| Área | Rotas | Papéis |
|---|---|---|
| Sessão | `POST /auth/login`, `/auth/register`, `/auth/refresh`, `/auth/logout`, `/auth/change-password` | Público / autenticado |
| Caixa | `GET /customers/lookup`, `POST /purchases` | CASHIER, MANAGER |
| Resgate | `POST /redemptions`, `POST /redemptions/:id/approve`, `/approve-with-credentials`, `/reject`, `/cancel`, `GET /redemptions/:id/receipt` | Caixa/gerente conforme ação |
| Cliente | `GET /me/summary`, `/credits`, `/redemptions`, `/stores`; `POST /me/stores/:storeId` | CUSTOMER |
| Equipe | `GET/POST /team/cashiers`, `PATCH /team/cashiers/:id` | MANAGER da mesma loja |
| Root | `/admin/dashboard`, `/groups`, `/stores`, `/users`, `/audit-logs` | ROOT |
| Relatórios | `GET /reports/store` | ROOT, MANAGER, CASHIER |
| Saúde | `GET /health` | Público |

## Qualidade e verificação

```bash
cd backend
npx prisma validate
npx tsc --noEmit -p tsconfig.json
npm test -- --runInBand
npm run build

cd ../frontend
npm run build
```

Há testes unitários para cálculo, arredondamento, expiração e consumo FIFO do cashback. O build de produção e os testes do domínio foram verificados. A validação end-to-end contra PostgreSQL/Meta WhatsApp depende de serviços e credenciais externos; esses serviços não estavam disponíveis neste ambiente.

## Operação segura em produção

- Sirva a aplicação atrás de HTTPS e configure `COOKIE_SECURE=true`; habilite `TRUST_PROXY=true` apenas quando houver proxy reverso confiável (a configuração Compose confia no Nginx interno).
- Configure `CORS_ORIGINS` apenas com origens da aplicação. Use valores de segredo por secret manager, não pelo repositório.
- O throttler padrão usa armazenamento em memória; em múltiplas réplicas, substitua/estenda-o com storage distribuído (por exemplo Redis) e aplique limites também no gateway.
- Configure backup e retenção do PostgreSQL, monitoramento de falhas de notificação e rotação dos tokens Meta. A auditoria contém IDs de usuário/IP e dados operacionais; aplique controles de acesso e política de retenção.
- A integração Meta requer templates aprovados; revise LGPD, consentimento de marketing/serviço e opt-out com assessoria responsável antes de enviar mensagens reais.
