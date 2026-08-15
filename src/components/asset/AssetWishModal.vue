<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import Modal from '../Modal.vue'
import type { Category, WishPriority, WishStatus, Row } from '@/lib/assetHelpers'
import { WISH_PRIORITY_LABEL, WISH_STATUS_LABEL } from '@/lib/assetHelpers'

const props = defineProps<{ open: boolean; wish?: Row | null; categories: Category[] }>()
const emit = defineEmits<{ close: []; save: [payload: Row]; remove: [id: string] }>()

const SCENES = ['日常替换', '新增购置', '送礼', '备用']

const form = ref<any>({
  id: '',
  name: '',
  category_id: null as string | null,
  est_unit_price: null,
  est_total_price: null,
  quantity: 1,
  scene: '',
  expect_date: '',
  ref_url: '',
  note: '',
  priority: 'medium' as WishPriority,
  status: 'pending' as WishStatus
})

const computedTotal = computed(() =>
  form.value.est_total_price
    ? Number(form.value.est_total_price)
    : Math.round((Number(form.value.est_unit_price) || 0) * (Number(form.value.quantity) || 1) * 100) / 100
)

watch(
  () => [props.open, props.wish],
  () => {
    if (!props.open) return
    if (props.wish) {
      form.value = { ...form.value, ...props.wish }
    } else {
      form.value = {
        id: '', name: '', category_id: null, est_unit_price: null, est_total_price: null,
        quantity: 1, scene: '', expect_date: '', ref_url: '', note: '', priority: 'medium', status: 'pending'
      }
    }
  },
  { immediate: true }
)

function submit() {
  if (!form.value.name.trim()) return
  const payload: Row = {
    ...form.value,
    name: form.value.name.trim(),
    category_id: form.value.category_id || null,
    quantity: Number(form.value.quantity) || 1,
    est_unit_price: form.value.est_unit_price || null,
    est_total_price: form.value.est_total_price || null
  }
  if (payload.id) delete payload.id
  emit('save', { ...payload, id: form.value.id || undefined })
}
</script>

<template>
  <Modal :open="open" :title="wish ? '编辑待买项' : '新增待买项'" @close="emit('close')">
    <div class="space-y-3">
      <div><label class="label">物品名称</label><input v-model="form.name" class="input" placeholder="如 空气炸锅" @keyup.enter="submit" /></div>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="label">所属分类</label>
          <select v-model="form.category_id" class="input">
            <option :value="null">未分类</option>
            <optgroup v-for="c in categories.filter((x) => !x.parent_id)" :key="c.id" :label="`${c.icon} ${c.name}`">
              <option :value="c.id">{{ c.name }}</option>
              <option v-for="s in categories.filter((x) => x.parent_id === c.id)" :key="s.id" :value="s.id">└ {{ s.name }}</option>
            </optgroup>
          </select>
        </div>
        <div>
          <label class="label">优先级</label>
          <div class="flex gap-2">
            <button
              v-for="(label, k) in WISH_PRIORITY_LABEL"
              :key="k"
              class="flex-1 rounded-xl border py-1.5 text-xs"
              :class="form.priority === k ? 'border-brand-500 bg-brand-500/10 text-brand-600 dark:text-brand-300' : 'border-slate-200 text-slate-500 dark:border-slate-700'"
              @click="form.priority = k"
            >{{ label }}</button>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-3 gap-3">
        <div><label class="label">预估单价</label><input v-model.number="form.est_unit_price" type="number" step="0.01" class="input" placeholder="0.00" /></div>
        <div><label class="label">数量</label><input v-model.number="form.quantity" type="number" step="0.01" min="0" class="input" /></div>
        <div><label class="label">预估总价</label><input v-model.number="form.est_total_price" type="number" step="0.01" class="input" :placeholder="`¥${computedTotal || 0}`" /></div>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="label">需求场景</label>
          <select v-model="form.scene" class="input">
            <option value="">不填</option>
            <option v-for="s in SCENES" :key="s" :value="s">{{ s }}</option>
          </select>
        </div>
        <div><label class="label">预期采购时间</label><input v-model="form.expect_date" type="date" class="input" /></div>
      </div>

      <div><label class="label">参考链接 / 渠道</label><input v-model="form.ref_url" class="input" placeholder="https://… 或 京东/淘宝" /></div>
      <div><label class="label">备注（规格 / 替代方案）</label><textarea v-model="form.note" class="input" rows="2" placeholder="如 5L 容量、备选 小米"></textarea></div>

      <div v-if="wish">
        <label class="label">状态</label>
        <select v-model="form.status" class="input">
          <option v-for="(label, k) in WISH_STATUS_LABEL" :key="k" :value="k">{{ label }}</option>
        </select>
      </div>

      <div class="flex justify-end gap-2 pt-1">
        <button v-if="wish" class="btn-danger mr-auto" @click="emit('remove', wish.id)">删除</button>
        <button class="btn-ghost" @click="emit('close')">取消</button>
        <button class="btn-primary" @click="submit">保存</button>
      </div>
    </div>
  </Modal>
</template>
