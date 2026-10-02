<script setup lang="ts">
import { ref, computed } from 'vue'
import { useCampaignStore } from '../stores/campaign'
import { useCloudStore } from '../stores/cloud'
import LedgerView from './LedgerView.vue'
import InventoryView from './InventoryView.vue'
import CharacterEditModal from './CharacterEditModal.vue'
import GiftModal from './GiftModal.vue'
import ExchangeCurrencyModal from './ExchangeCurrencyModal.vue'
import type { Character } from '../types'

const props = defineProps<{
  character: Character
  campaignId: string
}>()

const store = useCampaignStore()
const cloud = useCloudStore()
const activeTab = ref<'ledger' | 'inventory'>('ledger')
const showEditCharacter = ref(false)
const showGiftModal = ref(false)
const exchangeFromCurrencyId = ref<string>('')
const exchangeOpen = ref(false)

function openExchange(currencyId: string) {
  exchangeFromCurrencyId.value = currencyId
  exchangeOpen.value = true
}

// 玩家模式（连房间且非 GM）：可发起赠予
const isPlayerMode = computed(() => cloud.connected && !cloud.isGM)

// 战役级货币（所有角色共享）
const campaignCurrencies = computed(() => store.currentCampaign?.currencies ?? [])
const baseCurrency = computed(() => {
  const c = store.currentCampaign
  if (!c) return null
  return c.currencies.find(x => x.id === c.base_currency) ?? c.currencies[0] ?? null
})

// 计算该角色的货币余额
const currencyBalances = computed(() => {
  const balances: Record<string, { id: string; name: string; symbol: string; balance: number }> = {}
  for (const c of campaignCurrencies.value) {
    balances[c.id] = { id: c.id, name: c.name, symbol: c.symbol, balance: 0 }
  }
  for (const entry of props.character.ledger) {
    if (balances[entry.currency_id]) {
      if (entry.entry_type === 'income') {
        balances[entry.currency_id].balance += entry.amount
      } else {
        balances[entry.currency_id].balance -= entry.amount
      }
    }
  }
  return Object.values(balances)
})

// 总资产（换算为基准货币）
const totalAssets = computed(() => {
  const base = baseCurrency.value
  const rate = base?.exchange_rate || 1
  let total = 0
  for (const entry of props.character.ledger) {
    const cur = campaignCurrencies.value.find(c => c.id === entry.currency_id)
    if (!cur) continue
    const curRate = cur.exchange_rate || 1
    const converted = entry.amount * (curRate / rate)
    total += entry.entry_type === 'income' ? converted : -converted
  }
  return total.toFixed(2)
})

// 背包统计
const inventoryStats = computed(() => {
  let totalValue = 0
  let totalWeight = 0
  for (const item of props.character.inventory) {
    totalValue += item.total_price
    totalWeight += item.weight * item.quantity
  }
  return { totalValue: totalValue.toFixed(2), totalWeight: totalWeight.toFixed(2) }
})

function handleCharacterUpdate(updated: Character) {
  store.updateCharacter(updated)
  showEditCharacter.value = false
}
</script>

