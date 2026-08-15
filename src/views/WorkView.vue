<script setup lang="ts">
import { ref, computed } from 'vue'
import dayjs from 'dayjs'
import { useCollection } from '@/composables/useCollection'
import Modal from '../components/Modal.vue'

const { items: todos, repo } = useCollection('todos')

const viewMode = ref<'list' | 'board'>('list')
const tab = ref<'all' | 'today' | 'overdue' | 'done'>('all')
const priorityFilter = ref<'all' | 'high' | 'medium' | 'low'>('all')

const modalOpen = ref(false)
const form = ref({ id: '', title: '', note: '', priority: 'medium', due_date: '', remind_at: '', status: 'todo' })
const todayStr = dayjs().format('YYYY-MM-DD')

function openAdd() {
  form.value = { id: '', title: '', note: '', priority: 'medium', due_date: '', remind_at: '', status: 'todo' }
  modalOpen.value = true
}
function openEdit(t: any) {
  form.value = {
    id: t.id,
    title: t.title,
    note: t.note || '',
    priority: t.priority,
    due_date: t.due_date || '',
    remind_at: t.remind_at ? dayjs(t.remind_at).format('YYYY-MM-DDTHH:mm') : '',
    status: t.status
  }
  modalOpen.value = true
}

async function save() {
  if (!form.value.title.trim()) return
  const patch: any = {
    title: form.value.title.trim(),
    note: form.value.note,
    priority: form.value.priority,
    due_date: form.value.due_date || null,
    remind_at: form.value.remind_at ? new Date(form.value.remind_at).toISOString() : null,
    status: form.value.status
  }
  if (form.value.id) {
    await repo.update(form.value.id, patch)
  } else {
    await repo.insert(patch)
  }
  modalOpen.value = false
}

async function setStatus(t: any, status: string) {
  const patch: any = { status }
  if (status === 'done') patch.completed_at = new Date().toISOString()
  else if (t.status === 'done') patch.completed_at = null
  await repo.update(t.id, patch)
}
async function toggleDone(t: any) {
  await setStatus(t, t.status === 'done' ? 'todo' : 'done')
}
async function remove(t: any) {
  if (confirm('确定删除该事项？')) await repo.remove(t.id)
}

const filtered = computed(() => {
  return todos.value.filter((t) => {
    if (priorityFilter.value !== 'all' && t.priority !== priorityFilter.value) return false
    if (tab.value === 'done') return t.status === 'done'
    if (tab.value === 'today') return t.status !== 'done' && (!t.due_date || t.due_date <= todayStr)
    if (tab.value === 'overdue') return t.status !== 'done' && t.due_date && t.due_date < todayStr
    return t.status !== 'done'
  })
})
const board = computed(() => ({
  todo: todos.value.filter((t) => t.status === 'todo' && (priorityFilter.value === 'all' || t.priority === priorityFilter.value)),
  doing: todos.value.filter((t) => t.status === 'doing' && (priorityFilter.value === 'all' || t.priority === priorityFilter.value)),
  done: todos.value.filter((t) => t.status === 'done' && (priorityFilter.value === 'all' || t.priority === priorityFilter.value))
}))

const prioClass = (p: string) =>
  p === 'high'
    ? 'bg-rose-500/10 text-rose-500'
    : p === 'medium'
    ? 'bg-amber-500/10 text-amber-600'
    : 'bg-slate-500/10 text-slate-500'
const prioText = (p: string) => (p === 'high' ? '高' : p === 'medium' ? '中' : '低')
const isOverdue = (t: any) => t.status !== 'done' && t.due_date && t.due_date < todayStr
</script>

