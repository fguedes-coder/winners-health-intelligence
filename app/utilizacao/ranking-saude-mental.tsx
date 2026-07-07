'use client'

import { useMemo, useState } from 'react'
import { Brain, Info } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatBRL, formatNumber } from '@/lib/data'
import {
  ehPsiquiatria,
  FAIXAS_ATENCAO_SM,
  indiceAtencaoSaudeMental,
  type NivelAtencaoSM,
} from '@/lib/categorias'
import type { EventoCalc } from './utilizacao-explorer'

type OrdenacaoSM =
  | 'custo'
  | 'quantidade'
  | 'recente'
  | 'prestador'
  | 'benef-az'
  | 'benef-za'

type LinhaRanking = {
  beneficiario: string
  display: string
  psicologo: number
  psiquiatra: number
  total: number
  custo: number
  ultimoAtendimento: string | null
  prestadorPrincipal: string
}

// Cores por nível — apenas indicador de FREQUÊNCIA, não gravidade clínica.
const NIVEL_STYLE: Record<NivelAtencaoSM, string> = {
  Baixo: 'bg-emerald-500/15 text-emerald-400',
  Moderado: 'bg-amber-500/15 text-amber-400',
  Alto: 'bg-orange-500/15 text-orange-400',
  Crítico: 'bg-destructive/15 text-destructive',
}

const NIVEL_DOT: Record<NivelAtencaoSM, string> = {
  Baixo: 'bg-emerald-400',
  Moderado: 'bg-amber-400',
  Alto: 'bg-orange-400',
  Crítico: 'bg-destructive',
}

const inputClass =
  'h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-ring sm:w-64'

