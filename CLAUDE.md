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
- Internações (`app/internacoes`) — tempo real pelo SulAmérica Gestão
  Conectada (robô em `coletor-sulamerica/src/gestao-conectada.mjs`, tabela
  `gc_manifestacoes`); custo ligado ao TXT, reinternação ≤ 30 dias, saúde
  mental; seção própria no relatório executivo (`lib/internacoes-relatorio.ts`)
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

## Gestão Conectada — estado (12/11/2026)

Fases 1 e 2 em produção (PRs #43 e #44). O histórico começa na primeira
coleta (portal só mostra 60 dias). Pendências possíveis: alerta ativo
(nova internação de urgência, passou das diárias), item "internações" no
Winners Decide IA. Versão nominal do relatório é só para uso interno — a
empresa recebe a anonimizada.

Ajustes após conferir o relatório de out/26 (PR fix/internacoes-relatorio):
seção do relatório agora tem "Internações pagas no período" (explica o número
do resumo executivo, que é por mês de pagamento) + "que começaram no período";
negadas/canceladas fora de custo e reinternação; reinternação compara com a
última alta; no anonimizado, hospital com < 5 pessoas vai para "Demais".
Fase 3 (PR feat/gestao-conectada-fase3): ciclo de 6 h lê também as
autorizações fora internação (relatório de ~1 ano) e não reabre ficha
encerrada lida há < 3 dias; varredura semanal de madrugada (1h–5h) percorre
≈200 contas → carteirinhas (`gc_beneficiarios`: plano, código da empresa,
vigente) → todas as manifestações, retomando de onde parou. App: cartão
"Outras autorizações" em /internacoes, linha do tempo no Panorama do
Beneficiário, plano no perfil, parte C (autorizações) na seção do relatório,
status da varredura em Configurações → Robôs. Conferir a 1ª varredura.

Depois (PRs #50–#53): menu "Converse com a Winners" (`app/converse`, rota
`app/api/converse`, ferramentas em `lib/assistente/ferramentas.ts`, modelo
claude-sonnet-5-5 via AI SDK). Chave do Claude em Configurações →
Inteligência artificial (Vault, secret `assistente_anthropic_key`;
`ANTHROPIC_API_KEY` tem prioridade). Situações novas de internação:
`sem_alta` (antiga sem alta lançada) e `sem_registro` (pedido antigo que
sumiu do portal) — regra em `situacaoDe` (`lib/gestao-conectada.ts`).
Build no servidor usa `pnpm i --frozen-lockfile`: todo pacote importado tem
de ser dependência direta e o lockfile precisa bater com as overrides.

Fase 4 (PR feat/gc-anexos, 13/11/2026): o robô abre os ANEXOS de cada
manifestação (`/VisualizarArquivoAmazon?Id=<case>`; aviso de internação,
relatório/pedido médico, laudo, receita, orçamento OPME — quase sempre PDF
escaneado/manuscrito), baixa só em memória e o Claude (claude-opus-5-5,
`coletor-sulamerica/src/analisar-anexo.mjs`, mesma chave do chat) devolve
CID, diagnóstico, resumo, medicamentos, exames e transcrição → tabela
`gc_documentos` (o arquivo não é guardado). Roda após cada atualização
(12 min, 25 manifestações; internação aberta é reconferida a cada 20 h).
App: motivo (CID + diagnóstico) na tabela de internações, "Documentos
anexados" no detalhe, nas autorizações e na linha do tempo; chat ganhou
`documentos_medicos` e usa os anexos em "por qual causa". NUNCA vai para
relatório da empresa (nem nominal). Carga manual:
`node src/ler-anexos.mjs [minutos] [manifestações]`; teste sem gravar:
`node src/testar-anexos.mjs <nº manifestação> [--mostrar]`.

## Ao final de uma sessão longa

Se fizemos mudanças relevantes, atualizar este arquivo com o que foi feito e
o que falta, para a próxima sessão retomar sem precisar reexplorar o código.
