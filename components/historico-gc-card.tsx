import { History } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getHistoricoGC, situacaoAutorizacao } from '@/lib/gestao-conectada'
import { DocumentosGC } from '@/components/documentos-gc'

// Linha do tempo da pessoa no SulAmérica Gestão Conectada: tudo o que passou
// por autorização (internações, exames, prorrogações, OPME…), de qualquer
// data que o robô já leu — a varredura semanal traz o histórico antigo.

const VARIANT = {
  autorizada: 'success',
  negada: 'destructive',
  cancelada: 'neutral',
  em_analise: 'warning',
} as const
const ROTULO = { autorizada: 'Autorizada', negada: 'Negada', cancelada: 'Cancelada', em_analise: 'Em análise' }

const dataBR = (iso: string | null) =>
  iso ? new Date(iso.length === 10 ? `${iso}T12:00:00-03:00` : iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—'

export async function HistoricoGCCard({ carteirinha }: { carteirinha: string }) {
  const { disponivel, ficha, eventos } = await getHistoricoGC(carteirinha)
  if (!disponivel || (eventos.length === 0 && !ficha)) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="size-4 text-primary" /> Linha do tempo — SulAmérica Gestão Conectada
        </CardTitle>
        <CardDescription>
          Internações, exames, prorrogações e demais pedidos de autorização desta pessoa.
          {ficha &&
            ` Plano: ${ficha.plano ?? '—'} · empresa ${ficha.codigoEmpresa ?? '—'} · ${
              ficha.vigente == null ? 'vigência não informada' : ficha.vigente ? 'carteirinha vigente' : 'carteirinha não vigente'
            }.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {eventos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma autorização registrada no portal para esta carteirinha.</p>
        ) : (
          <ol className="relative flex flex-col gap-4 border-l border-border pl-5">
            {eventos.map((e) => {
              const s = situacaoAutorizacao(e.statusPortal)
              const internacao = /interna/i.test(e.tipoRegistro ?? '')
              return (
                <li key={e.numero} className="relative">
                  <span
                    className={`absolute -left-[25px] top-1.5 size-2.5 rounded-full ${internacao ? 'bg-primary' : 'bg-muted-foreground/50'}`}
                  />
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium tabular-nums">{dataBR(e.aberturaEm)}</span>
                    <span className="font-medium">{e.tipoRegistro ?? 'Manifestação'}</span>
                    <Badge variant={VARIANT[s]}>{ROTULO[s]}</Badge>
                    {e.carater && <span className="text-xs text-muted-foreground">{e.carater}</span>}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {[
                      e.prestador,
                      internacao && e.dataInternacao
                        ? `internação ${dataBR(e.dataInternacao)}${e.dataAlta ? ` → alta ${dataBR(e.dataAlta)}` : ' (sem alta)'}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                  <div className="mt-0.5 text-xs">{e.resumo}</div>
                  {e.motivoMedico && <div className="mt-0.5 text-xs font-medium">{e.motivoMedico}</div>}
                  {e.documentos.length > 0 && (
                    <details className="mt-1 text-xs">
                      <summary className="cursor-pointer text-primary">Ver documentos ({e.documentos.length})</summary>
                      <div className="mt-2">
                        <DocumentosGC documentos={e.documentos} compacto />
                      </div>
                    </details>
                  )}
                </li>
              )
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}
