// ===========================================================================
// Cadastro Mestre — leitura indexada para uso nas telas (server-only)
//
// Carrega beneficiarios_master e expõe índices por carteirinha, CPF e nome
// normalizado, além de um resolvedor em cascata. É a fonte cadastral de MAIOR
// precedência: master -> beneficiario_vidas -> eventos_utilizacao.
// ===========================================================================

import 'server-only'
import { createClient } from '@/lib/supabase/server'

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
  byNomeNorm: Map<string, MasterCadastro[]>
  // Registros do master SEM carteirinha (candidatos a ampliar a base via
  // chave sintética quando não casarem por CPF/nome com uma vida existente).
  semCarteirinha: MasterCadastro[]
  // Resolve o cadastro mestre aplicável, em cascata carteirinha -> cpf -> nome.
  resolve: (args: {
    carteirinha?: string | null
    cpf?: string | null
    nomeNorm?: string | null
  }) => MasterCadastro | undefined
}

function norm(v: string | null): string | null {
  if (v == null) return null
  const s = v.trim()
  return s ? s : null
}
function digits(v: string | null): string | null {
  if (v == null) return null
  const d = v.replace(/\D/g, '')
  return d ? d : null
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
  const byNomeNorm = new Map<string, MasterCadastro[]>()
  const semCarteirinha: MasterCadastro[] = []

  for (const m of list) {
    if (m.carteirinha) byCarteirinha.set(m.carteirinha, m)
    else semCarteirinha.push(m)
    const cpfKey = digits(m.cpf)
    if (cpfKey && !byCpf.has(cpfKey)) byCpf.set(cpfKey, m)
    if (m.nomeNorm) {
      const arr = byNomeNorm.get(m.nomeNorm) ?? []
      arr.push(m)
      byNomeNorm.set(m.nomeNorm, arr)
    }
  }

  const resolve: MasterIndex['resolve'] = ({ carteirinha, cpf, nomeNorm }) => {
    const cart = norm(carteirinha ?? null)
    if (cart) {
      const hit = byCarteirinha.get(cart)
      if (hit) return hit
    }
    const cpfKey = digits(cpf ?? null)
    if (cpfKey) {
      const hit = byCpf.get(cpfKey)
      if (hit) return hit
    }
    const nn = norm(nomeNorm ?? null)
    if (nn) {
      const cand = byNomeNorm.get(nn)
      if (cand && cand.length === 1) return cand[0] // só casa quando único
    }
    return undefined
  }

  return {
    list,
    temMaster: list.length > 0,
    byCarteirinha,
    byCpf,
    byNomeNorm,
    semCarteirinha,
    resolve,
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
    nomesNorm?: Set<string>
  },
): MasterCadastro[] {
  const { carteirinhas, cpfs, nomesNorm } = conhecidos
  const novos: MasterCadastro[] = []
  for (const m of index.list) {
    const cart = m.carteirinha
    const cpfKey = digits(m.cpf)
    const nn = m.nomeNorm
    const jaExiste =
      (cart != null && carteirinhas?.has(cart)) ||
      (cpfKey != null && cpfs?.has(cpfKey)) ||
      (nn != null && nomesNorm?.has(nn))
    if (!jaExiste) novos.push(m)
  }
  return novos
}
