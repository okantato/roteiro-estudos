# Clerk com Next.js

Este é um app Next.js independente, localizado em `clerk-nextjs/`, com Clerk configurado no App Router. Ele usa `proxy.ts`, pois está em Next.js 16.

## Configuração local

1. Crie ou selecione uma aplicação no [Clerk Dashboard](https://dashboard.clerk.com/) e obtenha as chaves de desenvolvimento.
2. Copie `.env.example` para `.env.local` e preencha `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` e `CLERK_SECRET_KEY`. Não compartilhe nem exponha a chave secreta.
3. Rode `npm install` e `npm run dev` dentro desta pasta.

O cabeçalho mostra os controles de entrar/cadastrar quando a pessoa está desconectada e o menu do usuário quando está conectada. O `clerkMiddleware()` disponibiliza o estado do Clerk nas rotas correspondentes; por padrão, ele não exige autenticação em nenhuma rota.

Para publicar este app na Vercel, importe o repositório e configure `clerk-nextjs` como **Root Directory**. Cadastre as mesmas duas variáveis de ambiente nas configurações do projeto Vercel.

Este scaffold não troca a autenticação da API Express que fica na raiz do repositório. A API continua usando o login próprio e a configuração de deploy da raiz continua apontando para Express.
