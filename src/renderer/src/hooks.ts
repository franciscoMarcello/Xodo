import { useCallback, useEffect, useState } from 'react'
import type { Settings, Status } from '../../shared/types'

/** Última leitura e as últimas `keep` leituras (uma a cada 2 s). */
export function useStatus(keep = 60) {
  const [list, setList] = useState<Status[]>([])
  useEffect(() => window.api.onStatus((s) => setList((l) => [...l.slice(-(keep - 1)), s])), [keep])
  return { status: list.at(-1) ?? null, history: list }
}

/** Carrega algo da API, com estado de carregando/erro e `reload`. `auto = false` só carrega quando chamar `reload`. */
export function useLoad<T>(fn: () => Promise<T>, auto = true) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(auto)
  const [error, setError] = useState<string | null>(null)
  const reload = useCallback(async () => {
    setLoading(true); setError(null)
    try { setData(await fn()) } catch (e) { setError(message(e)) } finally { setLoading(false) }
  }, [fn])
  useEffect(() => { if (auto) reload() }, [auto, reload])
  return { data, loading, error, reload, setData }
}

/** Ajustes com gravação imediata de um trecho. */
export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null)
  useEffect(() => { window.api.getSettings().then(setSettings) }, [])
  const save = useCallback(async (s: Settings) => setSettings(await window.api.saveSettings(s)), [])
  return { settings, save }
}

/** Erros do processo principal chegam como "Error invoking remote method 'x': Error: texto". */
export function message(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e)
  return m.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}
