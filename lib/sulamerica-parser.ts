// Parser do arquivo TXT de utilização da SulAmérica (layout DMS).
// Formato: CSV com delimitador ";" e qualificador de texto estilo Excel ="...".
// Cada linha (após o cabeçalho) representa um evento de utilização.
//
// Importante: o arquivo de UTILIZAÇÃO contém apenas beneficiários que tiveram
// algum evento no período. Ele NÃO representa as vidas ativas da apólice nem
// possui valor de fatura/prêmio. Também não há nome do beneficiário (somente
// códigos) nem coluna de competência explícita.

export type EventoParsed = {
  apolice: string
  grupo: string
  subestipulanteCodigo: string
  razaoSocial: string
  produto: string
  grupoFamiliar: string
  tipoBeneficiario: string
  codTitular: string
  codUsuario: string
  pessoaId: string
  titular: boolean
  sexo: string
  idade: number | null
  plano: string
  prestadorCodigo: string
  prestadorNome: string
  prestadorCnpj: string
  grupoEstatistico: string
  servicoPrincipal: string
  servico: string
  categoriaAtendimento: string
  posicaoPrestador: string
  valorApresentado: number
  valorPago: number
  valorCopart: number
  valorEmpresa: number
  dataAtendimento: string | null // ISO yyyy-mm-dd
  dataPagamento: string | null
  dataInternacao: string | null
  dscInternacao: string
  competencia: string | null // yyyy-mm (mês do pagamento)
  internacao: boolean
  saudeMental: boolean
}

export type SubestipulanteResumo = {
  codigo: string
  razaoSocial: string
  vidas: number // beneficiários com utilização neste subestipulante
  eventos: number
  valorUtilizacao: number
}

export type RankItem = {
  nome: string
  detalhe?: string
  eventos: number
  valor: number
}

export type CategoriaResumo = {
  nome: string
  valor: number
  pct: number
}

export type FaixaEtariaResumo = {
  faixa: string
  beneficiarios: number
}

export type ParseResult = {
  apolice: string
  razaoSocial: string
  produto: string
  // Não há competência explícita no layout; fica nulo e o usuário confirma.
  competencia: string | null
  competenciaSugerida: string | null
  // Competências de FATURAMENTO/processamento (derivadas da data de pagamento).
  competenciasDisponiveis: string[]
  // Competências de ATENDIMENTO (derivadas da data real do atendimento).
  competenciasAtendimento: string[]
  periodoInicio: string | null
  periodoFim: string | null
  totalEventos: number
  // Beneficiários com utilização (pessoas únicas encontradas no TXT)
  beneficiariosComUtilizacao: number
  titularesUnicos: number
  dependentesUnicos: number
  valorTotalUtilizacao: number
  valorTotalEmpresa: number
  totalInternacoes: number
  totalSaudeMental: number
  subestipulantes: SubestipulanteResumo[]
  topPrestadores: RankItem[]
  topUtilizadores: RankItem[]
  categorias: CategoriaResumo[]
  faixaEtaria: FaixaEtariaResumo[]
  eventos: EventoParsed[]
}

// Remove o qualificador Excel ="valor" e espaços nas pontas.
function unquote(raw: string): string {
  let v = (raw ?? '').trim()
  if (v.startsWith('="') && v.endsWith('"')) {
    v = v.slice(2, -1)
  } else if (v.startsWith('"') && v.endsWith('"')) {
    v = v.slice(1, -1)
  }
  return v.trim()
}

// Converte valor monetário brasileiro ("1.234,56") em number.
function parseValor(raw: string): number {
  const v = unquote(raw)
  if (!v) return 0
  const normalized = v.replace(/\./g, '').replace(',', '.')
  const n = Number.parseFloat(normalized)
  return Number.isFinite(n) ? n : 0
}

// Converte "dd/mm/aaaa" em "aaaa-mm-dd"; vazio => null.
function parseData(raw: string): string | null {
  const v = unquote(raw)
  const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) return null
  return `${m[3]}-${m[2]}-${m[1]}`
}

