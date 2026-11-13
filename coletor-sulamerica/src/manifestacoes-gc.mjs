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
    relatorios: m.relatorios ?? [],
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
    // Os relatórios em que a manifestação já apareceu se acumulam: uma
    // internação psiquiátrica continua marcada depois de sair da janela.
    const { data: antigas, error: aErr } = await db
      .from('gc_manifestacoes')
      .select('numero, relatorios, visto_em_relatorio_em')
      .in('numero', linhas.map((l) => l.numero))
    if (aErr) throw new Error(`Falha ao ler as manifestações gravadas: ${aErr.message}`)
    const anteriores = new Map((antigas ?? []).map((a) => [a.numero, a]))
    const agora = new Date().toISOString()
    for (const l of linhas) {
      const a = anteriores.get(l.numero)
      // Apareceu num relatório NESTA leitura? É o que diz se uma internação
      // sem alta ainda está em curso (ver situacaoDe no app). Todas as linhas
      // levam a coluna — o upsert em lote anula a que faltar.
      l.visto_em_relatorio_em = l.relatorios.length ? agora : (a?.visto_em_relatorio_em ?? null)
      l.relatorios = [...new Set([...(a?.relatorios ?? []), ...l.relatorios])].sort()
    }
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

/**
 * Manifestações já gravadas, encerradas no portal e lidas há menos de 3 dias:
 * o ciclo de 6 h não precisa reabrir a ficha delas (só anota o relatório).
 * Internação sem alta e o que ainda está em análise são sempre relidos.
 */
export async function casosParaPular(db) {
  const desde = new Date(Date.now() - 3 * 86_400_000).toISOString()
  const { data, error } = await db
    .from('gc_manifestacoes')
    .select('case_id, tipo_registro, status_portal, data_internacao, data_alta')
    .gte('atualizado_em', desde)
    .limit(5000)
  if (error) throw new Error(`Falha ao ler as manifestações gravadas: ${error.message}`)
  return new Set(
    (data ?? [])
      .filter((l) => /autoriz|negad|cancel|conclu|encerr|fechad/i.test(l.status_portal ?? ''))
      .filter((l) => !(/interna/i.test(l.tipo_registro ?? '') && !l.data_alta && !/negad|cancel/i.test(l.status_portal ?? '')))
      .map((l) => l.case_id),
  )
}

/** Acrescenta os relatórios em que manifestações puladas apareceram. */
export async function gravarOrigens(db, origens) {
  const comNome = origens.filter((o) => o.relatorios.length)
  if (!comNome.length) return
  const { data, error } = await db
    .from('gc_manifestacoes')
    .select('numero, case_id, relatorios')
    .in('case_id', comNome.map((o) => o.caseId))
  if (error) throw new Error(`Falha ao ler as manifestações gravadas: ${error.message}`)
  const porCaso = new Map((data ?? []).map((l) => [l.case_id, l]))
  const agora = new Date().toISOString()
  for (const o of comNome) {
    const l = porCaso.get(o.caseId)
    if (!l) continue
    const juntos = [...new Set([...(l.relatorios ?? []), ...o.relatorios])].sort()
    const { error: e } = await db
      .from('gc_manifestacoes')
      .update({ relatorios: juntos, visto_em_relatorio_em: agora })
      .eq('numero', l.numero)
    if (e) throw new Error(`Falha ao anotar relatórios: ${e.message}`)
  }
}

// ---------------------------------------------------------------------------
// Varredura semanal — fichas das carteirinhas (gc_beneficiarios)
// ---------------------------------------------------------------------------

/** @param {import('./gestao-conectada.mjs').Carteirinha} c */
export function linhaDaCarteirinha(c) {
  const v = c.campos
  const campos = Object.fromEntries(Object.entries(v).filter(([, x]) => texto(x)))
  return {
    beneficiario_id: c.id,
    conta_id: c.conta,
    carteirinha_sulamerica: String(v['Código de Identificação'] ?? '').replace(/\D/g, '') || null,
    nome: texto(v['Nome/Razão Social']),
    vigente: texto(v['Vigente']),
    codigo_empresa: texto(v['Código da Empresa']),
    nome_empresa: texto(v['Nome da Empresa']),
    plano: texto(v['Plano']),
    total_manifestacoes: c.totalManifestacoes,
    casos: c.manifestacoes,
    campos,
    verificado_em: new Date().toISOString(),
  }
}

export async function gravarCarteirinha(db, c) {
  const { error } = await db.from('gc_beneficiarios').upsert(linhaDaCarteirinha(c), { onConflict: 'beneficiario_id' })
  if (error) throw new Error(`Falha ao gravar a carteirinha: ${error.message}`)
}

/**
 * O que a varredura pode pular: carteirinhas conferidas há menos de
 * `revisitarDias`, contas cujas carteirinhas foram todas conferidas e
 * manifestações já gravadas.
 */
export async function estadoVarredura(db, revisitarDias) {
  const desde = new Date(Date.now() - revisitarDias * 86_400_000).toISOString()
  const [{ data: bs, error: e1 }, { data: ms, error: e2 }] = await Promise.all([
    db.from('gc_beneficiarios').select('beneficiario_id, conta_id, verificado_em').limit(10000),
    db.from('gc_manifestacoes').select('case_id').limit(50000),
  ])
  if (e1) throw new Error(`Falha ao ler as carteirinhas: ${e1.message}`)
  if (e2) throw new Error(`Falha ao ler as manifestações: ${e2.message}`)
  const conferidas = new Set()
  const contas = new Map()
  for (const b of bs ?? []) {
    const recente = b.verificado_em >= desde
    if (recente) conferidas.add(b.beneficiario_id)
    if (b.conta_id) contas.set(b.conta_id, (contas.get(b.conta_id) ?? true) && recente)
  }
  return {
    conferidas,
    contasConferidas: new Set([...contas].filter(([, ok]) => ok).map(([id]) => id)),
    casosConhecidos: new Set((ms ?? []).map((m) => m.case_id)),
  }
}

