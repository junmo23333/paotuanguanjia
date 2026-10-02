<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useCampaignStore } from '../stores/campaign'
import type { TransferTargetKind, TransferItemKind } from '../types'

const emit = defineEmits<{ close: [] }>()
const store = useCampaignStore()

const itemKind = ref<TransferItemKind>('currency')
const fromKind = ref<TransferTargetKind>('character')
const toKind = ref<TransferTargetKind>('warehouse')
const fromId = ref<string>('')
const toId = ref<string>('')
const currencyId = ref<string>('')
const itemId = ref<string>('')
const amount = ref<string>('')
const quantity = ref<string>('')
const reason = ref<string>('')
const day = ref<number>(1)

const error = ref('')

// 初始化默认值
watch(() => store.currentCampaign, (campaign) => {
  if (!campaign) return
  fromId.value = campaign.characters[0]?.id ?? ''
  toId.value = 'warehouse'
  // 货币从战役级配置取
  currencyId.value = campaign.currencies[0]?.id ?? ''
}, { immediate: true })

// 切换 from/to kind 时重置 id
watch(fromKind, () => {
  if (fromKind.value === 'character') {
    fromId.value = store.currentCampaign?.characters[0]?.id ?? ''
  } else {
    fromId.value = 'warehouse'
  }
})

watch(toKind, () => {
  if (toKind.value === 'character') {
    toId.value = store.currentCampaign?.characters[0]?.id ?? ''
  } else {
    toId.value = 'warehouse'
  }
})

// 物品选项根据 fromKind 切换
const fromItems = computed(() => {
  if (!store.currentCampaign) return []
  if (fromKind.value === 'character') {
    const char = store.currentCampaign.characters.find(c => c.id === fromId.value)
    return char?.inventory ?? []
  }
  return store.currentCampaign.warehouse.items
})

const fromCurrencies = computed(() => {
  if (!store.currentCampaign) return []
  // 货币是战役级共享配置
  return store.currentCampaign.currencies
})

// 当前 from 角色余额
const fromCurrencyBalance = computed(() => {
  if (!store.currentCampaign) return 0
  if (fromKind.value === 'warehouse') {
    const wc = store.currentCampaign.warehouse.currencies.find(c => c.currency_id === currencyId.value)
    return wc?.amount ?? 0
  }
  const char = store.currentCampaign.characters.find(c => c.id === fromId.value)
  if (!char) return 0
  let bal = 0
  for (const e of char.ledger) {
    if (e.currency_id === currencyId.value) {
      bal += e.entry_type === 'income' ? e.amount : -e.amount
    }
  }
  return bal
})

const fromItemBalance = computed(() => {
  const items = fromItems.value
  return items.find(i => i.id === itemId.value)?.quantity ?? 0
})

function targetOptions(kind: TransferTargetKind) {
  if (kind === 'warehouse') {
    return [{ id: 'warehouse', name: '📦 团队仓库' }]
  }
  return (store.currentCampaign?.characters ?? []).map(c => ({ id: c.id, name: `${c.icon || '👤'} ${c.name}` }))
}

async function submit() {
  error.value = ''
  if (!fromId.value || !toId.value) {
    error.value = '请选择源和目标'
    return
  }
  if (fromKind.value === toKind.value && fromId.value === toId.value) {
    error.value = '源和目标不能相同'
    return
  }
  try {
    if (itemKind.value === 'currency') {
      const amt = parseFloat(amount.value)
      if (!amt || amt <= 0) { error.value = '请输入有效金额'; return }
      await store.transferCurrency(
        fromKind.value, fromId.value,
        toKind.value, toId.value,
        currencyId.value,
        amt,
        reason.value || '仓库转移',
        day.value
      )
    } else {
      const qty = parseInt(quantity.value)
      if (!qty || qty <= 0) { error.value = '请输入有效数量'; return }
      await store.transferItem(
        fromKind.value, fromId.value,
        toKind.value, toId.value,
        itemId.value,
        qty,
        reason.value || '仓库转移',
        day.value
      )
    }
    emit('close')
  } catch (e: any) {
    error.value = e.toString() || '转移失败'
  }
}
</script>

