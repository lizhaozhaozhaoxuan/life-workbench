import { createApp, type App as VueApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { useAuthStore } from './stores/auth'
import { useTheme } from './composables/useTheme'
import './lib/chart'
import './style.css'

// 全局错误兜底：把任何运行时错误直接显示到页面，便于排查白屏
function showFatal(msg: string) {
  const el = document.getElementById('app')
  if (el) {
    el.innerHTML = `<div style="padding:24px;font-family:monospace;color:#e11d48;white-space:pre-wrap;line-height:1.6">⚠️ 运行时错误（请把下面内容发给我）：\n\n${msg}</div>`
  }
}
window.addEventListener('error', (e) => showFatal((e.error?.stack || e.message || String(e))))
window.addEventListener('unhandledrejection', (e) => showFatal('Promise: ' + (e.reason?.stack || e.reason)))

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.config.errorHandler = (err, _instance, info) => {
  console.error('[app error]', err, info)
  showFatal((err as Error)?.stack || String(err) + '\n\n' + info)
}

const theme = useTheme()
theme.init()

const auth = useAuthStore()
auth.init().finally(() => {
  app.mount('#app')
})
