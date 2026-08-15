import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('@/layouts/AppShell.vue'),
    children: [
      { path: '', name: 'overview', component: () => import('@/views/Overview.vue'), meta: { title: '概览' } },
      { path: 'work', name: 'work', component: () => import('@/views/WorkView.vue'), meta: { title: '工作' } },
      { path: 'life', name: 'life', component: () => import('@/views/LifeView.vue'), meta: { title: '生活' } },
      { path: 'finance', name: 'finance', component: () => import('@/views/FinanceView.vue'), meta: { title: '记账' } },
      { path: 'workout', name: 'workout', component: () => import('@/views/WorkoutView.vue'), meta: { title: '运动' } },
      { path: 'study', name: 'study', component: () => import('@/views/StudyView.vue'), meta: { title: '学习' } },
      { path: 'assets', name: 'assets', component: () => import('@/views/AssetsView.vue'), meta: { title: '资产' } },
      { path: 'settings', name: 'settings', component: () => import('@/views/SettingsView.vue'), meta: { title: '设置' } }
    ]
  },
  { path: '/auth', name: 'auth', component: () => import('@/views/AuthView.vue'), meta: { public: true } },
  { path: '/:pathMatch(.*)*', redirect: '/' }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (!to.meta.public && !auth.isLocal && !auth.user) {
    return { name: 'auth', query: { redirect: to.fullPath } }
  }
  return true
})

export default router
