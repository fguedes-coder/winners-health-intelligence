# CLAUDE.md

Contexto persistente para o Claude Code neste repositório. Lido automaticamente no início de toda sessão.

## O que é o projeto

Winners Health Intelligence — plataforma de analytics de saúde/benefícios da
Winners Corretora, em Next.js, hospedada na Vercel (repo separado do Vercel
Broker; o time da integração Vercel só enxerga o `winners-broker`, então
ajustes no projeto Vercel deste app são manuais).

Módulos principais (ver pastas em `app/`):
- Dashboard executivo (`app/dashboard`)
- Radar de Risco (`app/radar-risco`)
- Jornada Assistencial (`app/jornada-assistencial`)
- Sinistralidade (`app/sinistralidade`)
- Utilização (`app/utilizacao`)
- Relatórios (`app/relatorios`)
- People Analytics (`app/people-analytics`) — em desenvolvimento: cruza dados
  de apólice de saúde com arquivos de RH (XLSX/PDF/XML) para scoring
  executivo, ranking custo-vs-produtividade e relatórios compatíveis com LGPD
- Winners Decide (`app/winners-decide`)
- Cadastro Master, Clientes, Colaboradores, Beneficiário, Configurações,
  Uploads, API (`app/api`)

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript
- Supabase (`@supabase/ssr`, `@supabase/supabase-js`) + `pg`
- Tailwind CSS 4 + shadcn (`components.json`) + Base UI + Recharts
- Vercel AI SDK (`ai`, `@ai-sdk/openai`)
- `@vercel/blob` (storage), `@vercel/analytics`
- `xlsx` (SheetJS) e `jspdf` para import/export de planilhas e PDFs
- Gerenciador de pacotes: **pnpm** (não usar npm/yarn)

## Comandos

| Comando | O quê |
|---|---|
| `pnpm dev` | Next.js dev server |
| `pnpm build` / `pnpm start` | build e start de produção |
| `pnpm lint` | ESLint |

Não há suíte de testes configurada neste projeto ainda.

## SSO com o Winners Broker

SSO entre este app e o `winners-broker` já foi implementado e mesclado nos
dois repositórios, mas está com as env vars propositalmente desconfiguradas
por enquanto — o link da sidebar funciona como link simples e o login é
manual. Para ativar de verdade:
- configurar `SSO_SHARED_SECRET` nos dois repos
- configurar `SUPABASE_SERVICE_ROLE_KEY` neste repo (HI)
- fazer redeploy dos dois

Não ativar isso sem confirmar antes — é uma decisão pendente, não um bug.

## People Analytics — arquitetura planejada

- Identity matching em cascata: CPF → carteirinha → matrícula → nome (fuzzy)
- Criptografia de PII em nível de coluna
- Processamento assíncrono via Inngest ou Trigger.dev
- Rollout protegido por feature flag para não impactar os módulos existentes

## Ao final de uma sessão longa

Se fizemos mudanças relevantes, atualizar este arquivo com o que foi feito e
o que falta, para a próxima sessão retomar sem precisar reexplorar o código.
