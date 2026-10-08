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

## Variáveis (painel do Coolify — nunca em arquivo)

| Variável | |
|---|---|
| `SULAMERICA_LOGIN` | login do portal |
| `SULAMERICA_SENHA` | senha do portal |
| `IMAP_USUARIO` | caixa que recebe o token |
| `IMAP_SENHA` | senha dessa caixa |
| `SUPABASE_URL` | URL do Supabase do Health |
| `SUPABASE_SERVICE_ROLE_KEY` | service role do Supabase do Health |
| `IMAP_HOST` | opcional — padrão `mail.winnersseguros.net.br` (nome do certificado TLS) |
| `SULAMERICA_APOLICE` | opcional — padrão `81938` |

## Banco

`schema.sql` cria a tabela da fila (RLS no padrão do projeto).
