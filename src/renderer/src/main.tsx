import { createRoot } from 'react-dom/client'
import './styles.css'
import App from './App'
import Widget from './Widget'

const isWidget = location.hash.startsWith('#widget')
document.body.classList.toggle('widget-body', isWidget)
createRoot(document.getElementById('root')!).render(isWidget ? <Widget /> : <App />)
