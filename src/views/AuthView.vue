<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const isRegister = ref(false)
const username = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

if (auth.isLocal) {
  router.replace('/')
}

const redirect = computed(() => (route.query.redirect as string) || '/')

const USER_RE = /^[a-zA-Z0-9_一-龥]{2,20}$/

async function submit() {
  error.value = ''
  if (!username.value || !password.value) {
    error.value = '请输入用户名与密码'
    return
  }
  if (!USER_RE.test(username.value.trim())) {
    error.value = '用户名仅支持字母、数字、下划线、中文，2–20 位'
    return
  }
  loading.value = true
  try {
    if (isRegister.value) {
      await auth.signUp(username.value.trim(), password.value)
    } else {
      await auth.signIn(username.value.trim(), password.value)
    }
    router.replace(redirect.value)
  } catch (e: any) {
    error.value = e?.message || '操作失败，请重试'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="flex min-h-full items-center justify-center bg-gradient-to-br from-brand-500/10 via-slate-50 to-indigo-500/10 px-4 dark:from-brand-500/10 dark:via-slate-950 dark:to-indigo-500/10">
    <div class="card w-full max-w-sm p-7 animate-in">
      <div class="mb-6 flex items-center gap-3">
        <img src="/icon.svg" class="h-10 w-10" alt="" />
        <div>
          <h1 class="text-lg font-semibold">个人全维度工作台</h1>
          <p class="text-xs text-slate-400">{{ isRegister ? '创建账号，开启多端同步' : '登录以同步你的数据' }}</p>
        </div>
      </div>

      <form class="space-y-3" @submit.prevent="submit">
        <div>
          <label class="label">用户名</label>
          <input v-model="username" type="text" class="input" placeholder="字母、数字、下划线或中文" autocomplete="username" />
        </div>
        <div>
          <label class="label">密码</label>
          <input v-model="password" type="password" class="input" placeholder="至少 6 位" :autocomplete="isRegister ? 'new-password' : 'current-password'" />
        </div>

        <p v-if="error" class="text-sm text-rose-500">{{ error }}</p>

        <button class="btn-primary w-full" :disabled="loading">
          {{ loading ? '处理中…' : isRegister ? '注册并进入' : '登录' }}
        </button>
      </form>

      <button class="mt-4 w-full text-center text-sm text-brand-600 hover:underline" @click="isRegister = !isRegister">
        {{ isRegister ? '已有账号？去登录' : '没有账号？去注册' }}
      </button>
    </div>
  </div>
</template>
