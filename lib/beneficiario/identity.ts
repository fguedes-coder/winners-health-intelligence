// ===========================================================================
// Identidade do beneficiário — normalização e matching unificados
//
// Módulo puro (sem Supabase). Usado na leitura (getColaboradores) e na
// importação do Cadastro Mestre. Ordem de matching:
//   CPF → carteirinha normalizada → matrícula → nome normalizado
// ===========================================================================

import { normalizarNome } from '@/lib/people-analytics/rh'

export { normalizarNome }

/** CPF somente dígitos; null se vazio. */
export function normalizarCpf(valor: string | null | undefined): string | null {
  if (valor == null) return null
  const d = String(valor).replace(/\D/g, '')
  return d ? d : null
}

/**
 * Normaliza carteirinha para o mesmo formato de eventos_utilizacao.cod_usuario.
 * Cartão ANS 20 dígitos = 3 (operadora) + 16 (identificador) + 1 (DV).
 */
export function normalizarCarteirinha(valor: string | null | undefined): string {
  if (valor == null) return ''
  const d = String(valor).replace(/\D/g, '')
  if (!d) return ''
  if (d.length === 20) return d.slice(3, 19)
  if (d.length === 19) return d.slice(3)
  if (d.length === 17) return d.slice(0, 16)
  return d
}

/** Matrícula trimada, sem espaços internos, maiúscula. */
export function normalizarMatricula(
  valor: string | null | undefined,
): string | null {
  if (valor == null) return null
  const s = String(valor).trim()
  if (!s) return null
  return s.replace(/\s+/g, '').toUpperCase()
}

export type IdentidadeCampos = {
  cpf?: string | null
  carteirinha?: string | null
  matricula?: string | null
  nome?: string | null
  nomeNorm?: string | null
}

export type IdentidadeNormalizada = {
  cpf: string | null
  carteirinha: string | null
  matricula: string | null
  nomeNorm: string | null
}

/** Normaliza os quatro campos de identificação. */
export function normalizarIdentidade(
  campos: IdentidadeCampos,
): IdentidadeNormalizada {
  const cpf = normalizarCpf(campos.cpf)
  const cartRaw = campos.carteirinha?.trim() ?? ''
  const carteirinha = cartRaw ? normalizarCarteirinha(cartRaw) : null
  const matricula = normalizarMatricula(campos.matricula)
  const nomeNorm =
    campos.nomeNorm ??
    (campos.nome ? normalizarNome(campos.nome) : null) ??
    null
  return { cpf, carteirinha, matricula, nomeNorm }
}

/** Chave estável para deduplicar linhas dentro do mesmo arquivo importado. */
export function chaveIdentidadeArquivo(id: IdentidadeNormalizada): string | null {
  if (id.cpf) return `cpf:${id.cpf}`
  if (id.carteirinha) return `cart:${id.carteirinha}`
  if (id.matricula) return `mat:${id.matricula}`
  if (id.nomeNorm) return `nome:${id.nomeNorm}`
  return null
}

export type ResolverIdentidadeArgs = {
  cpf?: string | null
  carteirinha?: string | null
  matricula?: string | null
  nomeNorm?: string | null
}

/** Índice em memória para resolver identidade na ordem da cascata. */
export type IndiceIdentidade<T> = {
  byCpf: Map<string, T>
  byCarteirinha: Map<string, T>
  byMatricula: Map<string, T>
  byNomeNorm: Map<string, T[]>
  resolve: (args: ResolverIdentidadeArgs) => T | undefined
}

export function criarIndiceIdentidade<T>(
  items: T[],
  extrair: (item: T) => IdentidadeNormalizada,
): IndiceIdentidade<T> {
  const byCpf = new Map<string, T>()
  const byCarteirinha = new Map<string, T>()
  const byMatricula = new Map<string, T>()
  const byNomeNorm = new Map<string, T[]>()

  for (const item of items) {
    const id = extrair(item)
    if (id.cpf && !byCpf.has(id.cpf)) byCpf.set(id.cpf, item)
    if (id.carteirinha && !byCarteirinha.has(id.carteirinha)) {
      byCarteirinha.set(id.carteirinha, item)
    }
    if (id.matricula && !byMatricula.has(id.matricula)) {
      byMatricula.set(id.matricula, item)
    }
    if (id.nomeNorm) {
      const arr = byNomeNorm.get(id.nomeNorm) ?? []
      arr.push(item)
      byNomeNorm.set(id.nomeNorm, arr)
    }
  }

  const resolve = (args: ResolverIdentidadeArgs): T | undefined => {
    const id = normalizarIdentidade({
      cpf: args.cpf,
      carteirinha: args.carteirinha,
      matricula: args.matricula,
      nomeNorm: args.nomeNorm,
    })
    if (id.cpf) {
      const hit = byCpf.get(id.cpf)
      if (hit) return hit
    }
    if (id.carteirinha) {
      const hit = byCarteirinha.get(id.carteirinha)
      if (hit) return hit
    }
    if (id.matricula) {
      const hit = byMatricula.get(id.matricula)
      if (hit) return hit
    }
    if (id.nomeNorm) {
      const cand = byNomeNorm.get(id.nomeNorm)
      if (cand && cand.length === 1) return cand[0]
    }
    return undefined
  }

  return { byCpf, byCarteirinha, byMatricula, byNomeNorm, resolve }
}

