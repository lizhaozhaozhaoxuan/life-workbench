<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import Modal from '../Modal.vue'
import { parseFlowSentence, type ParsedFlow, type FlowCategorySets } from '@/lib/flowParser'

const props = defineProps<{ open: boolean; sets: FlowCategorySets }>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'apply', v: { type: 'expense' | 'income'; amount: number; category: string; note: string; trans_date: string }): void
}>()

const text = ref('')
const inputEl = ref<HTMLTextAreaElement | null>(null)

/** 随输入实时解析，即时反馈「我理解为…」 */
const parsed = computed<ParsedFlow>(() => parseFlowSentence(text.value, props.sets))
const canApply = computed(() => !!parsed.value.amount && parsed.value.amount > 0)

watch(
  () => props.open,
  (v) => {
    if (v) {
      text.value = ''
      nextTick(() => inputEl.value?.focus())
    }
  }
)

const examples = [
  '今天餐饮消费30元，备注海底捞',
  '昨天打车花了28块',
  '收到工资8000元',
  '上周三买书120元，备注三体'
]

function useExample(s: string) {
  text.value = s
  nextTick(() => inputEl.value?.focus())
}

function apply() {
  const p = parsed.value
  if (!p.amount || p.amount <= 0) return
  emit('apply', {
    type: p.type,
    amount: p.amount,
    category: p.category || '其他',
    note: p.note || '',
    trans_date: p.trans_date
  })
}
</script>

<template>
  <Modal :open="open" title="一句话快速记账" @close="emit('close')">
    <div class="space-y-3">
      <textarea
        ref="inputEl"
        v-model="text"
        rows="2"
        class="input w-full resize-none"
        placeholder="例如：今天餐饮消费30元，备注海底捞"
        @keydown.enter.prevent="apply"
      ></textarea>

      <!-- 示例，点一下直接填入 -->
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="s in examples"
          :key="s"
          class="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-500 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          @click="useExample(s)"
        >
          {{ s }}
        </button>
      </div>

      <!-- 解析预览 -->
      <div v-if="text.trim()" class="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
        <div class="mb-2 text-xs text-slate-400">我理解为</div>
        <div class="flex flex-wrap items-center gap-1.5">
          <span
            class="chip"
            :class="parsed.type === 'expense' ? 'bg-rose-500/10 text-rose-500' : 'bg-emerald-500/10 text-emerald-500'"
          >{{ parsed.type === 'expense' ? '支出' : '收入' }}</span>
          <span
            class="chip"
            :class="parsed.amount ? 'bg-brand-500/10 text-brand-600' : 'bg-amber-500/10 text-amber-600'"
          >{{ parsed.amount ? `¥${parsed.amount}` : '未识别金额' }}</span>
          <span class="chip bg-slate-200/70 text-slate-600 dark:bg-slate-700 dark:text-slate-200">{{ parsed.category || '其他' }}</span>
          <span class="chip bg-slate-200/70 text-slate-600 dark:bg-slate-700 dark:text-slate-200">{{ parsed.trans_date }}</span>
          <span v-if="parsed.note" class="chip bg-slate-200/70 text-slate-600 dark:bg-slate-700 dark:text-slate-200">备注 {{ parsed.note }}</span>
        </div>

        <p v-if="parsed.missing.includes('amount')" class="mt-2 text-xs text-amber-600">
          没识别到金额，请说具体些，如「30元」「三十块」。
        </p>
        <p v-if="parsed.missing.includes('category')" class="mt-1 text-xs text-slate-400">
          未匹配到分类，将记为「其他」，填入表单后可手动改。
        </p>
      </div>

      <div class="flex items-center gap-2">
        <button
          class="btn-primary ml-auto"
          :class="canApply ? '' : 'cursor-not-allowed opacity-50'"
          :disabled="!canApply"
          @click="apply"
        >
          填入表单
        </button>
        <button class="btn-ghost" @click="emit('close')">取消</button>
      </div>

      <p class="text-xs leading-relaxed text-slate-400">
        💡 当前为文字一句话录入，解析全程在本机完成、不联网不上传。真正的语音输入需在 HTTPS 环境（部署后）才能开麦，局域网 HTTP 下浏览器会拦截麦克风。
      </p>
    </div>
  </Modal>
</template>
