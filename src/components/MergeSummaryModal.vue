<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useCampaignStore } from '../stores/campaign'
import type { Character, LedgerSummary } from '../types'

const props = defineProps<{ character: Character }>()
const emit = defineEmits<{ close: [] }>()
const store = useCampaignStore()

const scope = ref<'character' | 'campaign'>('character')
const startDay = ref(1)
const endDay = ref(10)
const summary = ref<LedgerSummary | null>(null)
const loading = ref(false)
const copied = ref(false)

const maxDay = computed(() => {
  let max = 1
  const source = scope.value === 'character'
    ? [props.character]
    : (store.currentCampaign?.characters ?? [])
  for (const c of source) {
    for (const e of c.ledger) {
      if (e.day > max) max = e.day
    }
  }
  return max
})

watch(maxDay, (m) => {
  endDay.value = Math.max(m, 1)
}, { immediate: true })

async function load() {
  loading.value = true
  try {
    if (!store.currentCampaign) return
    summary.value = await store.getLedgerSummary(
      store.currentCampaign.id,
      scope.value === 'character' ? props.character.id : null,
      startDay.value,
      endDay.value
    )
  } finally {
    loading.value = false
  }
}

watch([scope, startDay, endDay], load, { immediate: true })

function getCurrencyName(id: string): string {
  return store.currentCampaign?.currencies.find(c => c.id === id)?.name || id
}

function getCurrencySymbol(id: string): string {
  return store.currentCampaign?.currencies.find(c => c.id === id)?.symbol || ''
}

const allCurrencyIds = computed(() => {
  const ids = new Set<string>()
  if (summary.value) {
    Object.keys(summary.value.total_income_by_currency).forEach(id => ids.add(id))
    Object.keys(summary.value.total_expense_by_currency).forEach(id => ids.add(id))
    Object.keys(summary.value.transfer_in_by_currency).forEach(id => ids.add(id))
    Object.keys(summary.value.transfer_out_by_currency).forEach(id => ids.add(id))
  }
  return Array.from(ids)
})

function buildReportText(): string {
  if (!summary.value) return ''
  const lines: string[] = []
  lines.push(`📊 合并总结：第 ${startDay.value} - ${endDay.value} 天（${scope.value === 'character' ? props.character.name : '全部角色'}）`)
  lines.push(`共 ${summary.value.entry_count} 笔记录`)
  lines.push('---')
  for (const id of allCurrencyIds.value) {
    const inc = summary.value.total_income_by_currency[id] || 0
    const exp = summary.value.total_expense_by_currency[id] || 0
    const tIn = summary.value.transfer_in_by_currency[id] || 0
    const tOut = summary.value.transfer_out_by_currency[id] || 0
    const net = inc - exp
    const sym = getCurrencySymbol(id)
    lines.push(`${getCurrencyName(id)} (${sym})`)
    lines.push(`  收入 ${inc.toFixed(2)} | 支出 ${exp.toFixed(2)} | 净额 ${net.toFixed(2)}`)
    if (tIn > 0 || tOut > 0) {
      lines.push(`  其中转移：转入 ${tIn.toFixed(2)} / 转出 ${tOut.toFixed(2)}`)
    }
  }
  return lines.join('\n')
}

async function copyReport() {
  const text = buildReportText()
  try {
    await navigator.clipboard.writeText(text)
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  } catch (e) {
    alert('复制失败，请手动选择')
  }
}
</script>

