<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import dayjs from 'dayjs'
import Modal from '../Modal.vue'
import type { Category, AssetCatType, AssetStatus, Row } from '@/lib/assetHelpers'
import { STATUS_LABEL } from '@/lib/assetHelpers'
import { uploadAssetImage, deleteAssetImage } from '@/lib/assetImages'

const props = defineProps<{ open: boolean; item?: Row | null; categories: Category[] }>()
const emit = defineEmits<{ close: []; save: [payload: Row]; remove: [id: string] }>()

const CHANNELS = ['线下门店', '淘宝', '京东', '拼多多', '商超', '其他']
const EMPTY = () => ({
  id: '',
  name: '',
  category_id: '' as string | null,
  purchase_date: dayjs().format('YYYY-MM-DD'),
  unit_price: null as number | null,
  total_price: null as number | null,
  quantity: 1,
  channel: '',
  status: 'in_use' as AssetStatus,
  note: '',
  images: [] as string[],
  archived: false,
  last_used_at: null as string | null,
  warranty_start: null as string | null,
  warranty_end: null as string | null,
  warranty_months: null as number | null,
  production_date: null as string | null,
  expiry_date: null as string | null,
  expected_years: null as number | null
})

const form = ref<any>(EMPTY())
const customChannel = ref('')
const uploading = ref(false)

const selectedCat = computed(() => props.categories.find((c) => c.id === form.value.category_id) || null)
const catType = computed<AssetCatType>(() => (selectedCat.value?.type as AssetCatType) || 'durable')

// 自动计算总价（未填总价时 = 单价 × 数量）
const computedTotal = computed(() => {
  if (form.value.total_price) return Number(form.value.total_price)
  return round2((Number(form.value.unit_price) || 0) * (Number(form.value.quantity) || 1))
})
function round2(n: number) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100
}

// 保修剩余 / 有效期剩余（即时预览）
const warrantyRemain = computed(() => {
  if (form.value.warranty_end) return daysBetween(form.value.warranty_end)
  if (form.value.warranty_start && form.value.warranty_months) {
    return daysBetween(dayjs(form.value.warranty_start).add(Number(form.value.warranty_months), 'month').format('YYYY-MM-DD'))
  }
  return null
})
const expiryRemain = computed(() => (form.value.expiry_date ? daysBetween(form.value.expiry_date) : null))
function daysBetween(target: string) {
  return dayjs(target).startOf('day').diff(dayjs().startOf('day'), 'day')
}

// 联动：填起止 -> 反推保修时长；填起始 + 时长 -> 推算结束
watch([() => form.value.warranty_start, () => form.value.warranty_end], () => {
  if (form.value.warranty_start && form.value.warranty_end) {
    form.value.warranty_months = dayjs(form.value.warranty_end).diff(dayjs(form.value.warranty_start), 'month')
  }
})
watch([() => form.value.warranty_start, () => form.value.warranty_months], () => {
  if (form.value.warranty_start && form.value.warranty_months && Number(form.value.warranty_months) > 0) {
    form.value.warranty_end = dayjs(form.value.warranty_start)
      .add(Number(form.value.warranty_months), 'month')
      .format('YYYY-MM-DD')
  }
})

watch(
  () => [props.open, props.item],
  () => {
    if (!props.open) return
    if (props.item) {
      form.value = { ...EMPTY(), ...props.item, images: [...(props.item.images || [])] }
    } else {
      form.value = EMPTY()
    }
    customChannel.value = ''
  },
  { immediate: true }
)

async function onPickImages(e: Event) {
  const files = (e.target as HTMLInputElement).files
  if (!files?.length) return
  uploading.value = true
  try {
    for (const f of Array.from(files)) {
      if (form.value.images.length >= 9) break
      const url = await uploadAssetImage(f)
      form.value.images.push(url)
    }
  } catch (err: any) {
    alert('图片上传失败：' + (err?.message || '未知错误'))
  } finally {
    uploading.value = false
    ;(e.target as HTMLInputElement).value = ''
  }
}
function removeImage(idx: number) {
  const url = form.value.images[idx]
  deleteAssetImage(url)
  form.value.images.splice(idx, 1)
}

function submit() {
  if (!form.value.name.trim()) return
  const payload: Row = {
    ...form.value,
    name: form.value.name.trim(),
    channel: form.value.channel === '__custom__' ? customChannel.value.trim() : form.value.channel || null,
    category_type: catType.value,
    quantity: Number(form.value.quantity) || 1,
    unit_price: form.value.unit_price || null,
    total_price: form.value.total_price || null,
    warranty_months: form.value.warranty_months || null,
    expected_years: form.value.expected_years || null
  }
  if (payload.id) delete payload.id
  emit('save', { ...payload, id: form.value.id || undefined })
}
</script>

