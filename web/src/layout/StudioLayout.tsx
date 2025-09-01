import React from 'react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Moon, Sun } from 'lucide-react'
import { cn } from '@/lib/utils'

type Props = {
  tab: '/' | '/sora'
  onTabChange: (v: '/' | '/sora') => void
  isDark: boolean
  onToggleTheme: () => void
  children: React.ReactNode
}

export default function StudioLayout({ tab, onTabChange, isDark, onToggleTheme, children }: Props) {
  return (
    <div className="relative z-10 mx-auto max-w-6xl p-4 space-y-4 min-h-screen gradient-dark">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-3 focus:py-2 focus:rounded-md focus:bg-neutral-900 focus:text-white">
        Skip to content
      </a>
      <header className="sticky top-0 z-40 flex items-center justify-between mb-6 py-4 border-b border-border/60 bg-background/80 supports-[backdrop-filter]:bg-background/60 backdrop-blur">
        <h1 className="!text-2xl font-sans font-semibold flex items-center gap-2">
          <div className="w-8 h-8 rounded-full gradient-brand flex items-center justify-center">
            <span className="text-primary-foreground text-sm">AI</span>
          </div>
          <span className="text-gradient">AI Media Studio</span>
        </h1>
        <div className="flex items-center gap-2">
          <Tabs value={tab} onValueChange={(v) => onTabChange(v as '/' | '/sora')}>
            <TabsList className="inline-flex rounded-2xl border border-input/20 bg-muted/30 p-1 text-muted-foreground shadow-lg supports-[backdrop-filter]:bg-muted/20 backdrop-blur">
              <TabsTrigger value="/">Images</TabsTrigger>
              <TabsTrigger value="/sora">Video (Sora)</TabsTrigger>
            </TabsList>
          </Tabs>
          <button
            className="p-2 rounded-full bg-popover/60 text-muted-foreground hover:text-foreground hover:bg-popover/80 supports-[backdrop-filter]:bg-popover/50 backdrop-blur border border-border/40"
            onClick={onToggleTheme}
            aria-label="Toggle dark mode"
            title="Toggle dark mode"
          >
            {isDark ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
          </button>
        </div>
      </header>
      {children}
    </div>
  )
}