function parseIntSafe(raw: string): number | null {
  const v = unquote(raw)
  if (!v) return null
  const n = Number.parseInt(v, 10)
  return Number.isFinite(n) ? n : null
}

const RE_SAUDE_MENTAL =
  /PSIC[OÓ]|PSIQUIATR|PSICOTERAPIA|SA[UÚ]DE MENTAL|TERAPEUTA OCUPACION/i

function detectaSaudeMental(...campos: string[]): boolean {
  return campos.some((c) => RE_SAUDE_MENTAL.test(c || ''))
}

function detectaInternacao(
  dataInternacao: string | null,
  dscInternacao: string,
  categoria: string,
): boolean {
  if (dataInternacao) return true
  const dsc = (dscInternacao || '').trim().toUpperCase()
  if (dsc && dsc !== 'NÃO INTERNADO' && dsc !== 'NAO INTERNADO') return true
  if (/INTERNA/i.test(categoria || '')) return true
  return false
}

function faixaDaIdade(idade: number | null): string {
  if (idade === null) return 'Não informado'
  if (idade <= 18) return '0-18'
  if (idade <= 30) return '19-30'
  if (idade <= 45) return '31-45'
  if (idade <= 60) return '46-60'
  return '60+'
}

const ORDEM_FAIXAS = ['0-18', '19-30', '31-45', '46-60', '60+', 'Não informado']

