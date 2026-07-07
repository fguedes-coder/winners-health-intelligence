// ===========================================================================
// Cadastro Mestre — importação com matching em cascata (server-only)
//
// Fluxo: parse CSV/XLSX -> mede qualidade "antes" -> casa cada linha contra o
// master existente (CPF -> Carteirinha -> Matrícula -> Nome normalizado
// idêntico) -> atualiza (merge não-destrutivo) ou insere -> mede qualidade
// "depois" -> registra a importação. Nunca sobrescreve um campo preenchido
// com valor vazio.
// ===========================================================================

import 'server-only'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/server'
import {
  mapearLinhaMaster,
  normalizarLinhaMaster,
  CAMPOS_QUALIDADE,
  type MasterLinha,
} from './parse'

export type QualidadeCampoMaster = {
  chave: string
  label: string
  preenchidos: number
  pct: number
}

export type QualidadeSnapshot = {
  total: number
  campos: QualidadeCampoMaster[]
  mediaGeral: number
}

export type ImportarMasterResult = {
  error?: string
  importacaoId?: string
  arquivoNome?: string
  total?: number
  atualizados?: number
  novos?: number
  naoEncontrados?: number
  duplicidades?: number
  qualidadeAntes?: QualidadeSnapshot
  qualidadeDepois?: QualidadeSnapshot
}

// Registro do master relevante para matching/merge.
type MasterRow = {
  id: string
  carteirinha: string | null
  matricula: string | null
  cpf: string | null
  nome: string | null
  nome_norm: string | null
  tipo: string | null
  sexo: string | null
  data_nascimento: string | null
  plano: string | null
  empresa: string | null
  data_adesao: string | null
  data_admissao: string | null
  email: string | null
  telefone: string | null
  status: string | null
  competencia: string | null
}

const COLS =
  'id, carteirinha, matricula, cpf, nome, nome_norm, tipo, sexo, data_nascimento, plano, empresa, data_adesao, data_admissao, email, telefone, status, competencia'

function vazio(v: string | null | undefined): boolean {
  return v == null || String(v).trim() === ''
}

// Mede a completude dos campos de qualidade sobre um conjunto de registros.
function medirQualidade(rows: Pick<MasterRow, keyof MasterRow>[]): QualidadeSnapshot {
  const total = rows.length
  // Mapeia a chave canônica do parser (camelCase) para a coluna do banco.
  const colByChave: Record<string, keyof MasterRow> = {
    cpf: 'cpf',
    nome: 'nome',
    sexo: 'sexo',
    dataNascimento: 'data_nascimento',
    empresa: 'empresa',
    plano: 'plano',
    tipo: 'tipo',
    dataAdesao: 'data_adesao',
    dataAdmissao: 'data_admissao',
    email: 'email',
    telefone: 'telefone',
  }
  const campos = CAMPOS_QUALIDADE.map((c) => {
    const col = colByChave[c.chave as string]
    const preenchidos = col
      ? rows.filter((r) => !vazio(r[col] as string | null)).length
      : 0
    return {
      chave: c.chave as string,
      label: c.label,
      preenchidos,
      pct: total ? (preenchidos / total) * 100 : 0,
    }
  })
  const mediaGeral =
    campos.length > 0
      ? campos.reduce((s, c) => s + c.pct, 0) / campos.length
      : 0
  return { total, campos, mediaGeral }
}

// Escolhe a planilha com dados de beneficiários (cabeçalho com nome/carteirinha/cpf).
function escolherLinhas(wb: XLSX.WorkBook): Record<string, unknown>[] {
  const temChaves = (rows: Record<string, unknown>[]) => {
    if (rows.length === 0) return false
    const headers = Object.keys(rows[0]).map((h) =>
      h
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase(),
    )
    return headers.some(
      (h) =>
        h.includes('nome') ||
        h.includes('cpf') ||
        h.includes('carteir') ||
        h.includes('matricula'),
    )
  }
  for (const nome of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[nome], {
      defval: null,
      raw: false,
    })
    if (temChaves(rows)) return rows
  }
  for (const nome of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[nome], {
      defval: null,
      raw: false,
    })
    if (rows.length > 0) return rows
  }
  return []
}

