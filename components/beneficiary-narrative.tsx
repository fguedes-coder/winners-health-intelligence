'use client'

import { useState } from 'react'
import { Sparkles, Loader2, AlertCircle, RefreshCw, ShieldAlert } from 'lucide-react'
import type { PanoramaBeneficiario } from '@/lib/beneficiary-panorama'
import {
  montarPayloadBeneficiario,
  type ClassificacaoRiscoFuturo,
  type NivelRiscoFuturo,
} from '@/lib/beneficiary-narrative'

type Fonte = 'ia' | 'deterministica'

// Estilo semântico de cada nível de Risco Assistencial Futuro.
const RISCO_FUTURO_ESTILO: Record<
  NivelRiscoFuturo,
  { cor: string; rotulo: string }
> = {
  Baixo: { cor: 'oklch(0.7 0.15 152)', rotulo: 'Baixo' },
  Moderado: { cor: 'oklch(0.8 0.15 85)', rotulo: 'Moderado' },
  Alto: { cor: 'oklch(0.72 0.17 52)', rotulo: 'Alto' },
  Crítico: { cor: 'oklch(0.62 0.22 25)', rotulo: 'Crítico' },
}

// Narrativa Assistencial contextual gerada pelo Winners Decide IA a partir do
// Panorama já carregado. O payload é montado no cliente (sempre anonimizado) e
// enviado à rota de IA, que interpreta a jornada de utilização do beneficiário.
export function BeneficiaryNarrative({ p }: { p: PanoramaBeneficiario }) {
  const [texto, setTexto] = useState<string | null>(null)
  const [fonte, setFonte] = useState<Fonte | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [classificacao, setClassificacao] =
    useState<ClassificacaoRiscoFuturo | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const semDados = p.kpis.eventos === 0

  async function gerar() {
    setCarregando(true)
    setErro(null)
    try {
      const payload = montarPayloadBeneficiario(p)
      // Fonte única: consome a classificação oficial anexada ao payload.
      setClassificacao(payload.risco_assistencial_futuro)
      const res = await fetch('/api/winners-decide/beneficiario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload }),
      })
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as {
          error?: string
        } | null
        throw new Error(j?.error ?? 'Falha ao gerar a narrativa.')
      }
      const j = (await res.json()) as {
        texto: string
        fonte: Fonte
        aviso?: string
      }
      setTexto(j.texto)
      setFonte(j.fonte)
      setAviso(j.aviso ?? null)
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setCarregando(false)
    }
  }

  return (
    <section className="rounded-xl border border-primary/30 bg-primary/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Sparkles className="size-4 text-primary" />
          Narrativa Assistencial (Winners Decide IA)
        </div>
        {texto !== null && (
          <button
            type="button"
            onClick={gerar}
            disabled={carregando}
            className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-border px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-60"
            title="Gerar novamente"
          >
            <RefreshCw className={`size-3 ${carregando ? 'animate-spin' : ''}`} />
            Regenerar
          </button>
        )}
      </div>

      <p className="mt-1 text-xs leading-relaxed text-muted-foreground text-pretty">
        Leitura contextual da jornada de utilização: o que aconteceu, o que gerou
        custo, continuidade e risco de recorrência. Não realiza diagnóstico
        médico.
      </p>

      {/* Estado inicial: botão para gerar */}
      {texto === null && !carregando && (
        <div className="mt-3">
          <button
            type="button"
            onClick={gerar}
            disabled={semDados}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Sparkles className="size-4" />
            Gerar narrativa
          </button>
          {semDados && (
            <p className="mt-2 text-xs text-muted-foreground">
              Sem utilização no recorte selecionado para analisar.
            </p>
          )}
        </div>
      )}

      {/* Carregando */}
      {carregando && texto === null && (
        <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin text-primary" />
          Analisando a jornada do beneficiário...
        </div>
      )}

      {/* Erro */}
      {erro && (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
          <span>{erro}</span>
        </div>
      )}

      {/* Resultado */}
      {texto !== null && (
        <div className="mt-3">
          {aviso && (
            <div className="mb-3 rounded-md border border-border bg-muted/40 px-3 py-1.5 text-[11px] text-muted-foreground">
              {aviso}
            </div>
          )}
          {classificacao && <RiscoFuturoCard c={classificacao} />}
          <NarrativaMarkdown texto={texto} />
          <div className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span
              className="size-1.5 rounded-full"
              style={{
                backgroundColor:
                  fonte === 'ia'
                    ? 'var(--color-primary)'
                    : 'var(--color-muted-foreground)',
              }}
            />
            {fonte === 'ia'
              ? 'Gerada por IA (Winners Decide) · dados anonimizados'
              : 'Análise determinística · dados anonimizados'}
          </div>
        </div>
      )}
    </section>
  )
}

