import { notFound } from 'next/navigation'
import Link from 'next/link'
import {
  Activity,
  ArrowLeft,
  CalendarDays,
  Coins,
  Wallet,
} from 'lucide-react'
import { DashboardShell } from '@/components/dashboard-shell'
import { StatCard } from '@/components/stat-card'
import { CategoriaGerencialDonut } from '@/components/categoria-gerencial-donut'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { UtilizacaoMensalChart } from '@/components/charts'
import { formatBRL, formatNumber } from '@/lib/data'
import { formatCompetencia } from '@/lib/categorias'
import { getBeneficiarioPerfil } from '@/lib/queries'

function formatData(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('pt-BR')
}

export default async function BeneficiarioPerfilPage({
  params,
}: {
  params: Promise<{ carteirinha: string }>
}) {
  const { carteirinha } = await params
  const perfil = await getBeneficiarioPerfil(decodeURIComponent(carteirinha))

  if (!perfil) notFound()

  const vinculoLabel =
    perfil.vinculo === 'TITULAR'
      ? 'Titular'
      : perfil.vinculo === 'DEPENDENTE'
        ? 'Dependente'
        : null

  const evolucao = perfil.evolucaoMensal.map((m) => ({
    mes: formatCompetencia(m.competencia),
    utilizado: m.valor,
  }))

  const cadastro: { rotulo: string; valor: string }[] = [
    { rotulo: 'Plano', valor: perfil.plano ?? '—' },
    { rotulo: 'Empresa / Filial', valor: perfil.empresa ?? '—' },
    { rotulo: 'CPF', valor: perfil.cpf ?? '—' },
    {
      rotulo: 'Sexo',
      valor:
        perfil.sexo === 'M'
          ? 'Masculino'
          : perfil.sexo === 'F'
            ? 'Feminino'
            : '—',
    },
    {
      rotulo: 'Idade',
      valor: perfil.idade !== null ? `${perfil.idade} anos` : '—',
    },
    { rotulo: 'Nascimento', valor: formatData(perfil.dataNascimento) },
    { rotulo: 'Adesão', valor: formatData(perfil.dataAdesao) },
    { rotulo: 'Tipo (origem)', valor: perfil.tipoBeneficiario ?? '—' },
  ]

  return (
    <DashboardShell title="Perfil do beneficiário">
      <div className="flex flex-col gap-6">
        <Link
          href="/colaboradores"
          className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Voltar para beneficiários
        </Link>

        {/* Cabeçalho */}
        <Card>
          <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-semibold text-foreground">
                  {perfil.nome ?? 'Nome não cadastrado'}
                </h2>
                {vinculoLabel && (
                  <Badge
                    variant={
                      perfil.vinculo === 'TITULAR' ? 'default' : 'neutral'
                    }
                  >
                    {vinculoLabel}
                  </Badge>
                )}
                {perfil.status && (
                  <Badge
                    variant={
                      perfil.status === 'ATIVO' ? 'success' : 'destructive'
                    }
                  >
                    {perfil.status}
                  </Badge>
                )}
                {!perfil.cadastrado && (
                  <Badge variant="neutral">Apenas em utilização</Badge>
                )}
              </div>
              <p className="font-mono text-sm text-muted-foreground">
                Carteirinha: {perfil.carteirinha}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Dados cadastrais */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">
              Dados cadastrais
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
              {cadastro.map((item) => (
                <div key={item.rotulo} className="flex flex-col gap-1">
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                    {item.rotulo}
                  </dt>
                  <dd className="text-sm font-medium text-foreground">
                    {item.valor}
                  </dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>

        {/* Indicadores de utilização */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="Valor Utilizado"
            value={formatBRL(perfil.valorTotal)}
            icon={Coins}
            hint="acumulado (todas as competências)"
          />
          <StatCard
            label="Eventos"
            value={formatNumber(perfil.eventosTotal)}
            icon={Activity}
            hint="total de utilizações"
          />
          <StatCard
            label="Custo Médio / Evento"
            value={formatBRL(perfil.custoMedioEvento)}
            icon={Wallet}
            hint="valor médio por utilização"
          />
          <StatCard
            label="Meses com Utilização"
            value={formatNumber(perfil.mesesAtivos)}
            icon={CalendarDays}
            hint="competências com eventos"
          />
        </div>

        {perfil.eventosTotal === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              Este beneficiário não possui eventos de utilização registrados.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <CategoriaGerencialDonut
              categorias={perfil.categoriasGerenciais}
              total={perfil.valorTotal}
            />
            <Card>
              <CardHeader>
                <CardTitle>Evolução mensal</CardTitle>
              </CardHeader>
              <CardContent>
                {evolucao.length > 0 ? (
                  <UtilizacaoMensalChart data={evolucao} />
                ) : (
                  <p className="py-12 text-center text-sm text-muted-foreground">
                    Sem competências para exibir.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </DashboardShell>
  )
}