<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="modal card">
      <div class="modal-header">
        <h3>🔄 转移</h3>
        <button class="btn btn-ghost btn-icon" @click="emit('close')">✕</button>
      </div>

      <div class="modal-body">
        <!-- 类型 -->
        <div class="form-row">
          <label>转移类型</label>
          <div class="type-toggle">
            <button
              class="type-btn"
              :class="{ active: itemKind === 'currency' }"
              @click="itemKind = 'currency'"
            >💰 货币</button>
            <button
              class="type-btn"
              :class="{ active: itemKind === 'item' }"
              @click="itemKind = 'item'"
            >🎒 物品</button>
          </div>
        </div>

        <!-- 源 -->
        <div class="form-row-group">
          <div class="form-row">
            <label>源</label>
            <div class="kind-toggle">
              <button
                class="kind-btn"
                :class="{ active: fromKind === 'character' }"
                @click="fromKind = 'character'"
              >角色</button>
              <button
                class="kind-btn"
                :class="{ active: fromKind === 'warehouse' }"
                @click="fromKind = 'warehouse'"
              >仓库</button>
            </div>
            <select class="input" v-model="fromId">
              <option v-for="opt in targetOptions(fromKind)" :key="opt.id" :value="opt.id">
                {{ opt.name }}
              </option>
            </select>
          </div>
          <div class="form-row">
            <label>目标</label>
            <div class="kind-toggle">
              <button
                class="kind-btn"
                :class="{ active: toKind === 'character' }"
                @click="toKind = 'character'"
              >角色</button>
              <button
                class="kind-btn"
                :class="{ active: toKind === 'warehouse' }"
                @click="toKind = 'warehouse'"
              >仓库</button>
            </div>
            <select class="input" v-model="toId">
              <option v-for="opt in targetOptions(toKind)" :key="opt.id" :value="opt.id">
                {{ opt.name }}
              </option>
            </select>
          </div>
        </div>

        <!-- 货币选择 -->
        <div v-if="itemKind === 'currency'" class="form-row">
          <label>币种</label>
          <select class="input" v-model="currencyId">
            <option v-for="c in fromCurrencies" :key="c.id" :value="c.id">
              {{ c.name }} ({{ c.symbol }})
            </option>
          </select>
          <div class="balance-hint">当前余额：{{ fromCurrencyBalance.toFixed(2) }}</div>
        </div>

        <!-- 物品选择 -->
        <div v-else class="form-row">
          <label>物品</label>
          <select class="input" v-model="itemId">
            <option value="">-- 选择物品 --</option>
            <option v-for="i in fromItems" :key="i.id" :value="i.id">
              {{ i.name }} (x{{ i.quantity }})
            </option>
          </select>
          <div v-if="itemId" class="balance-hint">当前数量：{{ fromItemBalance }}</div>
        </div>

        <!-- 数量/金额 -->
        <div v-if="itemKind === 'currency'" class="form-row">
          <label>金额</label>
          <input class="input" type="number" v-model="amount" placeholder="0.00" step="0.01" min="0">
        </div>
        <div v-else class="form-row">
          <label>数量</label>
          <input class="input" type="number" v-model="quantity" placeholder="1" step="1" min="1">
        </div>

        <div class="form-row-group">
          <div class="form-row">
            <label>剧本内第几天</label>
            <input class="input" type="number" v-model.number="day" min="1" step="1">
          </div>
          <div class="form-row">
            <label>备注</label>
            <input class="input" v-model="reason" placeholder="可选，留空则记为'仓库转移'">
          </div>
        </div>

        <div v-if="error" class="msg error">{{ error }}</div>
      </div>

      <div class="modal-footer">
        <button class="btn btn-secondary" @click="emit('close')">取消</button>
        <button class="btn btn-primary" @click="submit">确认转移</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { width: 560px; max-width: 95vw; }
.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 20px; border-bottom: 1px solid var(--color-border); }
.modal-header h3 { font-size: 15px; font-weight: 600; }
.modal-body { padding: 20px; display: flex; flex-direction: column; gap: 16px; }
.modal-footer { display: flex; justify-content: flex-end; gap: 8px; padding: 16px 20px; border-top: 1px solid var(--color-border); }

.form-row { display: flex; flex-direction: column; gap: 6px; }
.form-row label { font-size: 12px; font-weight: 600; color: var(--color-text-secondary); }
.form-row-group { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }

.type-toggle { display: flex; gap: 8px; }
.type-btn {
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
.type-btn.active {
  border-color: var(--color-primary);
  background: #f0f2ff;
  color: var(--color-primary);
}

.kind-toggle { display: flex; gap: 4px; margin-bottom: 4px; }
.kind-btn {
  flex: 1;
  padding: 4px 8px;
  font-size: 11px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  cursor: pointer;
  transition: all 0.15s;
}
.kind-btn.active {
  border-color: var(--color-primary);
  background: #f0f2ff;
  color: var(--color-primary);
}

.balance-hint {
  font-size: 11px;
  color: var(--color-text-muted);
  margin-top: 2px;
}

.msg { padding: 8px 12px; border-radius: var(--radius-sm); font-size: 13px; }
.msg.error { background: #fef0f0; color: var(--color-danger); }
</style>