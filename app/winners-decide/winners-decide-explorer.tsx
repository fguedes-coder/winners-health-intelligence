'use client'

import { useMemo, useRef, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  Bot,
  Brain,
  Cpu,
  Download,
  FileText,
  Info,
  Lightbulb,
  Loader2,
  MessageSquare,
  RefreshCw,
  Send,
  ShieldAlert,
  Siren,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { RiscoDonutChart } from '@/components/charts'
import { formatBRL, formatNumber } from '@/lib/data'
import { formatCompetencia } from '@/lib/categorias'
import type { EventoDetalhado } from '@/lib/queries'
import {
  analisarCarteira,
  SEVERIDADE_META,
  FILTROS_VAZIOS,
  type WinnersFiltros,
  type Severidade,
  type Prioridade,
} from '@/lib/winners-decide'
import { ForecastChart, type ForecastPonto } from './forecast-chart'

const inputClass =
  'h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-ring'

const ABAS = [
  { id: 'resumo', label: 'Resumo Executivo IA', icon: Sparkles },
  { id: 'insights', label: 'Principais Insights', icon: Lightbulb },
  { id: 'previsoes', label: 'Previsões', icon: TrendingUp },
  { id: 'plano', label: 'Plano de Ação', icon: ShieldAlert },
  { id: 'chat', label: 'Pergunte à IA', icon: MessageSquare },
] as const

type AbaId = (typeof ABAS)[number]['id']

const PRIORIDADE_META: Record<Prioridade, { label: string; cor: string }> = {
  alta: { label: 'Alta', cor: 'oklch(0.62 0.2 25)' },
  media: { label: 'Média', cor: 'oklch(0.78 0.15 78)' },
  baixa: { label: 'Baixa', cor: 'oklch(0.7 0.15 152)' },
}

const PERGUNTAS_SUGERIDAS = [
  'Por que a sinistralidade aumentou?',
  'Quais são os principais fatores de risco?',
  'Qual o impacto financeiro das vidas críticas?',
  'O que pode pressionar o reajuste?',
  'Quais ações o RH deve priorizar?',
  'Como reduzir pronto-socorro?',
]

type ChatMsg = {
  role: 'user' | 'assistant'
  content: string
  fonte?: string | null
}

export function WinnersDecideExplorer({
  eventos,
  faturaPorCompetencia,
}: {
  eventos: EventoDetalhado[]
  faturaPorCompetencia: Record<string, number>
}) {
  const [filtros, setFiltros] = useState<WinnersFiltros>(FILTROS_VAZIOS)
  const [aba, setAba] = useState<AbaId>('resumo')

  // Estado da análise executiva (IA)
  const [resumoIA, setResumoIA] = useState<string | null>(null)
  const [resumoFonte, setResumoFonte] = useState<string | null>(null)
  const [resumoAviso, setResumoAviso] = useState<string | null>(null)
  const [carregandoResumo, setCarregandoResumo] = useState(false)

  // Estado do chat
  const [mensagens, setMensagens] = useState<ChatMsg[]>([])
  const [pergunta, setPergunta] = useState('')
  const [carregandoChat, setCarregandoChat] = useState(false)
  const chatFimRef = useRef<HTMLDivElement>(null)

  const set = (chave: keyof WinnersFiltros, valor: string) =>
    setFiltros((f) => ({ ...f, [chave]: valor }))

  const opcoes = useMemo(() => {
    const clientes = new Set<string>()
    const apolices = new Set<string>()
    const subs = new Map<string, string>()
    const planos = new Set<string>()
    const meses = new Set<string>()
    for (const e of eventos) {
      if (e.apoliceCliente) clientes.add(e.apoliceCliente)
      if (e.apoliceNumero) apolices.add(e.apoliceNumero)
      if (e.subCodigo) subs.set(e.subCodigo, e.subRazao ?? e.subCodigo)
      if (e.plano) planos.add(e.plano)
      if (e.competencia) meses.add(e.competencia)
    }
    return {
      clientes: [...clientes].sort(),
      apolices: [...apolices].sort(),
      subs: [...subs.entries()].sort(),
      planos: [...planos].sort(),
      meses: [...meses].sort(),
    }
  }, [eventos])

  const analise = useMemo(
    () => analisarCarteira(eventos, filtros, faturaPorCompetencia),
    [eventos, filtros, faturaPorCompetencia],
  )

  const algumFiltro = Object.values(filtros).some(Boolean)

  function limparFiltros() {
    setFiltros(FILTROS_VAZIOS)
  }

  async function gerarResumo() {
    setCarregandoResumo(true)
    setResumoAviso(null)
    try {
      const res = await fetch('/api/winners-decide/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modo: 'resumo', filtros }),
      })
      const data = await res.json()
      setResumoIA(data.texto ?? 'Não foi possível gerar a análise.')
      setResumoFonte(data.fonte ?? null)
      setResumoAviso(data.aviso ?? null)
    } catch {
      setResumoIA('Ocorreu um erro ao gerar a análise. Tente novamente.')
    } finally {
      setCarregandoResumo(false)
    }
  }

  async function enviarPergunta(texto: string) {
    const q = texto.trim()
    if (!q || carregandoChat) return
    setPergunta('')
    setMensagens((m) => [...m, { role: 'user', content: q }])
    setCarregandoChat(true)
    try {
      const res = await fetch('/api/winners-decide/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modo: 'chat', filtros, pergunta: q }),
      })
      const data = await res.json()
      setMensagens((m) => [
        ...m,
        {
          role: 'assistant',
          content: data.texto ?? 'Não foi possível responder.',
          fonte: data.fonte ?? null,
        },
      ])
    } catch {
      setMensagens((m) => [
        ...m,
        { role: 'assistant', content: 'Ocorreu um erro ao consultar a IA. Tente novamente.' },
      ])
    } finally {
      setCarregandoChat(false)
      requestAnimationFrame(() =>
        chatFimRef.current?.scrollIntoView({ behavior: 'smooth' }),
      )
    }
  }

  // Monta as linhas do relatório (reutilizadas por Markdown e PDF).
  function linhasRelatorio(): string[] {
    const linhas: string[] = []
    linhas.push('# Winners Decide IA — Análise Consultiva')
    linhas.push('')
    linhas.push(`**Cliente:** ${filtros.cliente || 'Carteira consolidada'}`)
    const per = analise.periodo
    linhas.push(
      `**Período:** ${per.inicio && per.fim ? `${formatCompetencia(per.inicio)} a ${formatCompetencia(per.fim)}` : 'Não informado'}`,
    )
    linhas.push(`**Emitido em:** ${new Date().toLocaleString('pt-BR')}`)
    linhas.push('')
    linhas.push('## Indicadores')
    linhas.push(`- Vidas analisadas: ${analise.cards.vidasAnalisadas}`)
    linhas.push(
      `- Sinistralidade atual: ${analise.cards.sinistralidadeAtual !== null ? analise.cards.sinistralidadeAtual + '%' : 'não disponível'}`,
    )
    linhas.push(`- Vidas em risco crítico: ${analise.cards.vidasRiscoCritico}`)
    linhas.push(`- Impacto financeiro potencial: ${formatBRL(analise.cards.impactoFinanceiro)}`)
    linhas.push(`- Tendência projetada de custo: ${analise.cards.tendenciaProjetada}%`)
    linhas.push(`- Nível geral de alerta: ${SEVERIDADE_META[analise.cards.nivelAlerta].label}`)
    linhas.push('')
    linhas.push('## Principais Insights')
    for (const i of analise.insights) {
      linhas.push(`- [${SEVERIDADE_META[i.severidade].label}] ${i.titulo} — ${i.descricao} Recomendação: ${i.recomendacao}`)
    }
    linhas.push('')
    linhas.push('## Plano de Ação')
    for (const a of analise.planoAcao) {
      linhas.push(`- [${PRIORIDADE_META[a.prioridade].label}] ${a.titulo} — ${a.justificativa} (Prazo: ${a.prazo}; Responsável: ${a.responsavel})`)
    }
    if (resumoIA) {
      linhas.push('')
      linhas.push('## Resumo Executivo')
      linhas.push(
        `_Fonte: ${resumoFonte === 'ia' ? 'gerado por IA' : 'análise interna determinística'}._`,
      )
      linhas.push(resumoIA)
    }
    linhas.push('')
    linhas.push('_Análise baseada em padrões de utilização, custo e risco assistencial, com dados anonimizados (LGPD). Não realiza diagnóstico médico._')
    return linhas
  }

  function exportarMarkdown() {
    const blob = new Blob([linhasRelatorio().join('\n')], {
      type: 'text/markdown;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `winners-decide-${new Date().toISOString().slice(0, 10)}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function exportarPDF() {
    const { jsPDF } = await import('jspdf')
    const doc = new jsPDF({ unit: 'pt', format: 'a4' })
    const margem = 48
    const largura = doc.internal.pageSize.getWidth() - margem * 2
    const alturaPagina = doc.internal.pageSize.getHeight()
    let y = margem

    const novaLinhaSeNecessario = (altura: number) => {
      if (y + altura > alturaPagina - margem) {
        doc.addPage()
        y = margem
      }
    }
    // Remove marcações inline de markdown para o texto do PDF.
    const limpar = (t: string) => t.replace(/\*\*/g, '').replace(/(^|[^_])_([^_]+)_/g, '$1$2')

    for (const bruta of linhasRelatorio()) {
      const linha = bruta.trimEnd()
      if (!linha) {
        y += 8
        continue
      }
      if (linha.startsWith('# ')) {
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(16)
        doc.setTextColor(20, 20, 20)
        const partes = doc.splitTextToSize(limpar(linha.slice(2)), largura)
        novaLinhaSeNecessario(partes.length * 20 + 6)
        doc.text(partes, margem, y)
        y += partes.length * 20 + 6
      } else if (linha.startsWith('## ')) {
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(12.5)
        doc.setTextColor(30, 30, 30)
        const partes = doc.splitTextToSize(limpar(linha.slice(3)), largura)
        novaLinhaSeNecessario(partes.length * 16 + 10)
        y += 6
        doc.text(partes, margem, y)
        y += partes.length * 16 + 4
      } else if (linha.startsWith('- ')) {
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(10)
        doc.setTextColor(60, 60, 60)
        const partes = doc.splitTextToSize(limpar(linha.slice(2)), largura - 14)
        novaLinhaSeNecessario(partes.length * 13 + 4)
        doc.text('•', margem, y)
        doc.text(partes, margem + 14, y)
        y += partes.length * 13 + 4
      } else {
        const italico = linha.startsWith('_') && linha.endsWith('_')
        doc.setFont('helvetica', italico ? 'italic' : 'normal')
        doc.setFontSize(italico ? 8.5 : 10.5)
        doc.setTextColor(italico ? 120 : 45, italico ? 120 : 45, italico ? 120 : 45)
        const partes = doc.splitTextToSize(limpar(linha), largura)
        novaLinhaSeNecessario(partes.length * 14 + 4)
        doc.text(partes, margem, y)
        y += partes.length * 14 + 4
      }
    }

    doc.save(`winners-decide-${new Date().toISOString().slice(0, 10)}.pdf`)
  }

  const c = analise.cards
  const tendenciaPositiva = c.tendenciaProjetada > 0
  const cards = [
    {
      label: 'Vidas Analisadas',
      value: formatNumber(c.vidasAnalisadas),
      hint: 'Vidas com utilização no recorte',
      icon: Users,
      cor: 'var(--primary)',
    },
    {
      label: 'Sinistralidade Atual',
      value: c.sinistralidadeAtual !== null ? `${c.sinistralidadeAtual}%` : '—',
      hint: c.sinistralidadeAtual !== null ? 'Última competência' : 'Fatura não cadastrada',
      icon: Activity,
      cor: 'var(--chart-1)',
    },
    {
      label: 'Vidas em Risco Crítico',
      value: formatNumber(c.vidasRiscoCritico),
      hint: 'Score de risco 85–100',
      icon: Siren,
      cor: SEVERIDADE_META.critico.cor,
    },
    {
      label: 'Impacto Financeiro Potencial',
      value: formatBRL(c.impactoFinanceiro),
      hint: 'Custo de vidas em alto/crítico',
      icon: Wallet,
      cor: 'var(--destructive)',
    },
    {
      label: 'Tendência Projetada',
      value: `${tendenciaPositiva ? '+' : ''}${c.tendenciaProjetada}%`,
      hint: 'Custo assistencial (próximo ciclo)',
      icon: tendenciaPositiva ? TrendingUp : TrendingDown,
      cor: tendenciaPositiva ? 'var(--destructive)' : SEVERIDADE_META.baixo.cor,
    },
    {
      label: 'Nível Geral de Alerta',
      value: SEVERIDADE_META[c.nivelAlerta].label,
      hint: 'Consolidado da carteira',
      icon: ShieldAlert,
      cor: SEVERIDADE_META[c.nivelAlerta].cor,
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Brain className="size-6" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Winners Decide IA</h1>
            <p className="max-w-2xl text-sm text-muted-foreground text-pretty">
              Inteligência consultiva para análise preditiva, recomendações
              automáticas e apoio à decisão em saúde corporativa.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={exportarPDF}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            <FileText className="size-4" />
            Exportar PDF
          </button>
          <button
            type="button"
            onClick={exportarMarkdown}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            <Download className="size-4" />
            Relatório (.md)
          </button>
        </div>
      </div>

      {/* Aviso LGPD / não diagnóstico */}
      <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0 text-primary" />
        <p className="text-pretty">
          A Winners Decide IA{' '}
          <strong className="font-medium text-foreground">não realiza diagnóstico médico</strong>.
          As análises são baseadas em padrões de utilização, custo e risco
          assistencial, com dados anonimizados em conformidade com a LGPD.
        </p>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Filtros</CardTitle>
          {algumFiltro && (
            <button
              type="button"
              onClick={limparFiltros}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="size-3.5" />
              Limpar filtros
            </button>
          )}
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <Campo label="Cliente">
              <select value={filtros.cliente} onChange={(e) => set('cliente', e.target.value)} className={inputClass}>
                <option value="">Todos</option>
                {opcoes.clientes.map((x) => (
                  <option key={x} value={x}>{x}</option>
                ))}
              </select>
            </Campo>
            <Campo label="Apólice">
              <select value={filtros.apolice} onChange={(e) => set('apolice', e.target.value)} className={inputClass}>
                <option value="">Todas</option>
                {opcoes.apolices.map((x) => (
                  <option key={x} value={x}>{x}</option>
                ))}
              </select>
            </Campo>
            <Campo label="Subestipulante">
              <select value={filtros.sub} onChange={(e) => set('sub', e.target.value)} className={inputClass}>
                <option value="">Todos</option>
                {opcoes.subs.map(([cod, razao]) => (
                  <option key={cod} value={cod}>{cod} - {razao}</option>
                ))}
              </select>
            </Campo>
            <Campo label="Plano">
              <select value={filtros.plano} onChange={(e) => set('plano', e.target.value)} className={inputClass}>
                <option value="">Todos</option>
                {opcoes.planos.map((x) => (
                  <option key={x} value={x}>{x}</option>
                ))}
              </select>
            </Campo>
            <Campo label="Competência inicial">
              <select value={filtros.competenciaInicial} onChange={(e) => set('competenciaInicial', e.target.value)} className={inputClass}>
                <option value="">Início</option>
                {opcoes.meses.map((m) => (
                  <option key={m} value={m}>{formatCompetencia(m)}</option>
                ))}
              </select>
            </Campo>
            <Campo label="Competência final">
              <select value={filtros.competenciaFinal} onChange={(e) => set('competenciaFinal', e.target.value)} className={inputClass}>
                <option value="">Fim</option>
                {opcoes.meses.map((m) => (
                  <option key={m} value={m}>{formatCompetencia(m)}</option>
                ))}
              </select>
            </Campo>
          </div>
        </CardContent>
      </Card>

      {/* Cards principais */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {cards.map((k) => {
          const Icon = k.icon
          return (
            <div key={k.label} className="flex flex-col rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <span className="text-xs text-muted-foreground text-pretty">{k.label}</span>
                <div
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg"
                  style={{ backgroundColor: `color-mix(in oklch, ${k.cor} 18%, transparent)`, color: k.cor }}
                >
                  <Icon className="size-4" />
                </div>
              </div>
              <div className="mt-2 text-xl font-semibold tabular-nums" style={{ color: k.cor }}>
                {k.value}
              </div>
              <span className="mt-1 text-xs text-muted-foreground">{k.hint}</span>
            </div>
          )
        })}
      </div>

      {/* Abas */}
      <div className="flex flex-wrap gap-1.5 border-b border-border">
        {ABAS.map((t) => {
          const Icon = t.icon
          const ativo = aba === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setAba(t.id)}
              className={`inline-flex items-center gap-2 rounded-t-lg border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                ativo
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="size-4" />
              {t.label}
            </button>
          )
        })}
      </div>

      {!analise.temDados ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Nenhum dado corresponde aos filtros selecionados. Ajuste o recorte para gerar a análise.
          </CardContent>
        </Card>
      ) : (
        <>
          {aba === 'resumo' && (
            <AbaResumo
              texto={resumoIA}
              fonte={resumoFonte}
              aviso={resumoAviso}
              carregando={carregandoResumo}
              onGerar={gerarResumo}
            />
          )}
          {aba === 'insights' && <AbaInsights insights={analise.insights} distribuicao={analise.distribuicaoRisco} total={c.vidasAnalisadas} />}
          {aba === 'previsoes' && <AbaPrevisoes previsoes={analise.previsoes} />}
          {aba === 'plano' && <AbaPlano acoes={analise.planoAcao} />}
          {aba === 'chat' && (
            <AbaChat
              mensagens={mensagens}
              pergunta={pergunta}
              carregando={carregandoChat}
              onPergunta={setPergunta}
              onEnviar={enviarPergunta}
              chatFimRef={chatFimRef}
            />
          )}
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Aba 1 — Resumo Executivo IA
// ---------------------------------------------------------------------------
function AbaResumo({
  texto,
  fonte,
  aviso,
  carregando,
  onGerar,
}: {
  texto: string | null
  fonte: string | null
  aviso: string | null
  carregando: boolean
  onGerar: () => void
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle className="flex flex-wrap items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          Resumo Executivo IA
          {texto && !carregando && <FonteBadge fonte={fonte} />}
        </CardTitle>
        <button
          type="button"
          onClick={onGerar}
          disabled={carregando}
          className="inline-flex shrink-0 items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {carregando ? (
            <Loader2 className="size-4 animate-spin" />
          ) : texto ? (
            <RefreshCw className="size-4" />
          ) : (
            <Sparkles className="size-4" />
          )}
          {carregando
            ? 'Gerando análise...'
            : texto
              ? 'Regenerar análise com IA'
              : 'Gerar análise com IA'}
        </button>
      </CardHeader>
      <CardContent>
        {aviso && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            {aviso}
          </div>
        )}
        {!texto && !carregando && (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
              <Bot className="size-6" />
            </div>
            <p className="max-w-md text-sm text-muted-foreground text-pretty">
              Clique em <strong className="text-foreground">Gerar análise com IA</strong> para
              produzir um resumo executivo com visão geral da carteira, pontos de
              atenção, evolução de risco, impacto financeiro, pressão sobre
              reajuste e recomendação prioritária.
            </p>
          </div>
        )}
        {carregando && (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Analisando os dados da carteira...
          </div>
        )}
        {texto && !carregando && (
          <>
            <Markdown texto={texto} />
            {fonte && (
              <p className="mt-4 text-xs text-muted-foreground">
                {fonte === 'ia'
                  ? 'Análise gerada por IA (OpenAI) com base nos dados anonimizados da plataforma.'
                  : 'Análise determinística baseada nos dados da plataforma (configure OPENAI_API_KEY para ativar a IA).'}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Aba 2 — Principais Insights
// ---------------------------------------------------------------------------
function AbaInsights({
  insights,
  distribuicao,
  total,
}: {
  insights: ReturnType<typeof analisarCarteira>['insights']
  distribuicao: { nome: string; valor: number; cor: string }[]
  total: number
}) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {insights.map((i) => {
            const meta = SEVERIDADE_META[i.severidade]
            return (
              <div key={i.chave} className="flex flex-col rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold text-foreground text-pretty">{i.titulo}</h3>
                  <span
                    className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium"
                    style={{ backgroundColor: `color-mix(in oklch, ${meta.cor} 20%, transparent)`, color: meta.cor }}
                  >
                    {meta.label}
                  </span>
                </div>
                <p className="mt-1 text-sm font-medium tabular-nums" style={{ color: meta.cor }}>
                  {i.metrica}
                </p>
                <p className="mt-1.5 text-xs text-muted-foreground text-pretty">{i.descricao}</p>
                <div className="mt-3 flex items-start gap-1.5 border-t border-border pt-3 text-xs text-muted-foreground">
                  <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-primary" />
                  <span className="text-pretty">{i.recomendacao}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <Card className="h-fit">
        <CardHeader>
          <CardTitle>Distribuição de Risco</CardTitle>
        </CardHeader>
        <CardContent>
          {distribuicao.length > 0 ? (
            <>
              <RiscoDonutChart data={distribuicao} centerValue={formatNumber(total)} centerLabel="vidas" />
              <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-xs">
                {distribuicao.map((d) => (
                  <span key={d.nome} className="flex items-center gap-1.5 text-muted-foreground">
                    <span className="inline-block size-2.5 rounded-full" style={{ backgroundColor: d.cor }} />
                    {d.nome} ({d.valor})
                  </span>
                ))}
              </div>
            </>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">Sem dados de risco no recorte.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Aba 3 — Previsões
// ---------------------------------------------------------------------------
function AbaPrevisoes({
  previsoes,
}: {
  previsoes: ReturnType<typeof analisarCarteira>['previsoes']
}) {
  const custoData: ForecastPonto[] = montarForecast(
    previsoes.custoAssistencial.historico.map((h) => ({ mes: h.mes, valor: h.valor })),
    previsoes.custoAssistencial.projecao,
  )
  const sinistData: ForecastPonto[] = montarForecast(
    previsoes.sinistralidade.historico.map((h) => ({ mes: h.mes, valor: h.valor })),
    previsoes.sinistralidade.projecao,
  )
  const vidasData: ForecastPonto[] = montarForecast(
    previsoes.vidasCriticas.historico.map((h) => ({ mes: h.mes, valor: h.valor })),
    previsoes.vidasCriticas.projecao,
  )

  const cen = previsoes.sinistralidade.cenarios
  const cenarios = [
    { chave: 'otimista', label: 'Cenário Otimista', valor: cen.otimista, cor: SEVERIDADE_META.baixo.cor },
    { chave: 'provavel', label: 'Cenário Provável', valor: cen.provavel, cor: 'var(--primary)' },
    { chave: 'critico', label: 'Cenário Crítico', valor: cen.critico, cor: SEVERIDADE_META.critico.cor },
  ]

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground text-pretty">
        Projeções para os próximos 3 meses com base na tendência histórica por
        competência (análise linear simples). Os valores são estimativas de apoio
        à decisão, não garantias.
      </p>

      {/* Cenários de sinistralidade */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {cenarios.map((s) => (
          <div key={s.chave} className="flex flex-col rounded-xl border border-border bg-card p-4">
            <span className="text-xs text-muted-foreground">{s.label}</span>
            <span className="mt-1 text-2xl font-semibold tabular-nums" style={{ color: s.cor }}>
              {previsoes.sinistralidade.disponivel ? `${s.valor}%` : '—'}
            </span>
            <span className="mt-0.5 text-xs text-muted-foreground">Sinistralidade projetada (3 meses)</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Sinistralidade Projetada</CardTitle>
          </CardHeader>
          <CardContent>
            {previsoes.sinistralidade.disponivel ? (
              <ForecastChart data={sinistData} sufixo="%" />
            ) : (
              <p className="py-16 text-center text-sm text-muted-foreground">
                Sinistralidade indisponível: fatura não cadastrada para as competências do recorte.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Custo Assistencial Projetado</CardTitle>
          </CardHeader>
          <CardContent>
            <ForecastChart data={custoData} moeda />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Vidas Críticas Projetadas</CardTitle>
          </CardHeader>
          <CardContent>
            {vidasData.length > 0 ? (
              <ForecastChart data={vidasData} />
            ) : (
              <p className="py-16 text-center text-sm text-muted-foreground">Sem vidas em alto/crítico no recorte.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Impacto Financeiro e Reajuste</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div>
              <span className="text-xs text-muted-foreground">Impacto financeiro potencial</span>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-destructive">
                {formatBRL(previsoes.impactoFinanceiroPotencial)}
              </p>
            </div>
            <div className="border-t border-border pt-4">
              <span className="text-xs text-muted-foreground">Faixa de reajuste estimada</span>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                {previsoes.reajusteEstimado.max > 0
                  ? `${previsoes.reajusteEstimado.min}% – ${previsoes.reajusteEstimado.max}%`
                  : 'Sem pressão relevante'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground text-pretty">
                Estimativa a partir da sinistralidade projetada versus meta técnica de 70%.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function montarForecast(
  historico: { mes: string; valor: number }[],
  projecao: { mes: string; valor: number }[],
): ForecastPonto[] {
  const out: ForecastPonto[] = historico.map((h) => ({
    mes: h.mes,
    historico: h.valor,
    projecao: null,
  }))
  // Conecta a projeção ao último ponto histórico.
  if (out.length > 0 && projecao.length > 0) {
    out[out.length - 1] = { ...out[out.length - 1], projecao: out[out.length - 1].historico }
  }
  for (const p of projecao) {
    out.push({ mes: p.mes, historico: null, projecao: p.valor })
  }
  return out
}

// ---------------------------------------------------------------------------
// Aba 4 — Plano de Ação
// ---------------------------------------------------------------------------
function AbaPlano({
  acoes,
}: {
  acoes: ReturnType<typeof analisarCarteira>['planoAcao']
}) {
  return (
    <div className="flex flex-col gap-3">
      {acoes.map((a) => {
        const meta = PRIORIDADE_META[a.prioridade]
        return (
          <div key={a.chave} className="rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="text-sm font-semibold text-foreground text-pretty">{a.titulo}</h3>
              <span
                className="shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium"
                style={{ backgroundColor: `color-mix(in oklch, ${meta.cor} 20%, transparent)`, color: meta.cor }}
              >
                Prioridade {meta.label}
              </span>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground text-pretty">{a.justificativa}</p>
            <div className="mt-3 grid grid-cols-1 gap-2 border-t border-border pt-3 text-xs sm:grid-cols-3">
              <Detalhe rotulo="Impacto esperado" valor={a.impacto} />
              <Detalhe rotulo="Prazo sugerido" valor={a.prazo} />
              <Detalhe rotulo="Responsável sugerido" valor={a.responsavel} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Detalhe({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground">{rotulo}</span>
      <span className="font-medium text-foreground text-pretty">{valor}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Aba 5 — Pergunte à IA
// ---------------------------------------------------------------------------
function AbaChat({
  mensagens,
  pergunta,
  carregando,
  onPergunta,
  onEnviar,
  chatFimRef,
}: {
  mensagens: ChatMsg[]
  pergunta: string
  carregando: boolean
  onPergunta: (v: string) => void
  onEnviar: (texto: string) => void
  chatFimRef: React.RefObject<HTMLDivElement | null>
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="size-4 text-primary" />
          Pergunte à IA
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {mensagens.length === 0 && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground text-pretty">
              Faça perguntas sobre os dados da carteira selecionada. A IA responde
              exclusivamente com base nos dados disponíveis da plataforma.
            </p>
            <div className="flex flex-wrap gap-2">
              {PERGUNTAS_SUGERIDAS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => onEnviar(q)}
                  disabled={carregando}
                  className="rounded-full border border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-60"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {mensagens.length > 0 && (
          <div className="flex max-h-[440px] flex-col gap-3 overflow-y-auto pr-1">
            {mensagens.map((m, idx) => (
              <div
                key={idx}
                className={`flex gap-2.5 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}
              >
                <div
                  className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${
                    m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-primary/15 text-primary'
                  }`}
                >
                  {m.role === 'user' ? <Users className="size-4" /> : <Bot className="size-4" />}
                </div>
                <div className={`flex max-w-[80%] flex-col gap-1.5 ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div
                    className={`rounded-xl px-3.5 py-2.5 text-sm ${
                      m.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'border border-border bg-card text-foreground'
                    }`}
                  >
                    {m.role === 'assistant' ? <Markdown texto={m.content} /> : m.content}
                  </div>
                  {m.role === 'assistant' && m.fonte && <FonteBadge fonte={m.fonte} />}
                </div>
              </div>
            ))}
            {carregando && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Consultando os dados...
              </div>
            )}
            <div ref={chatFimRef} />
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault()
            onEnviar(pergunta)
          }}
          className="flex items-end gap-2 border-t border-border pt-4"
        >
          <textarea
            value={pergunta}
            onChange={(e) => onPergunta(e.target.value)}
            onKeyDown={(e) => {
              if (
                e.key === 'Enter' &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing &&
                e.keyCode !== 229
              ) {
                e.preventDefault()
                onEnviar(pergunta)
              }
            }}
            rows={2}
            placeholder="Digite sua pergunta sobre a carteira..."
            className="min-h-[44px] flex-1 resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring"
          />
          <button
            type="submit"
            disabled={carregando || !pergunta.trim()}
            className="inline-flex h-11 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            <Send className="size-4" />
            Enviar
          </button>
        </form>
        <p className="text-xs text-muted-foreground">
          As respostas são baseadas em dados anonimizados e não constituem
          diagnóstico médico.
        </p>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Componentes auxiliares
// ---------------------------------------------------------------------------
function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  )
}

