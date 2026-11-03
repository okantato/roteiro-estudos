# Roteiro de estudos

Planejador de estudos com API Express, autenticação e dados por usuário. Usa PostgreSQL no Neon e está preparado para Vercel.

## Desenvolvimento local

Requer Node.js 20 ou superior. Configure `DATABASE_URL` com a connection string pooled do Neon e `JWT_SECRET` com uma string aleatória longa. Copie `.env.example` para `.env` e preencha os valores localmente.

```sh
npm install
npm run migrate
npm start
```

A aplicação fica em `http://127.0.0.1:3000`. O `postinstall` copia GSAP e Three.js para `public/vendor/`, que também são servidos localmente pelo Express.

## Neon e Vercel

1. Crie um projeto PostgreSQL na [Neon](https://neon.com/).
2. No painel do projeto, copie a connection string pooled (host com `-pooler`) e use-a como `DATABASE_URL`.
3. Com essa variável disponível no ambiente local, execute `npm run migrate` para criar as tabelas.
4. Em **Settings → Environment Variables** da Vercel, configure `DATABASE_URL` (string pooled) e `JWT_SECRET` (string aleatória longa). Opcionalmente, configure `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN` para rate limit compartilhado entre instâncias.
5. Importe o repositório em [vercel.com/new](https://vercel.com/new) e faça o deploy.

Os assets dentro de `public/` são servidos pela CDN da Vercel. O schema está em `db/schema.sql`; aplique alterações executando explicitamente `npm run migrate` com o `DATABASE_URL` correto. `vercel dev` pode ser usado para desenvolvimento compatível com a Vercel.

## Segurança

CSP restrita, Helmet, bcrypt com custo 12, cookie `httpOnly` + `SameSite=Strict` + `Secure` em produção, proteção CSRF por `X-Requested-With` e validação de Origin, Zod, rate limit, queries parametrizadas e interface sem `innerHTML`. Sem Upstash, o rate limit de memória é ativado e um aviso é registrado; esse modo não compartilha contadores entre instâncias serverless.
