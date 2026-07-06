'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

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

// Normaliza a carteirinha para o mesmo formato de eventos_utilizacao.cod_usuario.
// O cartão ANS tem 20 dígitos = 3 (registro da operadora) + 16 (identificador) +
// 1 (dígito verificador). O cod_usuario corresponde aos 16 dígitos do meio.
function normalizarCarteirinha(v: string | undefined): string {
  if (!v) return ''
  const d = v.replace(/\D/g, '')
  if (d.length === 20) return d.slice(3, 19)
  if (d.length === 19) return d.slice(3) // 3 + 16, sem DV
  if (d.length === 17) return d.slice(0, 16) // 16 + DV
  return d
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
      cpf: pick('cpf')?.replace(/\D/g, '') || null,
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