// Indica a origem da análise: modelo de IA generativa ou análise interna
// determinística (fallback). Deixa claro para o usuário como o texto foi gerado.
function FonteBadge({ fonte }: { fonte: string | null }) {
  const ia = fonte === 'ia'
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
        ia
          ? 'bg-primary/15 text-primary'
          : 'bg-muted text-muted-foreground'
      }`}
      title={
        ia
          ? 'Texto gerado por modelo de IA a partir dos dados anonimizados da carteira.'
          : 'Análise determinística calculada localmente a partir dos mesmos dados. Conecte um provedor de IA para respostas generativas.'
      }
    >
      {ia ? <Sparkles className="size-3" /> : <Cpu className="size-3" />}
      {ia ? 'Gerado por IA' : 'Análise interna'}
    </span>
  )
}

// Renderizador leve de markdown (títulos ##, negrito **, listas -).
function Markdown({ texto }: { texto: string }) {
  const linhas = texto.split('\n')
  const blocos: React.ReactNode[] = []
  let lista: string[] = []

  const flushLista = (key: string) => {
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
      flushLista(`ul-${idx}`)
      return
    }
    if (l.startsWith('## ')) {
      flushLista(`ul-${idx}`)
      blocos.push(
        <h3 key={idx} className="mt-4 mb-1.5 text-sm font-semibold text-foreground first:mt-0">
          {inline(l.slice(3))}
        </h3>,
      )
    } else if (l.startsWith('# ')) {
      flushLista(`ul-${idx}`)
      blocos.push(
        <h2 key={idx} className="mt-4 mb-2 text-base font-semibold text-foreground first:mt-0">
          {inline(l.slice(2))}
        </h2>,
      )
    } else if (l.startsWith('- ') || l.startsWith('* ')) {
      lista.push(l.slice(2))
    } else {
      flushLista(`ul-${idx}`)
      blocos.push(
        <p key={idx} className="my-2 text-sm text-muted-foreground text-pretty leading-relaxed">
          {inline(l)}
        </p>,
      )
    }
  })
  flushLista('ul-final')

  return <div className="flex flex-col">{blocos}</div>
}

// Processa negrito **texto** e itálico _texto_ dentro de uma linha.
function inline(texto: string): React.ReactNode[] {
  const partes = texto.split(/(\*\*[^*]+\*\*|_[^_]+_)/g).filter(Boolean)
  return partes.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold text-foreground">
          {p.slice(2, -2)}
        </strong>
      )
    }
    if (p.startsWith('_') && p.endsWith('_')) {
      return (
        <em key={i} className="italic">
          {p.slice(1, -1)}
        </em>
      )
    }
    return <span key={i}>{p}</span>
  })
}
