import Head from 'next/head'
import Link from 'next/link'
import { ArrowRight, Check, Sparkles } from 'lucide-react'
import Logo from '../components/Logo'
import Button from '../components/ui/Button'
import { useAuth } from '../contexts/AuthContext'

const freeFeatures = [
  'Coding and prompt battles with friends, strangers, and bots',
  'Solo coding and prompt Practice',
  'All supported programming languages',
  'Problems, rankings, battle history, and tournaments',
  'Profiles, friends, messages, and notifications'
]

export default function PricingPage() {
  const { user } = useAuth()
  const playHref = user ? '/modes' : '/register'

  return (
    <>
      <Head>
        <title>CodeArena Is Free | Practice, Battle, and Create</title>
        <meta
          name="description"
          content="CodeArena is free, including coding practice, battles, rankings, tournaments, and a daily CreatorArena AI allowance."
        />
        <link rel="canonical" href="https://codearena.co/pricing" />
      </Head>

      <main className="min-h-screen bg-surface-950 text-white">
        <header className="border-b border-surface-800 bg-surface-900/80 backdrop-blur-md">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <Link href="/" className="transition-opacity hover:opacity-80">
              <Logo />
            </Link>
            <Button variant="primary" size="sm" onClick={() => { window.location.href = playHref }}>
              {user ? 'Play Now' : 'Create Free Account'}
            </Button>
          </div>
        </header>

        <div className="mx-auto max-w-6xl px-6 py-16 sm:py-24">
          <div className="mx-auto mb-12 max-w-3xl text-center">
            <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-success/30 bg-success/10 px-4 py-2 text-sm font-medium text-success-light">
              <Sparkles className="h-4 w-4" />
              Free for developers
            </span>
            <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">CodeArena is free to play</h1>
            <p className="mt-5 text-lg leading-relaxed text-surface-400">
              Practice alone, compete in real time, create with AI, and connect with other developers.
              CreatorArena has a daily generation limit to keep the free service sustainable.
            </p>
          </div>

          <div className="mx-auto max-w-2xl">
            <section className="rounded-2xl border-2 border-primary-500 bg-surface-900 p-7 shadow-xl shadow-primary-950/20">
              <div className="mb-6">
                <p className="text-sm font-semibold uppercase tracking-wider text-primary-400">CodeArena</p>
                <div className="mt-2 flex items-end gap-2">
                  <span className="text-5xl font-bold">$0</span>
                  <span className="pb-1 text-surface-400">forever</span>
                </div>
                <p className="mt-3 text-sm text-surface-400">
                  Generous daily fair-use safeguards keep shared code execution and model-backed modes sustainable.
                </p>
              </div>

              <ul className="mb-8 space-y-3">
                {freeFeatures.map(feature => (
                  <li key={feature} className="flex items-start gap-3 text-surface-200">
                    <Check className="mt-0.5 h-5 w-5 flex-shrink-0 text-success" />
                    <span>{feature}</span>
                  </li>
                ))}
                <li className="flex items-start gap-3 text-surface-200">
                  <Check className="mt-0.5 h-5 w-5 flex-shrink-0 text-success" />
                  CreatorArena AI generation with a daily fair-use limit
                </li>
              </ul>

              <Link
                href={playHref}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary-500 px-5 py-3 font-semibold text-white transition-colors hover:bg-primary-400"
              >
                {user ? 'Choose a Mode' : 'Start Free'}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </section>

          </div>
        </div>
      </main>
    </>
  )
}