type SlotUnificado = {
  id: string
  cpf: string | null
  matricula: string | null
  nomeNorm: string | null
  /** Carteirinha preferida para exibição (ex.: da base de vidas). */
  carteirinhaCanonica: string | null
  /** Todas as variantes de carteirinha observadas. */
  variantesCart: Set<string>
  temVida: boolean
  masterId: string | null
}

let seqUnificador = 0

/**
 * Agrupa vidas, eventos e master pela mesma identidade (somente leitura).
 * Não altera o banco — apenas produz um mapa slot → dados agregados.
 */
export class UnificadorIdentidade {
  private slots = new Map<string, SlotUnificado>()
  private cpfTo = new Map<string, string>()
  private cartTo = new Map<string, string>()
  private matTo = new Map<string, string>()
  private nomeTo = new Map<string, string>()
  /** Nomes compartilhados por mais de uma pessoa: nunca fundem sozinhos. */
  private nomesAmbiguos = new Set<string>()

  private criarSlot(partial: Partial<SlotUnificado>): string {
    const id = `slot:${++seqUnificador}`
    const slot: SlotUnificado = {
      id,
      cpf: partial.cpf ?? null,
      matricula: partial.matricula ?? null,
      nomeNorm: partial.nomeNorm ?? null,
      carteirinhaCanonica: partial.carteirinhaCanonica ?? null,
      variantesCart: partial.variantesCart ?? new Set(),
      temVida: partial.temVida ?? false,
      masterId: partial.masterId ?? null,
    }
    this.slots.set(id, slot)
    return id
  }

  private indexarSlot(slotId: string, slot: SlotUnificado) {
    if (slot.cpf && !this.cpfTo.has(slot.cpf)) this.cpfTo.set(slot.cpf, slotId)
    for (const v of slot.variantesCart) {
      const n = normalizarCarteirinha(v)
      if (n && !this.cartTo.has(n)) this.cartTo.set(n, slotId)
    }
    if (slot.carteirinhaCanonica) {
      const n = normalizarCarteirinha(slot.carteirinhaCanonica)
      if (n && !this.cartTo.has(n)) this.cartTo.set(n, slotId)
    }
    if (slot.matricula && !this.matTo.has(slot.matricula)) {
      this.matTo.set(slot.matricula, slotId)
    }
    if (slot.nomeNorm && !this.nomeTo.has(slot.nomeNorm)) {
      this.nomeTo.set(slot.nomeNorm, slotId)
    }
  }

  /**
   * Identificadores fortes divergentes indicam pessoas distintas (homônimos):
   * CPF, matrícula ou carteirinha não nulos e diferentes nos dois lados.
   */
  private conflitaIdentidadeForte(
    id: IdentidadeNormalizada,
    slot: SlotUnificado,
  ): boolean {
    if (id.cpf && slot.cpf && id.cpf !== slot.cpf) return true
    if (id.matricula && slot.matricula && id.matricula !== slot.matricula) {
      return true
    }
    if (id.carteirinha) {
      const carts = new Set<string>()
      for (const v of slot.variantesCart) {
        const n = normalizarCarteirinha(v)
        if (n) carts.add(n)
      }
      if (
        slot.carteirinhaCanonica &&
        !slot.carteirinhaCanonica.startsWith('master:')
      ) {
        const n = normalizarCarteirinha(slot.carteirinhaCanonica)
        if (n) carts.add(n)
      }
      if (carts.size > 0 && !carts.has(id.carteirinha)) return true
    }
    return false
  }

  private encontrarSlots(id: IdentidadeNormalizada): Set<string> {
    const found = new Set<string>()
    if (id.cpf && this.cpfTo.has(id.cpf)) found.add(this.cpfTo.get(id.cpf)!)
    if (id.carteirinha && this.cartTo.has(id.carteirinha)) {
      found.add(this.cartTo.get(id.carteirinha)!)
    }
    if (id.matricula && this.matTo.has(id.matricula)) {
      found.add(this.matTo.get(id.matricula)!)
    }
    // Nome só funde quando não é ambíguo e não há identificador forte
    // conflitante — evita associar dados de saúde de homônimos.
    if (id.nomeNorm && !this.nomesAmbiguos.has(id.nomeNorm)) {
      const porNome = this.nomeTo.get(id.nomeNorm)
      if (porNome) {
        const slot = this.slots.get(porNome)
        if (slot && !this.conflitaIdentidadeForte(id, slot)) {
          found.add(porNome)
        }
      }
    }
    return found
  }

