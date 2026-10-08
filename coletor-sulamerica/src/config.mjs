// Configuração do coletor. Segredos vêm só de variáveis de ambiente,
// cadastradas no painel do Coolify — nunca em arquivo nem no repositório.

const obrigatorias = [
  'SULAMERICA_LOGIN',
  'SULAMERICA_SENHA',
  'IMAP_USUARIO',
  'IMAP_SENHA',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
]

const faltando = obrigatorias.filter((k) => !process.env[k]?.trim())
if (faltando.length > 0) {
  // Só os NOMES das variáveis vão para o log, nunca valores.
  console.error(`[coletor] variáveis ausentes: ${faltando.join(', ')}`)
  process.exit(1)
}

export const config = {
  portal: {
    urlLogin:
      process.env.SULAMERICA_URL_LOGIN ??
      'https://os11.sulamerica.com.br/SASHubEmp/IntegraSASLogin.aspx',
    login: process.env.SULAMERICA_LOGIN.trim(),
    senha: process.env.SULAMERICA_SENHA,
    // Única apólice da carteira hoje; aparece sozinha na Nova Solicitação.
    apolice: process.env.SULAMERICA_APOLICE?.trim() || '81938',
  },
  imap: {
    // O certificado TLS do servidor de e-mail é emitido para este nome — e não
    // para mail.winnerscorretora.com.br. Conectar por ele mantém a verificação
    // do certificado ligada; desligá-la para "funcionar" não é opção.
    host: process.env.IMAP_HOST?.trim() || 'mail.winnersseguros.net.br',
    porta: Number(process.env.IMAP_PORTA ?? 993),
    usuario: process.env.IMAP_USUARIO.trim(),
    senha: process.env.IMAP_SENHA,
  },
  supabase: {
    url: process.env.SUPABASE_URL.trim(),
    chave: process.env.SUPABASE_SERVICE_ROLE_KEY.trim(),
    bucket: process.env.SUPABASE_BUCKET?.trim() || 'uploads',
  },
  agenda: {
    // Busca automática: dia 3, repetindo nos dias 4 e 5 se ainda não houver
    // arquivo, entre 7h e 19h (horário de São Paulo).
    dias: [3, 4, 5],
    horaInicio: 7,
    horaFim: 19,
  },
  // Depois da Nova Solicitação, a SulAmérica libera o arquivo em até ~1 h.
  esperaAposSolicitacaoMin: Number(process.env.ESPERA_APOS_SOLICITACAO_MIN ?? 70),
  maxVerificacoesAposSolicitacao: Number(process.env.MAX_VERIFICACOES ?? 4),
}
