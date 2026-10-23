import { useState, type ComponentType } from 'react'
import { Bell, Bug, ChartLine, CircuitBoard, FileText, FolderInput, Gamepad2, HardDrive, LayoutDashboard, ListTree, Monitor, Rocket, Settings, Wifi, Zap } from 'lucide-react'
import OptimizePage from './pages/Optimize'
import CrashesPage from './pages/Crashes'
import ReportPage from './pages/Report'
import Overview from './pages/Overview'
import AlertsPage from './pages/Alerts'
import MachinePage from './pages/Machine'
import DriversPage from './pages/Drivers'
import HistoryPage from './pages/History'
import ProcessesPage from './pages/Processes'
import DiskPage from './pages/Disk'
import OrganizerPage from './pages/Organizer'
import GamesPage from './pages/Games'
import InternetPage from './pages/Internet'
import EnergyPage from './pages/Energy'
import SettingsPage from './pages/Settings'
import { useStatus } from './hooks'

const PAGES = {
  overview: ['Visão geral', Overview, LayoutDashboard], alerts: ['Alertas', AlertsPage, Bell],
  history: ['Histórico', HistoryPage, ChartLine], crashes: ['Travamentos', CrashesPage, Bug], processes: ['Processos', ProcessesPage, ListTree], energy: ['Energia', EnergyPage, Zap], internet: ['Internet', InternetPage, Wifi],
  games: ['Jogos', GamesPage, Gamepad2],
  machine: ['Meu PC', MachinePage, Monitor], optimize: ['Otimizar', OptimizePage, Rocket], drivers: ['Drivers', DriversPage, CircuitBoard], disk: ['Disco e limpeza', DiskPage, HardDrive], organizer: ['Organizador', OrganizerPage, FolderInput], report: ['Relatório', ReportPage, FileText],
  settings: ['Ajustes', SettingsPage, Settings],
} as const

type PageId = keyof typeof PAGES

/** Menu por categoria. Ajustes fica separado, no pé. */
const GROUPS: [string, PageId[]][] = [
  ['Início', ['overview', 'alerts']],
  ['Monitorar', ['history', 'crashes', 'processes', 'energy', 'internet']],
  ['Jogos', ['games']],
  ['Meu PC', ['machine', 'optimize', 'drivers', 'disk', 'organizer', 'report']],
]

/** Contador de alertas no menu (componente separado: só ele redesenha a cada leitura). */
function AlertBadge() {
  const { status } = useStatus(1)
  return status?.alerts ? <span className="badge lv-warning nav-badge">{status.alerts}</span> : null
}

function NavItem({ id, active, go }: { id: PageId; active: boolean; go: Go }) {
  const [label, , Icon] = PAGES[id]
  const I = Icon as ComponentType<{ size?: number; strokeWidth?: number }>
  return (
    <button className={active ? 'active' : ''} onClick={() => go(id)}>
      <span className="nav-label"><I size={16} strokeWidth={1.8} />{label}</span>
      {id === 'alerts' && <AlertBadge />}
    </button>
  )
}

export default function App() {
  const [nav, setNav] = useState<{ page: PageId; query?: string; n: number }>({ page: 'overview', n: 0 })
  const go: Go = (page, query) => setNav((v) => ({ page, query, n: v.n + 1 }))
  const Page = PAGES[nav.page][1] as ComponentType<{ go: Go; query?: string }>
  return (
    <div className="app">
      <nav className="nav">
        <div className="brand">Xodó</div>
        {GROUPS.map(([title, ids]) => (
          <div className="nav-group" key={title}>
            <div className="nav-title">{title}</div>
            {ids.map((id) => <NavItem key={id} id={id} active={nav.page === id} go={go} />)}
          </div>
        ))}
        <div className="spacer" />
        <NavItem id="settings" active={nav.page === 'settings'} go={go} />
      </nav>
      {/* key: navegar de um alerta para Processos com outra busca recria a tela com a busca nova */}
      <main className="main"><Page key={nav.n} go={go} query={nav.query} /></main>
    </div>
  )
}

export type Go = (p: PageId, query?: string) => void
