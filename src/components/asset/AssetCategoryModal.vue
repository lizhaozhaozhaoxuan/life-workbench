<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import Modal from '../Modal.vue'
import type { Category, AssetCatType } from '@/lib/assetHelpers'

const props = defineProps<{
  open: boolean
  category?: Category | null
  parent?: Category | null // 非负值表示新增二级分类
}>()
const emit = defineEmits<{
  close: []
  save: [payload: { id?: string; name: string; type: AssetCatType; icon: string; parent_id: string | null }]
  remove: [id: string]
}>()

const ICONS = ['📦', '🛠️', '🔌', '💻', '🍎', '👕', '🪑', '📱', '🧴', '🥫', '🎮', '📷', '🚲', '⚙️', '🧊', '🛋️']

const form = ref({
  id: '',
  name: '',
  type: 'durable' as AssetCatType,
  icon: '📦',
  parent_id: null as string | null
})

const isSub = computed(() => !!props.parent)
const title = computed(() => {
  if (props.category) return '编辑分类'
  return isSub.value ? `新增二级分类（${props.parent?.name}）` : '新增一级分类'
})

watch(
  () => [props.open, props.category, props.parent],
  () => {
    if (!props.open) return
    if (props.category) {
      form.value = {
        id: props.category.id,
        name: props.category.name,
        type: props.category.type,
        icon: props.category.icon,
        parent_id: props.category.parent_id
      }
    } else {
      form.value = {
        id: '',
        name: '',
        type: (props.parent?.type ?? 'durable') as AssetCatType,
        icon: '📦',
        parent_id: props.parent?.id ?? null
      }
    }
  },
  { immediate: true }
)

function submit() {
  if (!form.value.name.trim()) return
  emit('save', {
    id: form.value.id || undefined,
    name: form.value.name.trim(),
    type: form.value.type,
    icon: form.value.icon,
    parent_id: form.value.parent_id
  })
}
</script>

<template>
  <Modal :open="open" :title="title" @close="emit('close')">
    <div class="space-y-3">
      <div>
        <label class="label">分类名称</label>
        <input v-model="form.name" class="input" :placeholder="isSub ? '如 手机、冰箱、苹果' : '如 家电、电子设备'" @keyup.enter="submit" />
      </div>

      <div v-if="!isSub">
        <label class="label">类型（决定台账显示哪些时效字段）</label>
        <div class="grid grid-cols-3 gap-2">
          <button
            v-for="t in (['warranty','perishable','durable'] as AssetCatType[])"
            :key="t"
            class="rounded-xl border px-2 py-2 text-xs"
            :class="form.type === t ? 'border-brand-500 bg-brand-500/10 text-brand-600 dark:text-brand-300' : 'border-slate-200 text-slate-500 dark:border-slate-700'"
            @click="form.type = t"
          >
            <div class="font-medium">
              {{ t === 'warranty' ? '保修类' : t === 'perishable' ? '时效类' : '长效类' }}
            </div>
            <div class="mt-0.5 opacity-70">
              {{ t === 'warranty' ? '家电/电子' : t === 'perishable' ? '食材/日化' : '服饰/家具' }}
            </div>
          </button>
        </div>
      </div>

      <div>
        <label class="label">图标</label>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="ic in ICONS"
            :key="ic"
            class="h-9 w-9 rounded-lg text-lg"
            :class="form.icon === ic ? 'bg-brand-500/15 ring-2 ring-brand-500' : 'bg-slate-100 dark:bg-slate-800'"
            @click="form.icon = ic"
          >{{ ic }}</button>
          <input v-model="form.icon" class="input h-9 w-12 text-center" maxlength="2" />
        </div>
        <p v-if="isSub" class="mt-1 text-xs text-slate-400">二级分类继承「{{ parent?.name }}」的类型（{{ parent?.type === 'warranty' ? '保修类' : parent?.type === 'perishable' ? '时效类' : '长效类' }}）。</p>
      </div>

      <div class="flex justify-end gap-2 pt-1">
        <button v-if="category && !category.is_preset" class="btn-danger mr-auto" @click="emit('remove', category.id)">删除</button>
        <button class="btn-ghost" @click="emit('close')">取消</button>
        <button class="btn-primary" @click="submit">保存</button>
      </div>
    </div>
  </Modal>
</template>
