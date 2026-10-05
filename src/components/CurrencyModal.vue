<script setup lang="ts">
import { ref, computed } from 'vue'
import { useCampaignStore } from '../stores/campaign'
import type { Currency, CurrencyKind } from '../types'

defineEmits<{ close: [] }>()

const store = useCampaignStore()
const MAX_CURRENCIES = 10

const currencies = computed(() => store.currentCampaign?.currencies ?? [])

// 嵌套弹窗状态
const showNested = ref(false)
const nestedMode = ref<'add' | 'edit'>('add')
const editingCurrency = ref<Currency | null>(null)

const form = ref<{ name: string; symbol: string; exchange_rate: string; kind: CurrencyKind }>({
  name: '', symbol: '', exchange_rate: '1', kind: 'currency',
})
const error = ref('')

function resetForm() {
  form.value = { name: '', symbol: '', exchange_rate: '1', kind: 'currency' }
  error.value = ''
}

function openAdd() {
  if (currencies.value.length >= MAX_CURRENCIES) {
    alert(`最多支持 ${MAX_CURRENCIES} 种货币`)
    return
  }
  resetForm()
  editingCurrency.value = null
  nestedMode.value = 'add'
  showNested.value = true
}

function openEdit(c: Currency) {
  resetForm()
  editingCurrency.value = c
  nestedMode.value = 'edit'
  form.value = {
    name: c.name,
    symbol: c.symbol,
    exchange_rate: c.exchange_rate.toString(),
    kind: c.kind,
  }
  showNested.value = true
}

function saveNested() {
  const name = form.value.name.trim()
  const symbol = form.value.symbol.trim()
  const exchange_rate = parseFloat(form.value.exchange_rate)
  const expKind = form.value.kind

  if (!name) { error.value = '请输入货币名称'; return }
  if (!symbol) { error.value = '请输入货币符号'; return }
  if (isNaN(exchange_rate) || exchange_rate <= 0) { error.value = '汇率必须大于 0'; return }

  if (editingCurrency.value) {
    store.updateCurrency({ ...editingCurrency.value, name, symbol, exchange_rate, kind: expKind })
  } else {
    store.addCurrency({ name, symbol, exchange_rate, kind: expKind })
  }
  showNested.value = false
  editingCurrency.value = null
  resetForm()
}

function cancelNested() {
  showNested.value = false
  editingCurrency.value = null
  resetForm()
}

function remove(id: string) {
  if (currencies.value.length <= 1) {
    alert('至少需要保留一种货币')
    return
  }
  if (!confirm('确定要删除该货币吗？\n（账本中引用了该货币的记录会保留但无法换算）')) return
  store.removeCurrency(id)
}
</script>

