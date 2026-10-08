// Configuração do coletor.
//
// Login e senhas do portal e do e-mail NÃO ficam aqui: o usuário os digita na
// aba Configurações → Robôs e eles são guardados criptografados
// no Supabase Vault (ver credenciais.mjs). No ambiente fica só o acesso ao
// banco do Health.

const obrigatorias = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']

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
    // Única apólice da carteira hoje; aparece sozinha na Nova Solicitação.
    apolice: process.env.SULAMERICA_APOLICE?.trim() || '81938',
  },
  imap: {
    // O certificado TLS do servidor de e-mail é emitido para este nome — e não
    // para mail.winnerscorretora.com.br. Conectar por ele mantém a verificação
    // do certificado ligada; desligá-la para "funcionar" não é opção.
    host: process.env.IMAP_HOST?.trim() || 'mail.winnersseguros.net.br',
    porta: Number(process.env.IMAP_PORTA ?? 993),
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
