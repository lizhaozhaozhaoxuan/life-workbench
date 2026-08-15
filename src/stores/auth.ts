import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase, HAS_SUPABASE, LOCAL_USER } from '@/lib/supabase'
import { setCurrentUser } from '@/lib/db'

// 用户名 → Supabase Auth 登录标识（邮箱字段）。
// local.app 为固定占位域，仅用于唯一标识与登录，绝不发送任何邮件。
function loginEmailOf(raw: string): string {
  return `${raw.trim().replace(/\s+/g, '_')}@local.app`
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<any>(null)
  const loading = ref(true)
  const isLocal = ref(!HAS_SUPABASE) // 无 Supabase 配置 -> 本地演示模式（无需登录）

  async function init() {
    if (!HAS_SUPABASE || !supabase) {
      isLocal.value = true
      setCurrentUser(LOCAL_USER)
      loading.value = false
      return
    }
    const { data } = await supabase.auth.getSession()
    user.value = data.session?.user ?? null
    setCurrentUser(user.value?.id ?? LOCAL_USER)
    supabase.auth.onAuthStateChange((_e, session) => {
      user.value = session?.user ?? null
      setCurrentUser(user.value?.id ?? LOCAL_USER)
    })
    loading.value = false
  }

  async function signUp(username: string, password: string) {
    if (!supabase) return
    const { data, error } = await supabase.auth.signUp({
      email: loginEmailOf(username),
      password,
      options: { redirectTo: window.location.origin }
    })
    if (error) {
      // 给出更友好的中文提示
      const msg = error.message || ''
      if (msg.includes('Invalid path') || msg.includes('request URL')) {
        throw new Error('注册服务配置异常：请确认 Supabase 控制台 Authentication → URL Configuration 中 Site URL 已填写（见 .env.example 旁说明）')
      }
      if (msg.includes('rate limit') || msg.includes('email')) {
        throw new Error('邮件发送超限：请在 Supabase 控制台 Authentication → Providers → Email 关闭「Confirm email」，注册不再发邮件即可')
      }
      if (msg.includes('already registered') || msg.includes('already been registered')) {
        throw new Error('该用户名已注册，请直接登录')
      }
      if (msg.includes('weak password')) {
        throw new Error('密码太弱，请至少使用 6 位')
      }
      throw error
    }
    // email confirmation 关闭时 user 立即可用；开启时 user 为 null 需等验证邮件
    if (data.user) {
      await supabase.from('profiles').upsert({ id: data.user.id, display_name: username })
      setCurrentUser(data.user.id)
    }
  }

  async function signIn(username: string, password: string) {
    if (!supabase) return
    const { error } = await supabase.auth.signInWithPassword({ email: loginEmailOf(username), password })
    if (error) {
      const msg = error.message || ''
      if (msg.includes('Invalid login credentials')) {
        throw new Error('用户名或密码错误')
      }
      throw error
    }
  }

  async function signOut() {
    if (supabase) await supabase.auth.signOut()
    user.value = null
  }

  return { user, loading, isLocal, init, signUp, signIn, signOut }
})
