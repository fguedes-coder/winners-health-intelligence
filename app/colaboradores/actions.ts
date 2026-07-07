'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { requireAuthAction } from '@/lib/auth/require-user'
import { normalizarCarteirinha, normalizarCpf } from '@/lib/beneficiario/identity'
import { normalizarNome } from '@/lib/people-analytics/rh'

// Telas que exibem o nome do beneficiário resolvido pela carteirinha.
// Como `beneficiario_nomes` é a fonte ÚNICA de nomes, qualquer inclusão,
// alteração ou remoção precisa invalidar o cache de todas elas para que a
// mudança apareça automaticamente, sem ação manual em cada módulo.
function revalidarTelasComNomes() {
  revalidatePath('/colaboradores')
  revalidatePath('/dashboard')
  revalidatePath('/utilizacao')
  revalidatePath('/sinistralidade')
  revalidatePath('/relatorios')
}

// ============================================================
// IMPORTAÇÃO DA BASE DE VIDAS ELEGÍVEIS (cadastro populacional)
// ============================================================

export type ImportVidasResult = {
  ok: boolean
  inseridos: number
  atualizados: number
  ignorados: number
  removidos: number
  total: number
  competencia: string
  colunasDetectadas?: Record<string, string>
  error?: string
}

type VidaRow = {
  carteirinha: string
  nome: string | null
  cpf: string | null
  tipo: string | null
  sexo: string | null
  data_nascimento: string | null
  plano: string | null
  empresa: string | null
  data_adesao: string | null
  status: string | null
}