<template>
  <Modal :open="open" :title="item ? '编辑资产' : '新增资产'" @close="emit('close')">
    <div class="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
      <div>
        <label class="label">资产名称</label>
        <input v-model="form.name" class="input" placeholder="如 戴森吹风机、 iPhone 15" @keyup.enter="submit" />
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="label">资产分类</label>
          <select v-model="form.category_id" class="input">
            <option :value="null">未分类</option>
            <optgroup v-for="c in categories.filter((x) => !x.parent_id)" :key="c.id" :label="`${c.icon} ${c.name}`">
              <option :value="c.id">{{ c.name }}（一级）</option>
              <option v-for="s in categories.filter((x) => x.parent_id === c.id)" :key="s.id" :value="s.id">
                └ {{ s.name }}
              </option>
            </optgroup>
          </select>
        </div>
        <div>
          <label class="label">资产状态</label>
          <select v-model="form.status" class="input">
            <option v-for="(label, k) in STATUS_LABEL" :key="k" :value="k">{{ label }}</option>
          </select>
        </div>
      </div>

      <div class="grid grid-cols-3 gap-3">
        <div>
          <label class="label">购买日期</label>
          <input v-model="form.purchase_date" type="date" class="input" />
        </div>
        <div>
          <label class="label">单价</label>
          <input v-model.number="form.unit_price" type="number" step="0.01" class="input" placeholder="0.00" />
        </div>
        <div>
          <label class="label">数量</label>
          <input v-model.number="form.quantity" type="number" step="0.01" min="0" class="input" />
        </div>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="label">总价（可空，自动 = 单价×数量）</label>
          <input v-model.number="form.total_price" type="number" step="0.01" class="input" :placeholder="`自动 ¥${computedTotal || 0}`" />
        </div>
        <div>
          <label class="label">购买渠道</label>
          <select v-if="!customChannel" v-model="form.channel" class="input">
            <option value="">不填</option>
            <option v-for="ch in CHANNELS" :key="ch" :value="ch">{{ ch }}</option>
            <option value="__custom__">+ 自定义…</option>
          </select>
          <input v-else v-model="customChannel" class="input" placeholder="输入渠道名称" @keyup.enter="submit" />
        </div>
      </div>

      <!-- 时效专属字段：按分类类型差异化展示 -->
      <div v-if="catType === 'warranty'" class="rounded-xl border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-800/60 dark:bg-amber-950/20">
        <div class="mb-2 text-xs font-semibold text-amber-600 dark:text-amber-400">保修信息（保修类）</div>
        <div class="grid grid-cols-3 gap-3">
          <div><label class="label">保修开始</label><input v-model="form.warranty_start" type="date" class="input" /></div>
          <div><label class="label">保修到期</label><input v-model="form.warranty_end" type="date" class="input" /></div>
          <div><label class="label">保修时长(月)</label><input v-model.number="form.warranty_months" type="number" class="input" placeholder="可自动算" /></div>
        </div>
        <div v-if="warrantyRemain !== null" class="mt-2 text-xs" :class="warrantyRemain < 0 ? 'text-rose-500' : warrantyRemain <= 30 ? 'text-amber-500' : 'text-slate-500'">
          剩余 {{ warrantyRemain < 0 ? `已过保 ${Math.abs(warrantyRemain)} 天` : `${warrantyRemain} 天` }}
        </div>
      </div>

      <div v-else-if="catType === 'perishable'" class="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-800/60 dark:bg-emerald-950/20">
        <div class="mb-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">有效期信息（时效类）</div>
        <div class="grid grid-cols-3 gap-3">
          <div><label class="label">生产日期</label><input v-model="form.production_date" type="date" class="input" /></div>
          <div><label class="label">有效期至</label><input v-model="form.expiry_date" type="date" class="input" /></div>
          <div></div>
        </div>
        <div v-if="expiryRemain !== null" class="mt-2 text-xs" :class="expiryRemain < 0 ? 'text-rose-500' : expiryRemain <= 7 ? 'text-amber-500' : 'text-slate-500'">
          剩余 {{ expiryRemain < 0 ? `已过期 ${Math.abs(expiryRemain)} 天` : `${expiryRemain} 天` }}
        </div>
      </div>

      <div v-else class="rounded-xl border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-700 dark:bg-slate-800/30">
        <div class="mb-2 text-xs font-semibold text-slate-500">长效资产（自愿填写）</div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="label">预期使用年限</label><input v-model.number="form.expected_years" type="number" class="input" placeholder="如 10" /></div>
          <div></div>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="label">最近使用日期（用于闲置判定）</label>
          <input v-model="form.last_used_at" type="date" class="input" />
        </div>
        <div v-if="item">
          <label class="label">归档</label>
          <label class="flex h-9 items-center gap-2 text-sm">
            <input v-model="form.archived" type="checkbox" class="h-4 w-4" />
            已归档（隐藏不删除）
          </label>
        </div>
      </div>

      <div>
        <label class="label">备注（存放位置 / 使用说明 / 补充）</label>
        <textarea v-model="form.note" class="input" rows="2" placeholder="如 放客厅柜子第二层"></textarea>
      </div>

      <!-- 图片上传 -->
      <div>
        <label class="label">资产图片（实物图 / 小票 / 保修凭证，最多 9 张）</label>
        <div class="flex flex-wrap gap-2">
          <div v-for="(img, idx) in form.images" :key="idx" class="relative h-16 w-16 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
            <img :src="img" class="h-full w-full object-cover" />
            <button class="absolute right-0 top-0 rounded-bl-lg bg-black/50 px-1 text-xs text-white" @click="removeImage(idx)">✕</button>
          </div>
          <label v-if="form.images.length < 9" class="flex h-16 w-16 cursor-pointer items-center justify-center rounded-lg border border-dashed border-slate-300 text-2xl text-slate-400 dark:border-slate-600">
            {{ uploading ? '…' : '+' }}
            <input type="file" accept="image/*" multiple class="hidden" @change="onPickImages" />
          </label>
        </div>
        <p v-if="uploading" class="mt-1 text-xs text-slate-400">图片处理中…</p>
      </div>
    </div>

    <div class="flex justify-end gap-2 pt-3">
      <button v-if="item" class="btn-danger mr-auto" @click="emit('remove', item.id)">删除</button>
      <button class="btn-ghost" @click="emit('close')">取消</button>
      <button class="btn-primary" @click="submit">保存</button>
    </div>
  </Modal>
</template>
