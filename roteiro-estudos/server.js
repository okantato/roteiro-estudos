import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const dir = path.dirname(fileURLToPath(import.meta.url));
const PROD = process.env.NODE_ENV === 'production';

// Segredo da sessão: variável de ambiente, ou gerado uma vez e salvo em .secret (só em desenvolvimento)
let SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  if (PROD) throw new Error('Defina JWT_SECRET em produção');
  const f = path.join(dir, '.secret');
  if (!fs.existsSync(f)) fs.writeFileSync(f, crypto.randomBytes(48).toString('hex'), { mode: 0o600 });
  SECRET = fs.readFileSync(f, 'utf8');
}

const db = new Database(path.join(dir, 'data.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, hash TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS plans(user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, data TEXT NOT NULL, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
`);

const Cred = z.object({
  email: z.string().trim().toLowerCase().email().max(120),
  password: z.string().min(10).max(100),
});
const Plan = z.object({
  title: z.string().max(120),
  days: z.array(z.object({
    title: z.string().max(120),
    desc: z.string().max(1000),
    deliv: z.string().max(500),
    done: z.boolean(),
    tasks: z.array(z.object({ text: z.string().max(200), done: z.boolean() })).max(50),
  })).max(120),
});

const DUMMY = bcrypt.hashSync('dummy-password', 12); // iguala o tempo de resposta quando o e-mail não existe
const cookieOpts = { httpOnly: true, sameSite: 'strict', secure: PROD, path: '/' };
const sign = (id) => jwt.sign({ sub: String(id) }, SECRET, { algorithm: 'HS256', expiresIn: '7d' });
const auth = (req, res, next) => {
  try {
    req.uid = Number(jwt.verify(req.cookies.sid, SECRET, { algorithms: ['HS256'] }).sub);
    next();
  } catch { res.status(401).json({ error: 'Não autenticado' }); }
};

const app = express();
app.disable('x-powered-by');
// Atrás de proxy reverso (Nginx, Render, etc.), descomente: app.set('trust proxy', 1);
app.use(helmet({
  hsts: PROD,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'], connectSrc: ["'self'"], objectSrc: ["'none'"],
      frameAncestors: ["'none'"], baseUri: ["'self'"], formAction: ["'self'"],
      upgradeInsecureRequests: PROD ? [] : null,
    },
  },
}));
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

// CSRF: cookie SameSite=Strict + cabeçalho obrigatório + Origin igual ao host
app.use('/api', (req, res, next) => {
  if (req.method !== 'GET') {
    try {
      const o = req.get('origin');
      if ((o && new URL(o).host !== req.get('host')) || req.get('x-requested-with') !== 'fetch') throw 0;
    } catch { return res.status(403).json({ error: 'Requisição inválida' }); }
  }
  next();
});
app.use('/api', rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false }));
const authLimit = rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: true, legacyHeaders: false });

app.post('/api/register', authLimit, (req, res) => {
  const p = Cred.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'E-mail inválido ou senha com menos de 10 caracteres' });
  try {
    const r = db.prepare('INSERT INTO users(email, hash) VALUES(?, ?)').run(p.data.email, bcrypt.hashSync(p.data.password, 12));
    res.cookie('sid', sign(r.lastInsertRowid), { ...cookieOpts, maxAge: 7 * 864e5 }).status(201).json({ email: p.data.email });
  } catch { res.status(409).json({ error: 'E-mail já cadastrado' }); }
});

app.post('/api/login', authLimit, (req, res) => {
  const p = Cred.safeParse(req.body);
  const u = p.success ? db.prepare('SELECT id, hash FROM users WHERE email = ?').get(p.data.email) : null;
  const ok = bcrypt.compareSync(p.success ? p.data.password : 'x', u ? u.hash : DUMMY);
  if (!u || !ok) return res.status(401).json({ error: 'Credenciais inválidas' });
  res.cookie('sid', sign(u.id), { ...cookieOpts, maxAge: 7 * 864e5 }).json({ email: p.data.email });
});

app.post('/api/logout', (req, res) => res.clearCookie('sid', cookieOpts).status(204).end());

app.get('/api/me', auth, (req, res) => {
  const u = db.prepare('SELECT email FROM users WHERE id = ?').get(req.uid);
  u ? res.json(u) : res.status(401).json({ error: 'Não autenticado' });
});

app.get('/api/plan', auth, (req, res) => {
  const r = db.prepare('SELECT data FROM plans WHERE user_id = ?').get(req.uid);
  res.json(r ? JSON.parse(r.data) : null);
});

app.put('/api/plan', auth, (req, res) => {
  const p = Plan.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'Plano inválido' });
  db.prepare(`INSERT INTO plans(user_id, data) VALUES(?, ?)
    ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = CURRENT_TIMESTAMP`).run(req.uid, JSON.stringify(p.data));
  res.status(204).end();
});

// Bibliotecas servidas localmente (CSP sem CDN)
app.use('/vendor/gsap', express.static(path.join(dir, 'node_modules/gsap/dist')));
app.use('/vendor/three', express.static(path.join(dir, 'node_modules/three/build')));
app.use(express.static(path.join(dir, 'public')));

app.use((err, req, res, next) => {
  if (err.status !== 400 && err.status !== 413) console.error(err.message);
  res.status(err.status || 500).json({ error: err.status === 413 ? 'Payload grande demais' : 'Erro' });
});

const port = process.env.PORT || 3000, host = process.env.HOST || '127.0.0.1';
app.listen(port, host, () => console.log(`http://${host}:${port}`));
