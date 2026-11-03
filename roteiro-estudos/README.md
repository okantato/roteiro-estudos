# Roteiro de estudos

Planejador genérico: dias, entregas e tarefas, com progresso, login e dados salvos por usuário.

## Rodar
    npm install
    npm start        # http://127.0.0.1:3000

Requer Node 18+. Em produção (atrás de HTTPS): defina NODE_ENV=production e JWT_SECRET (string longa e aleatória).
Variáveis opcionais: PORT, HOST.

## Estrutura
- server.js: API Express + SQLite (usuários e planos), autenticação e segurança
- public/: frontend (index.html, style.css, app.js) com GSAP e Three.js servidos localmente (sem CDN)

## Segurança implementada
CSP restrita (sem script inline, sem CDN), Helmet, senhas com bcrypt (custo 12), sessão em cookie
httpOnly + SameSite=Strict (+ Secure em produção), proteção CSRF (cabeçalho obrigatório + checagem de Origin),
rate limit (login e API), validação com Zod, SQL parametrizado, limite de payload, renderização sem innerHTML,
servidor ligado só em 127.0.0.1 por padrão. Rode `npm audit` periodicamente.
