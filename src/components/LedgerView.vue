<script setup lang="ts">
import { ref, computed } from 'vue'
import { useCampaignStore } from '../stores/campaign'
import type { Character, LedgerEntry } from '../types'
import MergeSummaryModal from './MergeSummaryModal.vue'

const props = defineProps<{ character: Character }>()
const store = useCampaignStore()

const showAdd = ref(false)
const editEntry = ref<LedgerEntry | null>(null)
const showMerge = ref(false)

// 表单状态
const form = ref({
  currency_id: '',
  entry_type: 'income' as 'income' | 'expense',
  amount: '',
  reason: '',
  day: 1,
})

function nextDay() {
  // 默认取当前最大 day + 1
  const maxDay = props.character.ledger.reduce((m, e) => Math.max(m, e.day || 1), 0)
  return Math.max(1, maxDay + 1)
}

function resetForm() {
  const defaultCur = store.currentCampaign?.currencies[0]
  form.value = {
    currency_id: defaultCur?.id || '',
    entry_type: 'income',
    amount: '',
    reason: '',
    day: nextDay(),
  }
}

function openAdd() {
  resetForm()
  showAdd.value = true
}

function openEdit(entry: LedgerEntry) {
  editEntry.value = entry
  form.value = {
    currency_id: entry.currency_id,
    entry_type: entry.entry_type,
    amount: entry.amount.toString(),
    reason: entry.reason,
    day: entry.day || 1,
  }
}

function saveEntry() {
  const entry: Omit<LedgerEntry, 'id' | 'timestamp'> = {
    currency_id: form.value.currency_id,
    entry_type: form.value.entry_type,
    amount: parseFloat(form.value.amount) || 0,
    reason: form.value.reason,
    day: form.value.day,
  }
  store.addLedgerEntry(props.character.id, entry)
  showAdd.value = false
  resetForm()
}

