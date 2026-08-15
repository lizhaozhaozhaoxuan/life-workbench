<script setup lang="ts">
import { ref, computed } from 'vue'
import dayjs from 'dayjs'
import { Lunar } from 'lunar-javascript'
import { useCollection } from '@/composables/useCollection'
import Modal from '../components/Modal.vue'
import { nextOccurrence, daysUntil, toLunarText } from '@/lib/lunar'

const { items: easyList, repo: easyRepo } = useCollection('life_easy')
const { items: anniversaries, repo: annRepo } = useCollection('life_anniversary')

// ---- 易忘清单 ----
const newEasy = ref({ title: '', repeat: 'once', remind_at: '' })
async function addEasy() {
  if (!newEasy.value.title.trim()) return
  await easyRepo.insert({
    title: newEasy.value.title.trim(),
    repeat: newEasy.value.repeat,
    remind_at: newEasy.value.remind_at ? new Date(newEasy.value.remind_at).toISOString() : null,
    done: false
  })
  newEasy.value = { title: '', repeat: 'once', remind_at: '' }
}
async function toggleEasy(e: any) {
  if (e.done) {
    await easyRepo.update(e.id, { done: false, done_at: null })
    return
  }
  const patch: any = { done: true, done_at: new Date().toISOString() }
  if (e.repeat !== 'once') {
    patch.done = false
    const base = e.repeat === 'monthly' ? dayjs().add(1, 'month') : dayjs().add(e.repeat === 'daily' ? 1 : 7, 'day')
    patch.next_remind_at = base.toISOString()
  }
  await easyRepo.update(e.id, patch)
}
async function removeEasy(e: any) {
  if (confirm('确定删除？')) await easyRepo.remove(e.id)
}

// ---- 纪念日 ----
const modalOpen = ref(false)
const mform = ref({ id: '', name: '', type: 'solar', date: '', lm: '', ld: '', repeat_year: true, advance_days: 0 })
function openAddAnn() {
  mform.value = { id: '', name: '', type: 'solar', date: '', lm: '', ld: '', repeat_year: true, advance_days: 0 }
  modalOpen.value = true
}
function openEditAnn(a: any) {
  mform.value = {
    id: a.id,
    name: a.name,
    type: a.is_lunar ? 'lunar' : 'solar',
    date: a.date,
    lm: a.lunar_month ?? '',
    ld: a.lunar_day ?? '',
    repeat_year: a.repeat_year,
    advance_days: a.advance_days
  }
  modalOpen.value = true
}
function pad(n: number) {
  return String(n).padStart(2, '0')
}
async function saveAnn() {
  if (!mform.value.name.trim()) return
  let dateStr = mform.value.date
  if (mform.value.type === 'lunar') {
    try {
      const solar = Lunar.fromYmd(dayjs().year(), Number(mform.value.lm), Number(mform.value.ld)).getSolar()
      dateStr = `${solar.getYear()}-${pad(solar.getMonth())}-${pad(solar.getDay())}`
    } catch {
      alert('农历日期不合法')
      return
    }
  }
  const patch: any = {
    name: mform.value.name.trim(),
    date: dateStr,
    is_lunar: mform.value.type === 'lunar',
    lunar_month: mform.value.type === 'lunar' ? Number(mform.value.lm) : null,
    lunar_day: mform.value.type === 'lunar' ? Number(mform.value.ld) : null,
    repeat_year: mform.value.repeat_year,
    advance_days: Number(mform.value.advance_days) || 0
  }
  if (mform.value.id) await annRepo.update(mform.value.id, patch)
  else await annRepo.insert(patch)
  modalOpen.value = false
}
async function removeAnn(a: any) {
  if (confirm('确定删除该纪念日？')) await annRepo.remove(a.id)
}

const annivSorted = computed(() =>
  anniversaries.value
    .map((a) => ({ ...a, next: nextOccurrence(a), d: daysUntil(nextOccurrence(a)) }))
    .sort((x, y) => x.d - y.d)
)
const repeatText = (r: string) => ({ once: '一次', daily: '每天', weekly: '每周', monthly: '每月' }[r] || r)
</script>