<template>
  <div class="space-y-4">
    <!-- 工具栏 -->
    <div class="flex flex-wrap items-center gap-2">
      <div class="flex rounded-xl border border-slate-200 p-0.5 dark:border-slate-700">
        <button
          v-for="m in (['list', 'board'] as const)"
          :key="m"
          class="rounded-lg px-3 py-1.5 text-sm"
          :class="viewMode === m ? 'bg-brand-600 text-white' : 'text-slate-500'"
          @click="viewMode = m"
        >{{ m === 'list' ? '列表' : '看板' }}</button>
      </div>
      <div class="flex flex-wrap gap-1">
        <button
          v-for="tb in (['all', 'today', 'overdue', 'done'] as const)"
          :key="tb"
          class="chip"
          :class="tab === tb ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'"
          @click="tab = tb"
        >{{ tb === 'all' ? '进行中' : tb === 'today' ? '今日' : tb === 'overdue' ? '逾期' : '已完成' }}</button>
      </div>
      <select v-model="priorityFilter" class="input w-auto py-1.5">
        <option value="all">全部优先级</option>
        <option value="high">高</option>
        <option value="medium">中</option>
        <option value="low">低</option>
      </select>
      <button class="btn-primary ml-auto" @click="openAdd">+ 新事项</button>
    </div>

    <!-- 列表视图 -->
    <div v-if="viewMode === 'list'" class="space-y-2">
      <div
        v-for="t in filtered"
        :key="t.id"
        class="card flex items-center gap-3 p-3 animate-in"
        :class="isOverdue(t) ? 'ring-1 ring-rose-400/40' : ''"
      >
        <button
          class="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition"
          :class="t.status === 'done' ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 dark:border-slate-600'"
          @click="toggleDone(t)"
        >{{ t.status === 'done' ? '✓' : '' }}</button>
        <div class="min-w-0 flex-1 cursor-pointer" @click="openEdit(t)">
          <div class="truncate font-medium" :class="t.status === 'done' ? 'text-slate-400 line-through' : ''">{{ t.title }}</div>
          <div class="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span class="chip" :class="prioClass(t.priority)">{{ prioText(t.priority) }}</span>
            <span v-if="t.due_date">📅 {{ t.due_date }}<span v-if="isOverdue(t)" class="text-rose-500">· 逾期</span></span>
            <span v-if="t.remind_at">🔔 {{ dayjs(t.remind_at).format('MM-DD HH:mm') }}</span>
          </div>
        </div>
        <button class="text-slate-300 hover:text-rose-500" @click="remove(t)">🗑</button>
      </div>
      <p v-if="!filtered.length" class="py-10 text-center text-sm text-slate-400">暂无事项</p>
    </div>

    <!-- 看板视图 -->
    <div v-else class="grid gap-3 md:grid-cols-3">
      <div v-for="col in (['todo', 'doing', 'done'] as const)" :key="col" class="space-y-2">
        <div class="px-1 text-sm font-medium text-slate-500">
          {{ col === 'todo' ? '待开始' : col === 'doing' ? '进行中' : '已完成' }} ({{ board[col].length }})
        </div>
        <div
          v-for="t in board[col]"
          :key="t.id"
          class="card cursor-pointer p-3 animate-in"
          :class="isOverdue(t) ? 'ring-1 ring-rose-400/40' : ''"
          @click="openEdit(t)"
        >
          <div class="font-medium" :class="t.status === 'done' ? 'text-slate-400 line-through' : ''">{{ t.title }}</div>
          <div class="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span class="chip" :class="prioClass(t.priority)">{{ prioText(t.priority) }}</span>
            <span v-if="t.due_date">📅 {{ t.due_date }}</span>
          </div>
          <div class="mt-2 flex gap-1">
            <button v-if="col !== 'todo'" class="chip bg-slate-100 dark:bg-slate-800" @click.stop="setStatus(t, 'todo')">待开始</button>
            <button v-if="col !== 'doing'" class="chip bg-brand-500/10 text-brand-600" @click.stop="setStatus(t, 'doing')">进行中</button>
            <button v-if="col !== 'done'" class="chip bg-emerald-500/10 text-emerald-600" @click.stop="setStatus(t, 'done')">完成</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 添加/编辑 -->
    <Modal :open="modalOpen" :title="form.id ? '编辑事项' : '新事项'" @close="modalOpen = false">
      <div class="space-y-3">
        <div>
          <label class="label">标题</label>
          <input v-model="form.title" class="input" placeholder="要做什么？" @keyup.enter="save" />
        </div>
        <div>
          <label class="label">备注</label>
          <textarea v-model="form.note" class="input" rows="2" placeholder="补充说明（可选）"></textarea>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="label">优先级</label>
            <select v-model="form.priority" class="input">
              <option value="high">高</option>
              <option value="medium">中</option>
              <option value="low">低</option>
            </select>
          </div>
          <div>
            <label class="label">状态</label>
            <select v-model="form.status" class="input">
              <option value="todo">待开始</option>
              <option value="doing">进行中</option>
              <option value="done">已完成</option>
            </select>
          </div>
          <div>
            <label class="label">截止日期</label>
            <input v-model="form.due_date" type="date" class="input" />
          </div>
          <div>
            <label class="label">提醒时间</label>
            <input v-model="form.remind_at" type="datetime-local" class="input" />
          </div>
        </div>
        <div class="flex justify-end gap-2 pt-1">
          <button class="btn-ghost" @click="modalOpen = false">取消</button>
          <button class="btn-primary" @click="save">保存</button>
        </div>
      </div>
    </Modal>
  </div>
</template>
