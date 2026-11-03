import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Pool } from '@neondatabase/serverless';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';

const dir = path.dirname(fileURLToPath(import.meta.url));
const PROD = process.env.NODE_ENV === 'production';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL ausente. Configure a connection string pooled do Neon.');
if (PROD && !process.env.JWT_SECRET) throw new Error('Defina JWT_SECRET em produção.');
const SECRET = process.env.JWT_SECRET || 'local-development-only-change-me';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const Cred = z.object({ email: z.string().trim().toLowerCase().email().max(120), password: z.string().min(10).max(100) });
const Plan = z.object({
  title: z.string().max(120),
  days: z.array(z.object({
    title: z.string().max(120), desc: z.string().max(1000), deliv: z.string().max(500), done: z.boolean(),
    tasks: z.array(z.object({ text: z.string().max(200), done: z.boolean() })).max(50),
  })).max(120),
});
const DUMMY = bcrypt.hashSync('dummy-password', 12);
const cookieOpts = { httpOnly: true, sameSite: 'strict', secure: PROD, path: '/' };
const sign = (id) => jwt.sign({ sub: String(id) }, SECRET, { algorithm: 'HS256', expiresIn: '7d' });
const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const auth = (req, res, next) => {
  try { req.uid = Number(jwt.verify(req.cookies.sid, SECRET, { algorithms: ['HS256'] }).sub); next(); }
  catch { res.status(401).json({ error: 'Não autenticado' }); }
};

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet({
  hsts: PROD,
  contentSecurityPolicy: { directives: {
    defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'"], imgSrc: ["'self'", 'data:'],
    connectSrc: ["'self'"], objectSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'self'"], formAction: ["'self'"],
    upgradeInsecureRequests: PROD ? [] : null,
  } },
}));
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

let apiLimit, authLimit;
if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  const redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN });
  const distributed = (limiter) => asyncRoute(async (req, res, next) => {
    const result = await limiter.limit(req.ip);
    res.set('RateLimit-Limit', String(result.limit));
    res.set('RateLimit-Remaining', String(result.remaining));
    if (!result.success) return res.status(429).json({ error: 'Muitas requisições' });
    next();
  });
  apiLimit = distributed(new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(120, '1 m'), prefix: 'roteiro:api' }));
  authLimit = distributed(new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10, '15 m'), prefix: 'roteiro:auth' }));
} else {
  console.warn('Aviso: Upstash não configurado; rate limit em memória não é compartilhado entre instâncias.');
  apiLimit = rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false });
  authLimit = rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: true, legacyHeaders: false });
}

app.use('/api', (req, res, next) => {
  if (req.method !== 'GET') {
    try { const o = req.get('origin'); if ((o && new URL(o).host !== req.get('host')) || req.get('x-requested-with') !== 'fetch') throw 0; }
    catch { return res.status(403).json({ error: 'Requisição inválida' }); }
  }
  next();
});
app.use('/api', apiLimit);

app.post('/api/register', authLimit, asyncRoute(async (req, res) => {
  const p = Cred.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'E-mail inválido ou senha com menos de 10 caracteres' });
  const hash = await bcrypt.hash(p.data.password, 12);
  const { rows } = await pool.query('INSERT INTO users(email, hash) VALUES($1, $2) RETURNING id', [p.data.email, hash]);
  res.cookie('sid', sign(rows[0].id), { ...cookieOpts, maxAge: 7 * 864e5 }).status(201).json({ email: p.data.email });
}));

app.post('/api/login', authLimit, asyncRoute(async (req, res) => {
  const p = Cred.safeParse(req.body);
  const { rows } = p.success ? await pool.query('SELECT id, hash FROM users WHERE email = $1', [p.data.email]) : { rows: [] };
  const u = rows[0];
  const ok = await bcrypt.compare(p.success ? p.data.password : 'x', u ? u.hash : DUMMY);
  if (!u || !ok) return res.status(401).json({ error: 'Credenciais inválidas' });
  res.cookie('sid', sign(u.id), { ...cookieOpts, maxAge: 7 * 864e5 }).json({ email: p.data.email });
}));
app.post('/api/logout', (req, res) => res.clearCookie('sid', cookieOpts).status(204).end());
app.get('/api/me', auth, asyncRoute(async (req, res) => {
  const { rows } = await pool.query('SELECT email FROM users WHERE id = $1', [req.uid]);
  rows[0] ? res.json(rows[0]) : res.status(401).json({ error: 'Não autenticado' });
}));
app.get('/api/plan', auth, asyncRoute(async (req, res) => {
  const { rows } = await pool.query('SELECT data FROM plans WHERE user_id = $1', [req.uid]);
  res.json(rows[0]?.data ?? null);
}));
app.put('/api/plan', auth, asyncRoute(async (req, res) => {
  const p = Plan.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'Plano inválido' });
  await pool.query(`INSERT INTO plans(user_id, data) VALUES($1, $2)
    ON CONFLICT(user_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`, [req.uid, p.data]);
  res.status(204).end();
}));

app.use(express.static(path.join(dir, 'public')));
app.use((err, req, res, next) => {
  if (err.code === '23505') return res.status(409).json({ error: 'E-mail já cadastrado' });
  if (err.status !== 400 && err.status !== 413) console.error(err);
  res.status(err.status || 500).json({ error: err.status === 413 ? 'Payload grande demais' : 'Erro' });
});

if (!process.env.VERCEL) {
  const port = process.env.PORT || 3000, host = process.env.HOST || '127.0.0.1';
  app.listen(port, host, () => console.log(`http://${host}:${port}`));
}

export default app;
