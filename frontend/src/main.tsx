import ReactDOM from 'react-dom/client'
import App from './App'
import { appName } from './config/app'
import './index.css'

document.title = appName

ReactDOM.createRoot(document.getElementById('root')!).render(
  <App />,
)