export function RankingSaudeMental({ eventos }: { eventos: EventoCalc[] }) {
  const [ordenacao, setOrdenacao] = useState<OrdenacaoSM>('custo')

  // Considera apenas eventos classificados como Saúde Mental.
  const linhas = useMemo<LinhaRanking[]>(() => {
    const map = new Map<string, LinhaRanking>()
    const prestContagem = new Map<string, Map<string, number>>()

    for (const e of eventos) {
      if (e.categoria !== 'Saúde Mental') continue
      const key = e.beneficiario
      const cur =
        map.get(key) ??
        {
          beneficiario: key,
          display: e.displayBeneficiario,
          psicologo: 0,
          psiquiatra: 0,
          total: 0,
          custo: 0,
          ultimoAtendimento: null as string | null,
          prestadorPrincipal: '—',
        }
      const texto = `${e.servicoPrincipal ?? ''} ${e.servico ?? ''}`
      if (ehPsiquiatria(texto)) cur.psiquiatra++
      else cur.psicologo++
      cur.total++
      cur.custo += e.valorPago
      if (
        e.dataAtendimento &&
        (!cur.ultimoAtendimento || e.dataAtendimento > cur.ultimoAtendimento)
      ) {
        cur.ultimoAtendimento = e.dataAtendimento
      }
      map.set(key, cur)

      // Contagem de eventos por prestador para eleger o prestador principal.
      if (e.prestadorNome) {
        const pc = prestContagem.get(key) ?? new Map<string, number>()
        pc.set(e.prestadorNome, (pc.get(e.prestadorNome) ?? 0) + 1)
        prestContagem.set(key, pc)
      }
    }

    for (const [key, linha] of map) {
      const pc = prestContagem.get(key)
      if (pc && pc.size > 0) {
        linha.prestadorPrincipal = [...pc.entries()].sort(
          (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
        )[0][0]
      }
    }

    return [...map.values()]
  }, [eventos])

  const ordenadas = useMemo(() => {
    const arr = [...linhas]
    arr.sort((a, b) => {
      switch (ordenacao) {
        case 'custo':
          return b.custo - a.custo
        case 'quantidade':
          return b.total - a.total
        case 'recente':
          return (b.ultimoAtendimento ?? '').localeCompare(
            a.ultimoAtendimento ?? '',
          )
        case 'prestador':
          return a.prestadorPrincipal.localeCompare(b.prestadorPrincipal)
        case 'benef-az':
          return a.display.localeCompare(b.display)
        case 'benef-za':
          return b.display.localeCompare(a.display)
        default:
          return 0
      }
    })
    return arr
  }, [linhas, ordenacao])

  const totais = useMemo(() => {
    let psicologo = 0
    let psiquiatra = 0
    let custo = 0
    for (const l of linhas) {
      psicologo += l.psicologo
      psiquiatra += l.psiquiatra
      custo += l.custo
    }
    return {
      beneficiarios: linhas.length,
      psicologo,
      psiquiatra,
      total: psicologo + psiquiatra,
      custo,
    }
  }, [linhas])

  if (linhas.length === 0) return null

  return (
    <Card>
      <CardHeader className="flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="flex items-center gap-2">
          <Brain className="size-4 text-primary" />
          Ranking de Utilização em Saúde Mental
          <Badge variant="neutral" className="ml-1">
            {formatNumber(totais.beneficiarios)} beneficiários
          </Badge>
        </CardTitle>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Ordenar por
          <select
            value={ordenacao}
            onChange={(e) => setOrdenacao(e.target.value as OrdenacaoSM)}
            className={inputClass}
          >
            <option value="custo">Maior custo</option>
            <option value="quantidade">Maior quantidade de utilizações</option>
            <option value="recente">Mais recente</option>
            <option value="prestador">Prestador</option>
            <option value="benef-az">Beneficiário A → Z</option>
            <option value="benef-za">Beneficiário Z → A</option>
          </select>
        </label>
      </CardHeader>
      <CardContent className="px-0 pb-2">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Beneficiário</TableHead>
                <TableHead>Prestador principal</TableHead>
                <TableHead className="text-right">Psicólogo</TableHead>
                <TableHead className="text-right">Psiquiatra</TableHead>
                <TableHead className="text-right">Total Utilizações</TableHead>
                <TableHead>Índice de Atenção</TableHead>
                <TableHead className="pr-6 text-right">Custo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ordenadas.slice(0, 200).map((l) => {
                const nivel = indiceAtencaoSaudeMental(l.total)
                return (
                  <TableRow key={l.beneficiario}>
                    <TableCell className="pl-6 font-medium text-foreground tabular-nums">
                      {l.display}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-muted-foreground">
                      {l.prestadorPrincipal}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-foreground">
                      {formatNumber(l.psicologo)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-foreground">
                      {formatNumber(l.psiquiatra)}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums text-foreground">
                      {formatNumber(l.total)}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold ${NIVEL_STYLE[nivel]}`}
                      >
                        <span
                          className={`size-1.5 rounded-full ${NIVEL_DOT[nivel]}`}
                        />
                        {nivel}
                      </span>
                    </TableCell>
                    <TableCell className="pr-6 text-right font-medium tabular-nums text-foreground">
                      {formatBRL(l.custo)}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
        {ordenadas.length > 200 && (
          <p className="px-6 py-3 text-xs text-muted-foreground">
            Exibindo os 200 primeiros beneficiários. Refine os filtros para ver
            registros específicos.
          </p>
        )}

        {/* Legenda do Índice de Atenção + aviso de que não é diagnóstico */}
        <div className="mx-6 mt-2 rounded-xl border border-border/60 bg-secondary/30 p-4">
          <p className="mb-3 text-sm font-medium text-foreground">
            Índice de Atenção em Saúde Mental
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {FAIXAS_ATENCAO_SM.map((f) => (
              <div key={f.nivel} className="flex flex-col gap-1">
                <span
                  className={`inline-flex w-fit items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold ${NIVEL_STYLE[f.nivel]}`}
                >
                  <span
                    className={`size-1.5 rounded-full ${NIVEL_DOT[f.nivel]}`}
                  />
                  {f.nivel}
                </span>
                <span className="text-xs text-muted-foreground">
                  {f.descricao}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground text-pretty">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            <span>
              Não é diagnóstico clínico. É apenas um indicador de frequência de
              utilização (nº de atendimentos por beneficiário no período),
              destinado a priorizar acompanhamento preventivo.
            </span>
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