// Remove acentos e normaliza um cabeçalho de coluna para comparação.
function normalizarChave(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

// Sinônimos aceitos para cada campo da base de vidas, EM ORDEM DE PRIORIDADE.
// A detecção tenta os sinônimos na ordem em que aparecem aqui — importante para
// a carteirinha, em que a "Carteira de identificação" (cartão ANS de 20 dígitos)
// deve ser preferida à "Matrícula" (código interno curto).
const MAPA_COLUNAS: Record<keyof Omit<VidaRow, never>, string[]> = {
  carteirinha: [
    'carteiradeidentificacao',
    'carteiraidentificacao',
    'numerocarteirinha',
    'numerodacarteira',
    'numerocarteira',
    'carteirinha',
    'carteira',
    'cartao',
    'codusuario',
    'codigousuario',
    'matriculabeneficiario',
    'matricula',
    'codigo',
    'registro',
  ],
  nome: [
    'nomecompletodobeneficiario',
    'nomebenef',
    'nomebeneficiario',
    'nomecompleto',
    'beneficiario',
    'segurado',
    'nome',
  ],
  cpf: ['cpf', 'cpfbeneficiario', 'documento'],
  tipo: [
    'tipo',
    'vinculo',
    'tipobeneficiario',
    'dependencia',
    'grauparentesco',
    'grau',
    'titularidade',
    'tipovida',
    'rdp',
    'df',
  ],
  sexo: ['sexo', 'genero'],
  data_nascimento: [
    'datanasc',
    'datanascimento',
    'nascimento',
    'dtnascimento',
    'dtnasc',
    'dn',
  ],
  plano: ['plano', 'produto', 'nomeplano', 'tipoplano'],
  empresa: [
    'empresa',
    'subestipulante',
    'contrato',
    'unidade',
    'estipulante',
    'razaosocial',
    'codemp',
    'codigoempresa',
  ],
  data_adesao: [
    'dataadesao',
    'adesao',
    'dtadesao',
    'iniciovigencia',
    'vigencia',
    'datainclusao',
    'inclusao',
  ],
  status: ['status', 'situacao', 'situacaobeneficiario', 'planoativo', 'ativo'],
}

// Detecta o delimitador mais provável de uma linha de cabeçalho.
function detectarDelimitador(linha: string): string {
  const candidatos = [';', '\t', ',', '|']
  let melhor = ';'
  let max = -1
  for (const d of candidatos) {
    const n = linha.split(d).length
    if (n > max) {
      max = n
      melhor = d
    }
  }
  return melhor
}

function limparCelula(v: string): string {
  return v.replace(/^["'=]+|["']+$/g, '').trim()
}

// Converte uma data em vários formatos para ISO (yyyy-mm-dd) ou null.
function parseData(v: string | undefined): string | null {
  if (!v) return null
  const s = v.trim()
  if (!s) return null
  // yyyymmdd (8 dígitos contínuos — padrão MECSAS). Ignora sentinelas como 99991231.
  let m = s.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (m) {
    const [, y, mo, d] = m
    if (s === '00000000' || y === '0000' || s === '99991231') return null
    return `${y}-${mo}-${d}`
  }
  // yyyy-mm-dd
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) {
    const [, y, mo, d] = m
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  // dd/mm/yyyy ou dd-mm-yyyy
  m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/)
  if (m) {
    let [, d, mo, y] = m
    if (y.length === 2) y = Number(y) > 40 ? `19${y}` : `20${y}`
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  return null
}

function normalizarTipo(v: string | undefined): string | null {
  if (!v) return null
  const bruto = v.trim()
  if (!bruto) return null
  const n = normalizarChave(bruto)
  if (!n) return null
  // Códigos numéricos (ex.: RDP/grau de dependência do MECSAS): 01 = titular,
  // qualquer outro código (02, 10, 11, ...) = dependente.
  if (/^\d+$/.test(n)) {
    return Number(n) === 1 ? 'TITULAR' : 'DEPENDENTE'
  }
  if (n.includes('titular') || n === 't') return 'TITULAR'
  if (
    n.includes('depend') ||
    n.includes('conjuge') ||
    n.includes('filh') ||
    n.includes('agregad') ||
    n === 'd'
  ) {
    return 'DEPENDENTE'
  }
  return bruto.toUpperCase()
}

function normalizarSexo(v: string | undefined): string | null {
  if (!v) return null
  const n = normalizarChave(v)
  if (!n) return null
  if (n.startsWith('m')) return 'M'
  if (n.startsWith('f')) return 'F'
  return null
}

function normalizarStatus(v: string | undefined): string | null {
  if (!v) return null
  const n = normalizarChave(v)
  if (!n) return null
  if (n.includes('inativ') || n.includes('cancel') || n === 'n' || n === 'nao')
    return 'INATIVO'
  if (n.includes('ativ') || n === 's' || n === 'sim' || n === '1')
    return 'ATIVO'
  return v.trim().toUpperCase()
}

// Faz o parse de um CSV/TXT COM CABEÇALHO, mapeando colunas automaticamente.
function parseVidas(conteudo: string): {
  rows: VidaRow[]
  mapeamento: Record<string, string>
  erro?: string
} {
  const linhas = conteudo.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (linhas.length < 2) {
    return {
      rows: [],
      mapeamento: {},
      erro: 'Arquivo vazio ou sem linhas de dados além do cabeçalho.',
    }
  }

  const delim = detectarDelimitador(linhas[0])

  // Alguns exports (ex.: MECSAS) trazem uma primeira linha apenas com índices
  // numéricos das colunas (1;2;3;...). Nesse caso, o cabeçalho real é a 2ª linha.
  const tokensPrimeiraLinha = linhas[0]
    .split(delim)
    .map((c) => limparCelula(c))
  const primeiraLinhaSoNumeros =
    tokensPrimeiraLinha.length > 1 &&
    tokensPrimeiraLinha.every((t) => t === '' || /^\d+$/.test(t))
  const linhaCabecalho = primeiraLinhaSoNumeros ? 1 : 0

  if (linhas.length < linhaCabecalho + 2) {
    return {
      rows: [],
      mapeamento: {},
      erro: 'Arquivo sem linhas de dados além do cabeçalho.',
    }
  }

  const cabecalhos = linhas[linhaCabecalho]
    .split(delim)
    .map((h) => limparCelula(h))
  const chavesNorm = cabecalhos.map((h) => normalizarChave(h))

  // Resolve o índice de cada campo respeitando a ORDEM DE PRIORIDADE dos
  // sinônimos (não a ordem das colunas no arquivo).
  const idx: Partial<Record<keyof VidaRow, number>> = {}
  const mapeamento: Record<string, string> = {}
  for (const campo of Object.keys(MAPA_COLUNAS) as (keyof VidaRow)[]) {
    for (const sin of MAPA_COLUNAS[campo]) {
      const found = chavesNorm.indexOf(sin)
      if (found >= 0) {
        idx[campo] = found
        mapeamento[campo] = cabecalhos[found]
        break
      }
    }
  }

  if (idx.carteirinha === undefined) {
    return {
      rows: [],
      mapeamento,
      erro:
        'Coluna de identificação (carteirinha/matrícula) não encontrada no cabeçalho. Inclua uma coluna como "Carteira de identificação", "Carteirinha", "Matrícula" ou "Código".',
    }
  }

  const rows: VidaRow[] = []
  for (let i = linhaCabecalho + 1; i < linhas.length; i++) {
    const cells = linhas[i].split(delim).map((c) => limparCelula(c))
    const pick = (campo: keyof VidaRow): string | undefined => {
      const j = idx[campo]
      return j === undefined ? undefined : cells[j]
    }
    const carteirinha = normalizarCarteirinha(pick('carteirinha'))
    if (!carteirinha || !/\d/.test(carteirinha)) continue

    rows.push({
      carteirinha,
      nome: pick('nome')?.trim() || null,
      cpf: normalizarCpf(pick('cpf')),
      tipo: normalizarTipo(pick('tipo')),
      sexo: normalizarSexo(pick('sexo')),
      data_nascimento: parseData(pick('data_nascimento')),
      plano: pick('plano')?.trim() || null,
      empresa: pick('empresa')?.trim() || null,
      data_adesao: parseData(pick('data_adesao')),
      status: normalizarStatus(pick('status')) ?? 'ATIVO',
    })
  }

  return { rows, mapeamento }
}

export async function importarVidas(
  formData: FormData,
): Promise<ImportVidasResult> {
  const auth = await requireAuthAction()
  if ('error' in auth) {
    return {
      ok: false,
      inseridos: 0,
      atualizados: 0,
      ignorados: 0,
      removidos: 0,
      total: 0,
      competencia: '',
      error: auth.error,
    }
  }

  // Competência (YYYY-MM) à qual esta base de vidas ficará vinculada.
  const competenciaRaw = String(formData.get('competencia') ?? '').trim()
  const competencia = /^\d{4}-\d{2}$/.test(competenciaRaw) ? competenciaRaw : ''
  const vazio = {
    ok: false,
    inseridos: 0,
    atualizados: 0,
    ignorados: 0,
    removidos: 0,
    total: 0,
    competencia,
  }
  try {
    if (!competencia) {
      return {
        ...vazio,
        error: 'Informe a competência (mês/ano) da base antes de importar.',
      }
    }
    const file = formData.get('file') as File | null
    if (!file) {
      return { ...vazio, error: 'Nenhum arquivo enviado.' }
    }

    const conteudo = await file.text()
    const { rows, mapeamento, erro } = parseVidas(conteudo)
    if (erro) return { ...vazio, error: erro, colunasDetectadas: mapeamento }
    if (rows.length === 0) {
      return {
        ...vazio,
        colunasDetectadas: mapeamento,
        error: 'Nenhum registro válido encontrado no arquivo.',
      }
    }

    // Deduplica pelo identificador (mantém o último registro do arquivo).
    const dedup = new Map<string, VidaRow>()
    for (const r of rows) dedup.set(r.carteirinha, r)
    const finais = [...dedup.values()]

    const supabase = await createClient()

    // Vidas já existentes NESTA competência (para relatar reimportação vs. nova).
    const { count: totalAntes } = await supabase
      .from('beneficiario_vidas')
      .select('carteirinha', { count: 'exact', head: true })
      .eq('competencia', competencia)

    const nowIso = new Date().toISOString()
    const payload = finais.map((r) => ({
      ...r,
      competencia,
      updated_at: nowIso,
    }))

    // Cada importação é a fotografia oficial daquela competência: limpamos a
    // competência informada e recriamos exatamente com o arquivo enviado.
    // As demais competências são preservadas para histórico populacional.
    const { error: errDel } = await supabase
      .from('beneficiario_vidas')
      .delete()
      .eq('competencia', competencia)
    if (errDel) {
      return { ...vazio, error: errDel.message, colunasDetectadas: mapeamento }
    }

    const { error } = await supabase
      .from('beneficiario_vidas')
      .upsert(payload, { onConflict: 'competencia,carteirinha' })

    if (error) {
      return { ...vazio, error: error.message, colunasDetectadas: mapeamento }
    }

    // Mantém a base de nomes sincronizada: alimenta carteirinha → nome
    // a partir das vidas que trouxeram nome, sem sobrescrever ausentes.
    const comNome = finais
      .filter((r) => r.nome)
      .map((r) => ({
        carteirinha: r.carteirinha,
        nome: r.nome as string,
        updated_at: nowIso,
      }))
    if (comNome.length > 0) {
      await supabase
        .from('beneficiario_nomes')
        .upsert(comNome, { onConflict: 'carteirinha' })
    }

    // A competência é recriada do zero: todos os registros são "novos" nela.
    // "removidos" = vidas que constavam na versão anterior desta competência
    // e não vieram no novo arquivo (a fotografia foi substituída).
    const anterior = totalAntes ?? 0
    const inseridos = finais.length
    const removidos = anterior > 0 ? anterior : 0

    revalidarTelasComNomes()

    return {
      ok: true,
      inseridos,
      atualizados: 0,
      ignorados: rows.length - finais.length,
      removidos,
      total: finais.length,
      competencia,
      colunasDetectadas: mapeamento,
    }
  } catch (e) {
    return {
      ...vazio,
      error: e instanceof Error ? e.message : 'Erro ao importar vidas.',
    }
  }
}

// ============================================================
// ATUALIZAÇÃO (MERGE) DA BASE DE VIDAS ATIVA — sem duplicar
// ============================================================
// Diferente de importarVidas (que substitui a fotografia de uma competência),
// esta ação MESCLA o arquivo na competência ATIVA (a mais recente):
//   • beneficiário já existente → atualiza apenas os campos preenchidos no
//     arquivo (merge não-destrutivo: valor vazio NÃO apaga o que já existe);
//   • beneficiário novo → é inserido na competência ativa;
//   • quem não veio no arquivo → permanece intacto.
// Assim é possível corrigir/atualizar dados sem criar um novo mês nem duplicar.

export type MesclarVidasResult = {
  ok: boolean
  atualizados: number
  inseridos: number
  inalterados: number
  ignorados: number
  total: number
  // Registros do Cadastro Mestre atualizados a partir do mesmo arquivo. O
  // Cadastro Mestre tem PRECEDÊNCIA na exibição, então sem esta etapa a
  // correção gravada em beneficiario_vidas ficaria "escondida" atrás do master.
  masterAtualizados: number
  competencia: string
  colunasDetectadas?: Record<string, string>
  error?: string
}

// Colunas do Cadastro Mestre atualizáveis a partir de uma linha da base de vidas.
type MasterMergeRow = {
  id: string
  carteirinha: string | null
  cpf: string | null
  nome: string | null
  nome_norm: string | null
  tipo: string | null
  sexo: string | null
  data_nascimento: string | null
  plano: string | null
  empresa: string | null
  data_adesao: string | null
  status: string | null
}

// Atualiza (merge não-destrutivo) o Cadastro Mestre a partir das linhas já
// parseadas da base de vidas. Casa por CPF → carteirinha (normalizada p/ 16
// dígitos) → nome normalizado único. Não INSERE novos registros no master:
// quem não existe lá é exibido a partir de beneficiario_vidas (já atualizado),
// evitando o risco de duplicar a população. Retorna quantos foram atualizados.
async function mesclarNoMaster(
  supabase: Awaited<ReturnType<typeof createClient>>,
  linhas: VidaRow[],
  nowIso: string,
): Promise<number> {
  // Carrega o master (paginado) com as colunas mescláveis.
  const master: MasterMergeRow[] = []
  const PAGE = 1000
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('beneficiarios_master')
      .select(
        'id, carteirinha, cpf, nome, nome_norm, tipo, sexo, data_nascimento, plano, empresa, data_adesao, status',
      )
      .range(from, from + PAGE - 1)
    if (error || !data || data.length === 0) break
    master.push(...(data as MasterMergeRow[]))
    if (data.length < PAGE) break
    from += PAGE
  }
  if (master.length === 0) return 0

  // Índices de matching.
  const byCpf = new Map<string, MasterMergeRow>()
  const byCart = new Map<string, MasterMergeRow>()
  const byNome = new Map<string, MasterMergeRow[]>()
  for (const m of master) {
    const cpfKey = normalizarCpf(m.cpf)
    if (cpfKey) byCpf.set(cpfKey, m)
    const cartKey = normalizarCarteirinha(m.carteirinha ?? undefined)
    if (cartKey) byCart.set(cartKey, m)
    if (m.nome_norm) {
      const arr = byNome.get(m.nome_norm) ?? []
      arr.push(m)
      byNome.set(m.nome_norm, arr)
    }
  }

  // Campos da base de vidas → colunas do master.
  const CAMPOS: (keyof Pick<
    VidaRow,
    'nome' | 'cpf' | 'tipo' | 'sexo' | 'data_nascimento' | 'plano' | 'empresa' | 'data_adesao' | 'status'
  >)[] = ['nome', 'cpf', 'tipo', 'sexo', 'data_nascimento', 'plano', 'empresa', 'data_adesao', 'status']

  let atualizados = 0
  const atualizadosIds = new Set<string>()
  for (const l of linhas) {
    const cpfKey = normalizarCpf(l.cpf) ?? ''
    const nomeNorm = l.nome ? normalizarNome(l.nome) : ''
    // Cascata: CPF → carteirinha normalizada → nome normalizado (se único).
    let alvo: MasterMergeRow | undefined
    if (cpfKey) alvo = byCpf.get(cpfKey)
    if (!alvo && l.carteirinha) alvo = byCart.get(l.carteirinha)
    if (!alvo && nomeNorm) {
      const cand = byNome.get(nomeNorm)
      if (cand && cand.length === 1) alvo = cand[0]
    }
    if (!alvo || atualizadosIds.has(alvo.id)) continue

    // Sobrescreve apenas com valores preenchidos que diferem do atual.
    const patch: Record<string, string | null> = {}
    for (const campo of CAMPOS) {
      const valNovo = l[campo]
      if (valNovo != null && valNovo !== '' && valNovo !== alvo[campo]) {
        patch[campo] = valNovo
      }
    }
    if (patch.nome !== undefined) {
      const nn = normalizarNome(String(patch.nome))
      if (nn && nn !== alvo.nome_norm) patch.nome_norm = nn
    }
    if (Object.keys(patch).length === 0) continue

    const { error } = await supabase
      .from('beneficiarios_master')
      .update({ ...patch, updated_at: nowIso })
      .eq('id', alvo.id)
    if (!error) {
      atualizados++
      atualizadosIds.add(alvo.id)
    }
  }
  return atualizados
}

export async function mesclarVidas(
  formData: FormData,
): Promise<MesclarVidasResult> {
  const auth = await requireAuthAction()
  if ('error' in auth) {
    return {
      ok: false,
      atualizados: 0,
      inseridos: 0,
      inalterados: 0,
      ignorados: 0,
      total: 0,
      masterAtualizados: 0,
      competencia: '',
      error: auth.error,
    }
  }

  const vazio: MesclarVidasResult = {
    ok: false,
    atualizados: 0,
    inseridos: 0,
    inalterados: 0,
    ignorados: 0,
    total: 0,
    masterAtualizados: 0,
    competencia: '',
  }
  try {
    const file = formData.get('file') as File | null
    if (!file) return { ...vazio, error: 'Nenhum arquivo enviado.' }

    const supabase = await createClient()

    // Competência ativa = a mais recente existente na base de vidas.
    const { data: ultima, error: errComp } = await supabase
      .from('beneficiario_vidas')
      .select('competencia')
      .order('competencia', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (errComp) return { ...vazio, error: errComp.message }
    const competencia = (ultima?.competencia as string | undefined) ?? ''
    if (!competencia) {
      return {
        ...vazio,
        error:
          'Ainda não há uma base de vidas para atualizar. Importe uma base inicial (com competência) antes de usar a atualização.',
      }
    }

    const conteudo = await file.text()
    const { rows, mapeamento, erro } = parseVidas(conteudo)
    if (erro)
      return { ...vazio, competencia, error: erro, colunasDetectadas: mapeamento }
    if (rows.length === 0) {
      return {
        ...vazio,
        competencia,
        colunasDetectadas: mapeamento,
        error: 'Nenhum registro válido encontrado no arquivo.',
      }
    }

    // Deduplica o próprio arquivo pela carteirinha (mantém o último).
    const dedup = new Map<string, VidaRow>()
    for (const r of rows) dedup.set(r.carteirinha, r)
    const finais = [...dedup.values()]

    // Carrega os registros já existentes na competência ativa.
    const carteirinhas = finais.map((r) => r.carteirinha)
    const existentesPorCart = new Map<string, VidaRow>()
    const PAGE = 500
    for (let i = 0; i < carteirinhas.length; i += PAGE) {
      const lote = carteirinhas.slice(i, i + PAGE)
      const { data, error } = await supabase
        .from('beneficiario_vidas')
        .select(
          'carteirinha, nome, cpf, tipo, sexo, data_nascimento, plano, empresa, data_adesao, status',
        )
        .eq('competencia', competencia)
        .in('carteirinha', lote)
      if (error)
        return { ...vazio, competencia, error: error.message, colunasDetectadas: mapeamento }
      for (const row of (data ?? []) as VidaRow[]) {
        existentesPorCart.set(row.carteirinha, row)
      }
    }

    // Campos mesclados de forma não-destrutiva (vazio não apaga).
    const CAMPOS: (keyof Omit<VidaRow, 'carteirinha'>)[] = [
      'nome',
      'cpf',
      'tipo',
      'sexo',
      'data_nascimento',
      'plano',
      'empresa',
      'data_adesao',
      'status',
    ]
    const nowIso = new Date().toISOString()
    const payload: (VidaRow & { competencia: string; updated_at: string })[] = []
    let atualizados = 0
    let inseridos = 0
    let inalterados = 0

    for (const novo of finais) {
      const atual = existentesPorCart.get(novo.carteirinha)
      if (!atual) {
        payload.push({ ...novo, competencia, updated_at: nowIso })
        inseridos++
        continue
      }
      // Merge: mantém o atual e sobrescreve só com valores preenchidos do arquivo.
      const merged: VidaRow = { ...atual, carteirinha: novo.carteirinha }
      let mudou = false
      for (const campo of CAMPOS) {
        const valNovo = novo[campo]
        if (valNovo != null && valNovo !== '' && valNovo !== atual[campo]) {
          merged[campo] = valNovo
          mudou = true
        }
      }
      if (mudou) {
        payload.push({ ...merged, competencia, updated_at: nowIso })
        atualizados++
      } else {
        inalterados++
      }
    }

    if (payload.length > 0) {
      const { error } = await supabase
        .from('beneficiario_vidas')
        .upsert(payload, { onConflict: 'competencia,carteirinha' })
      if (error)
        return { ...vazio, competencia, error: error.message, colunasDetectadas: mapeamento }
    }

    // Sincroniza a base de nomes com os nomes trazidos no arquivo.
    const comNome = finais
      .filter((r) => r.nome)
      .map((r) => ({
        carteirinha: r.carteirinha,
        nome: r.nome as string,
        updated_at: nowIso,
      }))
    if (comNome.length > 0) {
      await supabase
        .from('beneficiario_nomes')
        .upsert(comNome, { onConflict: 'carteirinha' })
    }

    // Também atualiza o Cadastro Mestre (fonte de MAIOR precedência na tela),
    // para que a correção de CPF/nascimento/etc. realmente apareça.
    const masterAtualizados = await mesclarNoMaster(supabase, finais, nowIso)

    revalidarTelasComNomes()

    return {
      ok: true,
      atualizados,
      inseridos,
      inalterados,
      ignorados: rows.length - finais.length,
      total: finais.length,
      masterAtualizados,
      competencia,
      colunasDetectadas: mapeamento,
    }
  } catch (e) {
    return {
      ...vazio,
      error: e instanceof Error ? e.message : 'Erro ao atualizar vidas.',
    }
  }
}

export type ImportNomesResult = {
  ok: boolean
  inseridos: number
  atualizados: number
  ignorados: number
  total: number
  error?: string
}

// Faz o parse de um conteúdo de texto/CSV com pares "carteirinha;nome".
// Aceita separadores ; , ou TAB e ignora cabeçalho quando detectado.
function parseNomes(
  conteudo: string,
): { carteirinha: string; nome: string }[] {
  const linhas = conteudo.split(/\r?\n/)
  const out: { carteirinha: string; nome: string }[] = []
  for (const raw of linhas) {
    const linha = raw.trim()
    if (!linha) continue
    // separadores possíveis
    const partes = linha.split(/[;\t,]/).map((p) => p.trim())
    if (partes.length < 2) continue
    let [carteirinha, ...resto] = partes
    let nome = resto.join(' ').trim()
    carteirinha = carteirinha.replace(/["=]/g, '').trim()
    nome = nome.replace(/^"|"$/g, '').trim()
    if (!carteirinha || !nome) continue
    // pula cabeçalho
    const low = (carteirinha + nome).toLowerCase()
    if (
      low.includes('carteirinha') ||
      low.includes('beneficiario') ||
      low.includes('beneficiário') ||
      (low.includes('nome') && !/\d/.test(carteirinha))
    ) {
      continue
    }
    if (!/\d/.test(carteirinha)) continue
    out.push({ carteirinha, nome })
  }
  return out
}

export async function importarNomes(
  formData: FormData,
): Promise<ImportNomesResult> {
  const auth = await requireAuthAction()
  if ('error' in auth) {
    return {
      ok: false,
      inseridos: 0,
      atualizados: 0,
      ignorados: 0,
      total: 0,
      error: auth.error,
    }
  }

  try {
    const file = formData.get('file') as File | null
    if (!file) {
      return {
        ok: false,
        inseridos: 0,
        atualizados: 0,
        ignorados: 0,
        total: 0,
        error: 'Nenhum arquivo enviado.',
      }
    }

    const conteudo = await file.text()
    const registros = parseNomes(conteudo)
    if (registros.length === 0) {
      return {
        ok: false,
        inseridos: 0,
        atualizados: 0,
        ignorados: 0,
        total: 0,
        error:
          'Nenhum registro válido encontrado. Use o formato "carteirinha;nome" por linha.',
      }
    }

    // Remove duplicados do próprio arquivo (mantém o último)
    const dedup = new Map<string, string>()
    for (const r of registros) dedup.set(r.carteirinha, r.nome)

    const supabase = await createClient()

    // Verifica quais já existem para reportar inseridos x atualizados
    const carteirinhas = [...dedup.keys()]
    const { data: existentes } = await supabase
      .from('beneficiario_nomes')
      .select('carteirinha')
      .in('carteirinha', carteirinhas)
    const existentesSet = new Set(
      ((existentes ?? []) as { carteirinha: string }[]).map(
        (e) => e.carteirinha,
      ),
    )

    const rows = [...dedup.entries()].map(([carteirinha, nome]) => ({
      carteirinha,
      nome,
      updated_at: new Date().toISOString(),
    }))

    const { error } = await supabase
      .from('beneficiario_nomes')
      .upsert(rows, { onConflict: 'carteirinha' })

    if (error) {
      return {
        ok: false,
        inseridos: 0,
        atualizados: 0,
        ignorados: 0,
        total: 0,
        error: error.message,
      }
    }

    const atualizados = rows.filter((r) =>
      existentesSet.has(r.carteirinha),
    ).length
    const inseridos = rows.length - atualizados

    revalidarTelasComNomes()

    return {
      ok: true,
      inseridos,
      atualizados,
      ignorados: registros.length - rows.length,
      total: rows.length,
    }
  } catch (e) {
    return {
      ok: false,
      inseridos: 0,
      atualizados: 0,
      ignorados: 0,
      total: 0,
      error: e instanceof Error ? e.message : 'Erro ao importar nomes.',
    }
  }
}

// Salva/edita o nome de uma única carteirinha (cadastro manual rápido).
// Nome vazio remove o cadastro — a carteirinha volta a ser exibida como fallback.
export async function salvarNome(
  carteirinha: string,
  nome: string,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireAuthAction()
  if ('error' in auth) return { ok: false, error: auth.error }

  const cart = carteirinha.trim()
  const n = nome.trim()
  if (!cart) return { ok: false, error: 'Carteirinha inválida.' }

  const supabase = await createClient()

  if (!n) {
    // Remoção: exclui o vínculo nome ↔ carteirinha.
    const { error } = await supabase
      .from('beneficiario_nomes')
      .delete()
      .eq('carteirinha', cart)
    if (error) return { ok: false, error: error.message }
  } else {
    const { error } = await supabase
      .from('beneficiario_nomes')
      .upsert(
        { carteirinha: cart, nome: n, updated_at: new Date().toISOString() },
        { onConflict: 'carteirinha' },
      )
    if (error) return { ok: false, error: error.message }
  }

  // Propaga a mudança para todo o dashboard automaticamente.
  revalidarTelasComNomes()
  return { ok: true }
}
