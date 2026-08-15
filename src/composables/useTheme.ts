import { ref } from 'vue'

export type ThemeMode = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'lb:theme'
const mode = ref<ThemeMode>((localStorage.getItem(STORAGE_KEY) as ThemeMode) || 'system')

function apply() {
  const root = document.documentElement
  const dark =
    mode.value === 'dark' ||
    (mode.value === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  root.classList.toggle('dark', dark)
  // 平滑过渡
  root.style.transition = 'background-color .3s ease, color .3s ease'
}

export function useTheme() {
  const setMode = (m: ThemeMode) => {
    mode.value = m
    localStorage.setItem(STORAGE_KEY, m)
    apply()
  }
  const init = () => {
    apply()
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (mode.value === 'system') apply()
    })
  }
  return { mode, setMode, init }
}
