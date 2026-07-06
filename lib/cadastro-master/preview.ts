// ===========================================================================
// Cadastro Mestre — prévia de atualização de campos (server-safe)
//
// Gera o relatório de conferência ANTES de qualquer gravação: casa cada
// linha do arquivo contra o master (CPF -> Carteirinha -> Matrícula -> Nome
// normalizado idêntico), separando o que preencheria campos vazios do que
// diverge de um valor já existente. Não grava nada — só lê/compara em
// memória. A escrita real acontece em outro passo, depois de confirmação
// explícita do usuário.
// ===========================================================================

import type { MasterLinha, DiagnosticoPlanilha } from './parse'

export type MasterRowDB = {
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

// Somente os campos pedidos para esta rotina de atualização (não inclui
// nome/carteirinha/email/telefone/status/competencia — esses continuam
// só no fluxo normal do Cadastro Mestre).
export type CampoAtualizavel =
  | 'cpf'
  | 'sexo'
  | 'dataNascimento'
  | 'matricula'
  | 'empresa'
  | 'dataAdmissao'
  | 'dataAdesao'
  | 'plano'
  | 'tipo'

export type CampoMatch = 'cpf' | 'carteirinha' | 'matricula' | 'nome'

export const CAMPOS_ALVO: { chave: CampoAtualizavel; col: keyof MasterRowDB; label: string }[] = [
  { chave: 'cpf', col: 'cpf', label: 'CPF' },
  { chave: 'dataNascimento', col: 'data_nascimento', label: 'Data de nascimento' },
  { chave: 'sexo', col: 'sexo', label: 'Sexo' },
  { chave: 'matricula', col: 'matricula', label: 'Matrícula' },
  { chave: 'empresa', col: 'empresa', label: 'Empresa/filial' },
  { chave: 'dataAdmissao', col: 'data_admissao', label: 'Data de admissão' },
  { chave: 'dataAdesao', col: 'data_adesao', label: 'Data de adesão' },
  { chave: 'plano', col: 'plano', label: 'Plano' },
  { chave: 'tipo', col: 'tipo', label: 'Tipo (titular/dependente)' },
]

export const LABEL_CAMPO_ATUALIZAVEL: Record<CampoAtualizavel, string> = Object.fromEntries(
  CAMPOS_ALVO.map((c) => [c.chave, c.label]),
) as Record<CampoAtualizavel, string>

export type CampoPreenchido = { campo: CampoAtualizavel; valorNovo: string }
export type CampoDivergente = { campo: CampoAtualizavel; valorAtual: string; valorNovo: string }

export type ItemPreviewEncontrado = {
  linhaIndex: number
  linha: MasterLinha
  beneficiarioId: string
  beneficiarioNome: string | null
  campoMatch: CampoMatch
  preenchimentos: CampoPreenchido[]
  divergencias: CampoDivergente[]
}

export type ItemPreviewNaoEncontrado = {
  linhaIndex: number
  linha: MasterLinha
}

export type ItemPreviewConflito = {
  linhaIndex: number
  linha: MasterLinha
  motivo: 'identificadores_divergentes' | 'duplicidade_no_arquivo'
}

export type PreviewAtualizacao = {
  total: number
  encontrados: ItemPreviewEncontrado[]
  naoEncontrados: ItemPreviewNaoEncontrado[]
  conflitos: ItemPreviewConflito[]
}

export type PreverAtualizacaoResult = {
  error?: string
  arquivoNome?: string
  linhas?: MasterLinha[]
  preview?: PreviewAtualizacao
  diagnostico?: DiagnosticoPlanilha
}

export type ConfirmarAtualizacaoResult = {
  error?: string
  atualizados?: number
  novos?: number
  ignorados?: number
}

function vazio(v: string | null | undefined): boolean {
  return v == null || String(v).trim() === ''
}

// Identidade da linha dentro do próprio arquivo, para detectar duplicidade
// de upload (mesmo padrão do importarCadastroMaster existente).
function chaveIdentidade(l: MasterLinha): string {
  if (l.cpf) return `cpf:${l.cpf}`
  if (l.carteirinha) return `cart:${l.carteirinha}`
  if (l.matricula) return `mat:${l.matricula}`
  return `nome:${l.nomeNorm}`
}

const PRIORIDADE: CampoMatch[] = ['cpf', 'carteirinha', 'matricula', 'nome']

// Gera o relatório de conferência (nenhuma escrita — só leitura/comparação).
export function gerarPreview(
  linhas: MasterLinha[],
  master: MasterRowDB[],
): PreviewAtualizacao {
  const byCpf = new Map<string, MasterRowDB>()
  const byCarteirinha = new Map<string, MasterRowDB>()
  const byMatricula = new Map<string, MasterRowDB>()
  const byNomeNorm = new Map<string, MasterRowDB[]>()

  for (const r of master) {
    if (!vazio(r.cpf)) byCpf.set(r.cpf as string, r)
    if (!vazio(r.carteirinha)) byCarteirinha.set(r.carteirinha as string, r)
    if (!vazio(r.matricula)) byMatricula.set(r.matricula as string, r)
    if (!vazio(r.nome_norm)) {
      const arr = byNomeNorm.get(r.nome_norm as string) ?? []
      arr.push(r)
      byNomeNorm.set(r.nome_norm as string, arr)
    }
  }

  const vistos = new Set<string>()
  const encontrados: ItemPreviewEncontrado[] = []
  const naoEncontrados: ItemPreviewNaoEncontrado[] = []
  const conflitos: ItemPreviewConflito[] = []

  linhas.forEach((linha, linhaIndex) => {
    const idk = chaveIdentidade(linha)
    if (vistos.has(idk)) {
      conflitos.push({ linhaIndex, linha, motivo: 'duplicidade_no_arquivo' })
      return
    }
    vistos.add(idk)

    // Verifica os 3 identificadores fortes independentemente (não para no
    // primeiro), para conseguir detectar quando apontam para pessoas
    // diferentes — isso vira conflito, não um match "torcido".
    const candidatos: { campo: CampoMatch; row: MasterRowDB }[] = []
    if (linha.cpf) {
      const hit = byCpf.get(linha.cpf)
      if (hit) candidatos.push({ campo: 'cpf', row: hit })
    }
    if (linha.carteirinha) {
      const hit = byCarteirinha.get(linha.carteirinha)
      if (hit) candidatos.push({ campo: 'carteirinha', row: hit })
    }
    if (linha.matricula) {
      const hit = byMatricula.get(linha.matricula)
      if (hit) candidatos.push({ campo: 'matricula', row: hit })
    }

    let nomeAmbiguo = false
    if (candidatos.length === 0 && linha.nomeNorm) {
      const cand = byNomeNorm.get(linha.nomeNorm)
      if (cand && cand.length === 1) {
        candidatos.push({ campo: 'nome', row: cand[0] })
      } else if (cand && cand.length > 1) {
        nomeAmbiguo = true
      }
    }

    const idsDistintos = new Set(candidatos.map((c) => c.row.id))

    if (idsDistintos.size === 0) {
      if (nomeAmbiguo) {
        conflitos.push({ linhaIndex, linha, motivo: 'identificadores_divergentes' })
      } else {
        naoEncontrados.push({ linhaIndex, linha })
      }
      return
    }

    if (idsDistintos.size > 1) {
      conflitos.push({ linhaIndex, linha, motivo: 'identificadores_divergentes' })
      return
    }

    const melhor = [...candidatos].sort(
      (a, b) => PRIORIDADE.indexOf(a.campo) - PRIORIDADE.indexOf(b.campo),
    )[0]
    const alvo = melhor.row

    const preenchimentos: CampoPreenchido[] = []
    const divergencias: CampoDivergente[] = []
    for (const { chave, col } of CAMPOS_ALVO) {
      const novo = linha[chave]
      if (vazio(novo)) continue
      const atual = alvo[col] as string | null
      if (vazio(atual)) {
        preenchimentos.push({ campo: chave, valorNovo: novo as string })
      } else if (String(atual).trim() !== String(novo).trim()) {
        divergencias.push({ campo: chave, valorAtual: atual as string, valorNovo: novo as string })
      }
    }

    encontrados.push({
      linhaIndex,
      linha,
      beneficiarioId: alvo.id,
      beneficiarioNome: alvo.nome,
      campoMatch: melhor.campo,
      preenchimentos,
      divergencias,
    })
  })

  return { total: linhas.length, encontrados, naoEncontrados, conflitos }
}

// Converte uma MasterLinha completa em colunas do banco (para INSERT de
// "não encontrados" — mesmo formato usado pelo Cadastro Mestre existente).
export function linhaParaColunas(l: MasterLinha) {
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

export type QualidadeCampoAlvo = { chave: CampoAtualizavel; label: string; preenchidos: number; pct: number }
export type QualidadeSnapshotAlvo = { total: number; campos: QualidadeCampoAlvo[]; mediaGeral: number }

// Mede a completude só dos campos desta rotina (CAMPOS_ALVO), para o
// antes/depois registrado na auditoria da atualização.
export function medirQualidadeAlvo(rows: MasterRowDB[]): QualidadeSnapshotAlvo {
  const total = rows.length
  const campos = CAMPOS_ALVO.map(({ chave, col, label }) => {
    const preenchidos = rows.filter((r) => !vazio(r[col] as string | null)).length
    return { chave, label, preenchidos, pct: total ? (preenchidos / total) * 100 : 0 }
  })
  const mediaGeral = campos.length ? campos.reduce((s, c) => s + c.pct, 0) / campos.length : 0
  return { total, campos, mediaGeral }
}

// Monta os patches de UPDATE (preenchimentos sempre + divergências só as
// aceitas explicitamente pelo usuário) e a lista de INSERTs para "não
// encontrados". Não grava nada — só monta a estrutura para quem chamar gravar.
export function montarPatches(
  preview: PreviewAtualizacao,
  divergenciasAceitas: Record<number, CampoAtualizavel[]>,
): {
  atualizacoes: { id: string; patch: Record<string, string> }[]
  novos: ReturnType<typeof linhaParaColunas>[]
} {
  const colByChave = Object.fromEntries(
    CAMPOS_ALVO.map((c) => [c.chave, c.col as string]),
  ) as Record<CampoAtualizavel, string>

  const atualizacoes: { id: string; patch: Record<string, string> }[] = []
  for (const item of preview.encontrados) {
    const patch: Record<string, string> = {}
    for (const p of item.preenchimentos) patch[colByChave[p.campo]] = p.valorNovo
    const aceitas = divergenciasAceitas[item.linhaIndex] ?? []
    for (const d of item.divergencias) {
      if (aceitas.includes(d.campo)) patch[colByChave[d.campo]] = d.valorNovo
    }
    if (Object.keys(patch).length > 0) {
      atualizacoes.push({ id: item.beneficiarioId, patch })
    }
  }

  const novos = preview.naoEncontrados.map((n) => linhaParaColunas(n.linha))

  return { atualizacoes, novos }
}