function deleteEntry(id: string) {
  store.removeLedgerEntry(props.character.id, id)
  editEntry.value = null
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

function getCurrencySymbol(id: string): { symbol: string; kind: 'currency' | 'experience' } {
  const c = store.currentCampaign?.currencies.find(c => c.id === id)
  return { symbol: c?.symbol || '?', kind: (c?.kind || 'currency') as 'currency' | 'experience' }
}

// 按 day 分组（从大到小）
const groupedByDay = computed(() => {
  const groups: Record<number, LedgerEntry[]> = {}
  for (const e of props.character.ledger) {
    const d = e.day || 1
    if (!groups[d]) groups[d] = []
    groups[d].push(e)
  }
  return Object.keys(groups)
    .map(Number)
    .sort((a, b) => b - a)
    .map(d => ({ day: d, entries: groups[d] }))
})

const totalIncome = computed(() => {
  const baseId = store.currentCampaign?.base_currency
  let sum = 0
  for (const e of props.character.ledger) {
    if (e.entry_type === 'income' && e.currency_id === baseId) sum += e.amount
  }
  return sum.toFixed(2)
})

const totalExpense = computed(() => {
  const baseId = store.currentCampaign?.base_currency
  let sum = 0
  for (const e of props.character.ledger) {
    if (e.entry_type === 'expense' && e.currency_id === baseId) sum += e.amount
  }
  return sum.toFixed(2)
})
</script>

<template>
  <div class="ledger-view">
    <!-- 工具栏 -->
    <div class="toolbar">
      <div class="summary-chips">
        <div class="summary-chip income">↑ 收入 {{ totalIncome }}</div>
        <div class="summary-chip expense">↓ 支出 {{ totalExpense }}</div>
      </div>
      <div class="toolbar-actions">
        <button class="btn btn-secondary btn-sm" @click="showMerge = true">📊 合并总结</button>
        <button class="btn btn-primary btn-sm" @click="openAdd">+ 记账</button>
      </div>
    </div>

    <!-- 记录列表（按 day 分组） -->
    <div class="ledger-list">
      <div v-if="character.ledger.length === 0" class="empty-state">
        <div class="empty-icon">📒</div>
        <p>暂无收支记录</p>
      </div>

      <template v-for="group in groupedByDay" :key="group.day">
        <div class="day-header">
          <span class="day-badge">第 {{ group.day }} 天</span>
          <span class="day-count">{{ group.entries.length }} 笔</span>
        </div>
        <div
          v-for="entry in group.entries"
          :key="entry.id"
          class="ledger-row"
          @click="openEdit(entry)"
        >
          <div class="lr-icon" :class="entry.entry_type">
            {{ entry.entry_type === 'income' ? '↑' : '↓' }}
          </div>
          <div class="lr-info">
            <div class="lr-reason">{{ entry.reason || '（无备注）' }}</div>
            <div class="lr-meta">
              <span class="badge" :class="getCurrencySymbol(entry.currency_id).kind === 'experience' ? 'badge-xp' : ''">
                {{ getCurrencySymbol(entry.currency_id).kind === 'experience' ? '⚡' : '' }}{{ getCurrencySymbol(entry.currency_id).symbol }}
              </span>
              <span class="lr-time">{{ formatTime(entry.timestamp) }}</span>
            </div>
          </div>
          <div class="lr-amount" :class="entry.entry_type === 'income' ? 'amount-income' : 'amount-expense'">
            {{ entry.entry_type === 'income' ? '+' : '-' }}{{ entry.amount.toFixed(2) }}
          </div>
          <button class="btn btn-ghost btn-icon btn-sm" @click.stop="deleteEntry(entry.id)">🗑</button>
        </div>
      </template>
    </div>

    <!-- 新增/编辑弹窗 -->
    <div v-if="showAdd || editEntry" class="modal-overlay" @click.self="showAdd = false; editEntry = null">
      <div class="modal card">
        <div class="modal-header">
          <h3>{{ editEntry ? '编辑记录' : '新增记账' }}</h3>
          <button class="btn btn-ghost btn-icon" @click="showAdd = false; editEntry = null">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-row-group">
            <div class="form-row">
              <label>类型</label>
              <div class="type-toggle">
                <button
                  class="type-btn"
                  :class="{ active: form.entry_type === 'income', income: form.entry_type === 'income' }"
                  @click="form.entry_type = 'income'"
                >↑ 收入</button>
                <button
                  class="type-btn"
                  :class="{ active: form.entry_type === 'expense', expense: form.entry_type === 'expense' }"
                  @click="form.entry_type = 'expense'"
                >↓ 支出</button>
              </div>
            </div>
            <div class="form-row">
              <label>第几天</label>
              <input class="input" type="number" v-model.number="form.day" min="1" step="1">
            </div>
          </div>

          <div class="form-row">
            <label>币种</label>
            <select class="input" v-model="form.currency_id">
              <optgroup v-if="(store.currentCampaign?.currencies ?? []).filter(c => c.kind === 'currency').length > 0" label="💰 金钱">
                <option v-for="c in (store.currentCampaign?.currencies ?? []).filter(c => c.kind === 'currency')" :key="c.id" :value="c.id">
                  {{ c.name }} ({{ c.symbol }})
                </option>
              </optgroup>
              <optgroup v-if="(store.currentCampaign?.currencies ?? []).filter(c => c.kind === 'experience').length > 0" label="⚡ 经验">
                <option v-for="c in (store.currentCampaign?.currencies ?? []).filter(c => c.kind === 'experience')" :key="c.id" :value="c.id">
                  {{ c.name }} ({{ c.symbol }})
                </option>
              </optgroup>
            </select>
          </div>

          <div class="form-row">
            <label>金额</label>
            <input class="input" type="number" v-model="form.amount" placeholder="0.00" step="0.01" min="0">
          </div>

          <div class="form-row">
            <label>事由</label>
            <input class="input" v-model="form.reason" placeholder="这笔钱的用途...">
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="showAdd = false; editEntry = null">取消</button>
          <button class="btn btn-primary" @click="saveEntry" :disabled="!form.currency_id || !form.amount">
            {{ editEntry ? '保存' : '添加' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 合并总结弹窗 -->
    <MergeSummaryModal
      v-if="showMerge"
      :character="character"
      @close="showMerge = false"
    />
  </div>
</template>

<style scoped>
.ledger-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 4px;
  flex-shrink: 0;
}
.summary-chips { display: flex; gap: 8px; }
.summary-chip {
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
}
.summary-chip.income { background: #e8fdf3; color: var(--color-income); }
.summary-chip.expense { background: #fef0f0; color: var(--color-expense); }

.toolbar-actions { display: flex; gap: 6px; }

.ledger-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.day-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 8px 6px 8px;
  margin-top: 6px;
  border-bottom: 1px dashed var(--color-border);
}
.day-header:first-child { margin-top: 0; }
.day-badge {
  background: var(--color-primary);
  color: white;
  padding: 2px 10px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 700;
}
.day-count {
  font-size: 11px;
  color: var(--color-text-muted);
}

.ledger-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background 0.12s;
}
.ledger-row:hover { background: var(--color-bg); }

.lr-icon {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 700;
  flex-shrink: 0;
}
.lr-icon.income { background: #e8fdf3; color: var(--color-income); }
.lr-icon.expense { background: #fef0f0; color: var(--color-expense); }

.lr-info { flex: 1; min-width: 0; }
.lr-reason { font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lr-meta { display: flex; align-items: center; gap: 8px; margin-top: 3px; }
.lr-time { font-size: 11px; color: var(--color-text-muted); }

.lr-amount { font-size: 14px; font-weight: 700; flex-shrink: 0; }

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
.modal { width: 420px; max-width: 95vw; }
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px;
  border-bottom: 1px solid var(--color-border);
}
.modal-header h3 { font-size: 15px; font-weight: 600; }
.modal-body { padding: 20px; display: flex; flex-direction: column; gap: 16px; }
.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 20px;
  border-top: 1px solid var(--color-border);
}

.form-row { display: flex; flex-direction: column; gap: 6px; }
.form-row label { font-size: 12px; font-weight: 600; color: var(--color-text-secondary); }
.form-row-group { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }

.type-toggle { display: flex; gap: 8px; }
.type-btn {
  flex: 1;
  padding: 8px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
}
.type-btn.active.income { border-color: var(--color-income); background: #e8fdf3; color: var(--color-income); }
.type-btn.active.expense { border-color: var(--color-expense); background: #fef0f0; color: var(--color-expense); }
</style>