<template>
  <div class="character-panel">
    <!-- 角色信息头 -->
    <div class="char-header card">
      <div class="char-header-left">
        <div class="char-avatar">{{ character.icon || '👤' }}</div>
        <div class="char-info">
          <div class="char-name-row">
            <h2 class="char-name">{{ character.name }}</h2>
            <button v-if="isPlayerMode" class="btn btn-ghost btn-icon btn-sm" @click="showGiftModal = true" title="发起赠予">🎁</button>
            <button class="btn btn-ghost btn-icon btn-sm" @click="showEditCharacter = true" title="编辑角色">✏️</button>
          </div>
          <div class="char-meta">
            <span class="badge">{{ character.rule_system }}</span>
            <span class="char-date">创建于 {{ new Date(character.created_at).toLocaleDateString('zh-CN') }}</span>
          </div>
          <div v-if="character.description" class="char-desc">{{ character.description }}</div>
        </div>
      </div>

      <!-- 货币概览（只读，战役级统一管理） -->
      <div class="currency-overview">
        <div class="overview-item">
          <div class="ov-label">💰 总资产</div>
          <div class="ov-value">{{ totalAssets }} {{ baseCurrency?.symbol || 'GP' }}</div>
        </div>
        <div class="currency-balances">
          <div v-for="bal in currencyBalances" :key="bal.symbol" class="bal-chip">
            <span class="bal-symbol">{{ bal.symbol }}</span>
            <span class="bal-amount" :class="bal.balance >= 0 ? 'amount-income' : 'amount-expense'">
              {{ bal.balance.toFixed(2) }}
            </span>
            <button
              class="bal-exchange-btn"
              title="兑换货币（手动）"
              @click="openExchange(bal.id)"
            >🔄</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Tab 导航 -->
    <div class="tabs">
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'ledger' }"
        @click="activeTab = 'ledger'"
      >
        📒 账本 <span class="tab-count">{{ character.ledger.length }}</span>
      </button>
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'inventory' }"
        @click="activeTab = 'inventory'"
      >
        🎒 背包 <span class="tab-count">{{ character.inventory.length }}</span>
      </button>
    </div>

    <!-- Tab 内容 -->
    <div class="tab-content">
      <LedgerView v-if="activeTab === 'ledger'" :character="character" />
      <InventoryView v-if="activeTab === 'inventory'" :character="character" :stats="inventoryStats" />
    </div>

    <!-- 模态框 -->
    <CharacterEditModal
      v-if="showEditCharacter"
      :character="character"
      @close="showEditCharacter = false"
      @update="handleCharacterUpdate"
    />
    <GiftModal v-if="showGiftModal" @close="showGiftModal = false" />
    <ExchangeCurrencyModal
      v-if="exchangeOpen"
      kind="character"
      :owner-id="character.id"
      :default-from-currency-id="exchangeFromCurrencyId"
      @close="exchangeOpen = false"
    />
  </div>
</template>

<style scoped>
.character-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 20px 24px;
  gap: 16px;
}

/* 角色头 */
.char-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  padding: 18px 20px;
  flex-shrink: 0;
}

.char-header-left {
  display: flex;
  gap: 14px;
  flex: 1;
  min-width: 0;
}

.char-avatar { font-size: 44px; flex-shrink: 0; }
.char-info { flex: 1; min-width: 0; }

.char-name-row { display: flex; align-items: center; gap: 8px; }
.char-name { font-size: 18px; font-weight: 700; }
.char-meta { display: flex; align-items: center; gap: 10px; margin-top: 5px; }
.char-date { font-size: 12px; color: var(--color-text-muted); }
.char-desc { font-size: 12px; color: var(--color-text-secondary); margin-top: 6px; }

/* 货币概览 */
.currency-overview {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-end;
  flex-shrink: 0;
}
.overview-item { text-align: right; }
.ov-label { font-size: 11px; color: var(--color-text-muted); }
.ov-value { font-size: 16px; font-weight: 700; color: var(--color-text); }
.currency-balances { display: flex; flex-wrap: wrap; gap: 4px; justify-content: flex-end; }
.bal-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  background: var(--color-bg);
  border-radius: 20px;
  font-size: 12px;
}
.bal-symbol { color: var(--color-text-muted); font-size: 10px; }
.bal-exchange-btn {
  background: none;
  border: none;
  padding: 0 2px;
  cursor: pointer;
  font-size: 11px;
  opacity: 0.5;
  transition: opacity 0.15s;
  margin-left: 2px;
}
.bal-exchange-btn:hover { opacity: 1; }

/* Tabs */
.tabs {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}
.tab-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: color 0.15s;
  margin-bottom: -1px;
}
.tab-btn:hover { color: var(--color-text); }
.tab-btn.active { color: var(--color-primary); border-bottom-color: var(--color-primary); }
.tab-count {
  background: var(--color-bg);
  padding: 1px 6px;
  border-radius: 10px;
  font-size: 11px;
  color: var(--color-text-muted);
}

/* Tab 内容 */
.tab-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
</style>