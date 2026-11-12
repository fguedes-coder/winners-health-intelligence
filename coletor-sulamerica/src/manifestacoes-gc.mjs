// Converte a ficha lida no Gestão Conectada numa linha de gc_manifestacoes e
// grava no banco do Health (upsert pelo número da manifestação).
//
// Todos os rótulos lidos vão também para `campos` (jsonb): se a SulAmérica
// acrescentar um campo na ficha, ele já fica guardado sem mudar o robô.
// Ficam de fora a "Senha" da guia (código de autorização, inútil para
// análise) e o "Email da Web".

const FORA = new Set(['Senha', 'Email da Web'])

const texto = (v) => {
  const s = String(v ?? '').trim()
  return s === '' || s === '-' ? null : s
}

const inteiro = (v) => {
  const s = String(v ?? '').replace(/\D/g, '')
  return s === '' ? null : Number(s)
}

/** '10/11/2026' → '2026-11-10' */
export function dataBR(v) {
  const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(String(v ?? ''))
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

/** '10/11/2026 23:45' → '2026-11-10T23:45:00-03:00' (Brasília, sem horário de verão desde 2019). */
export function dataHoraBR(v) {
  const m = /(\d{2})\/(\d{2})\/(\d{4})(?:\D+(\d{1,2}):(\d{2}))?/.exec(String(v ?? ''))
  if (!m) return null
  const hh = String(m[4] ?? '0').padStart(2, '0')
  return `${m[3]}-${m[2]}-${m[1]}T${hh}:${m[5] ?? '00'}:00-03:00`
}

/**
 * @param {import('./gestao-conectada.mjs').Manifestacao} m
 */
export function linhaDaManifestacao(m) {
  const c = m.campos
  const numero = texto(c['Número da Manifestação'])
  if (!numero) return null

  const hipoteses = Object.entries(c)
    .filter(([k, v]) => /hip[oó]tese|\bcid\b|diagn[oó]stic/i.test(k) && texto(v))
    .map(([, v]) => texto(v))

  const campos = Object.fromEntries(Object.entries(c).filter(([k, v]) => !FORA.has(k) && texto(v)))
  if (m.listasIncompletas.length) campos._listas_incompletas = m.listasIncompletas.join(',')

  const carteirinha = String(c['Código de Identificação'] ?? '').replace(/\D/g, '')

  return {
    numero,
    case_id: m.caseId,
    tipo_registro: texto(c['Tipo de registro da manifestação']),
    status_portal: texto(c['Status do Portal']),
    status: texto(c['Status']),
    numero_guia: texto(c['Número da Guia']),
    abertura_em: dataHoraBR(c['Data/Hora da Abertura Portal']),
    fechamento_em: dataHoraBR(c['Data/Hora de fechamento']),
    motivo_autorizacao: texto(c['Motivo da Autorização']),
    motivo_negativa: texto(c['Motivo da Negativa']),
    prestador_codigo: texto(c['Código do Prestador']),
    prestador_nome: texto(c['Nome Fantasia']),
    beneficiario_nome: texto(c['Nome/Razão Social']),
    carteirinha_sulamerica: carteirinha || null,
    medico_nome: texto(c['Nome do Profissional Solicitante']),
    medico_conselho: texto(c['Conselho Profissional']),
    medico_uf: texto(c['UF']),
    medico_numero: texto(c['Número do Conselho']),
    data_prevista: dataBR(c['Data Prevista para Internação']),
    carater: texto(c['Caráter do Atendimento']),
    regime: texto(c['Regime de Internação']),
    tipo_internacao: texto(c['Tipo de Internação']),
    diarias_solicitadas: inteiro(c['Qtd. Diárias Solicitadas']),
    diarias_autorizadas: inteiro(c['Qtd. Diárias Autorizadas']),
    acomodacao: texto(c['Tipo de Acomodação Autorizada']),
    data_internacao: dataBR(c['Data Internação']),
    data_alta: dataBR(c['Data de alta da internação']),
    tempo_internacao: inteiro(c['Tempo de internação']),
    hipotese_diagnostica: hipoteses.length ? hipoteses.join('\n') : null,
    indicacao_clinica: texto(c['Indicação Clinica'] ?? c['Indicação Clínica']),
    observacao: texto(c['Observação / Justificativa']),
    procedimentos: m.procedimentos,
    medicamentos: m.medicamentos,
    relacionadas: m.relacionadas,
    campos,
    atualizado_em: new Date().toISOString(),
  }
}

/**
 * Grava as manifestações lidas. Nunca apaga: o que saiu da janela do portal
 * continua no Health como histórico.
 * @returns {Promise<{ gravadas: number, internacoesAbertas: number }>}
 */
export async function gravarManifestacoes(db, manifestacoes) {
  const linhas = manifestacoes.map(linhaDaManifestacao).filter(Boolean)
  if (linhas.length) {
    const { error } = await db.from('gc_manifestacoes').upsert(linhas, { onConflict: 'numero' })
    if (error) throw new Error(`Falha ao gravar as manifestações: ${error.message}`)
  }
  const internacoesAbertas = linhas.filter(
    (l) => /interna/i.test(l.tipo_registro ?? '') && l.data_internacao && !l.data_alta,
  ).length
  return { gravadas: linhas.length, internacoesAbertas }
}

/** Internações já conhecidas e ainda sem alta (últimos 120 dias): o robô as relê. */
export async function manifestacoesARevisitar(db) {
  const desde = new Date(Date.now() - 120 * 86_400_000).toISOString()
  const { data, error } = await db
    .from('gc_manifestacoes')
    .select('case_id, status_portal')
    .is('data_alta', null)
    .ilike('tipo_registro', 'interna%')
    .gte('abertura_em', desde)
    .limit(80)
  if (error) throw new Error(`Falha ao ler as internações em aberto: ${error.message}`)
  return (data ?? [])
    .filter((l) => !/negad|cancel/i.test(l.status_portal ?? ''))
    .map((l) => l.case_id)
}
