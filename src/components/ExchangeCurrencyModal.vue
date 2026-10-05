<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useCampaignStore } from '../stores/campaign'

const props = defineProps<{
  kind: 'character' | 'warehouse'
  ownerId: string
  defaultFromCurrencyId?: string
}>()

const emit = defineEmits<{ close: [] }>()
const store = useCampaignStore()

const fromCurrencyId = ref<string>('')
const toCurrencyId = ref<string>('')
const amount = ref<string>('')
const day = ref<number>(1)
const error = ref('')

const currencies = computed(() => store.currentCampaign?.currencies ?? [])

const fromCurrency = computed(() =>
  currencies.value.find(c => c.id === fromCurrencyId.value)
)
const toCurrency = computed(() =>
  currencies.value.find(c => c.id === toCurrencyId.value)
)

// 合法目标币种：汇率必须成整数倍且同一 kind 系统（金钱 ⇄ 金钱、经验 ⇄ 经验）
const validTargets = computed(() => {
  const from = fromCurrency.value
  if (!from) return []
  return currencies.value.filter(c => {
    if (c.id === fromCurrencyId.value) return false
    if (c.kind !== from.kind) return false
    if (c.exchange_rate <= 0 || from.exchange_rate <= 0) return false
    const ratio = from.exchange_rate / c.exchange_rate
    const r = Math.round(ratio)
    return Math.abs(ratio - r) < 0.0001 && r > 0
  })
})

// 源币种余额
const sourceBalance = computed(() => {
  if (!store.currentCampaign) return 0
  if (props.kind === 'character') {
    const ch = store.currentCampaign.characters.find(c => c.id === props.ownerId)
    if (!ch) return 0
    return ch.ledger
      .filter(e => e.currency_id === fromCurrencyId.value)
      .reduce((s, e) => s + (e.entry_type === 'income' ? e.amount : -e.amount), 0)
  } else {
    const wc = store.currentCampaign.warehouse.currencies.find(c => c.currency_id === fromCurrencyId.value)
    return wc?.amount ?? 0
  }
})

// 预览目标金额
const previewTarget = computed(() => {
  const amt = parseFloat(amount.value) || 0
  if (!fromCurrency.value || !toCurrency.value) return 0
  return amt * (fromCurrency.value.exchange_rate / toCurrency.value.exchange_rate)
})

watch(() => store.currentCampaign, (c) => {
  if (c) {
    fromCurrencyId.value = props.defaultFromCurrencyId ?? c.currencies[0]?.id ?? ''
    toCurrencyId.value = ''
  }
}, { immediate: true })

watch(fromCurrencyId, () => {
  toCurrencyId.value = ''
})

function setMax() {
  amount.value = String(Math.floor(sourceBalance.value * 100) / 100)
}

async function submit() {
  error.value = ''
  if (!fromCurrencyId.value) { error.value = '请选择源币种'; return }
  if (!toCurrencyId.value) { error.value = '请选择目标币种'; return }
  if (toCurrency.value && fromCurrency.value && toCurrency.value.kind !== fromCurrency.value.kind) {
    error.value = '金钱和经验不能互相兑换'
    return
  }
  const amt = parseFloat(amount.value)
  if (!amt || amt <= 0) { error.value = '请输入有效金额'; return }
  if (amt > sourceBalance.value) {
    error.value = `源货币余额不足（${sourceBalance.value.toFixed(2)}）`
    return
  }
  try {
    await store.exchangeCurrency(
      props.kind,
      props.ownerId,
      fromCurrencyId.value,
      toCurrencyId.value,
      amt,
      day.value,
    )
    emit('close')
  } catch (e: any) {
    error.value = e?.message || e?.toString() || '兑换失败'
  }
}
</script>

<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="modal card">
      <div class="modal-header">
        <h3>🔄 货币兑换</h3>
        <button class="btn btn-ghost btn-icon" @click="emit('close')">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-row">
          <label>源币种</label>
          <select class="input" v-model="fromCurrencyId">
            <option v-for="c in currencies" :key="c.id" :value="c.id">
              {{ c.name }} ({{ c.symbol }}) — 汇率 {{ c.exchange_rate }}
            </option>
          </select>
          <div class="balance-hint">
            当前余额：<strong>{{ sourceBalance.toFixed(2) }}</strong> {{ fromCurrency?.symbol }}
          </div>
        </div>

        <div class="form-row">
          <label>目标币种</label>
          <select class="input" v-model="toCurrencyId">
            <option value="">— 请选择（汇率需成整数倍）—</option>
            <option v-for="c in validTargets" :key="c.id" :value="c.id">
              {{ c.name }} ({{ c.symbol }}) — {{ fromCurrency && c.exchange_rate > 0 ? (fromCurrency.exchange_rate / c.exchange_rate).toFixed(2) : '?' }} 倍
            </option>
          </select>
          <div v-if="fromCurrencyId && validTargets.length === 0" class="balance-hint neg">
            该源币种没有汇率成整数倍的目标币种，无法兑换
          </div>
        </div>

        <div class="form-row">
          <label>兑换数量（按源币种）</label>
          <div class="amount-input">
            <input class="input" type="number" v-model="amount" placeholder="0" step="0.01" min="0">
            <button class="btn btn-ghost btn-sm" @click="setMax" title="填入当前余额">最大</button>
          </div>
          <div v-if="toCurrency" class="balance-hint">
            将获得：<strong>{{ previewTarget.toFixed(2) }}</strong> {{ toCurrency.symbol }}
          </div>
        </div>

        <div class="form-row">
          <label>剧本内第几天</label>
          <input class="input" type="number" v-model.number="day" min="1" step="1">
        </div>

        <div v-if="error" class="msg error">{{ error }}</div>

        <div class="tip">💡 兑换要求两种货币汇率成整数倍（如 1 银 = 1000 文，1 金 = 10000 文）。<br>
          ⚡ <strong>金钱与经验是独立的两个系统，不能互相兑换。</strong>请从源币种同系统的货币中选择。</div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" @click="emit('close')">取消</button>
        <button class="btn btn-primary" @click="submit">🔄 确定兑换</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { width: 480px; max-width: 95vw; }
.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 20px; border-bottom: 1px solid var(--color-border); }
.modal-header h3 { font-size: 15px; font-weight: 600; }
.modal-body { padding: 20px; display: flex; flex-direction: column; gap: 16px; }
.modal-footer { display: flex; justify-content: flex-end; gap: 8px; padding: 16px 20px; border-top: 1px solid var(--color-border); }

.form-row { display: flex; flex-direction: column; gap: 6px; }
.form-row label { font-size: 12px; font-weight: 600; color: var(--color-text-secondary); }
.amount-input { display: flex; gap: 6px; }
.amount-input .input { flex: 1; }

.balance-hint {
  font-size: 11px;
  color: var(--color-text-muted);
  margin-top: 2px;
}
.balance-hint strong { color: var(--color-text-primary); font-weight: 700; }
.balance-hint.neg { color: var(--color-danger); }

.msg { padding: 8px 12px; border-radius: var(--radius-sm); font-size: 13px; }
.msg.error { background: #fef0f0; color: var(--color-danger); }

.tip {
  padding: 10px 12px;
  background: #f6f8fa;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  font-size: 12px;
  color: var(--color-text-secondary);
  line-height: 1.5;
}
</style>