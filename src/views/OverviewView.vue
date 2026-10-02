<script setup lang="ts">
import { ref, computed } from 'vue'
import { useCampaignStore } from '../stores/campaign'
import { generatePoster } from '../utils/poster'

const store = useCampaignStore()
const generating = ref(false)
const toast = ref('')

const campaign = computed(() => store.currentCampaign!)
const currencies = computed(() => campaign.value?.currencies ?? [])
const baseCurrency = computed(() => {
  const c = campaign.value
  if (!c) return null
  return c.currencies.find(x => x.id === c.base_currency) ?? c.currencies[0] ?? null
})

// 计算仓库余额
const warehouseBalances = computed(() => {
  const balances: Record<string, number> = {}
  for (const c of currencies.value) balances[c.id] = 0
  for (const wc of campaign.value.warehouse.currencies) {
    if (balances[wc.currency_id] !== undefined) balances[wc.currency_id] = wc.amount
  }
  return balances
})

const warehouseNonZeroCurrencies = computed(() =>
  currencies.value.filter(c => warehouseBalances.value[c.id] !== 0),
)

function calcCurrencyBalances(items: Array<{ currency_id: string; amount: number; entry_type: 'income' | 'expense' }>) {
  const balances: Record<string, number> = {}
  for (const c of currencies.value) balances[c.id] = 0
  for (const e of items) {
    if (balances[e.currency_id] !== undefined) {
      balances[e.currency_id] += e.entry_type === 'income' ? e.amount : -e.amount
    }
  }
  return balances
}

function calcBalance(char: any): number {
  const base = baseCurrency.value
  if (!base) return 0
  const rate = base.exchange_rate || 1
  let total = 0
  for (const e of char.ledger) {
    const cur = currencies.value.find(c => c.id === e.currency_id)
    if (!cur) continue
    const curRate = cur.exchange_rate || 1
    total += (e.entry_type === 'income' ? 1 : -1) * e.amount * (curRate / rate)
  }
  return total
}

const characterRows = computed(() => {
  return campaign.value.characters.map(char => ({
    char,
    balances: calcCurrencyBalances(char.ledger),
    total: calcBalance(char),
    totalItems: char.inventory.length,
  }))
})

function fmt(n: number, digits = 2): string {
  return n.toFixed(digits)
}

async function handleGeneratePoster() {
  if (!campaign.value || generating.value) return
  generating.value = true
  toast.value = ''
  try {
    const canvas = await generatePoster(campaign.value)
    // 浏览器：canvas → blob → clipboard
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('canvas toBlob 失败')), 'image/png')
    })
    await navigator.clipboard.write([
      new ClipboardItem({ [blob.type]: blob })
    ])
    toast.value = '✅ 海报已复制到剪贴板，可粘贴到任意位置'
  } catch (e: any) {
    console.error(e)
    toast.value = '❌ 生成失败：' + (e?.message || String(e))
  } finally {
    generating.value = false
    setTimeout(() => { toast.value = '' }, 4000)
  }
}
</script>

<template>
  <div class="overview-view">
    <!-- 顶栏：标题 + 生成海报按钮 -->
    <div class="overview-header">
      <div class="ovh-title">
        <h2>📊 战役概览</h2>
        <span class="subtitle">所有角色、仓库、货币一目了然</span>
      </div>
      <button class="btn btn-primary" :disabled="generating" @click="handleGeneratePoster">
        {{ generating ? '生成中...' : '🖼 生成海报' }}
      </button>
    </div>

    <!-- 战役信息卡 -->
    <div class="campaign-card card">
      <div class="cc-icon">{{ campaign.icon || '🎴' }}</div>
      <div class="cc-info">
        <div class="cc-name">{{ campaign.name }}</div>
        <div class="cc-meta">
          <span class="badge">{{ campaign.rule_system }}</span>
          <span>{{ campaign.characters.length }} 角色 · {{ campaign.warehouse.items.length + campaign.characters.reduce((s, c) => s + c.inventory.length, 0) }} 件物品</span>
        </div>
        <div v-if="campaign.description" class="cc-desc">{{ campaign.description }}</div>
      </div>
    </div>

    <!-- 团队仓库概览 -->
    <section class="section">
      <div class="section-head">
        <h3>📦 团队仓库</h3>
        <span class="count">{{ campaign.warehouse.items.length }} 件物品 · {{ warehouseNonZeroCurrencies.length }} 种货币</span>
      </div>

      <div v-if="warehouseNonZeroCurrencies.length > 0" class="currency-grid">
        <div v-for="c in warehouseNonZeroCurrencies" :key="c.id" class="currency-card warehouse-currency">
          <div class="cc-symbol">{{ c.symbol }}</div>
          <div class="cc-name">{{ c.name }}</div>
          <div class="cc-amount">{{ fmt(warehouseBalances[c.id]) }}</div>
        </div>
      </div>
      <div v-else class="empty-mini">仓库无货币</div>

      <div v-if="campaign.warehouse.items.length > 0" class="item-list">
        <div v-for="item in campaign.warehouse.items" :key="item.id" class="item-row">
          <span class="item-name">{{ item.name }}</span>
          <span class="item-meta">×{{ item.quantity }} · {{ fmt(item.total_price) }} {{ baseCurrency?.symbol || '' }}</span>
        </div>
      </div>
      <div v-else-if="warehouseNonZeroCurrencies.length === 0" class="empty-mini">仓库空空如也</div>
    </section>

    <!-- 角色概览 -->
    <section class="section">
      <div class="section-head">
        <h3>👥 玩家档案</h3>
        <span class="count">{{ campaign.characters.length }} 位</span>
      </div>

      <div v-if="campaign.characters.length === 0" class="empty-mini">还没有角色</div>

      <div v-for="row in characterRows" :key="row.char.id" class="char-card card">
        <div class="char-head">
          <div class="char-left">
            <div class="char-icon">{{ row.char.icon || '👤' }}</div>
            <div>
              <div class="char-name">{{ row.char.name }}</div>
              <div class="char-rule">{{ row.char.rule_system }} · {{ row.totalItems }} 件物品</div>
            </div>
          </div>
          <div class="char-balance">
            <div class="bal-label">总资产</div>
            <div class="bal-value" :class="row.total >= 0 ? 'amount-income' : 'amount-expense'">
              {{ row.total >= 0 ? '+' : '' }}{{ fmt(row.total) }} {{ baseCurrency?.symbol || '' }}
            </div>
          </div>
        </div>

        <!-- 货币余额 chips -->
        <div v-if="Object.values(row.balances).some(v => v !== 0)" class="bal-chips">
          <span
            v-for="c in currencies.filter(c => row.balances[c.id] !== 0)"
            :key="c.id"
            class="bal-chip"
            :class="row.balances[c.id] >= 0 ? 'income' : 'expense'"
          >
            {{ c.symbol }} {{ fmt(row.balances[c.id]) }}
          </span>
        </div>

        <!-- 物品列表 -->
        <div v-if="row.char.inventory.length > 0" class="char-inventory">
          <div v-for="item in row.char.inventory" :key="item.id" class="inv-row">
            <span class="inv-name">{{ item.name }}</span>
            <span class="inv-meta">×{{ item.quantity }} · {{ fmt(item.total_price) }} {{ baseCurrency?.symbol || '' }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- Toast 提示 -->
    <transition name="toast">
      <div v-if="toast" class="toast">{{ toast }}</div>
    </transition>
  </div>
</template>

<style scoped>
.overview-view {
  flex: 1;
  overflow-y: auto;
  padding: 24px 32px 80px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  background: var(--color-bg);
  position: relative;
}

.overview-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--color-border);
}
.ovh-title h2 {
  font-size: 22px;
  font-weight: 700;
  color: var(--color-text);
}
.subtitle {
  font-size: 13px;
  color: var(--color-text-muted);
  margin-left: 12px;
}