// ---------------------------------------------------------------------------
// Fase 4 — anexos lidos pelo Claude (gc_documentos)
// ---------------------------------------------------------------------------

const dataBRCurta = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '')

/**
 * Manifestações cujos anexos ainda não foram lidos (mais recentes primeiro) e
 * internações abertas lidas há mais de `reabrirHoras` (o hospital anexa
 * relatório, prorrogação etc. depois).
 * @returns {Promise<{ case_id: string, numero: string, contexto: string }[]>}
 */
export async function casosParaAnexos(db, { porCiclo, reabrirHoras }) {
  const colunas = 'case_id, numero, tipo_registro, prestador_nome, abertura_em, status_portal'
  const corte = new Date(Date.now() - reabrirHoras * 3_600_000).toISOString()
  const desde = new Date(Date.now() - 60 * 86_400_000).toISOString()
  const [novos, abertas] = await Promise.all([
    db.from('gc_manifestacoes').select(colunas).is('anexos_lidos_em', null).order('abertura_em', { ascending: false }).limit(porCiclo),
    db
      .from('gc_manifestacoes')
      .select(colunas)
      .ilike('tipo_registro', 'interna%')
      .is('data_alta', null)
      .gte('abertura_em', desde)
      .lt('anexos_lidos_em', corte)
      .limit(20),
  ])
  if (novos.error) throw new Error(`Falha ao ler as manifestações sem anexos lidos: ${novos.error.message}`)
  const vistos = new Set()
  const res = []
  for (const l of [...(abertas.data ?? []).filter((x) => !/negad|cancel/i.test(x.status_portal ?? '')), ...(novos.data ?? [])]) {
    if (vistos.has(l.case_id)) continue
    vistos.add(l.case_id)
    res.push({
      case_id: l.case_id,
      numero: l.numero,
      contexto: [l.tipo_registro, l.prestador_nome, l.abertura_em ? `aberta em ${dataBRCurta(l.abertura_em)}` : null].filter(Boolean).join(' — '),
    })
  }
  return res
}

/** Anexos já gravados de cada manifestação (para não baixar de novo). */
export async function documentosConhecidos(db, caseIds) {
  const mapa = new Map()
  if (!caseIds.length) return mapa
  const { data, error } = await db.from('gc_documentos').select('case_id, arquivo').in('case_id', caseIds)
  if (error) throw new Error(`Falha ao ler os anexos gravados: ${error.message}`)
  for (const d of data ?? []) {
    if (!mapa.has(d.case_id)) mapa.set(d.case_id, new Set())
    mapa.get(d.case_id).add(d.arquivo)
  }
  return mapa
}

const CAMPOS_LEITURA = [
  'tipo_documento', 'data_documento', 'medico', 'estabelecimento', 'cids', 'diagnostico', 'quadro_clinico',
  'conduta', 'leito', 'carater', 'diarias_previstas', 'procedimentos', 'materiais', 'medicamentos', 'exames',
  'resumo', 'transcricao', 'legibilidade', 'observacoes', 'erro', 'modelo',
]

/** Leitura já feita de um arquivo idêntico (o portal às vezes anexa o mesmo PDF duas vezes). */
export async function leituraPorHash(db, hash) {
  const { data } = await db
    .from('gc_documentos')
    .select(CAMPOS_LEITURA.join(', '))
    .eq('hash', hash)
    .is('erro', null)
    .limit(1)
  return data?.[0] ?? null
}

/** Resultado do analisador → colunas de gc_documentos. */
export function colunasDaLeitura({ dados, erro, modelo }) {
  const d = dados ?? {}
  const lista = (v) => (Array.isArray(v) ? v : [])
  const data = /^\d{4}-\d{2}-\d{2}$/.test(String(d.data_documento ?? '')) ? d.data_documento : null
  return {
    tipo_documento: d.tipo_documento ?? null,
    data_documento: data,
    medico: texto(d.medico),
    estabelecimento: texto(d.estabelecimento),
    cids: lista(d.cids),
    diagnostico: texto(d.diagnostico),
    quadro_clinico: texto(d.quadro_clinico),
    conduta: texto(d.conduta),
    leito: texto(d.leito),
    carater: texto(d.carater),
    diarias_previstas: Number.isInteger(d.diarias_previstas) ? d.diarias_previstas : null,
    procedimentos: lista(d.procedimentos),
    materiais: lista(d.materiais),
    medicamentos: lista(d.medicamentos),
    exames: lista(d.exames),
    resumo: texto(d.resumo),
    transcricao: texto(d.transcricao),
    legibilidade: d.legibilidade ?? null,
    observacoes: texto(d.observacoes),
    erro: erro ?? null,
    modelo: modelo ?? null,
  }
}

export async function gravarDocumento(db, linha) {
  const { error } = await db
    .from('gc_documentos')
    .upsert({ ...linha, analisado_em: new Date().toISOString() }, { onConflict: 'case_id,arquivo' })
  if (error) throw new Error(`Falha ao gravar o anexo: ${error.message}`)
}

export async function marcarAnexosLidos(db, caseId, quantos) {
  const { error } = await db
    .from('gc_manifestacoes')
    .update({ anexos_lidos_em: new Date().toISOString(), anexos: quantos })
    .eq('case_id', caseId)
  if (error) throw new Error(`Falha ao marcar os anexos lidos: ${error.message}`)
}
