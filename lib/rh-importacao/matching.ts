// ===========================================================================
// Conferência RH — matching em cascata contra beneficiários existentes
// (server-safe, sem Supabase, sem escrita — apenas relatório)
//
// Cascata de prioridade: CPF (1) -> Carteirinha (2) -> Matrícula (3) ->
// Nome normalizado (4, só quando único). Uma linha vira "conflito" quando
// identificadores diferentes apontam para beneficiários diferentes, ou
// quando o nome bate com mais de um beneficiário e nenhum identificador
// forte resolveu antes.
// ===========================================================================

import { normalizarNome } from '@/lib/people-analytics/rh'
import type { LinhaRh } from './parse'

export type CampoMatch = 'cpf' | 'carteirinha' | 'matricula' | 'nome'

export type BeneficiarioResumo = {
  id: string
  carteirinha: string | null
  cpf: string | null
  matricula: string | null
  nome: string | null
}

export type ItemEncontrado = {
  linha: LinhaRh
  beneficiario: BeneficiarioResumo
  campoMatch: CampoMatch
}

export type ItemNaoEncontrado = {
  linha: LinhaRh
}

export type ItemConflito = {
  linha: LinhaRh
  candidatos: { campo: CampoMatch; beneficiario: BeneficiarioResumo }[]
  motivo: 'identificadores_divergentes' | 'nome_ambiguo'
}

export type RelatorioConferenciaRh = {
  total: number
  encontrados: ItemEncontrado[]
  naoEncontrados: ItemNaoEncontrado[]
  conflitos: ItemConflito[]
}

export type ConferenciaRhResult = {
  error?: string
  arquivoNome?: string
  relatorio?: RelatorioConferenciaRh
}

const PRIORIDADE: CampoMatch[] = ['cpf', 'carteirinha', 'matricula', 'nome']

export function conferirBeneficiarios(
  linhas: LinhaRh[],
  beneficiarios: BeneficiarioResumo[],
): RelatorioConferenciaRh {
  const byCpf = new Map<string, BeneficiarioResumo>()
  const byCarteirinha = new Map<string, BeneficiarioResumo>()
  const byMatricula = new Map<string, BeneficiarioResumo>()
  const byNomeNorm = new Map<string, BeneficiarioResumo[]>()

  for (const b of beneficiarios) {
    if (b.cpf) byCpf.set(b.cpf, b)
    if (b.carteirinha) byCarteirinha.set(b.carteirinha, b)
    if (b.matricula) byMatricula.set(b.matricula, b)
    if (b.nome) {
      const key = normalizarNome(b.nome)
      const arr = byNomeNorm.get(key) ?? []
      arr.push(b)
      byNomeNorm.set(key, arr)
    }
  }

  const encontrados: ItemEncontrado[] = []
  const naoEncontrados: ItemNaoEncontrado[] = []
  const conflitos: ItemConflito[] = []

  for (const linha of linhas) {
    const candidatos: { campo: CampoMatch; beneficiario: BeneficiarioResumo }[] = []

    if (linha.cpf) {
      const hit = byCpf.get(linha.cpf)
      if (hit) candidatos.push({ campo: 'cpf', beneficiario: hit })
    }
    if (linha.carteirinha) {
      const hit = byCarteirinha.get(linha.carteirinha)
      if (hit) candidatos.push({ campo: 'carteirinha', beneficiario: hit })
    }
    if (linha.matricula) {
      const hit = byMatricula.get(linha.matricula)
      if (hit) candidatos.push({ campo: 'matricula', beneficiario: hit })
    }

    // Nome só entra na disputa quando nenhum identificador forte já bateu —
    // evita marcar como conflito um match forte que "colide" com um nome
    // parecido de outra pessoa.
    let nomeAmbiguo = false
    if (candidatos.length === 0 && linha.nomeNorm) {
      const cand = byNomeNorm.get(linha.nomeNorm)
      if (cand && cand.length === 1) {
        candidatos.push({ campo: 'nome', beneficiario: cand[0] })
      } else if (cand && cand.length > 1) {
        nomeAmbiguo = true
      }
    }

    const idsDistintos = new Set(candidatos.map((c) => c.beneficiario.id))

    if (idsDistintos.size === 0) {
      if (nomeAmbiguo) {
        conflitos.push({ linha, candidatos: [], motivo: 'nome_ambiguo' })
      } else {
        naoEncontrados.push({ linha })
      }
      continue
    }

    if (idsDistintos.size === 1) {
      const melhor = [...candidatos].sort(
        (a, b) => PRIORIDADE.indexOf(a.campo) - PRIORIDADE.indexOf(b.campo),
      )[0]
      encontrados.push({ linha, beneficiario: melhor.beneficiario, campoMatch: melhor.campo })
      continue
    }

    // Identificadores diferentes da mesma linha apontam para pessoas diferentes.
    conflitos.push({ linha, candidatos, motivo: 'identificadores_divergentes' })
  }

  return { total: linhas.length, encontrados, naoEncontrados, conflitos }
}