// Converte a linha canônica do parser para o formato de coluna do banco.
function paraColunas(l: MasterLinha) {
  return {
    carteirinha: l.carteirinha,
    matricula: l.matricula,
    cpf: l.cpf,
    nome: l.nome,
    nome_norm: l.nomeNorm,
    tipo: l.tipo,
    sexo: l.sexo,
    data_nascimento: l.dataNascimento,
    plano: l.plano,
    empresa: l.empresa,
    data_adesao: l.dataAdesao,
    data_admissao: l.dataAdmissao,
    email: l.email,
    telefone: l.telefone,
    status: l.status,
    competencia: l.competencia,
  }
}

export async function importarCadastroMaster(
  file: File,
): Promise<ImportarMasterResult> {
  if (!file || file.size === 0) {
    return { error: 'Selecione um arquivo CSV ou XLSX.' }
  }

  // 1) Parse do arquivo.
  let linhas: MasterLinha[]
  try {
    const buf = Buffer.from(await file.arrayBuffer())
    const wb = XLSX.read(buf, { type: 'buffer' })
    const rows = escolherLinhas(wb)
    linhas = rows
      .map((r) => normalizarLinhaMaster(mapearLinhaMaster(r)))
      .filter((l): l is MasterLinha => l !== null)
  } catch (e) {
    return { error: `Falha ao ler o arquivo: ${(e as Error).message}` }
  }
  if (linhas.length === 0) {
    return {
      error:
        'Nenhum beneficiário encontrado. Confira se há colunas como Nome, CPF, Carteirinha ou Matrícula.',
    }
  }

  const supabase = await createClient()

  // 2) Carrega o master atual + identidades conhecidas (vidas/eventos).
  const [{ data: masterData }, { data: vidasData }] = await Promise.all([
    supabase.from('beneficiarios_master').select(COLS),
    supabase.from('beneficiario_vidas').select('carteirinha, cpf'),
  ])

  // eventos_utilizacao pode ultrapassar o teto de 1000 linhas por request.
  const eventosCart = new Set<string>()
  {
    const PAGE = 1000
    let from = 0
    for (;;) {
      const { data, error } = await supabase
        .from('eventos_utilizacao')
        .select('cod_usuario')
        .range(from, from + PAGE - 1)
      if (error || !data || data.length === 0) break
      for (const e of data as { cod_usuario: string | null }[]) {
        if (!vazio(e.cod_usuario)) eventosCart.add(String(e.cod_usuario).trim())
      }
      if (data.length < PAGE) break
      from += PAGE
    }
  }

  const master = (masterData ?? []) as MasterRow[]
  const qualidadeAntes = medirQualidade(master)

  // Índices para matching em cascata.
  const byCpf = new Map<string, MasterRow>()
  const byCarteirinha = new Map<string, MasterRow>()
  const byMatricula = new Map<string, MasterRow>()
  const byNome = new Map<string, MasterRow[]>()
  for (const r of master) {
    if (!vazio(r.cpf)) byCpf.set(r.cpf as string, r)
    if (!vazio(r.carteirinha)) byCarteirinha.set(r.carteirinha as string, r)
    if (!vazio(r.matricula)) byMatricula.set(r.matricula as string, r)
    if (!vazio(r.nome_norm)) {
      const arr = byNome.get(r.nome_norm as string) ?? []
      arr.push(r)
      byNome.set(r.nome_norm as string, arr)
    }
  }

  // Identidades já conhecidas no sistema (para sinalizar "não encontrados").
  const conhecidasCart = new Set<string>()
  const conhecidasCpf = new Set<string>()
  for (const v of (vidasData ?? []) as { carteirinha: string | null; cpf: string | null }[]) {
    if (!vazio(v.carteirinha)) conhecidasCart.add(String(v.carteirinha).trim())
    if (!vazio(v.cpf)) conhecidasCpf.add(String(v.cpf).replace(/\D/g, ''))
  }
  for (const c of eventosCart) conhecidasCart.add(c)

  // 3) Processa cada linha: match em cascata, merge ou insert.
  let atualizados = 0
  let novos = 0
  let naoEncontrados = 0
  let duplicidades = 0

  const vistos = new Set<string>() // identidades já processadas neste arquivo
  const paraInserir: ReturnType<typeof paraColunas>[] = []
  const paraAtualizar: { id: string; patch: Record<string, string | null> }[] = []

  const chaveIdentidade = (l: MasterLinha) =>
    l.cpf
      ? `cpf:${l.cpf}`
      : l.carteirinha
        ? `cart:${l.carteirinha}`
        : l.matricula
          ? `mat:${l.matricula}`
          : `nome:${l.nomeNorm}`

  for (const l of linhas) {
    const idk = chaveIdentidade(l)
    if (vistos.has(idk)) {
      duplicidades++
      continue
    }
    vistos.add(idk)

    // Cascata: CPF -> Carteirinha -> Matrícula -> Nome normalizado idêntico.
    let alvo: MasterRow | undefined
    if (l.cpf) alvo = byCpf.get(l.cpf)
    if (!alvo && l.carteirinha) alvo = byCarteirinha.get(l.carteirinha)
    if (!alvo && l.matricula) alvo = byMatricula.get(l.matricula)
    if (!alvo && l.nomeNorm) {
      const cand = byNome.get(l.nomeNorm)
      if (cand && cand.length === 1) alvo = cand[0] // só casa se único
    }

    if (alvo) {
      // Merge não-destrutivo: só preenche campos vazios/atualiza com novo valor.
      const nova = paraColunas(l)
      const patch: Record<string, string | null> = {}
      for (const [col, valor] of Object.entries(nova)) {
        if (!vazio(valor as string)) patch[col] = valor as string
      }
      if (Object.keys(patch).length > 0) {
        paraAtualizar.push({ id: alvo.id, patch })
      }
      atualizados++
    } else {
      paraInserir.push(paraColunas(l))
      novos++
      const cartKey = l.carteirinha ? l.carteirinha.trim() : ''
      const cpfDig = l.cpf ? l.cpf.replace(/\D/g, '') : ''
      const conhecido =
        (cartKey && conhecidasCart.has(cartKey)) ||
        (cpfDig && conhecidasCpf.has(cpfDig))
      if (!conhecido) naoEncontrados++
    }
  }

  // 4) Persiste a importação (para vincular origem nos registros).
  const { data: imp, error: impErr } = await supabase
    .from('cadastro_master_importacoes')
    .insert({
      arquivo_nome: file.name,
      total_linhas: linhas.length,
      atualizados,
      novos,
      nao_encontrados: naoEncontrados,
      duplicidades,
      qualidade_antes: qualidadeAntes,
    })
    .select('id')
    .single()

  if (impErr || !imp) {
    return { error: `Erro ao registrar importação: ${impErr?.message ?? 'desconhecido'}` }
  }

  // 5) Executa inserts (em lote) e updates (individuais).
  const CHUNK = 500
  for (let i = 0; i < paraInserir.length; i += CHUNK) {
    const lote = paraInserir
      .slice(i, i + CHUNK)
      .map((r) => ({ ...r, origem_importacao_id: imp.id }))
    const { error } = await supabase.from('beneficiarios_master').insert(lote)
    if (error) return { error: `Erro ao inserir novos: ${error.message}` }
  }
  for (const u of paraAtualizar) {
    const { error } = await supabase
      .from('beneficiarios_master')
      .update({ ...u.patch, origem_importacao_id: imp.id, updated_at: new Date().toISOString() })
      .eq('id', u.id)
    if (error) return { error: `Erro ao atualizar: ${error.message}` }
  }

  // 6) Qualidade "depois" a partir do master já atualizado.
  const { data: depoisData } = await supabase
    .from('beneficiarios_master')
    .select(COLS)
  const qualidadeDepois = medirQualidade((depoisData ?? []) as MasterRow[])

  await supabase
    .from('cadastro_master_importacoes')
    .update({ qualidade_depois: qualidadeDepois })
    .eq('id', imp.id)

  return {
    importacaoId: imp.id,
    arquivoNome: file.name,
    total: linhas.length,
    atualizados,
    novos,
    naoEncontrados,
    duplicidades,
    qualidadeAntes,
    qualidadeDepois,
  }
}
