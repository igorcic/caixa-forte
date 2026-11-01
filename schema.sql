-- Caixa Forte: estrutura do banco PostgreSQL
-- O app cria tudo sozinho na primeira conexão; este arquivo é só para referência ou criação manual.
-- CREATE DATABASE caixaforte;
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
);
