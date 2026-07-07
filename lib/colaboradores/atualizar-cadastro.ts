// ===========================================================================
// Atualizar Cadastro (dentro de Beneficiários) — server-only
//
// Localiza beneficiários JÁ EXISTENTES na Base de Vidas oficial
// (beneficiario_vidas, competência ativa) a partir de um arquivo (ex.:
// MECSAS) e preenche CPF e/ou data de nascimento SOMENTE quando esses campos
// estiverem vazios no cadastro atual. Nunca cria beneficiário novo, nunca
// altera plano/empresa/carteirinha/vínculo. Idade é sempre um valor
// calculado a partir da data de nascimento, nunca uma coluna própria.
// ===========================================================================

import 'server-only'
import * as XLSX from 'xlsx'
import { normalizarNome } from '@/lib/people-analytics/rh'

export type CampoAtualizavel = 'cpf' | 'dataNascimento'

// Cadastro atual, tal como lido de beneficiario_vidas (competência ativa).
export type VidaAlvo = {
  carteirinha: string
  nome: string | null
  cpf: string | null
  data_nascimento: string | null
}

export type LinhaArquivo = {
  carteirinha: string | null
  cpf: string | null
  nome: string | null
  nomeNorm: string | null
  dataNascimento: string | null // já convertida para YYYY-MM-DD
}

export type CampoPreenchido = {
  campo: CampoAtualizavel
  valorAtual: string | null
  valorNovo: string
}

export type ItemAtualizado = {
  carteirinha: string
  nome: string | null
  campos: CampoPreenchido[]
}

export type ItemNaoEncontrado = {
  linha: number
  nome: string | null
  motivo: string
}

export type ItemConflito = {
  nomeNorm: string
  nome: string | null
  carteirinhas: string[]
}

export type PreviewAtualizarCadastro = {
  totalLinhasArquivo: number
  totalVidasCompetencia: number
  atualizacoes: ItemAtualizado[]
  semAlteracao: number
  naoEncontrados: ItemNaoEncontrado[]
  conflitos: ItemConflito[]
}

// ---------------------------------------------------------------------------
// Parsing do arquivo (XLSX ou CSV, detectando aba e linha de cabeçalho reais)
// ---------------------------------------------------------------------------

type CampoArquivo = 'carteirinha' | 'cpf' | 'nome' | 'dataNascimento'

const ALIASES: Record<CampoArquivo, string[]> = {
  carteirinha: [
    'carteiradeidentificacao',
    'carteiraidentificacao',
    'numerodacarteira',
    'numerocarteira',
    'carteirinha',
    'carteira',
    'cartao',
    'codusuario',
    'codigousuario',
    'matriculadobeneficiario',
    'matriculabeneficiario',
    'matricula',
    'codigo',
    'registro',
  ],
  cpf: ['cpf', 'cpfbeneficiario', 'nrcpf', 'documento'],
  nome: [
    'nomecompletodobeneficiario',
    'nomedofuncionario',
    'nomedocolaborador',
    'nomecompleto',
    'nomebeneficiario',
    'funcionario',
    'colaborador',
    'beneficiario',
    'segurado',
    'nome',
  ],
  dataNascimento: [
    'datadenascimento',
    'datanascimento',
    'datanasc',
    'dtnascimento',
    'dtnasc',
    'nascimento',
    'dn',
  ],
}

// Normaliza um cabeçalho para comparação: minúsculas, sem acentos/pontuação.
function normalizarCabecalho(v: unknown): string {
  return String(v ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

// Lê as linhas brutas (arrays de células) de cada aba do workbook, sem
// assumir qual linha é o cabeçalho — isso é decidido depois por pontuação.
function linhasBrutasPorAba(wb: XLSX.WorkBook): unknown[][][] {
  return wb.SheetNames.map((nome) =>
    XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nome], {
      header: 1,
      defval: '',
      raw: false,
    }),
  )
}

// Pontua uma linha bruta (array de células) por quantas células batem com
// algum alias conhecido — usada para achar a linha de cabeçalho real, já que
// exports reais (ex.: MECSAS) costumam trazer uma linha de índices numéricos
// antes do cabeçalho verdadeiro.
function pontuarComoCabecalho(linha: unknown[]): number {
  let pontos = 0
  for (const cel of linha) {
    const norm = normalizarCabecalho(cel)
    if (!norm) continue
    for (const campo of Object.keys(ALIASES) as CampoArquivo[]) {
      if (ALIASES[campo].includes(norm)) {
        pontos++
        break
      }
    }
  }
  return pontos
}