/* 战役卡 */
.campaign-card {
  display: flex;
  gap: 20px;
  align-items: center;
  padding: 20px 24px;
}
.cc-icon {
  font-size: 56px;
  flex-shrink: 0;
}
.cc-info { flex: 1; }
.cc-name { font-size: 20px; font-weight: 700; }
.cc-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 6px;
  font-size: 13px;
  color: var(--color-text-secondary);
}
.cc-desc {
  margin-top: 8px;
  font-size: 13px;
  color: var(--color-text-secondary);
  line-height: 1.5;
}

/* 区块 */
.section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.section-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 0 4px;
}
.section-head h3 {
  font-size: 16px;
  font-weight: 700;
  color: var(--color-text);
}
.count {
  font-size: 12px;
  color: var(--color-text-muted);
}

/* 货币网格 */
.currency-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 10px;
}
.currency-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: 12px 14px;
  text-align: center;
}
.warehouse-currency {
  background: #fff7e8;
  border-color: #f4d28a;
}
.cc-symbol {
  font-size: 11px;
  color: var(--color-text-muted);
  font-weight: 600;
  letter-spacing: 0.5px;
}
.cc-name {
  font-size: 13px;
  color: var(--color-text-secondary);
  margin: 2px 0;
}
.cc-amount {
  font-size: 20px;
  font-weight: 700;
  color: var(--color-text);
  margin-top: 4px;
}

/* 物品列表 */
.item-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.item-row {
  display: flex;
  justify-content: space-between;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: 8px 14px;
  font-size: 13px;
}
.item-name { color: var(--color-text); font-weight: 500; }
.item-meta { color: var(--color-text-muted); font-size: 12px; }

/* 角色卡 */
.char-card {
  padding: 14px 18px;
  border-left: 4px solid var(--color-primary);
}
.char-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}
.char-left {
  display: flex;
  gap: 12px;
  align-items: center;
}
.char-icon {
  font-size: 32px;
}
.char-name {
  font-size: 16px;
  font-weight: 700;
  color: var(--color-text);
}
.char-rule {
  font-size: 12px;
  color: var(--color-text-muted);
  margin-top: 2px;
}
.char-balance { text-align: right; }
.bal-label {
  font-size: 11px;
  color: var(--color-text-muted);
}
.bal-value {
  font-size: 16px;
  font-weight: 700;
  margin-top: 2px;
}

.bal-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}
.bal-chip {
  padding: 3px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
}
.bal-chip.income {
  background: #eef0ff;
  color: var(--color-primary);
}
.bal-chip.expense {
  background: #fef0f0;
  color: var(--color-danger);
}

.char-inventory {
  display: flex;
  flex-direction: column;
  gap: 4px;
  border-top: 1px dashed var(--color-border);
  padding-top: 10px;
}
.inv-row {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  padding: 3px 0;
}
.inv-name { color: var(--color-text); }
.inv-meta { color: var(--color-text-muted); }

.empty-mini {
  text-align: center;
  padding: 24px;
  color: var(--color-text-muted);
  font-size: 13px;
  background: var(--color-surface);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-sm);
}

/* Toast */
.toast {
  position: fixed;
  bottom: 32px;
  left: 50%;
  transform: translateX(-50%);
  padding: 12px 24px;
  background: var(--color-text);
  color: white;
  border-radius: var(--radius-md);
  font-size: 13px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.2);
  z-index: 200;
}
.toast-enter-active, .toast-leave-active {
  transition: all 0.2s;
}
.toast-enter-from, .toast-leave-to {
  opacity: 0;
  transform: translate(-50%, 10px);
}
</style>