  private mesclarSlots(alvoId: string, origemId: string) {
    if (alvoId === origemId) return
    const alvo = this.slots.get(alvoId)
    const origem = this.slots.get(origemId)
    if (!alvo || !origem) return

    if (!alvo.cpf && origem.cpf) alvo.cpf = origem.cpf
    if (!alvo.matricula && origem.matricula) alvo.matricula = origem.matricula
    if (!alvo.nomeNorm && origem.nomeNorm) alvo.nomeNorm = origem.nomeNorm
    if (!alvo.masterId && origem.masterId) alvo.masterId = origem.masterId
    alvo.temVida = alvo.temVida || origem.temVida
    for (const v of origem.variantesCart) alvo.variantesCart.add(v)
    if (!alvo.carteirinhaCanonica && origem.carteirinhaCanonica) {
      alvo.carteirinhaCanonica = origem.carteirinhaCanonica
    } else if (
      origem.temVida &&
      origem.carteirinhaCanonica &&
      !alvo.temVida
    ) {
      alvo.carteirinhaCanonica = origem.carteirinhaCanonica
      alvo.temVida = true
    }

    this.slots.delete(origemId)
    if (origem.cpf && this.cpfTo.get(origem.cpf) === origemId) {
      this.cpfTo.set(origem.cpf, alvoId)
    }
    for (const v of origem.variantesCart) {
      const n = normalizarCarteirinha(v)
      if (n && this.cartTo.get(n) === origemId) this.cartTo.set(n, alvoId)
    }
    if (origem.matricula && this.matTo.get(origem.matricula) === origemId) {
      this.matTo.set(origem.matricula, alvoId)
    }
    if (origem.nomeNorm && this.nomeTo.get(origem.nomeNorm) === origemId) {
      this.nomeTo.set(origem.nomeNorm, alvoId)
    }
  }

  /** Registra ou funde com slot existente. Retorna id do slot unificado. */
  registrar(
    campos: IdentidadeCampos,
    opts?: { temVida?: boolean; masterId?: string; preferCarteirinha?: string },
  ): string {
    const id = normalizarIdentidade(campos)
    const variantes = new Set<string>()
    if (campos.carteirinha?.trim()) variantes.add(campos.carteirinha.trim())
    if (id.carteirinha) variantes.add(id.carteirinha)
    if (opts?.preferCarteirinha?.trim()) {
      variantes.add(opts.preferCarteirinha.trim())
    }

    const matches = this.encontrarSlots(id)
    let slotId: string

    if (matches.size === 0) {
      const canon =
        opts?.preferCarteirinha?.trim() ||
        id.carteirinha ||
        (opts?.masterId ? `master:${opts.masterId}` : null)
      slotId = this.criarSlot({
        cpf: id.cpf,
        matricula: id.matricula,
        nomeNorm: id.nomeNorm,
        carteirinhaCanonica: canon,
        variantesCart: variantes,
        temVida: opts?.temVida ?? false,
        masterId: opts?.masterId ?? null,
      })
    } else {
      slotId = [...matches][0]
      for (const other of [...matches].slice(1)) {
        this.mesclarSlots(slotId, other)
      }
      const slot = this.slots.get(slotId)!
      // Preenche apenas quando vazio: sobrescrever CPF/matrícula/nome do slot
      // mascararia conflito de identidade entre pessoas distintas.
      if (id.cpf && !slot.cpf) slot.cpf = id.cpf
      if (id.matricula && !slot.matricula) slot.matricula = id.matricula
      if (id.nomeNorm && !slot.nomeNorm) slot.nomeNorm = id.nomeNorm
      if (opts?.masterId) slot.masterId = opts.masterId
      if (opts?.temVida) {
        slot.temVida = true
        if (opts.preferCarteirinha?.trim()) {
          slot.carteirinhaCanonica = normalizarCarteirinha(
            opts.preferCarteirinha.trim(),
          )
        }
      }
      for (const v of variantes) slot.variantesCart.add(v)
      if (!slot.carteirinhaCanonica && id.carteirinha) {
        slot.carteirinhaCanonica = id.carteirinha
      }
    }

    // Nome já apontando para OUTRO slot = duas pessoas com o mesmo nome.
    // Marca como ambíguo para que nunca mais funda sozinho.
    if (id.nomeNorm) {
      const existente = this.nomeTo.get(id.nomeNorm)
      if (existente && existente !== slotId) {
        this.nomesAmbiguos.add(id.nomeNorm)
      }
    }

    this.indexarSlot(slotId, this.slots.get(slotId)!)
    return slotId
  }

  /** Carteirinha canônica para exibição/agregação (1 linha por pessoa). */
  getCarteirinhaCanonica(slotId: string): string {
    const slot = this.slots.get(slotId)
    if (!slot) return slotId
    if (slot.carteirinhaCanonica) return slot.carteirinhaCanonica
    if (slot.masterId) return `master:${slot.masterId}`
    const first = [...slot.variantesCart][0]
    return first ? normalizarCarteirinha(first) : slotId
  }

  getSlot(slotId: string): SlotUnificado | undefined {
    return this.slots.get(slotId)
  }

  todosSlots(): Iterable<[string, SlotUnificado]> {
    return this.slots.entries()
  }
}
