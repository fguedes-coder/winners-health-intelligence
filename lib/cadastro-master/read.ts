// ===========================================================================
// Cadastro Mestre — leitura indexada para uso nas telas (server-only)
//
// Carrega beneficiarios_master e expõe índices por carteirinha, CPF e nome
// normalizado, além de um resolvedor em cascata. É a fonte cadastral de MAIOR
// precedência: master -> beneficiario_vidas -> eventos_utilizacao.
// ===========================================================================

import 'server-only'
import { createClient } from '@/lib/supabase/server'
import {
  normalizarCpf,
  normalizarCarteirinha,
  normalizarMatricula,
  type IdentidadeNormalizada,
} from '@/lib/beneficiario/identity'

type SupabaseServer = Awaited<ReturnType<typeof createClient>>

export type MasterCadastro = {
  id: string
  carteirinha: string | null
  matricula: string | null
  cpf: string | null
  nome: string | null
  nomeNorm: string | null
  tipo: string | null
  sexo: string | null
  dataNascimento: string | null
  plano: string | null
  empresa: string | null
  dataAdesao: string | null
  dataAdmissao: string | null
  email: string | null
  telefone: string | null
  status: string | null
}

export type MasterIndex = {
  list: MasterCadastro[]
  temMaster: boolean
  byCarteirinha: Map<string, MasterCadastro>
  byCpf: Map<string, MasterCadastro>
  byMatricula: Map<string, MasterCadastro>
  byNomeNorm: Map<string, MasterCadastro[]>
  semCarteirinha: MasterCadastro[]
  // Resolve o cadastro mestre: CPF → carteirinha → matrícula → nome.
  resolve: (args: {
    carteirinha?: string | null
    cpf?: string | null
    matricula?: string | null
    nomeNorm?: string | null
  }) => MasterCadastro | undefined
  identidadeDe: (m: MasterCadastro) => IdentidadeNormalizada
}

function identidadeDe(m: MasterCadastro): IdentidadeNormalizada {
  return {
    cpf: normalizarCpf(m.cpf),
    carteirinha: m.carteirinha ? normalizarCarteirinha(m.carteirinha) : null,
    matricula: normalizarMatricula(m.matricula),
    nomeNorm: m.nomeNorm,
  }
}

function norm(v: string | null): string | null {
  if (v == null) return null
  const s = v.trim()
  return s ? s : null
}

type MasterRowDB = {
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
}

const COLS =
  'id, carteirinha, matricula, cpf, nome, nome_norm, tipo, sexo, data_nascimento, plano, empresa, data_adesao, data_admissao, email, telefone, status'

// Carrega o master (paginado) e monta os índices. Se a tabela não existir ou
// estiver vazia, retorna um índice vazio (temMaster=false) sem quebrar as telas.
export async function loadMasterIndex(
  supabase?: SupabaseServer,
): Promise<MasterIndex> {
  const sb = supabase ?? (await createClient())

  const list: MasterCadastro[] = []
  const PAGE = 1000
  let from = 0
  for (;;) {
    const { data, error } = await sb
      .from('beneficiarios_master')
      .select(COLS)
      .range(from, from + PAGE - 1)
    if (error || !data || data.length === 0) break
    for (const r of data as MasterRowDB[]) {
      list.push({
        id: r.id,
        carteirinha: norm(r.carteirinha),
        matricula: norm(r.matricula),
        cpf: norm(r.cpf),
        nome: norm(r.nome),
        nomeNorm: norm(r.nome_norm),
        tipo: norm(r.tipo),
        sexo: norm(r.sexo),
        dataNascimento: norm(r.data_nascimento),
        plano: norm(r.plano),
        empresa: norm(r.empresa),
        dataAdesao: norm(r.data_adesao),
        dataAdmissao: norm(r.data_admissao),
        email: norm(r.email),
        telefone: norm(r.telefone),
        status: norm(r.status),
      })
    }
    if (data.length < PAGE) break
    from += PAGE
  }

  const byCarteirinha = new Map<string, MasterCadastro>()
  const byCpf = new Map<string, MasterCadastro>()
  const byMatricula = new Map<string, MasterCadastro>()
  const byNomeNorm = new Map<string, MasterCadastro[]>()
  const semCarteirinha: MasterCadastro[] = []

  for (const m of list) {
    const id = identidadeDe(m)
    if (id.carteirinha) byCarteirinha.set(id.carteirinha, m)
    else semCarteirinha.push(m)
    if (id.cpf && !byCpf.has(id.cpf)) byCpf.set(id.cpf, m)
    if (id.matricula && !byMatricula.has(id.matricula)) {
      byMatricula.set(id.matricula, m)
    }
    if (m.nomeNorm) {
      const arr = byNomeNorm.get(m.nomeNorm) ?? []
      arr.push(m)
      byNomeNorm.set(m.nomeNorm, arr)
    }
  }

  const resolve: MasterIndex['resolve'] = ({
    carteirinha,
    cpf,
    matricula,
    nomeNorm,
  }) => {
    const cartNorm = carteirinha ? normalizarCarteirinha(carteirinha) : null
    if (cartNorm) {
      const hit = byCarteirinha.get(cartNorm)
      if (hit) return hit
    }
    const cpfKey = normalizarCpf(cpf)
    if (cpfKey) {
      const hit = byCpf.get(cpfKey)
      if (hit) return hit
    }
    const matKey = normalizarMatricula(matricula)
    if (matKey) {
      const hit = byMatricula.get(matKey)
      if (hit) return hit
    }
    const nn = norm(nomeNorm ?? null)
    if (nn) {
      const cand = byNomeNorm.get(nn)
      if (cand && cand.length === 1) return cand[0]
    }
    return undefined
  }

  return {
    list,
    temMaster: list.length > 0,
    byCarteirinha,
    byCpf,
    byMatricula,
    byNomeNorm,
    semCarteirinha,
    resolve,
    identidadeDe,
  }
}
// Retorna os registros do master que NÃO estão representados na população real
// (base de vidas + eventos), casando por carteirinha, CPF ou nome normalizado.
// Esses são os únicos que devem virar linhas NOVAS nas telas — os demais apenas
// enriquecem a linha existente (via resolve). Evita nomes duplicados quando a
// carteirinha do master difere da usada em vidas/eventos, mas o CPF/nome casa.
export function masterNaoRepresentados(
  index: MasterIndex,
  conhecidos: {
    carteirinhas?: Set<string>
    cpfs?: Set<string>
    matriculas?: Set<string>
    nomesNorm?: Set<string>
  },
): MasterCadastro[] {
  const { carteirinhas, cpfs, matriculas, nomesNorm } = conhecidos
  const novos: MasterCadastro[] = []
  for (const m of index.list) {
    const id = index.identidadeDe(m)
    const jaExiste =
      (id.carteirinha != null && carteirinhas?.has(id.carteirinha)) ||
      (id.cpf != null && cpfs?.has(id.cpf)) ||
      (id.matricula != null && matriculas?.has(id.matricula)) ||
      (id.nomeNorm != null && nomesNorm?.has(id.nomeNorm))
    if (!jaExiste) novos.push(m)
  }
  return novos
}