<template>
  <!-- 外层弹窗：货币列表 -->
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal card" :class="{ dimmed: showNested }">
      <div class="modal-header">
        <h3>💰 货币管理（战役级）</h3>
        <button class="btn btn-ghost btn-icon" @click="$emit('close')">✕</button>
      </div>

      <div class="modal-body">
        <div class="currency-list">
          <div v-if="currencies.length === 0" class="empty-mini">
            还没有货币配置，点击下方按钮添加
          </div>
          <div v-for="c in currencies" :key="c.id" class="currency-row">
            <div class="cr-info">
              <div class="cr-name">
                {{ c.kind === 'experience' ? '⚡' : '💰' }} {{ c.name }}
                <span class="kind-badge" :class="`kind-${c.kind}`">
                  {{ c.kind === 'experience' ? '经验' : '金钱' }}
                </span>
                <span v-if="store.currentCampaign?.base_currency === c.id" class="base-badge">基准</span>
              </div>
              <div class="cr-meta">
                符号: <strong>{{ c.symbol }}</strong> |
                汇率: <strong>{{ c.exchange_rate }}</strong>
              </div>
            </div>
            <div class="cr-actions">
              <button class="btn btn-ghost btn-icon btn-sm" @click="openEdit(c)" title="编辑">✏️</button>
              <button class="btn btn-ghost btn-icon btn-sm" @click="remove(c.id)" title="删除">🗑</button>
            </div>
          </div>
        </div>

        <button
          class="btn btn-secondary"
          @click="openAdd"
          :disabled="currencies.length >= MAX_CURRENCIES"
        >
          {{ currencies.length >= MAX_CURRENCIES
              ? `已达上限（${MAX_CURRENCIES} 种）`
              : '+ 新增货币' }}
        </button>

        <div class="hint">
          💡 汇率用于换算总资产。例如 1GP=10SP，则 SP 汇率为 0.1。<br>
          📌 此处的货币配置是**战役级**的，所有角色和仓库共用一套。
        </div>
      </div>
    </div>
  </div>

  <!-- 嵌套弹窗：编辑/新增 -->
  <div v-if="showNested" class="modal-overlay nested" @click.self="cancelNested">
    <div class="modal card nested-modal">
      <div class="modal-header">
        <h3>{{ nestedMode === 'edit' ? '✏️ 编辑货币' : '➕ 新增货币' }}</h3>
        <button class="btn btn-ghost btn-icon" @click="cancelNested">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-row">
          <label>名称</label>
          <input class="input" v-model="form.name" placeholder="例如：金币" autofocus>
        </div>
        <div class="form-row">
          <label>所属系统</label>
          <div class="kind-picker">
            <button
              type="button"
              class="kind-btn"
              :class="{ active: form.kind === 'currency' }"
              @click="form.kind = 'currency'"
            >💰 金钱</button>
            <button
              type="button"
              class="kind-btn"
              :class="{ active: form.kind === 'experience' }"
              @click="form.kind = 'experience'"
            >⚡ 经验</button>
          </div>
        </div>
        <div class="form-row-2">
          <div class="form-row">
            <label>符号</label>
            <input class="input" v-model="form.symbol" placeholder="例如：GP">
          </div>
          <div class="form-row">
            <label>汇率（>0）</label>
            <input class="input" type="number" v-model="form.exchange_rate" min="0.0001" step="0.01" placeholder="1">
          </div>
        </div>
        <div v-if="error" class="msg error">{{ error }}</div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" @click="cancelNested">取消</button>
        <button class="btn btn-primary" @click="saveNested">
          {{ nestedMode === 'edit' ? '保存' : '添加' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
.modal-overlay.nested {
  z-index: 200;
  background: rgba(0,0,0,0.55);
}

.modal {
  width: 480px;
  max-width: 95vw;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  transition: opacity 0.15s;
}
.modal.dimmed {
  opacity: 0.55;
  pointer-events: none;
}
.nested-modal {
  width: 380px;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px;
  border-bottom: 1px solid var(--color-border);
}
.modal-header h3 { font-size: 15px; font-weight: 600; }

.modal-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow-y: auto;
}

.currency-list { display: flex; flex-direction: column; gap: 8px; }
.currency-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: var(--color-bg);
  border-radius: var(--radius-sm);
}
.cr-info { flex: 1; min-width: 0; }
.cr-name {
  font-weight: 600;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.base-badge {
  font-size: 10px;
  font-weight: 700;
  background: var(--color-primary);
  color: white;
  padding: 1px 6px;
  border-radius: 8px;
}
.cr-meta { font-size: 11px; color: var(--color-text-secondary); margin-top: 3px; }
.cr-actions { display: flex; gap: 2px; flex-shrink: 0; }

.empty-mini {
  text-align: center;
  padding: 30px;
  color: var(--color-text-muted);
  font-size: 12px;
  background: var(--color-bg);
  border-radius: var(--radius-sm);
}

.hint {
  font-size: 11px;
  color: var(--color-text-muted);
  padding: 10px 12px;
  background: var(--color-bg);
  border-radius: var(--radius-sm);
  line-height: 1.6;
}

.form-row { display: flex; flex-direction: column; gap: 6px; }
.form-row label { font-size: 12px; font-weight: 600; color: var(--color-text-secondary); }
.form-row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 14px 20px;
  border-top: 1px solid var(--color-border);
}

.msg { padding: 8px 12px; border-radius: var(--radius-sm); font-size: 13px; }
.msg.error { background: #fef0f0; color: var(--color-danger); }

/* Kind 选择器 */
.kind-picker { display: flex; gap: 8px; }
.kind-btn {
  flex: 1;
  padding: 10px 12px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 13px;
  transition: all 0.15s;
}
.kind-btn:hover { border-color: var(--color-primary); }
.kind-btn.active {
  background: var(--color-primary-soft);
  border-color: var(--color-primary);
  color: var(--color-primary);
  font-weight: 600;
}

.kind-badge {
  display: inline-block;
  padding: 1px 6px;
  margin-left: 6px;
  border-radius: 8px;
  font-size: 10px;
  font-weight: 600;
}
.kind-badge.kind-currency {
  background: #fef3e0;
  color: #d97706;
}
.kind-badge.kind-experience {
  background: #ede9fe;
  color: #6d28d9;
}
</style>