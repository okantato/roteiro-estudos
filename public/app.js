import * as THREE from '/vendor/three/three.module.min.js';

const $ = (s) => document.querySelector(s);
// Cria elementos sem innerHTML: todo texto entra como textContent (sem XSS)
const h = (t, p = {}, ...k) => {
  const e = document.createElement(t);
  for (const [a, v] of Object.entries(p)) (a in e) ? (e[a] = v) : e.setAttribute(a, v);
  e.append(...k.filter((x) => x != null));
  return e;
};
const api = async (m, u, b) => {
  const r = await fetch('/api/' + u, {
    method: m,
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
    body: b ? JSON.stringify(b) : undefined,
  });
  let d = null; try { d = await r.json(); } catch {}
  return { ok: r.ok, status: r.status, d };
};

let S, editing = -1, timer, prog = 0;

const EX = [
  ['Consolidar sua experiência', 'Reconstruir a história técnica do CRM: problema, arquitetura, implementação, testes e resultados observados.', 'Uma explicação de 3 minutos e três resultados verificáveis.'],
  ['Ruby e fundamentos de programação', 'Revisar arrays, hashes, algoritmos, complexidade, tratamento de erros e testes.', 'Resolver três exercícios de programação.'],
  ['SQL e modelagem', 'Revisar JOINs, GROUP BY, índices, consultas parametrizadas e modelagem de dados.', 'Consultas de histórico de pedidos com dados fictícios.'],
  ['Python para IA', 'Aprender sintaxe, funções, listas, dicionários, ambientes virtuais e consumo de APIs.', 'Um script Python que processa pedidos fictícios.'],
  ['APIs e arquitetura', 'Revisar REST, autenticação, latência, retries, timeouts, filas e observabilidade.', 'Desenhar uma arquitetura de serviço de recomendação.'],
  ['LLMs e tokens', 'Entender modelos de linguagem, tokenização, temperatura, contexto e limites.', 'Explicar quando usar e quando não usar um LLM.'],
  ['Prompt engineering e saídas estruturadas', 'Explorar mensagens de sistema, exemplos, JSON estruturado e validação.', 'Um prompt testável com casos de sucesso e erro.'],
  ['Embeddings e busca semântica', 'Entender vetores, similaridade, busca textual versus semântica e RAG.', 'Explicar o fluxo de recuperação de contexto.'],
  ['Agentes e ferramentas', 'Estudar tool calling, orquestração, estado, permissões e limites de execução.', 'Um agente conceitual que consulta restaurantes por API.'],
  ['Sistemas de recomendação', 'Estudar filtragem baseada em conteúdo, popularidade, ranking e feedback.', 'Criar uma função de pontuação de restaurantes.'],
  ['Qualidade e segurança de IA', 'Aprender avaliação de respostas, alucinações, dados pessoais e prompt injection.', 'Uma lista de casos de teste e riscos.'],
  ['Projeto prático', 'Construir um protótipo pequeno com dados simulados, banco e endpoint de recomendações.', 'Um repositório com README, testes e instruções de execução.'],
  ['Simulação técnica', 'Resolver um desafio com tempo limitado e explicar as decisões tomadas.', 'Uma solução funcional e uma apresentação técnica.'],
  ['Preparação final', 'Simular entrevista com recrutador e engenharia, revisar lacunas e treinar explicações.', 'Cinco respostas técnicas, objetivas e baseadas em evidências.'],
];
const fresh = () => ({
  title: 'Roteiro de 14 dias',
  days: EX.map(([title, desc, deliv]) => ({ title, desc, deliv, done: false, tasks: [] })),
});
const norm = (o) => ({
  title: String(o.title || '').slice(0, 120),
  days: (o.days || []).slice(0, 120).map((x) => ({
    title: String(x.title || '').slice(0, 120), desc: String(x.desc || '').slice(0, 1000),
    deliv: String(x.deliv || '').slice(0, 500), done: !!x.done,
    tasks: (x.tasks || []).slice(0, 50).map((k) => ({ text: String(k.text || '').slice(0, 200), done: !!k.done })),
  })),
});

