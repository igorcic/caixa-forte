# Caixa Forte

Aplicativo de desktop de finanças pessoais: salário CLT bruto → líquido (tabelas 2026), dívidas e parcelas, despesas fixas, cronograma mês a mês e relatório em Excel. Todos os dados são gravados no PostgreSQL.

## Usar
1. Instale o PostgreSQL (https://www.postgresql.org/download/) e anote a senha do usuário `postgres`.
2. Abra `Caixa Forte 1.0.0.exe` (não precisa instalar).
3. Vá em **Banco de dados**, informe servidor, porta, usuário e senha e clique em **Conectar e salvar**.
   O banco `caixaforte` e as tabelas são criados automaticamente.

## Rodar a partir do código
```
npm install
npm start            # abre o app
npm run build:win    # gera instalador + executável portátil em dist/
```

## Tabelas
| Tabela | O que guarda |
|---|---|
| salario | salário bruto, dependentes, outros descontos/proventos, vale-transporte |
| dividas | descrição, tipo, valor da parcela, parcela atual, total, juros ao mês |
| despesas | despesas fixas mensais |
| relatorios | cada Excel gerado, com um retrato (JSONB) dos números do mês |

Estrutura completa em `schema.sql`.

## Regras de cálculo (2026)
- INSS progressivo: 7,5% / 9% / 12% / 14%, teto R$ 8.475,55.
- IRRF: tabela vigente desde maio/2025, dedução por dependente R$ 189,59 ou desconto simplificado R$ 607,20 (usa o menor imposto), mais a redução da Lei 15.270/2025 (isenção até R$ 5.000; redução parcial até R$ 7.350).