export function parseSulAmerica(content: string): ParseResult {
  // Remove BOM e divide em linhas não vazias.
  const text = content.replace(/^\uFEFF/, '')
  const linhas = text.split(/\r?\n/).filter((l) => l.trim().length > 0)

  const eventos: EventoParsed[] = []

  // Pula o cabeçalho (primeira linha começa com APOLICE).
  const start = linhas[0]?.toUpperCase().startsWith('APOLICE') ? 1 : 0

  for (let i = start; i < linhas.length; i++) {
    const cols = linhas[i].split(';')
    if (cols.length < 43) continue // linha inválida

    const servicoPrincipal = unquote(cols[25])
    const servico = unquote(cols[27])
    const grupoEstatistico = unquote(cols[23])
    const categoria = unquote(cols[32])
    const dataInternacao = parseData(cols[42])
    const dscInternacao = unquote(cols[43] ?? '')
    const dataAtendimento = parseData(cols[40])
    const dataPagamento = parseData(cols[41])

    const codUsuario = unquote(cols[9])
    const dvUsuario = unquote(cols[10])
    const tipoBeneficiario = unquote(cols[6])
    const titular = tipoBeneficiario.toUpperCase().includes('TITULAR')
    // Identidade única da pessoa: código do usuário + dígito verificador.
    const pessoaId = `${codUsuario}/${dvUsuario}`

    const evento: EventoParsed = {
      apolice: unquote(cols[0]),
      grupo: unquote(cols[1]),
      subestipulanteCodigo: unquote(cols[2]),
      razaoSocial: unquote(cols[3]),
      produto: unquote(cols[4]),
      grupoFamiliar: unquote(cols[5]),
      tipoBeneficiario,
      codTitular: unquote(cols[7]),
      codUsuario,
      pessoaId,
      titular,
      sexo: unquote(cols[11]),
      idade: parseIntSafe(cols[12]),
      plano: unquote(cols[14]),
      prestadorCodigo: unquote(cols[16]),
      prestadorNome: unquote(cols[17]),
      prestadorCnpj: unquote(cols[18]),
      grupoEstatistico,
      servicoPrincipal,
      servico,
      categoriaAtendimento: categoria,
      posicaoPrestador: unquote(cols[34]),
      valorApresentado: parseValor(cols[35]),
      valorPago: parseValor(cols[36]),
      valorCopart: parseValor(cols[37]),
      valorEmpresa: parseValor(cols[38]),
      dataAtendimento,
      dataPagamento,
      dataInternacao,
      dscInternacao,
      // Competência do evento = mês do pagamento (quando processado).
      competencia: dataPagamento ? dataPagamento.slice(0, 7) : null,
      internacao: detectaInternacao(dataInternacao, dscInternacao, categoria),
      saudeMental: detectaSaudeMental(
        servico,
        servicoPrincipal,
        grupoEstatistico,
      ),
    }
    eventos.push(evento)
  }

  // Agregações
  const apolice = eventos[0]?.apolice ?? ''
  const razaoSocial = eventos[0]?.razaoSocial ?? ''
  const produto = eventos[0]?.produto ?? ''

  const pessoasGlobais = new Set<string>()
  const titularesGlobais = new Set<string>()
  const dependentesGlobais = new Set<string>()
  let valorTotalUtilizacao = 0
  let valorTotalEmpresa = 0
  let totalInternacoes = 0
  let totalSaudeMental = 0
  let periodoInicio: string | null = null
  let periodoFim: string | null = null

  const competenciaCount = new Map<string, number>()
  // Competências de atendimento (mês da data real do atendimento)
  const competenciasAtendimentoSet = new Set<string>()
  const subMap = new Map<
    string,
    { razaoSocial: string; vidas: Set<string>; eventos: number; valor: number }
  >()
  const prestadorMap = new Map<
    string,
    { detalhe: string; eventos: number; valor: number }
  >()
  const utilizadorMap = new Map<
    string,
    { detalhe: string; eventos: number; valor: number }
  >()
  const categoriaMap = new Map<string, number>()
  // Idade por pessoa (para faixa etária sem duplicar eventos)
  const idadePorPessoa = new Map<string, number | null>()

  for (const e of eventos) {
    pessoasGlobais.add(e.pessoaId)
    if (e.titular) titularesGlobais.add(e.pessoaId)
    else dependentesGlobais.add(e.pessoaId)
    if (!idadePorPessoa.has(e.pessoaId)) idadePorPessoa.set(e.pessoaId, e.idade)

    valorTotalUtilizacao += e.valorPago
    valorTotalEmpresa += e.valorEmpresa
    if (e.internacao) totalInternacoes++
    if (e.saudeMental) totalSaudeMental++

    if (e.dataAtendimento) {
      if (!periodoInicio || e.dataAtendimento < periodoInicio)
        periodoInicio = e.dataAtendimento
      if (!periodoFim || e.dataAtendimento > periodoFim)
        periodoFim = e.dataAtendimento
      competenciasAtendimentoSet.add(e.dataAtendimento.slice(0, 7))
    }
    if (e.competencia) {
      competenciaCount.set(
        e.competencia,
        (competenciaCount.get(e.competencia) ?? 0) + 1,
      )
    }

    // Subestipulante
    const subKey = e.subestipulanteCodigo || 'SEM_CODIGO'
    if (!subMap.has(subKey)) {
      subMap.set(subKey, {
        razaoSocial: e.razaoSocial,
        vidas: new Set(),
        eventos: 0,
        valor: 0,
      })
    }
    const sub = subMap.get(subKey)!
    sub.vidas.add(e.pessoaId)
    sub.eventos++
    sub.valor += e.valorPago

    // Prestador
    if (e.prestadorNome) {
      const pKey = e.prestadorCnpj || e.prestadorNome
      if (!prestadorMap.has(pKey)) {
        prestadorMap.set(pKey, {
          detalhe: e.prestadorNome,
          eventos: 0,
          valor: 0,
        })
      }
      const p = prestadorMap.get(pKey)!
      p.eventos++
      p.valor += e.valorPago
    }

    // Utilizador (beneficiário) — sem nome no TXT, usa código como identificação
    if (e.pessoaId) {
      if (!utilizadorMap.has(e.pessoaId)) {
        const tipo = e.titular ? 'Titular' : 'Dependente'
        const partes = [tipo, e.sexo, e.idade ? `${e.idade}a` : '']
          .filter(Boolean)
          .join(' · ')
        utilizadorMap.set(e.pessoaId, {
          detalhe: partes,
          eventos: 0,
          valor: 0,
        })
      }
      const u = utilizadorMap.get(e.pessoaId)!
      u.eventos++
      u.valor += e.valorPago
    }

    // Categoria de atendimento (para o donut de utilização)
    const catNome = e.categoriaAtendimento || 'Outros'
    categoriaMap.set(catNome, (categoriaMap.get(catNome) ?? 0) + e.valorPago)
  }

  // Competência sugerida = mês de pagamento dominante (não inventa explícita)
  let competenciaSugerida: string | null = null
  let maxCount = -1
  for (const [comp, count] of competenciaCount) {
    if (count > maxCount) {
      maxCount = count
      competenciaSugerida = comp
    }
  }
  const competenciasDisponiveis = [...competenciaCount.keys()].sort()

  const subestipulantes: SubestipulanteResumo[] = [...subMap.entries()]
    .map(([codigo, s]) => ({
      codigo,
      razaoSocial: s.razaoSocial,
      vidas: s.vidas.size,
      eventos: s.eventos,
      valorUtilizacao: s.valor,
    }))
    .sort((a, b) => b.valorUtilizacao - a.valorUtilizacao)

  const topPrestadores: RankItem[] = [...prestadorMap.values()]
    .map((p) => ({ nome: p.detalhe, eventos: p.eventos, valor: p.valor }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 10)

  const topUtilizadores: RankItem[] = [...utilizadorMap.entries()]
    .map(([cod, u]) => ({
      // Sem nome no TXT: usa o código como fallback de identificação.
      nome: cod,
      detalhe: u.detalhe,
      eventos: u.eventos,
      valor: u.valor,
    }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 10)

  const totalCategorias = [...categoriaMap.values()].reduce((a, b) => a + b, 0)
  const categoriasOrdenadas = [...categoriaMap.entries()]
    .map(([nome, valor]) => ({ nome, valor }))
    .sort((a, b) => b.valor - a.valor)
  const principais = categoriasOrdenadas.slice(0, 5)
  const restante = categoriasOrdenadas.slice(5).reduce((a, c) => a + c.valor, 0)
  const categorias: CategoriaResumo[] = principais.map((c) => ({
    nome: c.nome,
    valor: c.valor,
    pct: totalCategorias ? (c.valor / totalCategorias) * 100 : 0,
  }))
  if (restante > 0) {
    categorias.push({
      nome: 'Demais',
      valor: restante,
      pct: totalCategorias ? (restante / totalCategorias) * 100 : 0,
    })
  }

  const faixaMap = new Map<string, number>()
  for (const idade of idadePorPessoa.values()) {
    const faixa = faixaDaIdade(idade)
    faixaMap.set(faixa, (faixaMap.get(faixa) ?? 0) + 1)
  }
  const faixaEtaria: FaixaEtariaResumo[] = ORDEM_FAIXAS.filter((f) =>
    faixaMap.has(f),
  ).map((faixa) => ({ faixa, beneficiarios: faixaMap.get(faixa) ?? 0 }))

  return {
    apolice,
    razaoSocial,
    produto,
    competencia: null,
    competenciaSugerida,
    competenciasDisponiveis,
    competenciasAtendimento: [...competenciasAtendimentoSet].sort(),
    periodoInicio,
    periodoFim,
    totalEventos: eventos.length,
    beneficiariosComUtilizacao: pessoasGlobais.size,
    titularesUnicos: titularesGlobais.size,
    dependentesUnicos: dependentesGlobais.size,
    valorTotalUtilizacao,
    valorTotalEmpresa,
    totalInternacoes,
    totalSaudeMental,
    subestipulantes,
    topPrestadores,
    topUtilizadores,
    categorias,
    faixaEtaria,
    eventos,
  }
}
