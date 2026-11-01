// Camada de dados PostgreSQL do Caixa Forte (roda no processo principal do Electron).
const { Pool, Client } = require('pg');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS salario (
  id            SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  bruto         NUMERIC(12,2) NOT NULL DEFAULT 0,
  dependentes   INTEGER       NOT NULL DEFAULT 0,
  outros_desc   NUMERIC(12,2) NOT NULL DEFAULT 0,
  outros_prov   NUMERIC(12,2) NOT NULL DEFAULT 0,
  vale_transp   BOOLEAN       NOT NULL DEFAULT FALSE,
  atualizado_em TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS dividas (
  id             TEXT PRIMARY KEY,
  nome           TEXT          NOT NULL,
  categoria      TEXT          NOT NULL,
  valor_parcela  NUMERIC(12,2) NOT NULL CHECK (valor_parcela > 0),
  parcela_atual  INTEGER       NOT NULL CHECK (parcela_atual >= 1),
  total_parcelas INTEGER       NOT NULL CHECK (total_parcelas >= 1),
  juros_mensal   NUMERIC(7,3)  NOT NULL DEFAULT 0,
  ordem          INTEGER       NOT NULL DEFAULT 0,
  criado_em      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  atualizado_em  TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS despesas (
  id            TEXT PRIMARY KEY,
  nome          TEXT          NOT NULL,
  categoria     TEXT          NOT NULL,
  valor         NUMERIC(12,2) NOT NULL CHECK (valor > 0),
  ordem         INTEGER       NOT NULL DEFAULT 0,
  criado_em     TIMESTAMPTZ   NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS relatorios (
  id              SERIAL PRIMARY KEY,
  gerado_em       TIMESTAMPTZ   NOT NULL DEFAULT now(),
  arquivo         TEXT          NOT NULL,
  salario_bruto   NUMERIC(12,2) NOT NULL,
  salario_liquido NUMERIC(12,2) NOT NULL,
  total_parcelas  NUMERIC(12,2) NOT NULL,
  despesas_fixas  NUMERIC(12,2) NOT NULL,
  sobra           NUMERIC(12,2) NOT NULL,
  saldo_devedor   NUMERIC(12,2) NOT NULL,
  dados           JSONB         NOT NULL
);`;

let pool = null;

const conf = c => ({
  host: c.host || 'localhost', port: +c.port || 5432, user: c.user || 'postgres',
  password: c.password || '', database: c.database || 'caixaforte',
  ssl: c.ssl ? { rejectUnauthorized: false } : false, connectionTimeoutMillis: 5000
});

// Conecta, cria o banco se não existir e cria as tabelas.
async function connect(cfg) {
  await close();
  const c = conf(cfg);
  try {
    const t = new Client(c); await t.connect(); await t.end();
  } catch (e) {
    if (e.code !== '3D000') throw e; // 3D000 = banco não existe
    const adm = new Client({ ...c, database: 'postgres' });
    await adm.connect();
    await adm.query(`CREATE DATABASE "${c.database.replace(/"/g, '')}"`);
    await adm.end();
  }
  pool = new Pool({ ...c, max: 4 });
  await pool.query(SCHEMA);
  return { ok: true, database: c.database, host: c.host };
}
async function close() { if (pool) { const p = pool; pool = null; await p.end().catch(() => {}); } }
const ready = () => !!pool;

async function load() {
  const [s, d, e] = await Promise.all([
    pool.query('SELECT * FROM salario WHERE id = 1'),
    pool.query('SELECT * FROM dividas ORDER BY ordem, criado_em'),
    pool.query('SELECT * FROM despesas ORDER BY ordem, criado_em')
  ]);
  if (!s.rows.length && !d.rows.length && !e.rows.length) return null; // banco vazio
  const r = s.rows[0] || {};
  return {
    salario: { bruto: +r.bruto || 0, dependentes: r.dependentes || 0, outros: +r.outros_desc || 0, extra: +r.outros_prov || 0, vt: !!r.vale_transp },
    dividas: d.rows.map(x => ({ id: x.id, nome: x.nome, cat: x.categoria, parcela: +x.valor_parcela, atual: x.parcela_atual, total: x.total_parcelas, juros: +x.juros_mensal })),
    despesas: e.rows.map(x => ({ id: x.id, nome: x.nome, cat: x.categoria, valor: +x.valor }))
  };
}

