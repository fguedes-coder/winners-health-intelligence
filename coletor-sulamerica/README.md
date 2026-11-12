# Coletor SulAmérica

Serviço separado do app (Coolify: `winners-health-intelligence-coletor-sulamerica`)
que baixa o TXT de contas pagas do portal SulAmérica Integra e o deixa
**pronto para importação** na tela de Uploads. Ele só baixa: processar e
confirmar a importação continua sendo do usuário.

## Fluxo

1. Pedido na fila `coletas_sulamerica`: botão **Buscar agora** em Uploads, ou
   agenda automática (dias 3 a 5, 7h–19h, se o mês anterior ainda não tem arquivo).
2. Login no portal → o token chega por e-mail (~2 min) → o coletor lê a caixa
   (somente leitura) e entra.
3. Central de Contas Pagas → Acesso Contas Pagas → linha `81938 … MM/AAAA Disponivel`
   → download → arquivo guardado no bucket `uploads` → status `pronto`.
4. Mês fora da lista → **Nova Solicitação** (apólice, início = fim = mês) →
   status `aguardando` → nova conferência em ~70 min (a SulAmérica libera em até 1 h).

5. Com o TXT pronto, **valor da fatura do mês** no Portal do Corretor
   (`portal-corretor.mjs`): login → busca rápida pelo contrato da matriz
   (`82CC9`) → cartão **Pagamentos** → parcela com vencimento no mês da
   competência → coluna **Valor** (fatura cheia da apólice; "Valor pago" é só a
   matriz). Em `faturas`: mês vazio → grava; mesmo valor → confere; valor
   diferente → **não sobrescreve** e registra a divergência (`fatura.mjs`). O
   resultado aparece em Uploads. Falhar aqui não desfaz o TXT.
   O botão OK do login tem reCAPTCHA invisível: se o portal abrir desafio de
   imagens, o robô avisa e o valor é lançado à mão — não há tentativa de
   contornar.

Teste só de leitura (não grava nada):
`docker exec <container> node src/testar-fatura.mjs 2026-10`

## Credenciais

Login e senha do portal, do e-mail que recebe o token e (opcional) do Portal
do Corretor são digitados em
**Configurações → Robôs** e ficam criptografados no Supabase Vault
(`salvar_credencial_sulamerica`). O coletor os lê a cada busca pela função
`credenciais_sulamerica_coletor`, que só a service role executa.

## Variáveis (painel do Coolify)

| Variável | |
|---|---|
| `SUPABASE_URL` | URL do Supabase do Health |
| `SUPABASE_SERVICE_ROLE_KEY` | service role do Supabase do Health |
| `IMAP_HOST` | opcional — padrão `mail.winnersseguros.net.br` (nome do certificado TLS) |
| `SULAMERICA_APOLICE` | opcional — padrão `81938` |
| `CORRETOR_CONTRATO` | opcional — padrão `82CC9` (matriz da apólice) |

## Banco

`schema.sql` cria a tabela da fila (RLS no padrão do projeto) e as funções do cofre de credenciais.

## Gestão Conectada — internações (12/11/2026)

Independente do TXT. A cada 6 h (6h–22h, São Paulo) — ou pelo botão
**Atualizar agora** em Configurações → Robôs — o coletor:

1. entra em `sulamerica.my.site.com/gestaoconectada` com o acesso cadastrado
   em Configurações → Robôs (`gc_login`/`gc_senha` no Vault);
2. lê os relatórios de internação da "Pasta Médico" (lista em `config.mjs`) e
   colhe o ID de cada manifestação;
3. relê também as internações já conhecidas e ainda sem alta (120 dias) — é
   assim que a alta aparece depois que a internação sai da janela de 60 dias;
4. abre cada ficha (Detalhes + Relacionado) e grava em `gc_manifestacoes`
   (upsert pelo número; nunca apaga).

Só navega e lê: não clica em nada que altere o portal. Dado de saúde sensível:
nada de nome, carteirinha ou diagnóstico vai para o log.

Teste só leitura (não grava, imprime só contagens):

```
node src/testar-gestao-conectada.mjs
```

Se o portal pedir verificação de identidade (código), o robô para e avisa —
entrar uma vez pelo navegador costuma resolver.

### Fase 3 — autorizações e varredura semanal

- O ciclo de 6 h lê também o relatório "Solicitações de autorização (exceto
  internação)" (~1 ano: exames SP/SADT, prorrogações, OPME, quimio…). Ficha já
  gravada, encerrada no portal e lida há menos de 3 dias não é reaberta (só o
  relatório é anotado).
- **Varredura** (`tipo = 'varredura'` em `coletas_gestao_conectada`), de
  madrugada (1h–5h) quando a última completa tiver mais de 6 dias: relatório
  "Beneficiários sob gestão" (≈200 contas, "Linhas de detalhes" ligado e
  rolagem em passos) → cada conta → cada carteirinha (`gc_beneficiarios`:
  plano, código da empresa, vigente) → todas as manifestações da carteirinha
  ("Exibir tudo" quando passa de 6). Só lê as manifestações que ainda não
  estão no banco. Para em `GC_VARREDURA_MAX_MIN` (230) e continua na noite
  seguinte, pulando carteirinhas conferidas há menos de 6 dias.

Teste só leitura da varredura (não grava; imprime contagens, planos e
códigos de empresa):

```
node src/testar-varredura.mjs 8   # minutos
```