// ---------- fundo 3D (Three.js): reage ao progresso ----------
function bg() {
  const rd = new THREE.WebGLRenderer({ canvas: $('#bg'), alpha: true, antialias: true });
  const sc = new THREE.Scene(), cam = new THREE.PerspectiveCamera(50, 1, .1, 100);
  cam.position.z = 5;
  const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6, 1), new THREE.MeshBasicMaterial({ wireframe: true, transparent: true, opacity: .4 }));
  const pts = new THREE.Points(
    new THREE.BufferGeometry().setFromPoints(Array.from({ length: 300 }, () => new THREE.Vector3((Math.random() - .5) * 14, (Math.random() - .5) * 10, (Math.random() - .5) * 8))),
    new THREE.PointsMaterial({ color: 0x6fc3a9, size: .03 }));
  sc.add(mesh, pts);
  const fit = () => { rd.setPixelRatio(Math.min(devicePixelRatio, 2)); rd.setSize(innerWidth, innerHeight); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); };
  addEventListener('resize', fit); fit();
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let k = 0;
  const loop = () => {
    k += (prog - k) * .05;
    mesh.scale.setScalar(.7 + k * .8);
    mesh.material.color.setHSL(.08 + k * .34, .55, .6);
    mesh.rotation.y += .003; mesh.rotation.x += .0015; pts.rotation.y -= .0005;
    cam.lookAt(0, 0, 0); rd.render(sc, cam);
    calm || requestAnimationFrame(loop);
  };
  loop();
  calm || addEventListener('pointermove', (e) => gsap.to(cam.position, { x: e.clientX / innerWidth - .5, y: .5 - e.clientY / innerHeight, duration: 1.2 }));
}
try { bg(); } catch {}

// ---------- estado e persistência ----------
const save = () => {
  clearTimeout(timer);
  $('#st').textContent = 'Salvando…';
  timer = setTimeout(async () => {
    const r = await api('PUT', 'plan', S);
    $('#st').textContent = r.ok ? 'Salvo' : 'Erro ao salvar';
    if (r.status === 401) show(false);
  }, 500);
};
const sync = (x) => { if (x.tasks.length) x.done = x.tasks.every((k) => k.done); };
const mv = (i, d) => { [S.days[i], S.days[i + d]] = [S.days[i + d], S.days[i]]; save(); render(); };
const reset = (p) => { S = p; editing = -1; save(); render(true); };

// ---------- interface ----------
function tasks(x) {
  const w = h('div', { className: 'tasks' });
  if (x.tasks.length) w.append(h('div', { className: 'tc', textContent: `${x.tasks.filter((k) => k.done).length}/${x.tasks.length} tarefas` }));
  x.tasks.forEach((k, j) => {
    const c = h('input', { type: 'checkbox', checked: k.done });
    c.onchange = () => { k.done = c.checked; sync(x); save(); render(); };
    w.append(h('label', { className: 'tk' + (k.done ? ' on' : '') }, c, h('span', { textContent: k.text }),
      h('button', { className: 'x', title: 'Remover tarefa', textContent: '×', onclick: (e) => { e.preventDefault(); x.tasks.splice(j, 1); sync(x); save(); render(); } })));
  });
  const a = h('input', { type: 'text', placeholder: '+ nova tarefa (Enter)', 'aria-label': 'Nova tarefa', maxLength: 200 });
  a.onkeydown = (e) => {
    if (e.key === 'Enter' && a.value.trim() && x.tasks.length < 50) { x.tasks.push({ text: a.value.trim(), done: false }); x.done = false; save(); render(); }
  };
  w.append(a);
  return w;
}

function card(x, i, n) {
  const c = h('div', { className: 'day' + (x.done ? ' done' : '') });
  const cb = h('input', { type: 'checkbox', checked: x.done, 'aria-label': 'Concluir dia ' + (i + 1) });
  cb.onchange = () => { x.done = cb.checked; x.tasks.forEach((k) => (k.done = cb.checked)); save(); render(); };
  const b = h('div', { className: 'body' });
  if (editing === i) {
    const f = {};
    [['title', 'Título'], ['desc', 'Descrição', 1], ['deliv', 'Entrega'], ['tasks', 'Tarefas (uma por linha)', 1]].forEach(([k, l, a]) => {
      const inp = h(a ? 'textarea' : 'input', a ? { rows: k === 'tasks' ? 5 : 3 } : { type: 'text' });
      inp.value = k === 'tasks' ? x.tasks.map((t) => t.text).join('\n') : x[k];
      f[k] = inp; b.append(h('label', { textContent: l }), inp);
    });
    b.append(h('div', { className: 'acts' },
      h('button', { className: 'pri', textContent: 'Salvar', onclick: () => {
        x.title = f.title.value.slice(0, 120); x.desc = f.desc.value.slice(0, 1000); x.deliv = f.deliv.value.slice(0, 500);
        const old = x.tasks;
        x.tasks = f.tasks.value.split('\n').map((s) => s.trim().slice(0, 200)).filter(Boolean).slice(0, 50)
          .map((s) => ({ text: s, done: old.some((t) => t.text === s && t.done) }));
        sync(x); editing = -1; save(); render();
      } }),
      h('button', { textContent: 'Cancelar', onclick: () => { editing = -1; render(); } })));
  } else {
    b.append(h('h3', { textContent: `Dia ${i + 1} — ${x.title || 'Sem título'}` }));
    if (x.desc) b.append(h('p', { className: 'd', textContent: x.desc }));
    if (x.deliv) b.append(h('p', { className: 'e' }, h('b', { textContent: 'Entrega: ' }), x.deliv));
    b.append(tasks(x), h('div', { className: 'acts' },
      h('button', { textContent: 'Editar', onclick: () => { editing = i; render(); } }),
      i > 0 ? h('button', { textContent: '↑', onclick: () => mv(i, -1) }) : null,
      i < n - 1 ? h('button', { textContent: '↓', onclick: () => mv(i, 1) }) : null,
      h('button', { className: 'del', textContent: 'Remover', onclick: () => { if (confirm('Remover este dia?')) { S.days.splice(i, 1); editing = -1; save(); render(); } } })));
  }
  c.append(cb, b);
  return c;
}

