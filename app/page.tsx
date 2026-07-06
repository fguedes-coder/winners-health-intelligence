'use client'

import Image from 'next/image'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowRight,
  BarChart3,
  Eye,
  EyeOff,
  FileText,
  Headset,
  LineChart,
  Lock,
  Mail,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Users,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const FEATURES = [
  { icon: LineChart, title: 'Análise de sinistralidade', desc: 'em tempo real' },
  { icon: Users, title: 'Gestão completa', desc: 'de apólices e clientes' },
  { icon: FileText, title: 'Relatórios executivos', desc: 'automatizados' },
]

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    const supabase = createClient()
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (signInError) {
      setError('E-mail ou senha inválidos. Verifique suas credenciais.')
      setIsLoading(false)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* ============ Painel da marca (esquerda) ============ */}
      <div
        className="relative hidden flex-col justify-between overflow-hidden p-12 lg:flex lg:w-1/2"
        style={{
          background:
            'linear-gradient(150deg, #081a3a 0%, #0a2766 45%, #0e54c4 100%)',
        }}
      >
        {/* brilho radial decorativo */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(circle at 78% 38%, rgba(56,140,255,0.45), transparent 55%)',
          }}
        />
        {/* linhas curvas sutis */}
        <div
          className="pointer-events-none absolute -right-24 top-1/3 size-[640px] rounded-full border border-white/5"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -right-40 top-1/4 size-[760px] rounded-full border border-white/5"
          aria-hidden="true"
        />

        {/* Logo + Conteúdo (agrupados no topo) */}
        <div className="relative">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <Image
              src="/brand/winners-shield.png"
              alt=""
              width={48}
              height={48}
              priority
              className="size-11 object-contain"
            />
            <div className="flex flex-col leading-none">
              <span className="text-2xl font-bold tracking-wide text-white">
                WINNERS
              </span>
              <span className="mt-1 text-[10px] font-medium tracking-[0.2em] text-white/70">
                CORRETORA DE SEGUROS
              </span>
            </div>
          </div>

          {/* Conteúdo central */}
          <div className="mt-16 max-w-lg">
          <div className="mb-7 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 ring-1 ring-inset ring-white/15 backdrop-blur-sm">
            <BarChart3 className="size-4 text-[#5aa6ff]" />
            <span className="text-xs font-semibold tracking-wider text-[#9cc6ff]">
              INTELIGÊNCIA QUE GERA RESULTADOS
            </span>
          </div>

          <h1 className="text-balance text-4xl font-bold leading-[1.1] text-white xl:text-5xl">
            Inteligência de dados para a gestão de{' '}
            <span className="text-[#4d9bff]">saúde corporativa</span>
          </h1>

          <p className="mt-5 max-w-md text-pretty leading-relaxed text-white/70">
            Monitore sinistralidade, beneficiários e custos em tempo real. A
            plataforma da Winners Corretora transforma dados em decisões
            estratégicas.
          </p>

          <div className="mt-9 flex flex-col gap-5">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex items-center gap-4">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#1f6fe5] shadow-lg shadow-[#0a2766]/50">
                  <Icon className="size-5 text-white" />
                </div>
                <div className="leading-tight">
                  <p className="font-semibold text-white">{title}</p>
                  <p className="text-sm text-white/60">{desc}</p>
                </div>
              </div>
            ))}
          </div>
          </div>
        </div>

        {/* Mockup de dashboard flutuante (canto inferior direito) */}
        <div
          className="pointer-events-none absolute bottom-12 right-0 hidden w-[470px] xl:block"
          aria-hidden="true"
        >
          <DashboardMock />
        </div>

        {/* Rodapé */}
        <div className="relative flex flex-col gap-2 text-xs text-white/55">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-white/70" />
            <span>Segurança e privacidade de dados garantidas</span>
          </div>
          <p>
            © {new Date().getFullYear()} Winners Corretora. Todos os direitos
            reservados.
          </p>
        </div>
      </div>

      {/* ============ Painel de acesso (direita) ============ */}
      <div className="flex flex-1 items-center justify-center bg-[#f7f8fb] p-6 lg:p-10">
        <div className="w-full max-w-md">
          {/* Logo mobile */}
          <div className="mb-8 flex items-center justify-center gap-3 lg:hidden">
            <Image
              src="/brand/winners-shield.png"
              alt="Winners Corretora de Seguros"
              width={40}
              height={40}
              priority
              className="size-10 object-contain"
            />
            <span className="text-xl font-bold tracking-wide text-[#0a2766]">
              WINNERS
            </span>
          </div>

          {/* Ícone escudo */}
          <div className="mb-6 flex justify-center">
            <div className="flex size-16 items-center justify-center rounded-2xl bg-gradient-to-b from-[#e8f0fe] to-[#dbe7fd] shadow-sm ring-1 ring-inset ring-[#cdddfb]">
              <Shield className="size-8 text-[#1f6fe5]" strokeWidth={2.2} />
            </div>
          </div>

          <div className="mb-8 text-center">
            <h2 className="text-3xl font-bold text-[#1b2942]">
              Acessar plataforma
            </h2>
            <p className="mt-2 text-[15px] text-[#6b7689]">
              Entre com suas credenciais corporativas para continuar.
            </p>
          </div>

          <form className="flex flex-col gap-5" onSubmit={handleLogin}>
            {/* E-mail */}
            <div className="flex flex-col gap-2">
              <label
                htmlFor="email"
                className="text-sm font-semibold text-[#374151]"
              >
                E-mail corporativo
              </label>
              <div className="flex items-center gap-2.5 rounded-xl border border-[#e2e6ee] bg-white px-3.5 transition-colors focus-within:border-[#1f6fe5] focus-within:ring-2 focus-within:ring-[#1f6fe5]/15">
                <Mail className="size-[18px] text-[#9aa3b2]" />
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com.br"
                  className="h-12 flex-1 bg-transparent text-sm text-[#1b2942] outline-none placeholder:text-[#9aa3b2]"
                />
              </div>
            </div>

            {/* Senha */}
            <div className="flex flex-col gap-2">
              <label
                htmlFor="senha"
                className="text-sm font-semibold text-[#374151]"
              >
                Senha
              </label>
              <div className="flex items-center gap-2.5 rounded-xl border border-[#e2e6ee] bg-white px-3.5 transition-colors focus-within:border-[#1f6fe5] focus-within:ring-2 focus-within:ring-[#1f6fe5]/15">
                <Lock className="size-[18px] text-[#9aa3b2]" />
                <input
                  id="senha"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••"
                  className="h-12 flex-1 bg-transparent text-sm text-[#1b2942] outline-none placeholder:text-[#9aa3b2]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="text-[#9aa3b2] transition-colors hover:text-[#1f6fe5]"
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  {showPassword ? (
                    <EyeOff className="size-[18px]" />
                  ) : (
                    <Eye className="size-[18px]" />
                  )}
                </button>
              </div>
            </div>

            {/* Lembrar / Esqueci */}
            <div className="flex items-center justify-between">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-[#4b5563] select-none">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="size-4 rounded border-[#cbd2dd] text-[#1f6fe5] accent-[#1f6fe5]"
                />
                Lembrar meu acesso
              </label>
              <a
                href="mailto:suporte@winnerscorretora.com.br?subject=Recuperação de senha"
                className="text-sm font-semibold text-[#1f6fe5] hover:underline"
              >
                Esqueci minha senha
              </a>
            </div>

            {error && (
              <p
                role="alert"
                className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600"
              >
                {error}
              </p>
            )}

            {/* Botão principal */}
            <button
              type="submit"
              disabled={isLoading}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[15px] font-semibold text-white shadow-lg shadow-[#1f6fe5]/25 transition-opacity hover:opacity-95 disabled:opacity-60"
              style={{
                background: 'linear-gradient(135deg, #1f6fe5 0%, #1545c4 100%)',
              }}
            >
              {isLoading ? 'Entrando...' : 'Entrar na plataforma'}
              {!isLoading && <ArrowRight className="size-[18px]" />}
            </button>
          </form>

          {/* Divisor */}
          <div className="my-6 flex items-center gap-4">
            <span className="h-px flex-1 bg-[#e2e6ee]" />
            <span className="text-xs font-medium text-[#9aa3b2]">ou</span>
            <span className="h-px flex-1 bg-[#e2e6ee]" />
          </div>

          {/* SSO */}
          <button
            type="button"
            onClick={() =>
              setError(
                'O acesso via SSO corporativo ainda não está configurado. Use seu e-mail e senha.',
              )
            }
            className="flex h-12 w-full items-center justify-center gap-2.5 rounded-xl border border-[#e2e6ee] bg-white text-sm font-semibold text-[#1f6fe5] transition-colors hover:bg-[#f3f6fc]"
          >
            <SlidersHorizontal className="size-[18px]" />
            Acessar com SSO (SSO Corporativo)
          </button>

          {/* Box de ajuda */}
          <div className="mt-5 flex items-start gap-3 rounded-xl bg-[#eef3fd] p-4">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#dce7fb]">
              <Headset className="size-[18px] text-[#1f6fe5]" />
            </div>
            <div className="leading-snug">
              <p className="text-sm font-semibold text-[#1b2942]">
                Problemas para acessar?
              </p>
              <p className="mt-0.5 text-sm text-[#6b7689]">
                Entre em contato com o administrador da Winners Corretora.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const MESES = [
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

const cardCls =
  'rounded-2xl bg-white/[0.08] ring-1 ring-inset ring-white/15 shadow-2xl shadow-[#04102b]/40 backdrop-blur-md'

/** Mockup decorativo de dashboard: painéis de vidro flutuantes sobrepostos. */
function DashboardMock() {
  return (
    <div className="relative h-[300px]">
      {/* ---- Card central: Custo Total (maior, ao fundo) ---- */}
      <div className={`absolute left-[45px] top-0 w-[310px] ${cardCls} p-4`}>
        {/* barra de janela */}
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-white/25" />
            <span className="size-2 rounded-full bg-white/25" />
            <span className="size-2 rounded-full bg-white/25" />
          </div>
          <span className="text-[11px] text-white/40">×</span>
        </div>
        <p className="text-[11px] text-white/55">Custo Total</p>
        <p className="text-2xl font-bold text-white">R$ 2,4M</p>
        <p className="text-[10px] text-white/40">Últimos 12 meses</p>
        {/* gráfico de área */}
        <svg
          viewBox="0 0 300 90"
          className="mt-2 h-[90px] w-full"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="mockArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#5aa6ff" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#5aa6ff" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d="M0,78 L25,70 L50,72 L75,60 L100,64 L125,50 L150,52 L175,38 L200,42 L225,26 L250,30 L275,16 L300,10 L300,90 L0,90 Z"
            fill="url(#mockArea)"
          />
          <path
            d="M0,78 L25,70 L50,72 L75,60 L100,64 L125,50 L150,52 L175,38 L200,42 L225,26 L250,30 L275,16 L300,10"
            fill="none"
            stroke="#7db8ff"
            strokeWidth="2"
          />
        </svg>
        <div className="mt-1 flex justify-between">
          {MESES.map((m) => (
            <span key={m} className="text-[7px] text-white/35">
              {m}
            </span>
          ))}
        </div>
      </div>

      {/* ---- Card frontal-esquerdo: Sinistralidade ---- */}
      <div className={`absolute left-0 top-[128px] w-[160px] ${cardCls} p-3.5`}>
        <p className="text-[11px] text-white/55">Sinistralidade</p>
        <p className="text-xl font-bold text-white">54,7%</p>
        <p className="text-[9px] text-white/40">
          Últimos 12 meses <span className="text-[#4ade80]">↗ -8,2%</span>
        </p>
        {/* gráfico de linha */}
        <svg
          viewBox="0 0 150 44"
          className="mt-2 h-11 w-full"
          preserveAspectRatio="none"
        >
          <path
            d="M0,34 L20,24 L40,30 L60,14 L80,22 L100,10 L120,18 L150,6"
            fill="none"
            stroke="#5aa6ff"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>
      </div>

      {/* ---- Card frontal-direito: Beneficiários ---- */}
      <div className={`absolute right-[-30px] top-[70px] w-[150px] ${cardCls} p-3.5`}>
        <p className="text-[11px] text-white/55">Beneficiários</p>
        <p className="text-xl font-bold text-white">1.248</p>
        <p className="text-[9px] text-white/40">Ativos</p>
        <div className="mt-3 flex justify-center">
          <div
            className="size-16 rounded-full"
            style={{
              background:
                'conic-gradient(#5aa6ff 0% 70%, rgba(255,255,255,0.12) 70% 100%)',
              mask: 'radial-gradient(circle 15px at center, transparent 98%, #000 100%)',
              WebkitMask:
                'radial-gradient(circle 15px at center, transparent 98%, #000 100%)',
            }}
          />
        </div>
      </div>
    </div>
  )
}
