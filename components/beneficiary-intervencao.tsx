import { AlertTriangle, PiggyBank, Target } from 'lucide-react'
import type { PanoramaBeneficiario } from '@/lib/beneficiary-panorama'
import {
  montarPayloadBeneficiario,
  classificarPrioridadeIntervencao,
  classificarPotencialEconomia,
  type NivelPrioridade,
  type NivelEconomia,
} from '@/lib/beneficiary-narrative'

// Estilo semântico de cada nível de prioridade (P1 mais urgente → P4 rotina).
const PRIORIDADE_ESTILO: Record<NivelPrioridade, string> = {
  P1: 'oklch(0.62 0.22 25)',
  P2: 'oklch(0.72 0.17 52)',
  P3: 'oklch(0.8 0.15 85)',
  P4: 'oklch(0.7 0.15 152)',
}

// Escala de cor do potencial de economia. Economia é OPORTUNIDADE: quanto
// maior, melhor. Por isso a escala é invertida em relação ao risco —
// Alto = verde (melhor oportunidade), Médio = amarelo, Baixo = cinza neutro.
const ECONOMIA_ESTILO: Record<NivelEconomia, string> = {
  Alto: 'oklch(0.7 0.15 152)',
  Médio: 'oklch(0.8 0.15 85)',
  Baixo: 'oklch(0.65 0.02 260)',
}

// Recomendações e Oportunidades de Intervenção: consolida a Prioridade de
// Intervenção (P1–P4) e o Potencial de Economia do beneficiário, ambos
// determinísticos e derivados do Panorama já carregado — com os fatores que
// sustentam cada classificação e o benefício esperado da ação.
export function BeneficiaryIntervencao({ p }: { p: PanoramaBeneficiario }) {
  if (p.kpis.eventos === 0) return null

  const d = montarPayloadBeneficiario(p)
  const prio = classificarPrioridadeIntervencao(d, p.analise.prioridadeIntervencao)
  const eco = classificarPotencialEconomia(d)

  const corPrio = PRIORIDADE_ESTILO[prio.nivel]
  const corEco = ECONOMIA_ESTILO[eco.nivel]

  return (
    <section>
      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
        <Target className="size-4 text-primary" />
        Recomendações e Oportunidades de Intervenção
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {/* P2 · Prioridade de Intervenção */}
        <div
          className="flex flex-col rounded-lg border p-3"
          style={{
            borderColor: `color-mix(in oklch, ${corPrio} 45%, transparent)`,
            backgroundColor: `color-mix(in oklch, ${corPrio} 8%, transparent)`,
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-4" style={{ color: corPrio }} />
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Prioridade de Intervenção
              </span>
            </div>
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold text-background"
              style={{ backgroundColor: corPrio }}
            >
              {prio.nivel} · {prio.rotulo}
            </span>
          </div>

          <div className="mt-2.5 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full"
                style={{ width: `${prio.indice}%`, backgroundColor: corPrio }}
              />
            </div>
            <span className="text-xs font-medium text-muted-foreground">
              {prio.indice}/100
            </span>
          </div>

          <p className="mt-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Principais fatores
          </p>
          <ul className="mt-1 flex flex-col gap-1">
            {prio.motivos.map((m, i) => (
              <li
                key={i}
                className="flex gap-2 text-xs leading-relaxed text-muted-foreground"
              >
                <span
                  className="mt-1 size-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: corPrio }}
                />
                <span className="text-pretty">{m}</span>
              </li>
            ))}
          </ul>

          <div className="mt-auto pt-2.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Benefício esperado
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-foreground text-pretty">
              {prio.beneficioEsperado}
            </p>
          </div>
        </div>

        {/* P3 · Potencial de Economia */}
        <div
          className="flex flex-col rounded-lg border p-3"
          style={{
            borderColor: `color-mix(in oklch, ${corEco} 45%, transparent)`,
            backgroundColor: `color-mix(in oklch, ${corEco} 8%, transparent)`,
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <PiggyBank className="size-4" style={{ color: corEco }} />
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Potencial de Economia
              </span>
            </div>
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold text-background"
              style={{ backgroundColor: corEco }}
            >
              {eco.nivel}
            </span>
          </div>

          <p className="mt-2.5 text-xs leading-relaxed text-foreground text-pretty">
            {eco.interpretacao}
          </p>

          <p className="mt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Alavancas identificadas
          </p>
          <ul className="mt-1 flex flex-col gap-1">
            {eco.motivos.map((m, i) => (
              <li
                key={i}
                className="flex gap-2 text-xs leading-relaxed text-muted-foreground"
              >
                <span
                  className="mt-1 size-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: corEco }}
                />
                <span className="text-pretty">{m}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground text-pretty">
        Potencial de economia é uma estimativa de oportunidade de gestão, não uma
        promessa de redução de custo. Classificações determinísticas, derivadas
        dos indicadores de utilização do período.
      </p>
    </section>
  )
}
