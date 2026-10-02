<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useCampaignStore } from '../stores/campaign'

const emit = defineEmits<{ close: [] }>()
const store = useCampaignStore()

const currencyId = ref<string>('')
const action = ref<'add' | 'subtract'>('add')
const amount = ref<string>('')
const reason = ref<string>('')
const day = ref<number>(1)
const error = ref('')

watch(() => store.currentCampaign, (c) => {
  if (c) {
    currencyId.value = c.currencies[0]?.id ?? ''
  }
}, { immediate: true })

const selectedCurrency = computed(() => {
  return store.currentCampaign?.currencies.find(c => c.id === currencyId.value)
})

const currentBalance = computed(() => {
  if (!store.currentCampaign || !currencyId.value) return 0
  const wc = store.currentCampaign.warehouse.currencies.find(c => c.currency_id === currencyId.value)
  return wc?.amount ?? 0
})

const previewBalance = computed(() => {
  const amt = parseFloat(amount.value) || 0
  return action.value === 'add' ? currentBalance.value + amt : currentBalance.value - amt
})

async function submit() {
  error.value = ''
  if (!currencyId.value) { error.value = '请选择币种'; return }
  const amt = parseFloat(amount.value)
  if (!amt || amt <= 0) { error.value = '请输入有效金额'; return }
  if (action.value === 'subtract' && amt > currentBalance.value) {
    error.value = `扣除金额超过当前余额（${currentBalance.value.toFixed(2)}）`
    return
  }
  try {
    await store.adjustWarehouseCurrency(
      currencyId.value,
      amt,
      action.value,
      reason.value.trim() || (action.value === 'add' ? 'GM 添加' : 'GM 扣除'),
      day.value,
    )
    emit('close')
  } catch (e: any) {
    error.value = e?.message || e?.toString() || '调整失败'
  }
}
</script>

<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="modal card">
      <div class="modal-header">
        <h3>💰 调整仓库货币（GM）</h3>
        <button class="btn btn-ghost btn-icon" @click="emit('close')">✕</button>
      </div>
      <div class="modal-body">
        <div class="gm-note">⚠️ 仅 GM 可直接调整仓库货币，普通玩家请用转移流程。</div>

        <div class="form-row">
          <label>币种</label>
          <select class="input" v-model="currencyId">
            <option v-for="c in store.currentCampaign?.currencies ?? []" :key="c.id" :value="c.id">
              {{ c.name }} ({{ c.symbol }})
            </option>
          </select>
          <div class="balance-hint">
            当前余额：<strong>{{ currentBalance.toFixed(2) }}</strong> {{ selectedCurrency?.symbol }}
          </div>
        </div>

        <div class="form-row">
          <label>操作</label>
          <div class="action-toggle">
            <button
              class="action-btn add"
              :class="{ active: action === 'add' }"
              @click="action = 'add'"
            >📥 添加</button>
            <button
              class="action-btn subtract"
              :class="{ active: action === 'subtract' }"
              @click="action = 'subtract'"
            >📤 扣除</button>
          </div>
        </div>

        <div class="form-row">
          <label>金额</label>
          <input class="input" type="number" v-model="amount" placeholder="0.00" step="0.01" min="0">
          <div class="balance-hint">
            调整后余额：<strong :class="previewBalance < 0 ? 'neg' : ''">{{ previewBalance.toFixed(2) }}</strong> {{ selectedCurrency?.symbol }}
          </div>
        </div>

        <div class="form-row-group">
          <div class="form-row">
            <label>剧本内第几天</label>
            <input class="input" type="number" v-model.number="day" min="1" step="1">
          </div>
          <div class="form-row">
            <label>备注（可选）</label>
            <input class="input" v-model="reason" :placeholder="action === 'add' ? '如：战利品、GM 奖励' : '如：购买消耗、GM 收回'">
          </div>
        </div>

        <div v-if="error" class="msg error">{{ error }}</div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" @click="emit('close')">取消</button>
        <button class="btn btn-primary" @click="submit">
          {{ action === 'add' ? '📥 确定添加' : '📤 确定扣除' }}
        </button>
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
.form-row-group { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }

.gm-note {
  padding: 10px 12px;
  background: #fff7e8;
  border: 1px solid #f4d28a;
  border-radius: 8px;
  font-size: 12px;
  color: #8a5a00;
}

.action-toggle { display: flex; gap: 8px; }
.action-btn {
  flex: 1;
  padding: 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}
.action-btn.add.active {
  border-color: #2ea043;
  background: #e6f7eb;
  color: #2ea043;
}
.action-btn.subtract.active {
  border-color: var(--color-danger);
  background: #fef0f0;
  color: var(--color-danger);
}

.balance-hint {
  font-size: 11px;
  color: var(--color-text-muted);
  margin-top: 2px;
}
.balance-hint strong { color: var(--color-text-primary); font-weight: 700; }
.balance-hint strong.neg { color: var(--color-danger); }

.msg { padding: 8px 12px; border-radius: var(--radius-sm); font-size: 13px; }
.msg.error { background: #fef0f0; color: var(--color-danger); }
</style>