<template>
  <div class="grid gap-6 lg:grid-cols-2">
    <!-- 易忘清单 -->
    <section>
      <h2 class="mb-3 text-sm font-semibold text-slate-500 dark:text-slate-400">易忘清单</h2>
      <div class="card mb-3 flex flex-wrap items-center gap-2 p-3">
        <input v-model="newEasy.title" class="input flex-1" placeholder="怕忘记的小事，如浇花、还书…" @keyup.enter="addEasy" />
        <select v-model="newEasy.repeat" class="input w-auto py-2">
          <option value="once">一次性</option>
          <option value="daily">每天</option>
          <option value="weekly">每周</option>
          <option value="monthly">每月</option>
        </select>
        <input v-model="newEasy.remind_at" type="datetime-local" class="input w-auto py-2" title="提醒时间" />
        <button class="btn-primary" @click="addEasy">添加</button>
      </div>
      <div class="space-y-2">
        <div v-for="e in easyList" :key="e.id" class="card flex items-center gap-3 p-3 animate-in" :class="e.done ? 'opacity-60' : ''">
          <button
            class="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition"
            :class="e.done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 dark:border-slate-600'"
            @click="toggleEasy(e)"
          >{{ e.done ? '✓' : '' }}</button>
          <div class="min-w-0 flex-1">
            <div class="truncate font-medium" :class="e.done ? 'line-through' : ''">{{ e.title }}</div>
            <div class="mt-0.5 flex flex-wrap gap-2 text-xs text-slate-400">
              <span class="chip bg-slate-100 dark:bg-slate-800">{{ repeatText(e.repeat) }}</span>
              <span v-if="e.remind_at || e.next_remind_at">🔔 {{ dayjs(e.next_remind_at || e.remind_at).format('MM-DD HH:mm') }}</span>
            </div>
          </div>
          <button class="text-slate-300 hover:text-rose-500" @click="removeEasy(e)">🗑</button>
        </div>
        <p v-if="!easyList.length" class="py-8 text-center text-sm text-slate-400">清单为空</p>
      </div>
    </section>

    <!-- 纪念日 -->
    <section>
      <div class="mb-3 flex items-center justify-between">
        <h2 class="text-sm font-semibold text-slate-500 dark:text-slate-400">纪念日</h2>
        <button class="btn-ghost py-1.5 text-xs" @click="openAddAnn">+ 新增</button>
      </div>
      <div class="space-y-2">
        <div
          v-for="a in annivSorted"
          :key="a.id"
          class="card cursor-pointer p-3 animate-in"
          :class="a.d <= 7 ? 'ring-1 ring-amber-400/40' : ''"
          @click="openEditAnn(a)"
        >
          <div class="flex items-center justify-between">
            <span class="font-medium">{{ a.name }}</span>
            <span class="text-lg font-semibold" :class="a.d === 0 ? 'text-rose-500' : a.d <= 7 ? 'text-amber-500' : 'text-slate-400'">
              {{ a.d === 0 ? '今天' : `还有 ${a.d} 天` }}
            </span>
          </div>
          <div class="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span v-if="a.is_lunar" class="chip bg-violet-500/10 text-violet-500">农历 {{ toLunarText(a.next) }}</span>
            <span>{{ dayjs(a.next).format('YYYY-MM-DD') }}</span>
            <span class="chip bg-slate-100 dark:bg-slate-800">{{ a.repeat_year ? '每年' : '仅一次' }}</span>
            <span v-if="a.advance_days">提前 {{ a.advance_days }} 天提醒</span>
          </div>
        </div>
        <p v-if="!annivSorted.length" class="py-8 text-center text-sm text-slate-400">还没有纪念日</p>
      </div>
    </section>

    <!-- 纪念日编辑 -->
    <Modal :open="modalOpen" :title="mform.id ? '编辑纪念日' : '新增纪念日'" @close="modalOpen = false">
      <div class="space-y-3">
        <div>
          <label class="label">名称</label>
          <input v-model="mform.name" class="input" placeholder="如 结婚纪念日" />
        </div>
        <div>
          <label class="label">日期类型</label>
          <div class="flex gap-2">
            <button class="chip" :class="mform.type === 'solar' ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-slate-800'" @click="mform.type = 'solar'">公历</button>
            <button class="chip" :class="mform.type === 'lunar' ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-slate-800'" @click="mform.type = 'lunar'">农历</button>
          </div>
        </div>
        <div v-if="mform.type === 'solar'">
          <label class="label">公历日期</label>
          <input v-model="mform.date" type="date" class="input" />
        </div>
        <div v-else class="grid grid-cols-2 gap-3">
          <div><label class="label">农历月</label><input v-model="mform.lm" type="number" min="1" max="12" class="input" placeholder="1-12" /></div>
          <div><label class="label">农历日</label><input v-model="mform.ld" type="number" min="1" max="30" class="input" placeholder="1-30" /></div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="label">重复</label>
            <select v-model="mform.repeat_year" class="input">
              <option :value="true">每年</option>
              <option :value="false">仅一次</option>
            </select>
          </div>
          <div>
            <label class="label">提前提醒（天）</label>
            <input v-model.number="mform.advance_days" type="number" min="0" class="input" />
          </div>
        </div>
        <div class="flex justify-end gap-2 pt-1">
          <button v-if="mform.id" class="btn-danger mr-auto" @click="removeAnn({ id: mform.id }); modalOpen = false">删除</button>
          <button class="btn-ghost" @click="modalOpen = false">取消</button>
          <button class="btn-primary" :disabled="!mform.name.trim()" :class="!mform.name.trim() ? 'cursor-not-allowed opacity-50' : ''" @click="saveAnn">保存</button>
        </div>
      </div>
    </Modal>
  </div>
</template>
