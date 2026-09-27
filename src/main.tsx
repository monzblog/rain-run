import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './ui/App'
import './styles.css'

const promo = new URLSearchParams(location.search).has('promo')
createRoot(document.getElementById('root')!).render(
  promo ? <App promo /> : <StrictMode><App promo={false} /></StrictMode>,
)