// Acha a melhor (aba, linha) candidata a cabeçalho dentre as primeiras 15
// linhas de cada aba do workbook.
function melhorCabecalho(wb: XLSX.WorkBook): {
  abaIndex: number
  linhaIndex: number
  pontuacao: number
} {
  const abas = linhasBrutasPorAba(wb)
  let melhor = { abaIndex: 0, linhaIndex: 0, pontuacao: -1 }
  abas.forEach((linhas, abaIndex) => {
    const limite = Math.min(linhas.length, 15)
    for (let linhaIndex = 0; linhaIndex < limite; linhaIndex++) {
      const pontuacao = pontuarComoCabecalho(linhas[linhaIndex])
      if (pontuacao > melhor.pontuacao) {
        melhor = { abaIndex, linhaIndex, pontuacao }
      }
    }
  })
  return melhor
}

// Converte uma data em vários formatos (incluindo AAAAMMDD do MECSAS) para
// ISO (yyyy-mm-dd), ou null quando não reconhecida/sentinela.
function converterData(v: unknown): string | null {
  const s = String(v ?? '').trim()
  if (!s) return null
  let m = s.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (m) {
    const [, y, mo, d] = m
    if (s === '00000000' || y === '0000' || s === '99991231') return null
    return `${y}-${mo}-${d}`
  }
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) {
    const [, y, mo, d] = m
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/)
  if (m) {
    let [, d, mo, y] = m
    if (y.length === 2) y = Number(y) > 40 ? `19${y}` : `20${y}`
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  return null
}

// Normaliza a carteirinha para o MESMO formato usado em beneficiario_vidas
// (ver normalizarCarteirinha em app/colaboradores/actions.ts — a Base de
// Vidas guarda o identificador de 16 dígitos, sem prefixo de operadora nem
// dígito verificador). Precisa continuar espelhando aquela função.
function normalizarCarteirinha(v: unknown): string {
  const d = String(v ?? '').replace(/\D/g, '')
  if (d.length === 20) return d.slice(3, 19)
  if (d.length === 19) return d.slice(3)
  if (d.length === 17) return d.slice(0, 16)
  return d
}

export type DiagnosticoArquivo = {
  abaEscolhida: string
  linhaCabecalhoEscolhida: number
  colunasDetectadas: Partial<Record<CampoArquivo, string>>
  totalLinhasLidas: number
}

export function lerArquivoCadastro(buf: Buffer): {
  linhas: LinhaArquivo[]
  diagnostico: DiagnosticoArquivo
} {
  const wb = XLSX.read(buf, { type: 'buffer' })
  const { abaIndex, linhaIndex } = melhorCabecalho(wb)
  const nomeAba = wb.SheetNames[abaIndex]
  const sheet = wb.Sheets[nomeAba]
  const todasLinhas = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    raw: false,
  })

  const cabecalhos = (todasLinhas[linhaIndex] ?? []) as unknown[]
  const idx: Partial<Record<CampoArquivo, number>> = {}
  const colunasDetectadas: Partial<Record<CampoArquivo, string>> = {}
  cabecalhos.forEach((h, i) => {
    const norm = normalizarCabecalho(h)
    if (!norm) return
    for (const campo of Object.keys(ALIASES) as CampoArquivo[]) {
      if (idx[campo] !== undefined) continue
      if (ALIASES[campo].includes(norm)) {
        idx[campo] = i
        colunasDetectadas[campo] = String(h)
      }
    }
  })

  const linhas: LinhaArquivo[] = []
  for (let i = linhaIndex + 1; i < todasLinhas.length; i++) {
    const cells = (todasLinhas[i] ?? []) as unknown[]
    if (cells.every((c) => String(c ?? '').trim() === '')) continue
    const pick = (campo: CampoArquivo): unknown =>
      idx[campo] !== undefined ? cells[idx[campo] as number] : undefined

    const carteirinha = idx.carteirinha !== undefined
      ? normalizarCarteirinha(pick('carteirinha')) || null
      : null
    const cpf = idx.cpf !== undefined
      ? String(pick('cpf') ?? '').replace(/\D/g, '') || null
      : null
    const nome = idx.nome !== undefined
      ? String(pick('nome') ?? '').trim() || null
      : null
    const dataNascimento = idx.dataNascimento !== undefined
      ? converterData(pick('dataNascimento'))
      : null

    if (!carteirinha && !cpf && !nome) continue
    linhas.push({
      carteirinha,
      cpf,
      nome,
      nomeNorm: nome ? normalizarNome(nome) : null,
      dataNascimento,
    })
  }

  return {
    linhas,
    diagnostico: {
      abaEscolhida: nomeAba,
      linhaCabecalhoEscolhida: linhaIndex + 1,
      colunasDetectadas,
      totalLinhasLidas: linhas.length,
    },
  }
}

