import 'server-only'

import { jsPDF } from 'jspdf'
import { formatBRL } from '@/lib/data'
import {
  K_ANONIMATO,
  aplicarKAnonimato,
  rotuloPrestadorSeguro,
} from '@/lib/privacidade-clinica'
import type { DashboardData, PainelData } from '@/lib/queries'
import type { AnaliseExecutiva } from '@/lib/analise-ia'
import type { ResumoRadar } from '@/lib/radar-agg'
import type { ResumoSaudeMental } from '@/lib/saude-mental-agg'
import type { AnaliseIA } from '@/lib/winners-decide-analysis'
import { AVISO_LGPD, type ModoPrivacidade } from '@/lib/anonimizar'
import type { RelatorioConfig } from '@/app/relatorios/actions'

/**
 * Gerador de relatório executivo em PDF **nativo** (sem impressão do navegador).
 *
 * O documento é desenhado programaticamente com jsPDF: capa institucional,
 * cabeçalho e rodapé próprios em cada página, numeração elegante e gráficos
 * vetoriais. Não há URL, data do navegador ou qualquer elemento de browser —
 * o padrão segue relatórios de consultoria (Mercer / Aon / Deloitte).
 */

// ---------------------------------------------------------------------------
// Paleta corporativa (3-5 cores + neutros)
// ---------------------------------------------------------------------------
type RGB = [number, number, number]

const NAVY: RGB = [10, 27, 61] // fundo da capa
const NAVY_SOFT: RGB = [18, 40, 82] // cartão sobre a capa
const BLUE: RGB = [30, 90, 168] // azul institucional
const BLUE_LT: RGB = [76, 134, 214] // acento de gráfico
const INK: RGB = [26, 34, 51] // texto principal
const MUTED: RGB = [107, 114, 128] // texto secundário
const LINE: RGB = [226, 232, 240] // linhas / bordas
const ZEBRA: RGB = [245, 247, 250] // linha alternada de tabela
const WHITE: RGB = [255, 255, 255]
const AMBER: RGB = [180, 83, 9] // atenção (pontos de risco)
const GREEN: RGB = [21, 128, 61] // economia / resultado positivo
const GREEN_LT: RGB = [236, 247, 240] // fundo suave do bloco de economia
const RED: RGB = [185, 28, 28] // P1 / risco crítico
const ORANGE: RGB = [194, 65, 12] // P2 / risco alto
const BLUE_XLT: RGB = [239, 246, 255] // fundo suave do bloco de intervenção

// Acentos exclusivos da capa (fundo navy)
const TEAL: RGB = [45, 212, 191] // destaque positivo (sinistralidade saudável)
const TEAL_DIM: RGB = [32, 118, 106] // borda do cartão de sinistralidade
const BLUE_TITLE: RGB = [64, 131, 246] // "Plano de Saúde" no título da capa
const AMBER_CAPA: RGB = [251, 191, 36] // status de atenção sobre navy
const RED_CAPA: RGB = [248, 113, 113] // status crítico sobre navy
const NAVY_LINE: RGB = [40, 62, 108] // divisórias sobre navy
const CAPA_MUTED: RGB = [150, 170, 205] // texto secundário sobre navy
const CAPA_LABEL: RGB = [168, 184, 212] // rótulos de KPI sobre navy

// Cores dos selos de prioridade (P1–P4).
const PRIORIDADE_COR: Record<string, RGB> = {
  P1: RED,
  P2: ORANGE,
  P3: AMBER,
  P4: GREEN,
}
// Cores do Risco Assistencial Futuro.
const RISCO_FUTURO_COR: Record<string, RGB> = {
  Baixo: GREEN,
  Moderado: AMBER,
  Alto: ORANGE,
  Crítico: RED,
}
// Cores do Potencial de Economia (Alto = maior oportunidade).
const ECONOMIA_COR: Record<string, RGB> = {
  Alto: GREEN,
  Médio: AMBER,
  Baixo: [107, 114, 128],
}

// ---------------------------------------------------------------------------
// Geometria (unidade: pt — A4 retrato)
// ---------------------------------------------------------------------------
const PAGE_W = 595.28
const PAGE_H = 841.89
const MARGIN = 48
const CONTENT_TOP = 92
const CONTENT_BOTTOM = PAGE_H - 54
const USABLE_W = PAGE_W - MARGIN * 2

const MESES_ABREV = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
]
const MESES_EXT = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
]

function fmtCompExt(yyyymm: string | null): string {
  if (!yyyymm || !/^\d{4}-\d{2}$/.test(yyyymm)) return '—'
  const [a, m] = yyyymm.split('-')
  return `${MESES_EXT[Number(m) - 1]}/${a}`
}

function fmtCompShort(yyyymm: string): string {
  if (!/^\d{4}-\d{2}$/.test(yyyymm)) return yyyymm
  const [a, m] = yyyymm.split('-')
  return `${MESES_ABREV[Number(m) - 1]}/${a.slice(2)}`
}

function pct(v: number | null): string {
  return v === null
    ? '—'
    : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
}