// Cartão visual da Classificação de Risco Assistencial Futuro: nível colorido
// (Baixo/Moderado/Alto/Crítico) + os fatores (motivos) que o sustentam.
function RiscoFuturoCard({ c }: { c: ClassificacaoRiscoFuturo }) {
  const estilo = RISCO_FUTURO_ESTILO[c.nivel]
  return (
    <div
      className="mb-3 rounded-lg border p-3"
      style={{
        borderColor: `color-mix(in oklch, ${estilo.cor} 45%, transparent)`,
        backgroundColor: `color-mix(in oklch, ${estilo.cor} 10%, transparent)`,
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className="size-4" style={{ color: estilo.cor }} />
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Risco Assistencial Futuro
          </span>
        </div>
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold text-background"
          style={{ backgroundColor: estilo.cor }}
        >
          {estilo.rotulo}
        </span>
      </div>
      {c.motivos.length > 0 && (
        <ul className="mt-2.5 flex flex-col gap-1">
          {c.motivos.map((m, i) => (
            <li
              key={i}
              className="flex gap-2 text-xs leading-relaxed text-muted-foreground"
            >
              <span
                className="mt-1 size-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: estilo.cor }}
              />
              <span className="text-pretty">{m}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// Render simples de markdown (títulos ##, listas, negrito), alinhado ao padrão
// do Winners Decide.
function NarrativaMarkdown({ texto }: { texto: string }) {
  const linhas = texto.split('\n')
  const blocos: React.ReactNode[] = []
  let lista: string[] = []

  const flush = (key: string) => {
    if (lista.length === 0) return
    blocos.push(
      <ul key={key} className="my-2 flex flex-col gap-1.5 pl-1">
        {lista.map((item, i) => (
          <li key={i} className="flex gap-2 text-sm text-muted-foreground">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
            <span className="text-pretty">{inline(item)}</span>
          </li>
        ))}
      </ul>,
    )
    lista = []
  }

  linhas.forEach((linha, idx) => {
    const l = linha.trim()
    if (!l) {
      flush(`ul-${idx}`)
      return
    }
    if (l.startsWith('## ')) {
      flush(`ul-${idx}`)
      blocos.push(
        <h3
          key={idx}
          className="mt-4 mb-1.5 text-sm font-semibold text-foreground first:mt-0"
        >
          {inline(l.slice(3))}
        </h3>,
      )
    } else if (l.startsWith('# ')) {
      flush(`ul-${idx}`)
      blocos.push(
        <h2
          key={idx}
          className="mt-4 mb-2 text-base font-semibold text-foreground first:mt-0"
        >
          {inline(l.slice(2))}
        </h2>,
      )
    } else if (l.startsWith('- ') || l.startsWith('* ')) {
      lista.push(l.slice(2))
    } else {
      flush(`ul-${idx}`)
      blocos.push(
        <p
          key={idx}
          className="my-2 text-sm leading-relaxed text-muted-foreground text-pretty"
        >
          {inline(l)}
        </p>,
      )
    }
  })
  flush('ul-final')

  return <div className="flex flex-col">{blocos}</div>
}

function inline(texto: string): React.ReactNode[] {
  const partes = texto.split(/(\*\*[^*]+\*\*|_[^_]+_)/g).filter(Boolean)
  return partes.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      )
    }
    if (part.startsWith('_') && part.endsWith('_')) {
      return (
        <em key={i} className="italic">
          {part.slice(1, -1)}
        </em>
      )
    }
    return <span key={i}>{part}</span>
  })
}