// ---------------------------------------------------------------------------
// Matching + geração do preview (carteirinha -> CPF -> nome único)
// ---------------------------------------------------------------------------

function vazio(v: string | null | undefined): boolean {
  return v == null || v.trim() === ''
}

export function gerarPreviewAtualizarCadastro(
  linhasArquivo: LinhaArquivo[],
  vidas: VidaAlvo[],
): PreviewAtualizarCadastro {
  const byCarteirinha = new Map<string, VidaAlvo>()
  const byCpf = new Map<string, VidaAlvo>()
  const byNomeNorm = new Map<string, VidaAlvo[]>()
  for (const v of vidas) {
    byCarteirinha.set(v.carteirinha, v)
    const cpfDig = (v.cpf ?? '').replace(/\D/g, '')
    if (cpfDig) byCpf.set(cpfDig, v)
    if (v.nome) {
      const nn = normalizarNome(v.nome)
      const arr = byNomeNorm.get(nn) ?? []
      arr.push(v)
      byNomeNorm.set(nn, arr)
    }
  }

  const atualizacoes: ItemAtualizado[] = []
  const naoEncontrados: ItemNaoEncontrado[] = []
  const conflitosMap = new Map<string, ItemConflito>()
  let semAlteracao = 0
  const jaProcessados = new Set<VidaAlvo>()

  linhasArquivo.forEach((linha, i) => {
    let alvo: VidaAlvo | undefined
    if (linha.carteirinha) alvo = byCarteirinha.get(linha.carteirinha)
    if (!alvo && linha.cpf) alvo = byCpf.get(linha.cpf)
    if (!alvo && linha.nomeNorm) {
      const cand = byNomeNorm.get(linha.nomeNorm)
      if (cand && cand.length === 1) {
        alvo = cand[0]
      } else if (cand && cand.length > 1) {
        conflitosMap.set(linha.nomeNorm, {
          nomeNorm: linha.nomeNorm,
          nome: linha.nome,
          carteirinhas: cand.map((c) => c.carteirinha),
        })
        return
      }
    }

    if (!alvo) {
      naoEncontrados.push({
        linha: i + 1,
        nome: linha.nome,
        motivo:
          'Não encontrado na Base de Vidas por carteirinha, CPF nem nome — não será criado.',
      })
      return
    }
    // Mesma pessoa referenciada mais de uma vez no arquivo: processa só uma vez.
    if (jaProcessados.has(alvo)) return
    jaProcessados.add(alvo)

    const campos: CampoPreenchido[] = []
    if (vazio(alvo.cpf) && !vazio(linha.cpf)) {
      campos.push({ campo: 'cpf', valorAtual: alvo.cpf, valorNovo: linha.cpf as string })
    }
    if (vazio(alvo.data_nascimento) && !vazio(linha.dataNascimento)) {
      campos.push({
        campo: 'dataNascimento',
        valorAtual: alvo.data_nascimento,
        valorNovo: linha.dataNascimento as string,
      })
    }

    if (campos.length === 0) {
      semAlteracao++
      return
    }
    atualizacoes.push({ carteirinha: alvo.carteirinha, nome: alvo.nome, campos })
  })

  return {
    totalLinhasArquivo: linhasArquivo.length,
    totalVidasCompetencia: vidas.length,
    atualizacoes,
    semAlteracao,
    naoEncontrados,
    conflitos: [...conflitosMap.values()],
  }
}