/** Formatação compacta para eixos de gráfico (R$ 1,2 mi / R$ 340 mil). */
function fmtCompacto(v: number): string {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1).replace('.', ',')} mi`
  if (v >= 1_000) return `R$ ${Math.round(v / 1_000)} mil`
  return `R$ ${Math.round(v)}`
}

// Mini-resumo individual dos maiores ofensores (Top 3 por custo).
export type MiniResumoBeneficiario = {
  display: string
  riscoFuturo: string
  prioridadeNivel: string
  prioridadeRotulo: string
  economia: string
  participacaoPct: number
  valorTotal: number
  resumo: string
}

export type RelatorioPdfInput = {
  data: DashboardData
  painel: PainelData | null
  analise: AnaliseExecutiva
  config: RelatorioConfig
  resumoRadar: ResumoRadar
  /** Resumo dedicado de Saúde Mental (página exclusiva). */
  saudeMental: ResumoSaudeMental | null
  /** Análise consultiva do módulo Winners Decide IA (OpenAI ou determinística). */
  analiseIA: AnaliseIA | null
  /** Mini-resumos dos 3 maiores ofensores financeiros (páginas individuais). */
  miniResumos: MiniResumoBeneficiario[]
  modo: ModoPrivacidade
  competenciaInicio: string | null
  competenciaFim: string | null
  competenciasSelecionadas: string[]
  /** Imagens em data URL (base64) resolvidas no servidor. */
  assets: {
    shield?: string | null
    clienteLogo?: string | null
  }
}

type ColAlign = 'left' | 'right' | 'center'
type Col = { header: string; width: number; align?: ColAlign }

// ---------------------------------------------------------------------------
// Construtor do documento
// ---------------------------------------------------------------------------
class Relatorio {
  private doc: jsPDF
  private y = CONTENT_TOP
  private coverPages = new Set<number>()
  private clienteNome: string
  private periodoLabel: string
  private anonimizado: boolean
  private input: RelatorioPdfInput

  constructor(input: RelatorioPdfInput) {
    this.input = input
    this.doc = new jsPDF({
      unit: 'pt',
      format: 'a4',
      orientation: 'portrait',
      compress: true,
    })
    this.clienteNome = input.config.clienteNome?.trim() || 'Empresa Cliente'
    this.anonimizado = input.modo === 'anonimizado'
    const { competenciaInicio: ini, competenciaFim: fim } = input
    this.periodoLabel =
      ini && fim && ini !== fim
        ? `${fmtCompExt(ini)} a ${fmtCompExt(fim)}`
        : fmtCompExt(fim ?? ini)
  }

  // ---- utilidades de baixo nível -----------------------------------------
  private fill(c: RGB) {
    this.doc.setFillColor(c[0], c[1], c[2])
  }
  private stroke(c: RGB) {
    this.doc.setDrawColor(c[0], c[1], c[2])
  }
  private ink(c: RGB) {
    this.doc.setTextColor(c[0], c[1], c[2])
  }
  private font(style: 'normal' | 'bold', size: number) {
    this.doc.setFont('helvetica', style)
    this.doc.setFontSize(size)
  }

  private newContentPage() {
    this.doc.addPage()
    this.y = CONTENT_TOP
  }

  private ensure(h: number) {
    if (this.y + h > CONTENT_BOTTOM) this.newContentPage()
  }

  // ---- capa institucional --------------------------------------------------
  // Layout: fundo navy com motivos decorativos, emblema + wordmark, título,
  // cartão do cliente + selo de sinistralidade lado a lado, régua de KPIs e
  // rodapé com emissão/LGPD. Referência: capa aprovada em ago/2026.
  private capa() {
    const doc = this.doc
    // Página 1 já existe. Marca como capa (sem cabeçalho/rodapé).
    this.coverPages.add(doc.getNumberOfPages())

    // Fundo navy integral
    this.fill(NAVY)
    doc.rect(0, 0, PAGE_W, PAGE_H, 'F')

    // Faixa de acento superior
    this.fill(BLUE)
    doc.rect(0, 0, PAGE_W, 6, 'F')

    this.capaDecoracao()

    // Emblema (shield) centralizado
    const shield = this.input.assets.shield
    let topY = 44
    if (shield) {
      try {
        const props = doc.getImageProperties(shield)
        const h = 62
        const w = (props.width / props.height) * h
        doc.addImage(shield, 'PNG', (PAGE_W - w) / 2, topY, w, h)
      } catch {
        /* segue sem o emblema */
      }
    }
    topY += 62 + 32

    // Wordmark textual (o logo horizontal é escuro; na capa navy usamos texto)
    this.ink(WHITE)
    this.font('bold', 27)
    doc.text('WINNERS', PAGE_W / 2, topY, { align: 'center' })
    this.ink(BLUE_LT)
    this.font('bold', 11)
    doc.text('HEALTH INTELLIGENCE', PAGE_W / 2, topY + 19, {
      align: 'center',
      charSpace: 3,
    })
    this.font('normal', 7.5)
    this.ink(CAPA_MUTED)
    doc.text(
      'DADOS QUE CUIDAM. INTELIGÊNCIA QUE GERA VALOR.',
      PAGE_W / 2,
      topY + 36,
      { align: 'center', charSpace: 1.2 },
    )

    // Bloco de título
    this.ink(BLUE_TITLE)
    this.font('bold', 11)
    doc.text('RELATÓRIO EXECUTIVO', MARGIN, 216, { charSpace: 2 })

    this.ink(WHITE)
    this.font('bold', 29)
    doc.text('Sinistralidade &', MARGIN, 252)
    doc.text('Utilização do', MARGIN, 288)
    this.ink(BLUE_TITLE)
    doc.text('Plano de Saúde', MARGIN, 324)

    this.fill(BLUE_TITLE)
    doc.rect(MARGIN, 340, 44, 3.5, 'F')

    this.ink([170, 186, 214])
    this.font('normal', 12)
    doc.text('Análise consolidada da carteira de saúde', MARGIN, 368)

    // Cartões lado a lado: cliente (esq.) + sinistralidade (dir.)
    const cardY = 396
    const cardH = 172
    const sinCardW = 160
    const gap = 16
    const cliCardW = USABLE_W - sinCardW - gap
    this.capaCartaoCliente(MARGIN, cardY, cliCardW, cardH)
    this.capaCartaoSinistralidade(MARGIN + cliCardW + gap, cardY, sinCardW, cardH)

    // Régua de KPIs
    this.capaKpis(MARGIN, cardY + cardH + 16, USABLE_W, 80)

    // Tagline em duas linhas (branca + teal) com selo de verificação
    const l1 = 'INFORMAÇÃO PARA DECISÕES ESTRATÉGICAS —'
    const l2 = 'GESTÃO INTELIGENTE PARA PROMOVER SAÚDE E SUSTENTABILIDADE.'
    this.font('normal', 9)
    const w1 = doc.getTextWidth(l1)
    this.font('bold', 9)
    const w2 = doc.getTextWidth(l2)
    const blocoX = (PAGE_W - Math.max(w1, w2)) / 2
    this.capaIconeCheckCircle(blocoX - 26, 708, 9, TEAL)
    this.ink([186, 200, 224])
    this.font('normal', 9)
    doc.text(l1, blocoX, 704)
    this.ink(TEAL)
    this.font('bold', 9)
    doc.text(l2, blocoX, 719)

    // Rodapé da capa: emissão (data do relatório, não do navegador)
    this.stroke(NAVY_LINE)
    doc.setLineWidth(0.8)
    doc.line(MARGIN, PAGE_H - 66, PAGE_W - MARGIN, PAGE_H - 66)
    this.capaIconeCalendario(MARGIN, PAGE_H - 50, 9, CAPA_MUTED)
    this.ink(CAPA_MUTED)
    this.font('normal', 8.5)
    doc.text(`Emitido em ${this.dataEmissao()}`, MARGIN + 16, PAGE_H - 42)
    if (this.anonimizado) {
      const rotulo = 'RELATÓRIO ANONIMIZADO — LGPD'
      this.font('bold', 8.5)
      const wR = doc.getTextWidth(rotulo)
      this.capaIconeCadeado(PAGE_W - MARGIN - wR - 16, PAGE_H - 50, CAPA_MUTED)
      this.ink(CAPA_MUTED)
      doc.text(rotulo, PAGE_W - MARGIN, PAGE_H - 42, { align: 'right' })
    }
  }

  /** Motivos decorativos da capa: ondas à esquerda e gráfico à direita. */
  private capaDecoracao() {
    const doc = this.doc
    // Ondas suaves no canto superior esquerdo
    this.stroke([26, 50, 98])
    doc.setLineWidth(1.1)
    for (let i = 0; i < 3; i++) {
      doc.lines(
        [[90, -34, 190, 16, 270, -44]],
        -12,
        76 + i * 26,
        [1, 1],
        'S',
      )
    }
    // Barras + linha de tendência no canto superior direito
    const alturas = [46, 84, 60, 108, 138]
    const baseY = 306
    this.fill([19, 42, 88])
    alturas.forEach((h, i) => {
      doc.rect(408 + i * 30, baseY - h, 17, h, 'F')
    })
    const pontos: [number, number][] = [
      [404, 246],
      [438, 256],
      [468, 214],
      [498, 226],
      [528, 178],
      [560, 152],
    ]
    this.stroke([43, 96, 178])
    doc.setLineWidth(1.4)
    for (let i = 1; i < pontos.length; i++) {
      doc.line(pontos[i - 1][0], pontos[i - 1][1], pontos[i][0], pontos[i][1])
    }
    this.fill([43, 96, 178])
    for (const [x, y] of pontos) doc.circle(x, y, 2.6, 'F')
  }

  /** Cartão do cliente: logo, nome e linhas de informação com ícones. */
  private capaCartaoCliente(x: number, y: number, w: number, h: number) {
    const doc = this.doc
    this.fill(NAVY_SOFT)
    doc.roundedRect(x, y, w, h, 10, 10, 'F')
    this.stroke(NAVY_LINE)
    doc.setLineWidth(0.8)
    doc.roundedRect(x, y, w, h, 10, 10, 'S')

    const padX = x + 18
    this.ink(BLUE_LT)
    this.font('bold', 9)
    doc.text('CLIENTE', padX, y + 26, { charSpace: 1.5 })

    // Logo do cliente em caixa branca
    const logoBoxY = y + 44
    const logoBoxW = 118
    const logoBoxH = 100
    const clienteLogo = this.input.assets.clienteLogo
    if (clienteLogo) {
      try {
        this.fill(WHITE)
        doc.roundedRect(padX, logoBoxY, logoBoxW, logoBoxH, 8, 8, 'F')
        const props = doc.getImageProperties(clienteLogo)
        const maxW = logoBoxW - 18
        const maxH = logoBoxH - 18
        let lw = maxW
        let lh = (props.height / props.width) * lw
        if (lh > maxH) {
          lh = maxH
          lw = (props.width / props.height) * lh
        }
        const fmt = clienteLogo.includes('image/png') ? 'PNG' : 'JPEG'
        doc.addImage(
          clienteLogo,
          fmt,
          padX + (logoBoxW - lw) / 2,
          logoBoxY + (logoBoxH - lh) / 2,
          lw,
          lh,
        )
      } catch {
        this.drawLogoFallback(padX, logoBoxY, logoBoxW, logoBoxH)
      }
    } else {
      this.drawLogoFallback(padX, logoBoxY, logoBoxW, logoBoxH)
    }

    // Divisória vertical
    const divX = padX + logoBoxW + 18
    this.stroke(NAVY_LINE)
    doc.setLineWidth(1)
    doc.line(divX, y + 22, divX, y + h - 22)

    // Nome + linhas de informação
    const infoX = divX + 16
    this.ink(WHITE)
    this.font('bold', 15)
    doc.text(this.clienteNome, infoX, y + 36, {
      maxWidth: x + w - infoX - 14,
    })

    const k = this.input.data.kpis
    const vidas = (k.vidasAtivas ?? k.vidasComUtilizacao ?? 0).toLocaleString(
      'pt-BR',
    )
    const infos: {
      label: string
      valor: string
      icone: 'calendario' | 'pessoas' | 'cifrao'
    }[] = [
      { label: 'PERÍODO ANALISADO', valor: this.periodoLabel, icone: 'calendario' },
      { label: 'VIDAS ATIVAS', valor: vidas, icone: 'pessoas' },
      {
        label: 'VALOR UTILIZADO NO PERÍODO',
        valor: formatBRL(k.valorUtilizado),
        icone: 'cifrao',
      },
    ]
    let iy = y + 70
    for (const info of infos) {
      if (info.icone === 'calendario') {
        this.capaIconeCalendario(infoX, iy - 6, 10, BLUE_LT)
      } else if (info.icone === 'pessoas') {
        this.capaIconePessoa(infoX + 1, iy - 6, BLUE_LT)
      } else {
        this.capaIconeCifrao(infoX + 5, iy - 1, BLUE_LT)
      }
      this.ink([140, 160, 195])
      this.font('normal', 7.5)
      this.doc.text(info.label, infoX + 20, iy - 3, { charSpace: 0.6 })
      this.ink(WHITE)
      this.font('bold', 11)
      this.doc.text(info.valor, infoX + 20, iy + 10)
      iy += 32
    }
  }

  /** Selo de sinistralidade com status qualitativo. */
  private capaCartaoSinistralidade(x: number, y: number, w: number, h: number) {
    const doc = this.doc
    const sin = this.input.data.evolucaoSinistralidade.at(-1)?.valor ?? null

    const status =
      sin === null
        ? { cor: CAPA_MUTED, linhas: ['SEM FATURA', 'NO PERÍODO'] }
        : sin < 75
          ? { cor: TEAL, linhas: ['EM PATAMAR', 'SAUDÁVEL'] }
          : sin < 100
            ? { cor: AMBER_CAPA, linhas: ['EM ZONA DE', 'ATENÇÃO'] }
            : { cor: RED_CAPA, linhas: ['ACIMA DO', 'EQUILÍBRIO'] }

    this.fill(NAVY_SOFT)
    doc.roundedRect(x, y, w, h, 10, 10, 'F')
    this.stroke(sin !== null && sin < 75 ? TEAL_DIM : NAVY_LINE)
    doc.setLineWidth(1)
    doc.roundedRect(x, y, w, h, 10, 10, 'S')

    const cx = x + w / 2
    this.capaIconeCheckCircle(cx, y + 34, 15, status.cor)

    this.ink([210, 222, 240])
    this.font('bold', 9)
    doc.text('SINISTRALIDADE', cx, y + 66, { align: 'center', charSpace: 1 })

    this.ink(status.cor)
    this.font('bold', 25)
    doc.text(sin === null ? '—' : pct(sin), cx, y + 96, { align: 'center' })

    this.stroke(NAVY_LINE)
    doc.setLineWidth(0.9)
    doc.line(cx - 30, y + 110, cx + 30, y + 110)

    this.ink(status.cor)
    this.font('bold', 9.5)
    doc.text(status.linhas[0], cx, y + 130, { align: 'center', charSpace: 0.5 })
    doc.text(status.linhas[1], cx, y + 143, { align: 'center', charSpace: 0.5 })
  }

  /** Régua de 4 KPIs da capa (eventos, vidas, internações, saúde mental). */
  private capaKpis(x: number, y: number, w: number, h: number) {
    const doc = this.doc
    this.fill(NAVY_SOFT)
    doc.roundedRect(x, y, w, h, 10, 10, 'F')
    this.stroke(NAVY_LINE)
    doc.setLineWidth(0.8)
    doc.roundedRect(x, y, w, h, 10, 10, 'S')

    const k = this.input.data.kpis
    const cel = w / 4
    const kpis: {
      valor: number
      linhas: string[]
      icone: 'barras' | 'pessoa' | 'leito' | 'coracao'
    }[] = [
      { valor: k.eventos, linhas: ['EVENTOS'], icone: 'barras' },
      {
        valor: k.vidasComUtilizacao,
        linhas: ['VIDAS COM', 'UTILIZAÇÃO'],
        icone: 'pessoa',
      },
      { valor: k.internacoes, linhas: ['INTERNAÇÕES'], icone: 'leito' },
      {
        valor: k.saudeMental,
        linhas: ['EVENTOS DE', 'SAÚDE MENTAL'],
        icone: 'coracao',
      },
    ]

    kpis.forEach((kpi, i) => {
      const x0 = x + i * cel
      if (i > 0) {
        this.stroke(NAVY_LINE)
        doc.setLineWidth(0.8)
        doc.line(x0, y + 16, x0, y + h - 16)
      }
      const icx = x0 + 26
      const icy = y + h / 2
      this.stroke(BLUE_LT)
      doc.setLineWidth(1.3)
      doc.circle(icx, icy, 13, 'S')
      if (kpi.icone === 'barras') this.capaIconeBarras(icx, icy, BLUE_LT)
      else if (kpi.icone === 'pessoa') this.capaIconePessoa(icx - 4, icy - 6, BLUE_LT)
      else if (kpi.icone === 'leito') this.capaIconeLeito(icx, icy, BLUE_LT)
      else this.capaIconeCoracao(icx, icy, BLUE_LT)

      this.ink(BLUE_LT)
      this.font('bold', 19)
      doc.text(kpi.valor.toLocaleString('pt-BR'), x0 + 46, y + h / 2 + 2)
      this.ink(CAPA_LABEL)
      this.font('bold', 6.3)
      kpi.linhas.forEach((linha, li) => {
        doc.text(linha, x0 + 46, y + h / 2 + 13 + li * 8, { charSpace: 0.4 })
      })
    })
  }

  // ---- ícones vetoriais da capa -------------------------------------------
  private capaIconeCheckCircle(cx: number, cy: number, r: number, cor: RGB) {
    const doc = this.doc
    this.stroke(cor)
    doc.setLineWidth(1.6)
    doc.circle(cx, cy, r, 'S')
    const s = r / 9
    doc.setLineWidth(1.7)
    doc.line(cx - 4 * s, cy + 0.5 * s, cx - 1.2 * s, cy + 3.5 * s)
    doc.line(cx - 1.2 * s, cy + 3.5 * s, cx + 4.5 * s, cy - 3 * s)
  }

  private capaIconeCalendario(x: number, y: number, w: number, cor: RGB) {
    const doc = this.doc
    this.stroke(cor)
    doc.setLineWidth(1)
    doc.roundedRect(x, y, w, w * 0.9, 1.5, 1.5, 'S')
    doc.line(x, y + 3, x + w, y + 3)
    doc.line(x + 2.5, y - 1.5, x + 2.5, y + 1)
    doc.line(x + w - 2.5, y - 1.5, x + w - 2.5, y + 1)
  }

  private capaIconePessoa(x: number, y: number, cor: RGB) {
    const doc = this.doc
    this.stroke(cor)
    doc.setLineWidth(1.1)
    doc.circle(x + 4, y + 2.5, 2.4, 'S')
    doc.lines(
      [[0.5, -4, 7.5, -4, 8, 0]],
      x,
      y + 10.5,
      [1, 1],
      'S',
    )
  }

  private capaIconeCifrao(x: number, y: number, cor: RGB) {
    this.ink(cor)
    this.font('bold', 11)
    this.doc.text('$', x, y, { align: 'center' })
  }

  private capaIconeBarras(cx: number, cy: number, cor: RGB) {
    const doc = this.doc
    this.fill(cor)
    doc.rect(cx - 5.5, cy + 1, 2.6, 4.5, 'F')
    doc.rect(cx - 1.3, cy - 2, 2.6, 7.5, 'F')
    doc.rect(cx + 2.9, cy - 5, 2.6, 10.5, 'F')
  }

  private capaIconeLeito(cx: number, cy: number, cor: RGB) {
    const doc = this.doc
    this.stroke(cor)
    doc.setLineWidth(1.1)
    // Estrutura da cama + travesseiro + pernas
    doc.line(cx - 6.5, cy - 4, cx - 6.5, cy + 4.5)
    doc.line(cx - 6.5, cy + 1.5, cx + 6.5, cy + 1.5)
    doc.line(cx + 6.5, cy - 1, cx + 6.5, cy + 4.5)
    doc.roundedRect(cx - 5, cy - 2.5, 3.4, 2.6, 0.8, 0.8, 'S')
    doc.line(cx - 1, cy - 1, cx + 6.5, cy - 1)
  }

  private capaIconeCoracao(cx: number, cy: number, cor: RGB) {
    const doc = this.doc
    this.fill(cor)
    doc.circle(cx - 2, cy - 1.6, 2.3, 'F')
    doc.circle(cx + 2, cy - 1.6, 2.3, 'F')
    doc.triangle(cx - 4.2, cy - 0.6, cx + 4.2, cy - 0.6, cx, cy + 4.6, 'F')
  }

  private capaIconeCadeado(x: number, y: number, cor: RGB) {
    const doc = this.doc
    this.stroke(cor)
    doc.setLineWidth(1)
    // Corpo + alça
    doc.roundedRect(x, y + 3, 8, 6, 1, 1, 'S')
    doc.lines([[0, -3.5, 4, -3.5, 4, 0]], x + 2, y + 3, [1, 1], 'S')
  }

  private drawLogoFallback(x: number, y: number, w: number, h: number) {
    this.fill([28, 48, 90])
    this.doc.roundedRect(x, y, w, h, 6, 6, 'F')
    this.ink(WHITE)
    this.font('bold', 12)
    this.doc.text(this.clienteNome, x + w / 2, y + h / 2, {
      align: 'center',
      baseline: 'middle',
      maxWidth: w - 16,
    })
  }

  private dataEmissao(): string {
    const d = new Date()
    const dia = String(d.getDate()).padStart(2, '0')
    const mes = MESES_EXT[d.getMonth()]
    return `${dia} de ${mes} de ${d.getFullYear()}`
  }

  // ---- sumário -------------------------------------------------------------
  private sumario(secoes: { num: string; nome: string }[]) {
    this.newContentPage()
    this.sectionTitle(null, 'Sumário')
    this.font('normal', 11)
    for (const s of secoes) {
      this.ensure(22)
      this.ink(BLUE)
      this.font('bold', 11)
      this.doc.text(s.num, MARGIN, this.y)
      this.ink(INK)
      this.font('normal', 11)
      this.doc.text(s.nome, MARGIN + 34, this.y)
      // linha pontilhada até a borda
      this.stroke(LINE)
      this.doc.setLineDashPattern([1, 2], 0)
      this.doc.setLineWidth(0.6)
      this.doc.line(
        MARGIN + 34 + this.doc.getTextWidth(s.nome) + 8,
        this.y - 3,
        PAGE_W - MARGIN,
        this.y - 3,
      )
      this.doc.setLineDashPattern([], 0)
      this.y += 22
    }

    this.y += 6
    this.paragraph(
      'Documento gerado automaticamente a partir dos dados importados, com análise executiva derivada dos indicadores da carteira.',
      { muted: true, size: 9.5 },
    )

    if (this.anonimizado) {
      this.avisoLGPD()
    }
  }

  private avisoLGPD() {
    const doc = this.doc
    const linhas = doc.splitTextToSize(AVISO_LGPD, USABLE_W - 60) as string[]
    const h = 30 + linhas.length * 12
    this.ensure(h)
    this.fill([239, 246, 255])
    doc.roundedRect(MARGIN, this.y, USABLE_W, h, 6, 6, 'F')
    this.fill(BLUE)
    doc.rect(MARGIN, this.y, 3.5, h, 'F')
    this.ink(BLUE)
    this.font('bold', 10.5)
    doc.text('Relatório anonimizado — Conformidade LGPD', MARGIN + 18, this.y + 20)
    this.ink(INK)
    this.font('normal', 9)
    doc.text(linhas, MARGIN + 18, this.y + 34)
    this.y += h + 14
  }

  // ---- blocos de conteúdo --------------------------------------------------
  private sectionTitle(numero: string | null, titulo: string) {
    this.ensure(46)
    const doc = this.doc
    if (numero) {
      this.ink(BLUE)
      this.font('bold', 20)
      doc.text(numero, MARGIN, this.y + 4)
    }
    this.ink(INK)
    this.font('bold', 16)
    doc.text(titulo, MARGIN + (numero ? 42 : 0), this.y + 2)
    this.y += 12
    this.stroke(BLUE)
    doc.setLineWidth(1.5)
    doc.line(MARGIN, this.y, MARGIN + 40, this.y)
    this.stroke(LINE)
    doc.setLineWidth(0.6)
    doc.line(MARGIN + 46, this.y, PAGE_W - MARGIN, this.y)
    this.y += 20
  }

  private subTitle(texto: string) {
    this.ensure(28)
    this.ink(INK)
    this.font('bold', 11.5)
    this.doc.text(texto, MARGIN, this.y)
    this.y += 16
  }

  private paragraph(
    texto: string,
    opts: { muted?: boolean; size?: number } = {},
  ) {
    const size = opts.size ?? 10.5
    this.font('normal', size)
    this.ink(opts.muted ? MUTED : INK)
    const linhas = this.doc.splitTextToSize(texto, USABLE_W) as string[]
    const lh = size * 1.35
    for (const linha of linhas) {
      this.ensure(lh)
      this.doc.text(linha, MARGIN, this.y)
      this.y += lh
    }
    this.y += 6
  }

  /** Nota de rodapé da seção: texto pequeno, cinza, com recuo de marcador. */
  private nota(texto: string) {
    const size = 8
    this.font('normal', size)
    this.ink(MUTED)
    const linhas = this.doc.splitTextToSize(texto, USABLE_W - 12) as string[]
    const lh = size * 1.3
    this.y += 4
    for (let i = 0; i < linhas.length; i++) {
      this.ensure(lh)
      if (i === 0) this.doc.text('*', MARGIN, this.y)
      this.doc.text(linhas[i], MARGIN + 12, this.y)
      this.y += lh
    }
    this.y += 6
  }

  private vazio(texto: string) {
    this.ensure(40)
    const doc = this.doc
    this.fill(ZEBRA)
    const linhas = doc.splitTextToSize(texto, USABLE_W - 32) as string[]
    const h = 20 + linhas.length * 13
    doc.roundedRect(MARGIN, this.y, USABLE_W, h, 6, 6, 'F')
    this.ink(MUTED)
    this.font('normal', 10)
    doc.text(linhas, MARGIN + 16, this.y + 18)
    this.y += h + 12
  }

  // KPIs em grade de 4 colunas
  private kpis(items: { label: string; valor: string; destaque?: boolean }[]) {
    const doc = this.doc
    const perRow = 4
    const gap = 12
    const cardW = (USABLE_W - gap * (perRow - 1)) / perRow
    const cardH = 54
    for (let i = 0; i < items.length; i += perRow) {
      const linha = items.slice(i, i + perRow)
      this.ensure(cardH + 12)
      linha.forEach((kpi, j) => {
        const x = MARGIN + j * (cardW + gap)
        this.fill(kpi.destaque ? [239, 246, 255] : ZEBRA)
        doc.roundedRect(x, this.y, cardW, cardH, 6, 6, 'F')
        if (kpi.destaque) {
          this.fill(BLUE)
          doc.rect(x, this.y, 3, cardH, 'F')
        }
        this.ink(MUTED)
        this.font('normal', 7.8)
        const lblLines = doc.splitTextToSize(
          kpi.label.toUpperCase(),
          cardW - 20,
        ) as string[]
        doc.text(lblLines.slice(0, 2), x + 12, this.y + 16)
        this.ink(kpi.destaque ? BLUE : INK)
        this.font('bold', 15)
        doc.text(kpi.valor, x + 12, this.y + cardH - 12)
      })
      this.y += cardH + 12
    }
  }

  // Tabela genérica com quebra de página e repetição de cabeçalho
  private table(cols: Col[], rows: string[][]) {
    const doc = this.doc
    const padX = 8
    const padY = 6
    const headerH = 22
    const fontSize = 8.8
    const lh = fontSize * 1.25

    const colX: number[] = []
    let acc = MARGIN
    for (const c of cols) {
      colX.push(acc)
      acc += c.width
    }

    const drawHeader = () => {
      this.fill(BLUE)
      doc.rect(MARGIN, this.y, USABLE_W, headerH, 'F')
      this.ink(WHITE)
      this.font('bold', fontSize)
      cols.forEach((c, i) => {
        const align = c.align ?? 'left'
        const tx =
          align === 'right'
            ? colX[i] + c.width - padX
            : align === 'center'
              ? colX[i] + c.width / 2
              : colX[i] + padX
        doc.text(c.header, tx, this.y + 15, { align })
      })
      this.y += headerH
    }

    this.ensure(headerH + 28)
    drawHeader()

    rows.forEach((row, ri) => {
      // wrap por célula e altura da linha
      const wrapped = row.map((cell, i) =>
        doc.splitTextToSize(cell ?? '', cols[i].width - padX * 2),
      ) as string[][]
      const maxLines = Math.max(1, ...wrapped.map((w) => w.length))
      const rowH = padY * 2 + maxLines * lh

      if (this.y + rowH > CONTENT_BOTTOM) {
        this.newContentPage()
        drawHeader()
      }

      if (ri % 2 === 1) {
        this.fill(ZEBRA)
        doc.rect(MARGIN, this.y, USABLE_W, rowH, 'F')
      }
      this.ink(INK)
      this.font('normal', fontSize)
      cols.forEach((c, i) => {
        const align = c.align ?? 'left'
        const tx =
          align === 'right'
            ? colX[i] + c.width - padX
            : align === 'center'
              ? colX[i] + c.width / 2
              : colX[i] + padX
        doc.text(wrapped[i], tx, this.y + padY + fontSize, { align })
      })
      this.y += rowH
    })

    // moldura externa
    this.stroke(LINE)
    doc.setLineWidth(0.6)
    doc.line(MARGIN, this.y, PAGE_W - MARGIN, this.y)
    this.y += 16
  }

  // Cartões de recomendação
  private recomendacoes(items: { titulo: string; descricao: string }[]) {
    const doc = this.doc
    for (const r of items) {
      const descLines = doc.splitTextToSize(r.descricao, USABLE_W - 28) as string[]
      const h = 30 + descLines.length * 12
      this.ensure(h + 8)
      this.fill(ZEBRA)
      doc.roundedRect(MARGIN, this.y, USABLE_W, h, 6, 6, 'F')
      this.fill(BLUE)
      doc.rect(MARGIN, this.y, 3, h, 'F')
      this.ink(INK)
      this.font('bold', 10.5)
      doc.text(r.titulo, MARGIN + 16, this.y + 18)
      this.ink(MUTED)
      this.font('normal', 9)
      doc.text(descLines, MARGIN + 16, this.y + 32)
      this.y += h + 8
    }
  }

  // ---- gráficos vetoriais --------------------------------------------------
  private chartFrame(altura: number): {
    x: number
    y: number
    w: number
    h: number
  } {
    this.ensure(altura + 16)
    const x = MARGIN
    const y = this.y
    const w = USABLE_W
    const h = altura
    this.y += altura + 16
    return { x, y, w, h }
  }

  /**
   * Evolução da sinistralidade. Para evitar poluição visual, o eixo é limitado
   * a 0–200% sempre que houver competências com valores excepcionalmente altos
   * (ex.: 1234%); nesses casos o ponto é comprimido para o teto e sinalizado.
   * Retorna quantas competências foram comprimidas (para a nota de rodapé).
   */
  private lineChartSinistralidade(serie: { mes: string; valor: number }[]): number {
    const doc = this.doc
    const { x, y, w, h } = this.chartFrame(190)
    const padL = 44
    const padR = 16
    const padT = 22
    const padB = 26
    const plotX = x + padL
    const plotY = y + padT
    const plotW = w - padL - padR
    const plotH = h - padT - padB

    const valores = serie.map((s) => s.valor)
    const rawMax = Math.max(0, ...valores)
    const CEIL = 200
    const comprimir = rawMax > CEIL
    const maxV = comprimir ? CEIL : Math.max(100, rawMax) * 1.12
    const scaleY = (v: number) =>
      plotY + plotH - (Math.min(v, maxV) / maxV) * plotH
    const stepX = serie.length > 1 ? plotW / (serie.length - 1) : 0

    // gridlines + rótulos do eixo Y
    this.stroke(LINE)
    doc.setLineWidth(0.5)
    this.font('normal', 7.5)
    for (let g = 0; g <= 4; g++) {
      const val = (maxV / 4) * g
      const gy = scaleY(val)
      doc.line(plotX, gy, plotX + plotW, gy)
      this.ink(MUTED)
      const rotulo = comprimir && g === 4 ? `${Math.round(val)}%+` : `${Math.round(val)}%`
      doc.text(rotulo, plotX - 6, gy + 2.5, { align: 'right' })
    }

    // linha de equilíbrio técnico (75%)
    if (75 < maxV) {
      this.stroke(AMBER)
      doc.setLineWidth(0.8)
      doc.setLineDashPattern([3, 2], 0)
      const ry = scaleY(75)
      doc.line(plotX, ry, plotX + plotW, ry)
      doc.setLineDashPattern([], 0)
      this.ink(AMBER)
      this.font('normal', 7)
      doc.text('equilíbrio 75%', plotX + plotW, ry - 3, { align: 'right' })
    }

    // linha da série (usando valores comprimidos ao teto)
    this.stroke(BLUE)
    doc.setLineWidth(1.6)
    const pts = serie.map((s, i) => ({
      px: plotX + i * stepX,
      py: scaleY(s.valor),
      foraEscala: s.valor > maxV,
    }))
    for (let i = 1; i < pts.length; i++) {
      doc.line(pts[i - 1].px, pts[i - 1].py, pts[i].px, pts[i].py)
    }
    // pontos + valores + rótulos do eixo X
    let comprimidos = 0
    pts.forEach((p, i) => {
      if (p.foraEscala) {
        comprimidos++
        // marcador losango âmbar para o ponto comprimido
        this.fill(AMBER)
        const s = 3.2
        doc.triangle(p.px, p.py - s, p.px - s, p.py + s, p.px + s, p.py + s, 'F')
        this.ink(AMBER)
        this.font('bold', 7.5)
        doc.text(`${serie[i].valor.toFixed(0)}%`, p.px, p.py - 7, { align: 'center' })
      } else {
        this.fill(BLUE)
        doc.circle(p.px, p.py, 2.4, 'F')
        this.ink(BLUE)
        this.font('bold', 7.5)
        doc.text(`${serie[i].valor.toFixed(0)}%`, p.px, p.py - 7, { align: 'center' })
      }
      this.ink(MUTED)
      this.font('normal', 7)
      doc.text(fmtCompShort(serie[i].mes), p.px, plotY + plotH + 14, {
        align: 'center',
      })
    })
    return comprimidos
  }

  /** Nota discreta abaixo de um gráfico. */
  private chartNote(texto: string) {
    this.ensure(20)
    this.ink(MUTED)
    this.font('normal', 8)
    const linhas = this.doc.splitTextToSize(texto, USABLE_W) as string[]
    for (const l of linhas) {
      this.doc.text(l, MARGIN, this.y)
      this.y += 11
    }
    this.y += 6
  }

  private groupedBarsUtilizacao(
    serie: { mes: string; utilizado: number; fatura: number }[],
  ) {
    const doc = this.doc
    const { x, y, w, h } = this.chartFrame(200)
    const padL = 52
    const padR = 12
    const padT = 24
    const padB = 26
    const plotX = x + padL
    const plotY = y + padT
    const plotW = w - padL - padR
    const plotH = h - padT - padB

    const maxV =
      Math.max(1, ...serie.flatMap((s) => [s.utilizado, s.fatura])) * 1.1
    const scaleY = (v: number) => plotY + plotH - (v / maxV) * plotH

    // grid + eixo Y compacto
    this.stroke(LINE)
    doc.setLineWidth(0.5)
    this.font('normal', 7)
    for (let g = 0; g <= 4; g++) {
      const val = (maxV / 4) * g
      const gy = scaleY(val)
      doc.line(plotX, gy, plotX + plotW, gy)
      this.ink(MUTED)
      doc.text(fmtCompacto(val), plotX - 6, gy + 2.5, { align: 'right' })
    }

    const groupW = plotW / serie.length
    const barW = Math.min(18, (groupW - 8) / 2)
    serie.forEach((s, i) => {
      const cx = plotX + i * groupW + groupW / 2
      const x1 = cx - barW - 1
      const x2 = cx + 1
      this.fill(BLUE)
      doc.rect(x1, scaleY(s.utilizado), barW, plotY + plotH - scaleY(s.utilizado), 'F')
      this.fill(BLUE_LT)
      doc.rect(x2, scaleY(s.fatura), barW, plotY + plotH - scaleY(s.fatura), 'F')
      this.ink(MUTED)
      this.font('normal', 7)
      doc.text(fmtCompShort(s.mes), cx, plotY + plotH + 14, { align: 'center' })
    })

    // legenda
    this.legend(plotX, y + 12, [
      { cor: BLUE, label: 'Utilizado' },
      { cor: BLUE_LT, label: 'Fatura' },
    ])
  }

  private hBarsCategorias(items: { nome: string; valor: number }[]) {
    const doc = this.doc
    const linhas = items.slice(0, 8)
    const rowH = 22
    const { x, y, w } = this.chartFrame(linhas.length * rowH + 10)
    const labelW = 150
    const valueW = 74
    const barX = x + labelW
    const barMaxW = w - labelW - valueW
    const maxV = Math.max(1, ...linhas.map((c) => c.valor))

    linhas.forEach((c, i) => {
      const by = y + i * rowH + 4
      this.ink(INK)
      this.font('normal', 8.5)
      const nome = doc.splitTextToSize(c.nome, labelW - 8)[0] as string
      doc.text(nome, x, by + 11)
      // trilho
      this.fill([237, 241, 247])
      doc.roundedRect(barX, by + 3, barMaxW, 12, 2, 2, 'F')
      // barra
      const bw = Math.max(2, (c.valor / maxV) * barMaxW)
      this.fill(BLUE)
      doc.roundedRect(barX, by + 3, bw, 12, 2, 2, 'F')
      this.ink(INK)
      this.font('bold', 8.5)
      doc.text(formatBRL(c.valor), x + w, by + 12, { align: 'right' })
    })
  }

  private vBarsFaixa(items: { faixa: string; beneficiarios: number }[]) {
    const doc = this.doc
    const { x, y, w, h } = this.chartFrame(180)
    const padT = 20
    const padB = 24
    const plotY = y + padT
    const plotH = h - padT - padB
    const maxV = Math.max(1, ...items.map((f) => f.beneficiarios)) * 1.15
    const groupW = w / items.length
    const barW = Math.min(46, groupW * 0.55)

    items.forEach((f, i) => {
      const cx = x + i * groupW + groupW / 2
      const bh = (f.beneficiarios / maxV) * plotH
      const by = plotY + plotH - bh
      this.fill(BLUE)
      doc.roundedRect(cx - barW / 2, by, barW, bh, 2, 2, 'F')
      this.ink(INK)
      this.font('bold', 8.5)
      doc.text(String(f.beneficiarios), cx, by - 4, { align: 'center' })
      this.ink(MUTED)
      this.font('normal', 7.5)
      const lbl = doc.splitTextToSize(f.faixa, groupW - 4) as string[]
      doc.text(lbl, cx, plotY + plotH + 12, { align: 'center' })
    })
    // base
    this.stroke(LINE)
    doc.setLineWidth(0.6)
    doc.line(x, plotY + plotH, x + w, plotY + plotH)
  }

  private legend(x: number, y: number, items: { cor: RGB; label: string }[]) {
    const doc = this.doc
    let lx = x
    this.font('normal', 8)
    for (const it of items) {
      this.fill(it.cor)
      doc.rect(lx, y - 6, 9, 9, 'F')
      this.ink(MUTED)
      doc.text(it.label, lx + 13, y + 1)
      lx += 20 + doc.getTextWidth(it.label) + 16
    }
  }

  // ---- renderização de markdown (Winners Decide IA) -----------------------
  /** Parágrafo com suporte a **negrito** inline e quebra de linha por palavra. */
  private richParagraph(
    texto: string,
    opts: { size?: number; indent?: number; color?: RGB; gap?: number } = {},
  ) {
    const size = opts.size ?? 10
    const indent = opts.indent ?? 0
    const color = opts.color ?? INK
    const lh = size * 1.4
    const maxW = USABLE_W - indent
    const x0 = MARGIN + indent

    // tokeniza preservando espaços e marcando trechos em **negrito**
    const parts = texto.split(/(\*\*[^*]+\*\*)/g).filter((s) => s.length > 0)
    const words: { t: string; bold: boolean }[] = []
    for (const part of parts) {
      const bold = part.startsWith('**') && part.endsWith('**')
      const clean = bold ? part.slice(2, -2) : part
      for (const tk of clean.split(/(\s+)/)) {
        if (tk.length > 0) words.push({ t: tk, bold })
      }
    }

    let lineWords: { t: string; bold: boolean }[] = []
    let lineWidth = 0
    const flush = () => {
      this.ensure(lh)
      let cx = x0
      for (const wd of lineWords) {
        this.font(wd.bold ? 'bold' : 'normal', size)
        this.ink(color)
        this.doc.text(wd.t, cx, this.y)
        cx += this.doc.getTextWidth(wd.t)
      }
      this.y += lh
      lineWords = []
      lineWidth = 0
    }

    for (const wd of words) {
      const isSpace = /^\s+$/.test(wd.t)
      if (lineWords.length === 0 && isSpace) continue
      this.font(wd.bold ? 'bold' : 'normal', size)
      const wWidth = this.doc.getTextWidth(wd.t)
      if (lineWidth + wWidth > maxW && lineWords.length > 0) {
        // não quebra deixando um espaço pendurado no fim da linha
        if (lineWords[lineWords.length - 1].t.trim() === '') lineWords.pop()
        flush()
        if (isSpace) continue
      }
      lineWords.push(wd)
      lineWidth += wWidth
    }
    if (lineWords.length > 0) flush()
    this.y += opts.gap ?? 4
  }

  private markdownBullet(texto: string) {
    const size = 10
    this.ensure(size * 1.4)
    this.fill(BLUE)
    this.doc.circle(MARGIN + 3, this.y - 3, 1.8, 'F')
    this.richParagraph(texto, { size, indent: 14, gap: 2 })
  }

  /** Renderiza um texto em markdown simples (## títulos, - listas, **negrito**). */
  private markdownBlock(md: string) {
    const linhas = md.replace(/\r/g, '').split('\n')
    for (const raw of linhas) {
      const line = raw.trimEnd()
      if (line.trim() === '') continue

      const heading = line.match(/^#{1,4}\s+(.*)$/)
      if (heading) {
        const t = heading[1]
          .replace(/\*\*/g, '')
          .replace(/^\d+\.\s*/, '')
          .trim()
        this.y += 6
        this.subTitle(t)
        continue
      }
      const bullet = line.match(/^\s*[-*]\s+(.*)$/)
      if (bullet) {
        this.markdownBullet(bullet[1])
        continue
      }
      const italic = line.match(/^_(.*)_$/)
      if (italic) {
        this.richParagraph(italic[1], { size: 8.5, color: MUTED })
        continue
      }
      this.richParagraph(line, { size: 10 })
    }
  }

  // ---- plano de ação agrupado por beneficiário ----------------------------
  private planoAgrupado(acoes: ResumoRadar['plano']['acoes']) {
    type Grupo = {
      display: string
      score: number
      faixaLabel: string
      prioridadeLabel: string
      valorTotal: number
      acoes: string[]
    }
    const grupos: Grupo[] = []
    const idx = new Map<string, number>()
    for (const a of acoes) {
      const key = a.carteirinha || a.display
      let gi = idx.get(key)
      if (gi === undefined) {
        gi = grupos.length
        idx.set(key, gi)
        grupos.push({
          display: a.display,
          score: a.score,
          faixaLabel: a.faixaLabel,
          prioridadeLabel: a.prioridadeLabel,
          valorTotal: a.valorTotal,
          acoes: [],
        })
      }
      if (!grupos[gi].acoes.includes(a.acao)) grupos[gi].acoes.push(a.acao)
    }

    const acaoLH = 15
    for (const g of grupos) {
      const cardH = 62 + g.acoes.length * acaoLH + 10
      this.ensure(cardH + 8)
      const y0 = this.y
      // moldura + barra de acento (cor conforme faixa)
      const acento = this.corFaixa(g.faixaLabel)
      this.fill(ZEBRA)
      this.doc.roundedRect(MARGIN, y0, USABLE_W, cardH, 6, 6, 'F')
      this.fill(acento)
      this.doc.rect(MARGIN, y0, 3, cardH, 'F')

      // nome do beneficiário
      this.ink(INK)
      this.font('bold', 11.5)
      this.doc.text(g.display, MARGIN + 14, y0 + 20)

      // chip da faixa (canto superior direito)
      const chipLabel = g.faixaLabel.toUpperCase()
      this.font('bold', 7.5)
      const chipTextW = this.doc.getTextWidth(chipLabel)
      const chipW = chipTextW + 16
      const chipX = PAGE_W - MARGIN - 12 - chipW
      this.fill(acento)
      this.doc.roundedRect(chipX, y0 + 10, chipW, 15, 7, 7, 'F')
      this.ink(WHITE)
      this.doc.text(chipLabel, chipX + chipW / 2, y0 + 20, { align: 'center' })

      // linha de indicadores
      this.ink(MUTED)
      this.font('normal', 9)
      this.doc.text(
        `Score ${g.score}  ·  Prioridade ${g.prioridadeLabel}  ·  Valor ${formatBRL(g.valorTotal)}`,
        MARGIN + 14,
        y0 + 38,
      )

      // rótulo das ações
      this.ink(INK)
      this.font('bold', 8.5)
      this.doc.text('AÇÕES RECOMENDADAS', MARGIN + 14, y0 + 54, { charSpace: 0.6 })

      // checklist
      let ay = y0 + 54 + acaoLH
      for (const acao of g.acoes) {
        this.drawCheck(MARGIN + 16, ay - 3)
        this.ink(INK)
        this.font('normal', 9.5)
        this.doc.text(acao, MARGIN + 28, ay, {
          maxWidth: USABLE_W - 44,
        })
        ay += acaoLH
      }
      this.y = y0 + cardH + 8
    }
  }

  /** Desenha um pequeno "check" vetorial em verde. */
  private drawCheck(x: number, y: number) {
    this.stroke(GREEN)
    this.doc.setLineWidth(1.3)
    this.doc.line(x, y, x + 2.4, y + 2.6)
    this.doc.line(x + 2.4, y + 2.6, x + 6.4, y - 3.2)
  }

  /** Cor de acento conforme a faixa/prioridade textual. */
  private corFaixa(label: string): RGB {
    const l = label.toLowerCase()
    if (l.includes('rític') || l.includes('critic')) return AMBER
    if (l.includes('alto') || l.includes('alta')) return [200, 120, 20]
    return BLUE
  }

  // ---- seção: Saúde Mental -------------------------------------------------
  private secaoSaudeMental(numero: string, sm: ResumoSaudeMental) {
    this.newContentPage()
    this.sectionTitle(numero, 'Saúde Mental')
    this.paragraph(
      'A saúde mental é hoje um dos principais temas da saúde corporativa. Esta seção consolida a utilização de psicologia e psiquiatria, o custo associado e sua participação no gasto assistencial do período.',
    )
    const tend =
      sm.tendenciaPct === null
        ? '—'
        : `${sm.tendenciaPct > 0 ? '+' : ''}${sm.tendenciaPct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
    this.kpis([
      { label: 'Eventos de saúde mental', valor: sm.eventos.toLocaleString('pt-BR'), destaque: true },
      { label: 'Beneficiários monitorados', valor: sm.beneficiarios.toLocaleString('pt-BR'), destaque: true },
      { label: 'Utilizações em psicologia', valor: sm.psicologia.toLocaleString('pt-BR') },
      { label: 'Utilizações em psiquiatria', valor: sm.psiquiatria.toLocaleString('pt-BR') },
      { label: 'Custo total associado', valor: formatBRL(sm.custo), destaque: true },
      { label: '% do custo assistencial', valor: pct(sm.pctCusto) },
      { label: 'Tendência de custo', valor: tend },
    ])

    if (sm.top.length > 0) {
      this.subTitle('Top beneficiários — Saúde Mental')
      this.table(
        [
          { header: '#', width: 30, align: 'right' },
          { header: 'Beneficiário', width: 210 },
          { header: 'Utilizações', width: 80, align: 'right' },
          { header: 'Custo', width: 100, align: 'right' },
          { header: '% do custo SM', width: USABLE_W - 420, align: 'right' },
        ],
        sm.top.map((b, i) => [
          String(i + 1),
          b.display,
          String(b.utilizacoes),
          formatBRL(b.custo),
          pct(b.participacaoPct),
        ]),
      )
    }

    this.calloutInterpretacao(sm.interpretacao)
  }

  /** Caixa de interpretação executiva (destaque azul). */
  private calloutInterpretacao(texto: string) {
    const doc = this.doc
    const linhas = doc.splitTextToSize(texto, USABLE_W - 60) as string[]
    const h = 26 + linhas.length * 13
    this.ensure(h + 8)
    this.fill([239, 246, 255])
    doc.roundedRect(MARGIN, this.y, USABLE_W, h, 6, 6, 'F')
    this.fill(BLUE)
    doc.rect(MARGIN, this.y, 3.5, h, 'F')
    this.ink(BLUE)
    this.font('bold', 9)
    doc.text('INTERPRETAÇÃO EXECUTIVA', MARGIN + 18, this.y + 18, { charSpace: 0.6 })
    this.ink(INK)
    this.font('normal', 9.5)
    doc.text(linhas, MARGIN + 18, this.y + 32)
    this.y += h + 12
  }

  // ---- seção: Beneficiários Prioritários para Intervenção -----------------
  private secaoIntervencao(
    numero: string,
    iv: ResumoRadar['intervencao'],
    miniResumos: MiniResumoBeneficiario[],
  ) {
    const doc = this.doc
    this.newContentPage()
    this.sectionTitle(numero, 'Beneficiários Prioritários para Intervenção')
    this.paragraph(
      'Classificação consultiva das vidas quanto à Prioridade de Intervenção (P1 a P4), ao Risco Assistencial Futuro e ao Potencial de Economia por gestão de saúde. Direciona onde concentrar esforços de gestão de caso e acompanhamento assistencial.',
    )

    // Card executivo: Oportunidades Prioritárias da Carteira
    const cardH = 96
    this.ensure(cardH + 12)
    const y0 = this.y
    this.fill(BLUE_XLT)
    doc.roundedRect(MARGIN, y0, USABLE_W, cardH, 10, 10, 'F')
    this.stroke([200, 215, 240])
    doc.setLineWidth(1)
    doc.roundedRect(MARGIN, y0, USABLE_W, cardH, 10, 10, 'S')
    this.fill(BLUE)
    doc.rect(MARGIN, y0, 4, cardH, 'F')
    this.ink(BLUE)
    this.font('bold', 11)
    doc.text('OPORTUNIDADES PRIORITÁRIAS DA CARTEIRA', MARGIN + 24, y0 + 28, {
      charSpace: 1,
    })
    // Quatro números-chave.
    const metr = [
      { v: iv.vidasP1.toLocaleString('pt-BR'), l: 'vidas P1 (ação imediata)' },
      { v: iv.vidasP2.toLocaleString('pt-BR'), l: 'vidas P2 (alta atenção)' },
      {
        v: iv.vidasEconomiaAlta.toLocaleString('pt-BR'),
        l: 'com potencial de economia alto',
      },
      {
        v: `${iv.pctCustoPrioritario.toFixed(1)}%`,
        l: 'do custo concentrado nesses casos',
      },
    ]
    const colW = (USABLE_W - 48) / 4
    metr.forEach((m, i) => {
      const x = MARGIN + 24 + i * colW
      this.ink(INK)
      this.font('bold', 22)
      doc.text(m.v, x, y0 + 62)
      this.ink(MUTED)
      this.font('normal', 8)
      doc.text(doc.splitTextToSize(m.l, colW - 8) as string[], x, y0 + 76)
    })
    this.y = y0 + cardH + 16

    // Indicador estratégico: Exposição Financeira Prioritária
    this.subTitle('Exposição Financeira Prioritária')
    this.paragraph(
      `${iv.pctCustoPrioritario.toFixed(1)}% do custo da carteira (${formatBRL(iv.valorPrioritario)}) está concentrado em beneficiários classificados como Prioridade 1 ou Prioridade 2 — os casos de maior retorno para ações de gestão assistencial.`,
    )

    // Tabela dos 5 prioritários com selos coloridos
    this.subTitle('Top 5 beneficiários prioritários')
    this.tabelaPrioritarios(iv.prioritarios)

    // Distribuições sobre toda a carteira
    this.subTitle('Distribuição por Prioridade de Intervenção')
    this.barrasDistribuicao(iv.distribuicaoPrioridade, (n) => PRIORIDADE_COR[n])
    this.subTitle('Distribuição por Potencial de Economia')
    this.barrasDistribuicao(iv.distribuicaoEconomia, (n) => ECONOMIA_COR[n])

    // Resumo executivo determinístico de oportunidades
    this.subTitle('Resumo Executivo de Oportunidades')
    this.paragraph(iv.resumoOportunidades)
    this.paragraph(
      'Texto gerado automaticamente a partir dos indicadores da carteira.',
      { muted: true, size: 8.5 },
    )

    // Mini-resumos dos maiores ofensores financeiros (Top 3 por custo)
    if (miniResumos.length > 0) {
      this.subTitle('Maiores ofensores financeiros — leitura rápida')
      this.paragraph(
        'Síntese individual dos três beneficiários de maior custo, para leitura executiva sem abrir o Panorama do Beneficiário.',
        { muted: true, size: 9 },
      )
      for (const m of miniResumos) this.cardMiniResumo(m)
    }
  }

  /** Card compacto de um beneficiário ofensor (Top 3 por custo). */
  private cardMiniResumo(m: MiniResumoBeneficiario) {
    const doc = this.doc
    const resumoLines = doc.splitTextToSize(m.resumo, USABLE_W - 32) as string[]
    // Limita a 5 linhas conforme spec.
    const linhas = resumoLines.slice(0, 5)
    const headH = 26
    const chipsH = 18
    const bodyH = linhas.length * 12
    const cardH = headH + chipsH + bodyH + 20
    this.ensure(cardH + 10)
    const y0 = this.y

    this.fill(ZEBRA)
    doc.roundedRect(MARGIN, y0, USABLE_W, cardH, 8, 8, 'F')
    const cor = PRIORIDADE_COR[m.prioridadeNivel] ?? BLUE
    this.fill(cor)
    doc.rect(MARGIN, y0, 4, cardH, 'F')

    // Nome + participação
    this.ink(INK)
    this.font('bold', 11)
    doc.text(m.display, MARGIN + 16, y0 + 20)
    this.ink(MUTED)
    this.font('normal', 9)
    doc.text(
      `${formatBRL(m.valorTotal)} · ${pct(m.participacaoPct)} da carteira`,
      PAGE_W - MARGIN - 12,
      y0 + 20,
      { align: 'right' },
    )

    // Chips: Prioridade · Risco Futuro · Economia
    let cx = MARGIN + 16
    const cy = y0 + headH + 6
    cx = this.chip(
      `${m.prioridadeNivel} – ${m.prioridadeRotulo}`,
      cx,
      cy,
      PRIORIDADE_COR[m.prioridadeNivel] ?? BLUE,
    )
    cx = this.chip(
      `Risco: ${m.riscoFuturo}`,
      cx,
      cy,
      RISCO_FUTURO_COR[m.riscoFuturo] ?? MUTED,
    )
    cx = this.chip(
      `Economia: ${m.economia}`,
      cx,
      cy,
      ECONOMIA_COR[m.economia] ?? MUTED,
    )

    // Resumo (máx. 5 linhas)
    this.ink(INK)
    this.font('normal', 9)
    doc.text(linhas, MARGIN + 16, cy + chipsH + 4)

    this.y = y0 + cardH + 10
  }

  /** Chip colorido com borda; devolve o x final para encadear. */
  private chip(texto: string, x: number, y: number, cor: RGB): number {
    const doc = this.doc
    this.font('bold', 8)
    const w = doc.getTextWidth(texto) + 16
    this.fill([255, 255, 255])
    doc.roundedRect(x, y, w, 14, 7, 7, 'F')
    this.stroke(cor)
    doc.setLineWidth(0.8)
    doc.roundedRect(x, y, w, 14, 7, 7, 'S')
    this.ink(cor)
    doc.text(texto, x + 8, y + 9.5)
    return x + w + 8
  }

  /** Tabela dos beneficiários prioritários com selo P1–P4 e níveis coloridos. */
  private tabelaPrioritarios(
    rows: ResumoRadar['intervencao']['prioritarios'],
  ) {
    const doc = this.doc
    const cols: { header: string; width: number; align?: ColAlign }[] = [
      { header: 'Beneficiário', width: 150 },
      { header: 'Prioridade', width: 130 },
      { header: 'Risco Futuro', width: 85 },
      { header: 'Pot. Economia', width: 80, align: 'center' },
      { header: '% Carteira', width: USABLE_W - 445, align: 'right' },
    ]
    const colX: number[] = []
    let acc = MARGIN
    for (const c of cols) {
      colX.push(acc)
      acc += c.width
    }
    const padX = 8
    const headerH = 22
    const rowH = 24
    const fontSize = 8.8

    const drawHeader = () => {
      this.fill(BLUE)
      doc.rect(MARGIN, this.y, USABLE_W, headerH, 'F')
      this.ink(WHITE)
      this.font('bold', fontSize)
      cols.forEach((c, i) => {
        const align = c.align ?? 'left'
        const tx =
          align === 'right'
            ? colX[i] + c.width - padX
            : align === 'center'
              ? colX[i] + c.width / 2
              : colX[i] + padX
        doc.text(c.header, tx, this.y + 15, { align })
      })
      this.y += headerH
    }

    this.ensure(headerH + rowH * 2)
    drawHeader()

    rows.forEach((b, ri) => {
      if (this.y + rowH > CONTENT_BOTTOM) {
        this.newContentPage()
        drawHeader()
      }
      if (ri % 2 === 1) {
        this.fill(ZEBRA)
        doc.rect(MARGIN, this.y, USABLE_W, rowH, 'F')
      }
      const baseY = this.y + 6 + fontSize
      // Beneficiário
      this.ink(INK)
      this.font('normal', fontSize)
      doc.text(b.display, colX[0] + padX, baseY)
      // Selo de prioridade: quadradinho colorido + "P1 – Ação Imediata"
      const cor = PRIORIDADE_COR[b.prioridadeNivel] ?? MUTED
      this.fill(cor)
      doc.roundedRect(colX[1] + padX, this.y + rowH / 2 - 4.5, 9, 9, 1.5, 1.5, 'F')
      this.ink(cor)
      this.font('bold', fontSize)
      doc.text(
        `${b.prioridadeNivel} – ${b.prioridadeRotulo}`,
        colX[1] + padX + 14,
        baseY,
      )
      // Risco Futuro (texto colorido)
      this.ink(RISCO_FUTURO_COR[b.riscoFuturo] ?? INK)
      this.font('bold', fontSize)
      doc.text(b.riscoFuturo, colX[2] + padX, baseY)
      // Potencial Economia (texto colorido, centralizado)
      this.ink(ECONOMIA_COR[b.economia] ?? INK)
      doc.text(b.economia, colX[3] + cols[3].width / 2, baseY, {
        align: 'center',
      })
      // % Carteira
      this.ink(INK)
      this.font('normal', fontSize)
      doc.text(
        pct(b.participacaoPct),
        colX[4] + cols[4].width - padX,
        baseY,
        { align: 'right' },
      )
      this.y += rowH
    })

    this.stroke(LINE)
    doc.setLineWidth(0.6)
    doc.line(MARGIN, this.y, PAGE_W - MARGIN, this.y)
    this.y += 16
  }

  /** Barras horizontais de distribuição por nível (vidas + % do custo). */
  private barrasDistribuicao(
    dados: ResumoRadar['intervencao']['distribuicaoPrioridade'],
    corDe: (nivel: string) => RGB,
  ) {
    const doc = this.doc
    const rotuloW = 150
    const valorW = 120
    const trackX = MARGIN + rotuloW
    const trackW = USABLE_W - rotuloW - valorW
    const rowH = 22
    const maxPct = Math.max(1, ...dados.map((d) => d.pctCusto))

    for (const d of dados) {
      this.ensure(rowH + 4)
      const cor = corDe(d.nivel) ?? MUTED
      // Rótulo: nível em destaque + descrição (omitida quando redundante).
      this.ink(INK)
      this.font('bold', 9)
      doc.text(`${d.nivel}`, MARGIN, this.y + 12)
      const nivelW = doc.getTextWidth(`${d.nivel}`)
      const mesmaPalavra =
        d.rotulo.trim().toLowerCase() === d.nivel.trim().toLowerCase()
      if (d.rotulo && !mesmaPalavra) {
        const descX = MARGIN + Math.max(24, nivelW + 8)
        this.ink(MUTED)
        this.font('normal', 8)
        doc.text(d.rotulo, descX, this.y + 12, {
          maxWidth: trackX - descX - 8,
        })
      }
      // Trilho + barra proporcional ao % do custo
      this.fill(ZEBRA)
      doc.roundedRect(trackX, this.y + 3, trackW, 12, 3, 3, 'F')
      const w = Math.max(2, (d.pctCusto / maxPct) * trackW)
      this.fill(cor)
      doc.roundedRect(trackX, this.y + 3, w, 12, 3, 3, 'F')
      // Valor à direita: vidas + % custo
      this.ink(INK)
      this.font('normal', 8.5)
      doc.text(
        `${d.vidas} vida(s) · ${d.pctCusto.toFixed(1)}% custo`,
        PAGE_W - MARGIN,
        this.y + 12,
        { align: 'right' },
      )
      this.y += rowH
    }
    this.y += 8
  }

  // ---- seção: Oportunidade de Economia ------------------------------------
  private secaoEconomia(
    numero: string,
    plano: ResumoRadar['plano'],
  ) {
    const doc = this.doc
    this.newContentPage()
    this.sectionTitle(numero, 'Oportunidade de Economia')

    // Bloco premium de destaque
    const cardH = 112
    this.ensure(cardH + 12)
    const y0 = this.y
    this.fill(GREEN_LT)
    doc.roundedRect(MARGIN, y0, USABLE_W, cardH, 10, 10, 'F')
    this.stroke([200, 224, 208])
    doc.setLineWidth(1)
    doc.roundedRect(MARGIN, y0, USABLE_W, cardH, 10, 10, 'S')
    this.fill(GREEN)
    doc.rect(MARGIN, y0, 4, cardH, 'F')

    this.ink(GREEN)
    this.font('bold', 11)
    doc.text('ECONOMIA POTENCIAL ESTIMADA', MARGIN + 24, y0 + 32, { charSpace: 1 })
    this.ink(INK)
    this.font('bold', 40)
    doc.text(formatBRL(plano.economiaPotencial), MARGIN + 24, y0 + 74)
    this.ink(MUTED)
    this.font('normal', 9)
    doc.text(
      `Base: redução conservadora de ${(plano.taxaEconomia * 100).toFixed(0)}% da utilização das ${plano.beneficiariosPrioritarios.toLocaleString('pt-BR')} vidas prioritárias.`,
      MARGIN + 24,
      y0 + 96,
    )
    this.y = y0 + cardH + 16

    this.paragraph(
      'Estimativa baseada na redução conservadora da utilização das vidas prioritárias por meio de ações preventivas e gestão de saúde. O valor representa o potencial de mitigação de custo evitável ao longo dos próximos ciclos, não uma garantia contratual.',
    )

    this.subTitle('Principais alavancas de economia')
    this.alavancas([
      { titulo: 'Gestão de Casos Críticos', desc: 'Acompanhamento dedicado das vidas de maior risco e custo, com plano de cuidado individualizado.' },
      { titulo: 'Monitoramento Pós-Alta', desc: 'Redução de reinternações por meio de seguimento estruturado após internações.' },
      { titulo: 'Saúde Mental', desc: 'Programas preventivos e direcionamento adequado de psicologia e psiquiatria.' },
      { titulo: 'Direcionamento Assistencial', desc: 'Orientação da rede e do nível de atendimento adequado a cada necessidade.' },
      { titulo: 'Redução de Reinternações', desc: 'Protocolos de continuidade do cuidado para evitar reentradas hospitalares.' },
      { titulo: 'Uso adequado de Pronto-Socorro', desc: 'Substituição de PS evitável por atenção primária e telemedicina.' },
    ])
  }

  /** Grade de 2 colunas com as alavancas de economia. */
  private alavancas(items: { titulo: string; desc: string }[]) {
    const doc = this.doc
    const gap = 12
    const colW = (USABLE_W - gap) / 2
    for (let i = 0; i < items.length; i += 2) {
      const linha = items.slice(i, i + 2)
      // altura da linha = maior dos dois cards
      const alturas = linha.map((it) => {
        const descLines = doc.splitTextToSize(it.desc, colW - 40) as string[]
        return 30 + descLines.length * 11
      })
      const rowH = Math.max(...alturas)
      this.ensure(rowH + 10)
      linha.forEach((it, j) => {
        const x = MARGIN + j * (colW + gap)
        this.fill(ZEBRA)
        doc.roundedRect(x, this.y, colW, rowH, 6, 6, 'F')
        this.drawCheck(x + 14, this.y + 15)
        this.ink(INK)
        this.font('bold', 10)
        doc.text(it.titulo, x + 26, this.y + 18, { maxWidth: colW - 34 })
        this.ink(MUTED)
        this.font('normal', 8.5)
        const descLines = doc.splitTextToSize(it.desc, colW - 40) as string[]
        doc.text(descLines, x + 26, this.y + 32)
      })
      this.y += rowH + 10
    }
    this.y += 4
  }

  // ---- seção: Winners Decide IA -------------------------------------------
  private secaoWinnersDecideIA(numero: string, analiseIA: AnaliseIA) {
    this.newContentPage()
    this.sectionTitle(numero, 'Winners Decide IA')
    this.ink(MUTED)
    this.font('normal', 10.5)
    this.doc.text(
      'Análise Estratégica Assistida por Inteligência Artificial',
      MARGIN,
      this.y,
    )
    this.y += 18

    // etiqueta de origem da análise
    const origem =
      analiseIA.fonte === 'ia'
        ? 'Análise generativa (OpenAI) sobre dados anonimizados da carteira.'
        : 'Análise determinística baseada nos mesmos dados da plataforma.'
    this.ink([120, 130, 150])
    this.font('normal', 8.5)
    this.doc.text(origem, MARGIN, this.y)
    this.y += 16

    this.markdownBlock(analiseIA.texto)
  }

  // ---- cabeçalho / rodapé (passe final) -----------------------------------
  private stampHeadersFooters() {
    const doc = this.doc
    const total = doc.getNumberOfPages()
    const conteudoTotal = total - this.coverPages.size
    let contador = 0
    for (let p = 1; p <= total; p++) {
      if (this.coverPages.has(p)) continue
      contador++
      doc.setPage(p)

      // Cabeçalho
      this.ink(INK)
      this.font('bold', 9.5)
      doc.text('Relatório Executivo de Sinistralidade', MARGIN, 46)
      this.ink(MUTED)
      this.font('normal', 9)
      doc.text(this.clienteNome, PAGE_W - MARGIN, 46, { align: 'right' })
      this.stroke(LINE)
      doc.setLineWidth(0.6)
      doc.line(MARGIN, 58, PAGE_W - MARGIN, 58)

      // Rodapé
      const fy = PAGE_H - 34
      this.stroke(LINE)
      doc.setLineWidth(0.6)
      doc.line(MARGIN, fy - 12, PAGE_W - MARGIN, fy - 12)
      this.ink(MUTED)
      this.font('normal', 8)
      doc.text('Winners Health Intelligence', MARGIN, fy)
      doc.text(
        this.anonimizado
          ? 'Confidencial — anonimizado (LGPD)'
          : 'Confidencial — uso restrito',
        PAGE_W / 2,
        fy,
        { align: 'center' },
      )
      this.font('bold', 8)
      this.ink(INK)
      doc.text(`Página ${contador} de ${conteudoTotal}`, PAGE_W - MARGIN, fy, {
        align: 'right',
      })
    }
  }

  // ---- montagem ------------------------------------------------------------
  build(): ArrayBuffer {
    const { data, analise, resumoRadar, painel } = this.input
    const k = data.kpis
    const sinistralidade = data.evolucaoSinistralidade.at(-1)?.valor ?? null

    // Seção de intervenção só aparece quando há vidas classificadas.
    const temIntervencao = resumoRadar.total > 0
    const secoes = [
      { num: '01', nome: 'Resumo Executivo' },
      { num: '02', nome: 'Informações Contratuais' },
      { num: '03', nome: 'Análise Populacional' },
      { num: '04', nome: 'Análise de Sinistralidade' },
      { num: '05', nome: 'Análise de Utilização' },
      { num: '06', nome: 'Análise de Custo Assistencial' },
      { num: '07', nome: 'Top Utilizadores' },
    ]
    if (temIntervencao)
      secoes.push({ num: '08', nome: 'Beneficiários Prioritários para Intervenção' })
    secoes.push({ num: '09', nome: 'Top Prestadores' })
    secoes.push({ num: '10', nome: 'Radar de Risco' })
    const { saudeMental, analiseIA } = this.input
    const temPlano =
      resumoRadar.total > 0 && resumoRadar.plano.beneficiariosPrioritarios > 0
    if (temPlano) secoes.push({ num: '10.1', nome: 'Plano de Ação Preventivo' })

    // Numeração dinâmica das seções finais (só aparecem quando há conteúdo).
    const temSaudeMental = Boolean(saudeMental && saudeMental.eventos > 0)
    let n = 11
    const numSaudeMental = temSaudeMental ? String(n++) : null
    const numEconomia = temPlano ? String(n++) : null
    // Seção suprimida quando a análise não passou na validação automática:
    // sem número, sem entrada no sumário e sem página. Relatório sem a seção é
    // publicável; relatório que se contradiz não é.
    const iaPublicavel = Boolean(analiseIA && analiseIA.fonte !== 'suprimida')
    const numIA = iaPublicavel ? String(n++) : null
    const numConclusoes = String(n++)
    if (numSaudeMental) secoes.push({ num: numSaudeMental, nome: 'Saúde Mental' })
    if (numEconomia) secoes.push({ num: numEconomia, nome: 'Oportunidade de Economia' })
    if (numIA) secoes.push({ num: numIA, nome: 'Winners Decide IA' })
    secoes.push({ num: numConclusoes, nome: 'Conclusões e Recomendações' })

    // CAPA + SUMÁRIO
    this.capa()
    this.sumario(secoes)

    // 1. RESUMO EXECUTIVO
    this.newContentPage()
    this.sectionTitle('1', 'Resumo Executivo')
    this.paragraph(analise.resumoExecutivo)
    this.kpis([
      { label: 'Valor utilizado', valor: formatBRL(k.valorUtilizado), destaque: true },
      { label: 'Sinistralidade', valor: pct(sinistralidade), destaque: true },
      { label: 'Eventos', valor: k.eventos.toLocaleString('pt-BR') },
      { label: 'Vidas com utilização', valor: k.vidasComUtilizacao.toLocaleString('pt-BR') },
      { label: 'Vidas ativas', valor: k.vidasAtivas?.toLocaleString('pt-BR') ?? '—' },
      {
        label: 'Custo médio / vida',
        valor: data.vidas.custoMedioVida !== null ? formatBRL(data.vidas.custoMedioVida) : '—',
      },
      { label: 'Internações', valor: k.internacoes.toLocaleString('pt-BR') },
      { label: 'Saúde mental', valor: k.saudeMental.toLocaleString('pt-BR') },
    ])

    // 2. INFORMAÇÕES CONTRATUAIS
    this.newContentPage()
    this.sectionTitle('2', 'Informações Contratuais')
    const qtdComp = this.input.competenciasSelecionadas.length
    const competenciasLabel =
      qtdComp > 0
        ? this.input.competenciasSelecionadas.map((c) => fmtCompExt(c)).join(', ')
        : this.periodoLabel
    this.table(
      [
        { header: 'Informação', width: 220 },
        { header: 'Valor', width: USABLE_W - 220 },
      ],
      [
        ['Cliente', this.clienteNome],
        ['Período de referência', this.periodoLabel],
        [`Competências analisadas${qtdComp > 0 ? ` (${qtdComp})` : ''}`, competenciasLabel],
        [
          'Apólices ativas',
          String(data.opcoes.apolices.length || painel?.apolicesAtivas || 0),
        ],
        ['Subestipulantes', String(k.subestipulantes)],
        ['Planos contratados', data.opcoes.planos.length ? data.opcoes.planos.join(', ') : '—'],
        ['Vidas ativas (cadastro)', k.vidasAtivas?.toLocaleString('pt-BR') ?? 'Não informado'],
        ['Titulares', k.titulares.toLocaleString('pt-BR')],
        ['Dependentes', k.dependentes.toLocaleString('pt-BR')],
      ],
    )

    if (data.subestipulanteResumo.length > 0) {
      this.subTitle('Resumo por subestipulante')
      this.table(
        [
          { header: 'Código', width: 70 },
          { header: 'Subestipulante', width: 175 },
          { header: 'Vidas', width: 50, align: 'right' },
          { header: 'Eventos', width: 55, align: 'right' },
          { header: 'Valor', width: 90, align: 'right' },
          { header: 'Custo/vida', width: USABLE_W - 440, align: 'right' },
        ],
        data.subestipulanteResumo.slice(0, 12).map((s) => [
          s.codigo || '—',
          s.razao,
          String(s.vidasUtil),
          String(s.eventos),
          formatBRL(s.valor),
          formatBRL(s.custoVida),
        ]),
      )
    }

    // 3. ANÁLISE POPULACIONAL
    this.newContentPage()
    this.sectionTitle('3', 'Análise Populacional')
    if (data.faixaEtaria.length > 0) {
      this.paragraph(
        'Distribuição etária das vidas com utilização no período. A faixa etária é um dos principais condicionantes do custo assistencial.',
      )
      this.vBarsFaixa(
        data.faixaEtaria.map((f) => ({ faixa: f.faixa, beneficiarios: f.vidas })),
      )
      this.table(
        [
          { header: 'Faixa etária', width: 150 },
          { header: 'Vidas', width: 70, align: 'right' },
          { header: '% vidas', width: 80, align: 'right' },
          { header: 'Valor', width: 110, align: 'right' },
          { header: '% valor', width: USABLE_W - 410, align: 'right' },
        ],
        data.faixaEtaria.map((f) => [
          f.faixa,
          String(f.vidas),
          pct(f.pctVidas),
          formatBRL(f.valor),
          pct(f.pctValor),
        ]),
      )
    } else {
      this.vazio('Sem informação de idade no arquivo importado.')
    }

    // 4. SINISTRALIDADE
    this.newContentPage()
    this.sectionTitle('4', 'Análise de Sinistralidade')
    if (data.sinistralidadeDisponivel && data.evolucaoSinistralidade.length > 0) {
      this.paragraph(
        'Evolução da sinistralidade (relação entre valor utilizado e receita/fatura) ao longo das competências. O ponto de equilíbrio técnico situa-se em torno de 70% a 75%.',
      )
      const comprimidos = this.lineChartSinistralidade(data.evolucaoSinistralidade)
      if (comprimidos > 0) {
        this.chartNote(
          'Competências com sinistralidade excepcionalmente elevada foram comprimidas ao teto de 200% para melhor leitura visual; o valor real está indicado sobre o ponto (marcado em âmbar).',
        )
      }
    } else {
      this.vazio(
        'Sinistralidade indisponível: cadastre o valor de fatura por competência na tela de Sinistralidade para habilitar esta análise.',
      )
    }

    // 5. UTILIZAÇÃO
    this.newContentPage()
    this.sectionTitle('5', 'Análise de Utilização')
    this.paragraph(
      'Comparativo entre valor utilizado e fatura por competência e composição da utilização por categoria assistencial.',
    )
    if (data.utilizacaoMensal.length > 0) {
      this.groupedBarsUtilizacao(data.utilizacaoMensal)
    }
    // Descrições de procedimento passam pela camada de privacidade clínica
    // antes de virar rótulo: capítulos sensíveis são generalizados e linhas
    // com menos de K beneficiários distintos entram em "Demais procedimentos".
    const categoriasSeguras = aplicarKAnonimato(data.categoriasDetalhadas)
    const categoriaChartData = categoriasSeguras.linhas.slice(0, 8)
    if (categoriaChartData.length > 0) {
      this.subTitle('Principais categorias por valor')
      this.hBarsCategorias(
        categoriaChartData.map((c) => ({ nome: c.nome, valor: c.valor })),
      )
      if (categoriasSeguras.suprimidas > 0) {
        this.nota(
          `Procedimentos utilizados por menos de ${K_ANONIMATO} beneficiários no período são agregados em "Demais procedimentos", e descrições que revelam condição de saúde sensível são apresentadas pelo capítulo clínico. Sem essa proteção, uma linha isolada permitiria reidentificar a pessoa atendida (LGPD, arts. 11 e 12).`,
        )
      }
    }

    // 6. CUSTO ASSISTENCIAL
    this.newContentPage()
    this.sectionTitle('6', 'Análise de Custo Assistencial')
    this.kpis([
      {
        label: 'Custo médio por vida',
        valor: data.vidas.custoMedioVida !== null ? formatBRL(data.vidas.custoMedioVida) : '—',
        destaque: true,
      },
      {
        label: 'Custo médio por usuário',
        valor:
          data.vidas.custoMedioUsuario !== null ? formatBRL(data.vidas.custoMedioUsuario) : '—',
        destaque: true,
      },
      { label: 'Taxa de utilização', valor: pct(data.vidas.taxaUtilizacao) },
      {
        label: 'Ticket médio por evento',
        valor: k.eventos > 0 ? formatBRL(k.valorUtilizado / k.eventos) : '—',
      },
    ])
    if (data.tipoUtilizacao.length > 0) {
      this.subTitle('Composição por tipo de utilização')
      this.table(
        [
          { header: 'Tipo', width: 150 },
          { header: 'Eventos', width: 70, align: 'right' },
          { header: '% eventos', width: 80, align: 'right' },
          { header: 'Valor', width: 110, align: 'right' },
          { header: '% valor', width: USABLE_W - 410, align: 'right' },
        ],
        data.tipoUtilizacao.map((t) => [
          t.tipo,
          String(t.eventos),
          pct(t.pctEventos),
          formatBRL(t.valor),
          pct(t.pctValor),
        ]),
      )
      this.nota(
        'Cada evento é contabilizado em uma única categoria. Eventos com internação entram em "Internações" independentemente da origem (pronto-socorro, obstétrica ou psiquiátrica), de modo que esta tabela reconcilia com o indicador de internações do resumo executivo. As utilizações de saúde mental são apuradas por eixo clínico, em seção própria.',
      )
    }

    // 7. TOP UTILIZADORES
    this.newContentPage()
    this.sectionTitle('7', 'Top Utilizadores')
    this.paragraph(
      'Beneficiários de maior valor utilizado no período. A concentração de custo nestes indivíduos orienta ações de gestão de casos.',
    )
    this.table(
      [
        { header: '#', width: 30, align: 'right' },
        { header: 'Beneficiário', width: 225 },
        { header: 'Eventos', width: 65, align: 'right' },
        { header: 'Valor', width: 100, align: 'right' },
        { header: '% do total', width: USABLE_W - 420, align: 'right' },
      ],
      data.topUtilizadores.slice(0, 10).map((u, i) => [
        String(i + 1),
        u.nome,
        String(u.eventos),
        formatBRL(u.valor),
        k.valorUtilizado > 0 ? pct((u.valor / k.valorUtilizado) * 100) : '—',
      ]),
    )

    // 8. BENEFICIÁRIOS PRIORITÁRIOS PARA INTERVENÇÃO
    if (temIntervencao) {
      this.secaoIntervencao('8', resumoRadar.intervencao, this.input.miniResumos)
    }

    // 9. TOP PRESTADORES
    this.newContentPage()
    this.sectionTitle('9', 'Top Prestadores')
    this.paragraph(
      'Prestadores e redes com maior volume financeiro no período, base para negociação e direcionamento de rede.',
    )
    this.table(
      [
        { header: '#', width: 30, align: 'right' },
        { header: 'Prestador', width: 225 },
        { header: 'Eventos', width: 65, align: 'right' },
        { header: 'Valor', width: 100, align: 'right' },
        { header: '% do total', width: USABLE_W - 420, align: 'right' },
      ],
      data.topPrestadores.slice(0, 10).map((p, i) => [
        String(i + 1),
        // Razão social que revela especialidade sensível é substituída pela
        // especialidade quando o prestador atendeu menos de K vidas.
        rotuloPrestadorSeguro(p.nome, p.beneficiarios).rotulo,
        String(p.eventos),
        formatBRL(p.valor),
        k.valorUtilizado > 0 ? pct((p.valor / k.valorUtilizado) * 100) : '—',
      ]),
    )
    if (
      data.topPrestadores
        .slice(0, 10)
        .some((p) => rotuloPrestadorSeguro(p.nome, p.beneficiarios).suprimido)
    ) {
      this.nota(
        `Prestadores cuja razão social revela especialidade (saúde da mulher, oncologia, saúde mental, pediatria, infectologia) e que atenderam menos de ${K_ANONIMATO} vidas no período são identificados pela especialidade, não pelo nome — a combinação nome + baixa contagem revelaria a condição de saúde do beneficiário.`,
      )
    }

    // 10. RADAR DE RISCO
    this.newContentPage()
    this.sectionTitle('10', 'Radar de Risco')
    if (resumoRadar.total > 0) {
      this.paragraph(
        'Estratificação dos beneficiários por risco assistencial, com base em internações, reinternações, uso de pronto-socorro, saúde mental, procedimentos e medicamentos de alto custo e crescimento acelerado de utilização. Orienta a priorização de ações de gestão de saúde.',
      )
      this.kpis([
        { label: 'Beneficiários monitorados', valor: resumoRadar.total.toLocaleString('pt-BR'), destaque: true },
        { label: 'Vidas em risco (Alto/Crítico)', valor: resumoRadar.emRisco.toLocaleString('pt-BR'), destaque: true },
        { label: 'Impacto financeiro', valor: formatBRL(resumoRadar.impactoFinanceiro) },
        { label: '% do custo total', valor: pct(resumoRadar.pctImpacto) },
      ])
      this.subTitle('Distribuição por faixa de risco')
      this.table(
        [
          { header: 'Faixa', width: 200 },
          { header: 'Vidas', width: 100, align: 'right' },
          { header: '% da carteira', width: USABLE_W - 300, align: 'right' },
        ],
        resumoRadar.distribuicao.map((d) => [
          d.nome,
          String(d.valor),
          resumoRadar.total > 0 ? pct((d.valor / resumoRadar.total) * 100) : '—',
        ]),
      )
      this.subTitle('Beneficiários prioritários')
      this.table(
        [
          { header: '#', width: 28, align: 'right' },
          { header: 'Beneficiário', width: 170 },
          { header: 'Faixa', width: 80 },
          { header: 'Score', width: 50, align: 'right' },
          { header: 'Valor', width: 95, align: 'right' },
          { header: '% total', width: USABLE_W - 423, align: 'right' },
        ],
        resumoRadar.top.map((b, i) => [
          String(i + 1),
          b.display,
          b.faixaLabel,
          String(b.score),
          formatBRL(b.valorTotal),
          pct(b.participacaoPct),
        ]),
      )
    } else {
      this.vazio('Sem dados suficientes para estratificação de risco no período.')
    }

    // 10.1 PLANO DE AÇÃO PREVENTIVO
    if (temPlano) {
      const plano = resumoRadar.plano
      this.newContentPage()
      this.sectionTitle('10.1', 'Plano de Ação Preventivo')
      this.paragraph(plano.resumoTexto)
      this.kpis([
        { label: 'Beneficiários prioritários', valor: plano.beneficiariosPrioritarios.toLocaleString('pt-BR'), destaque: true },
        { label: 'Prioridade crítica', valor: plano.prioridadeCritica.toLocaleString('pt-BR'), destaque: true },
        { label: 'Potencial impacto financeiro', valor: formatBRL(plano.potencialImpacto) },
        { label: 'Exposição ao risco', valor: pct(plano.exposicaoPct) },
      ])
      this.subTitle('Ações prioritárias por beneficiário')
      this.planoAgrupado(plano.acoes)
      this.subTitle('Recomendações prioritárias do período')
      this.recomendacoes(
        plano.recomendacoes.map((r) => ({
          titulo: `${r.titulo} — ${r.frequencia} ${r.frequencia === 1 ? 'vida' : 'vidas'}`,
          descricao: r.descricao,
        })),
      )
      this.subTitle('Conclusão executiva')
      this.paragraph(plano.conclusao)
    }

    // SAÚDE MENTAL (página exclusiva)
    if (numSaudeMental && saudeMental) {
      this.secaoSaudeMental(numSaudeMental, saudeMental)
    }

    // OPORTUNIDADE DE ECONOMIA (destaque premium)
    if (numEconomia && temPlano) {
      this.secaoEconomia(numEconomia, resumoRadar.plano)
    }

    // WINNERS DECIDE IA (análise consultiva)
    if (numIA && analiseIA && analiseIA.fonte !== 'suprimida') {
      this.secaoWinnersDecideIA(numIA, analiseIA)
    }

    // CONCLUSÕES E RECOMENDAÇÕES
    this.newContentPage()
    this.sectionTitle(numConclusoes, 'Conclusões e Recomendações')
    if (analise.pontosAtencao.length > 0) {
      this.subTitle('Pontos de atenção')
      this.font('normal', 10)
      for (const p of analise.pontosAtencao) {
        const linhas = this.doc.splitTextToSize(p, USABLE_W - 16) as string[]
        const lh = 13.5
        this.ensure(linhas.length * lh + 4)
        this.fill(AMBER)
        this.doc.circle(MARGIN + 3, this.y - 3, 1.8, 'F')
        this.ink(INK)
        this.doc.text(linhas, MARGIN + 12, this.y)
        this.y += linhas.length * lh + 4
      }
      this.y += 6
    }
    this.subTitle('Recomendações')
    this.recomendacoes(analise.recomendacoes)
    this.subTitle('Conclusão')
    this.paragraph(analise.conclusao)

    // Cabeçalhos, rodapés e numeração (passe final)
    this.stampHeadersFooters()

    return this.doc.output('arraybuffer')
  }
}

export function gerarRelatorioPdf(input: RelatorioPdfInput): ArrayBuffer {
  return new Relatorio(input).build()
}