// Grava o estado inteiro numa transação: salário, dívidas e despesas (inclui exclusões).
async function saveAll(st) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const s = st.salario || {};
    await c.query(`INSERT INTO salario (id,bruto,dependentes,outros_desc,outros_prov,vale_transp,atualizado_em)
      VALUES (1,$1,$2,$3,$4,$5,now())
      ON CONFLICT (id) DO UPDATE SET bruto=$1,dependentes=$2,outros_desc=$3,outros_prov=$4,vale_transp=$5,atualizado_em=now()`,
      [+s.bruto || 0, +s.dependentes || 0, +s.outros || 0, +s.extra || 0, !!s.vt]);

    const dv = st.dividas || [];
    await c.query('DELETE FROM dividas WHERE NOT (id = ANY($1::text[]))', [dv.map(x => x.id)]);
    for (const [k, x] of dv.entries()) {
      await c.query(`INSERT INTO dividas (id,nome,categoria,valor_parcela,parcela_atual,total_parcelas,juros_mensal,ordem)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (id) DO UPDATE SET nome=$2,categoria=$3,valor_parcela=$4,parcela_atual=$5,total_parcelas=$6,juros_mensal=$7,ordem=$8,atualizado_em=now()
        WHERE (dividas.nome,dividas.categoria,dividas.valor_parcela,dividas.parcela_atual,dividas.total_parcelas,dividas.juros_mensal,dividas.ordem)
          IS DISTINCT FROM ($2,$3,$4::numeric,$5::int,$6::int,$7::numeric,$8::int)`,
        [x.id, x.nome, x.cat, x.parcela, x.atual, x.total, +x.juros || 0, k]);
    }

    const ds = st.despesas || [];
    await c.query('DELETE FROM despesas WHERE NOT (id = ANY($1::text[]))', [ds.map(x => x.id)]);
    for (const [k, x] of ds.entries()) {
      await c.query(`INSERT INTO despesas (id,nome,categoria,valor,ordem) VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (id) DO UPDATE SET nome=$2,categoria=$3,valor=$4,ordem=$5,atualizado_em=now()
        WHERE (despesas.nome,despesas.categoria,despesas.valor,despesas.ordem) IS DISTINCT FROM ($2,$3,$4::numeric,$5::int)`,
        [x.id, x.nome, x.cat, x.valor, k]);
    }
    await c.query('COMMIT');
    return { ok: true };
  } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; }
  finally { c.release(); }
}

async function logRelatorio(r) {
  const q = await pool.query(`INSERT INTO relatorios (arquivo,salario_bruto,salario_liquido,total_parcelas,despesas_fixas,sobra,saldo_devedor,dados)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [r.arquivo, r.bruto, r.liquido, r.parcelas, r.despesas, r.sobra, r.saldo, JSON.stringify(r.dados)]);
  return { id: q.rows[0].id };
}

async function listRelatorios() {
  const q = await pool.query('SELECT id,gerado_em,arquivo,salario_liquido,total_parcelas,sobra FROM relatorios ORDER BY gerado_em DESC LIMIT 20');
  return q.rows.map(r => ({ ...r, gerado_em: r.gerado_em.toISOString(), salario_liquido: +r.salario_liquido, total_parcelas: +r.total_parcelas, sobra: +r.sobra }));
}

module.exports = { connect, close, ready, load, saveAll, logRelatorio, listRelatorios, SCHEMA };