function render(anim) {
  const L = $('#list'); L.replaceChildren();
  $('#title').value = S.title;
  const n = S.days.length, d = S.days.filter((x) => x.done).length, p = n ? d / n : 0;
  let tt = 0, td = 0;
  S.days.forEach((x) => x.tasks.forEach((k) => { tt++; if (k.done) td++; }));
  $('#count').textContent = `${d}/${n} dias` + (tt ? ` · ${td}/${tt} tarefas` : '');
  $('#pct').textContent = Math.round(p * 100) + '%';
  gsap.to('#fill', { width: p * 100 + '%', duration: .6, ease: 'power2.out' });
  prog = p;
  if (!n) L.append(h('div', { className: 'empty', textContent: 'Nenhum dia ainda. Clique em “Adicionar dia”.' }));
  S.days.forEach((x, i) => L.append(card(x, i, n)));
  if (anim) gsap.from('.day', { y: 24, opacity: 0, duration: .5, stagger: .05, ease: 'power3.out' });
}

// ---------- autenticação ----------
const show = (ok) => {
  $('#auth').hidden = ok; $('#app').hidden = !ok;
  if (!ok) gsap.from('#auth .card', { y: 30, opacity: 0, duration: .6 });
};
async function boot() {
  const m = await api('GET', 'me');
  if (!m.ok) return show(false);
  $('#who').textContent = m.d.email;
  const p = await api('GET', 'plan');
  S = p.d && p.d.days ? norm(p.d) : fresh();
  if (!p.d) save();
  show(true); render(true);
}
const enter = async (u) => {
  const r = await api('POST', u, { email: $('#em').value, password: $('#pw').value });
  if (!r.ok) { $('#err').textContent = (r.d && r.d.error) || 'Erro, tente novamente'; return; }
  $('#pw').value = ''; $('#err').textContent = ''; boot();
};
$('#login').onclick = () => enter('login');
$('#reg').onclick = () => enter('register');
$('#pw').onkeydown = (e) => { if (e.key === 'Enter') enter('login'); };
$('#out').onclick = async () => { await api('POST', 'logout'); S = null; show(false); };

// ---------- ações ----------
$('#title').oninput = (e) => { S.title = e.target.value.slice(0, 120); save(); };
$('#add').onclick = () => {
  if (S.days.length >= 120) return;
  S.days.push({ title: '', desc: '', deliv: '', done: false, tasks: [] });
  editing = S.days.length - 1; save(); render();
};
$('#blank').onclick = () => confirm('Substituir o roteiro atual por um modelo em branco?') &&
  reset({ title: 'Meu roteiro de estudos', days: [{ title: 'Tópico', desc: 'O que estudar e como.', deliv: 'O que você vai produzir ao final do dia.', done: false, tasks: [] }] });
$('#ex').onclick = () => confirm('Substituir o roteiro atual pelo exemplo de 14 dias?') && reset(fresh());
$('#rst').onclick = () => { S.days.forEach((x) => { x.done = false; x.tasks.forEach((k) => (k.done = false)); }); save(); render(); };
$('#exp').onclick = () => { const io = $('#io'); io.hidden = !io.hidden; $('#json').value = JSON.stringify(S, null, 2); };
$('#imp').onclick = () => { try { reset(norm(JSON.parse($('#json').value))); } catch { alert('JSON inválido.'); } };

boot();