<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="modal card">
      <div class="modal-header">
        <h3>📊 合并总结</h3>
        <button class="btn btn-ghost btn-icon" @click="emit('close')">✕</button>
      </div>

      <div class="modal-body">
        <div class="form-row-group">
          <div class="form-row">
            <label>范围</label>
            <div class="scope-toggle">
              <button
                class="scope-btn"
                :class="{ active: scope === 'character' }"
                @click="scope = 'character'"
              >当前角色</button>
              <button
                class="scope-btn"
                :class="{ active: scope === 'campaign' }"
                @click="scope = 'campaign'"
              >全部角色</button>
            </div>
          </div>
        </div>

        <div class="form-row-group">
          <div class="form-row">
            <label>起始天</label>
            <input class="input" type="number" v-model.number="startDay" min="1" step="1">
          </div>
          <div class="form-row">
            <label>结束天</label>
            <input class="input" type="number" v-model.number="endDay" :min="startDay" step="1">
          </div>
        </div>

        <div class="report" v-if="summary">
          <div class="report-header">
            <span>📋 第 {{ startDay }} - {{ endDay }} 天 · 共 {{ summary.entry_count }} 笔</span>
          </div>
          <div v-if="allCurrencyIds.length === 0" class="empty-mini">
            所选范围内没有收支记录
          </div>
          <table v-else class="summary-table">
            <thead>
              <tr>
                <th>币种</th>
                <th>收入</th>
                <th>支出</th>
                <th>净额</th>
                <th>转移</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="id in allCurrencyIds" :key="id">
                <td>
                  <div class="cur-name">{{ getCurrencyName(id) }}</div>
                  <div class="cur-symbol">{{ getCurrencySymbol(id) }}</div>
                </td>
                <td class="amount-income">
                  +{{ (summary.total_income_by_currency[id] || 0).toFixed(2) }}
                </td>
                <td class="amount-expense">
                  -{{ (summary.total_expense_by_currency[id] || 0).toFixed(2) }}
                </td>
                <td :class="((summary.total_income_by_currency[id] || 0) - (summary.total_expense_by_currency[id] || 0)) >= 0 ? 'amount-income' : 'amount-expense'">
                  {{ ((summary.total_income_by_currency[id] || 0) - (summary.total_expense_by_currency[id] || 0)).toFixed(2) }}
                </td>
                <td class="transfer-cell">
                  <span v-if="(summary.transfer_in_by_currency[id] || 0) > 0" class="t-in">入 {{ (summary.transfer_in_by_currency[id] || 0).toFixed(2) }}</span>
                  <span v-if="(summary.transfer_out_by_currency[id] || 0) > 0" class="t-out">出 {{ (summary.transfer_out_by_currency[id] || 0).toFixed(2) }}</span>
                  <span v-if="(summary.transfer_in_by_currency[id] || 0) === 0 && (summary.transfer_out_by_currency[id] || 0) === 0" class="t-empty">-</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else-if="loading" class="loading-mini">加载中...</div>
      </div>

      <div class="modal-footer">
        <button class="btn btn-secondary" @click="emit('close')">关闭</button>
        <button class="btn btn-primary" @click="copyReport" :disabled="!summary">
          {{ copied ? '✓ 已复制' : '📋 复制报告' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { width: 640px; max-width: 95vw; }
.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 20px; border-bottom: 1px solid var(--color-border); }
.modal-header h3 { font-size: 15px; font-weight: 600; }
.modal-body { padding: 20px; display: flex; flex-direction: column; gap: 16px; max-height: 70vh; overflow-y: auto; }
.modal-footer { display: flex; justify-content: flex-end; gap: 8px; padding: 16px 20px; border-top: 1px solid var(--color-border); }

.form-row { display: flex; flex-direction: column; gap: 6px; }
.form-row label { font-size: 12px; font-weight: 600; color: var(--color-text-secondary); }
.form-row-group { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }

.scope-toggle { display: flex; gap: 8px; }
.scope-btn {
  flex: 1;
  padding: 8px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
}
.scope-btn.active {
  border-color: var(--color-primary);
  background: #f0f2ff;
  color: var(--color-primary);
}

.report {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.report-header {
  padding: 10px 14px;
  background: var(--color-bg);
  font-size: 12px;
  font-weight: 600;
  border-bottom: 1px solid var(--color-border);
}

.empty-mini, .loading-mini {
  text-align: center;
  color: var(--color-text-muted);
  font-size: 13px;
  padding: 30px;
}

.summary-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.summary-table th,
.summary-table td {
  padding: 10px 14px;
  text-align: right;
  border-bottom: 1px solid var(--color-border);
}
.summary-table th:first-child,
.summary-table td:first-child {
  text-align: left;
}
.summary-table th:last-child,
.summary-table td:last-child {
  text-align: left;
}
.summary-table th {
  background: var(--color-bg);
  font-weight: 600;
  font-size: 11px;
  color: var(--color-text-secondary);
}
.summary-table tbody tr:last-child td {
  border-bottom: none;
}

.cur-name { font-weight: 600; }
.cur-symbol { font-size: 10px; color: var(--color-text-muted); }

.transfer-cell {
  font-size: 11px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-align: left;
}
.t-in { color: var(--color-success); }
.t-out { color: var(--color-warning); }
.t-empty { color: var(--color-text-muted); }
</style>