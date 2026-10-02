<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useCampaignStore } from '../stores/campaign'
import { useCloudStore } from '../stores/cloud'
import type { Warehouse, Item } from '../types'
import TransferModal from './TransferModal.vue'
import InventoryView from './InventoryView.vue'

const props = defineProps<{ warehouse: Warehouse; readOnly?: boolean }>()
const emit = defineEmits<{ close: []; 'open-currency': []; 'open-adjust': [] }>()
const store = useCampaignStore()
const cloud = useCloudStore()

// 玩家申请
const showRequest = ref(false)
const requestItem = ref<{ name: string } | null>(null)
const requestQty = ref(1)
const requestAction = ref<'take' | 'deposit'>('take')
const requestMsg = ref('')

function openRequest(opts: { name: string; deposit?: boolean }) {
  requestItem.value = { name: opts.name }
  requestQty.value = 1
  requestAction.value = opts.deposit ? 'deposit' : 'take'
  requestMsg.value = ''
  showRequest.value = true
}
async function submitRequest() {
  if (!requestItem.value) return
  const myId = cloud.myCharacterId
  if (!myId) { requestMsg.value = '未认领角色，无法提交申请'; return }
  const myChar = store.currentCampaign?.characters.find(c => c.id === myId)
  try {
    await cloud.submitItemRequest(myId, myChar?.name || '玩家', requestItem.value.name, requestQty.value, requestAction.value)
    requestMsg.value = '已提交，等待 GM 批准'
    setTimeout(() => { showRequest.value = false }, 1200)
  } catch (e: any) {
    requestMsg.value = '提交失败：' + (e?.message || e)
  }
}
async function approve(r: any) {
  try { await cloud.approveRequest(r) } catch (e: any) { alert(e.message || e) }
}
async function reject(r: any) {
  await cloud.rejectRequest(r)
}

onMounted(async () => {
  if (cloud.isGM) {
    try { await cloud.pullRequests() } catch {}
  }
})

const showTransfer = ref(false)
const editingName = ref(false)
const editingDesc = ref(false)
const nameDraft = ref(props.warehouse.name)
const descDraft = ref(props.warehouse.description)

// 由于仓库没有自己的 currencies 列表，使用战役级统一配置
const virtualCharacter = computed(() => {
  return {
    id: 'warehouse',
    name: props.warehouse.name,
    rule_system: '',
    description: props.warehouse.description,
    currencies: store.currentCampaign?.currencies ?? [],
    base_currency: store.currentCampaign?.base_currency ?? '',
    ledger: [],
    inventory: props.warehouse.items,
    created_at: '',
    updated_at: '',
  } as any
})

const inventoryStats = computed(() => {
  let totalValue = 0
  let totalWeight = 0
  for (const item of props.warehouse.items) {
    totalValue += item.total_price
    totalWeight += item.weight * item.quantity
  }
  return { totalValue: totalValue.toFixed(2), totalWeight: totalWeight.toFixed(2) }
})

const currencyBalances = computed(() => {
  const balances: Record<string, { name: string; symbol: string; balance: number; id: string }> = {}
  for (const c of store.currentCampaign?.currencies ?? []) {
    balances[c.id] = { id: c.id, name: c.name, symbol: c.symbol, balance: 0 }
  }
  for (const wc of props.warehouse.currencies) {
    if (balances[wc.currency_id]) {
      balances[wc.currency_id].balance = wc.amount
    }
  }
  return Object.values(balances)
})

async function saveName() {
  await store.updateWarehouse(nameDraft.value, props.warehouse.description)
  editingName.value = false
}

async function saveDesc() {
  await store.updateWarehouse(props.warehouse.name, descDraft.value)
  editingDesc.value = false
}

// 仓库物品添加/编辑/删除桥接到 InventoryView
function handleAddItem(item: Omit<Item, 'id' | 'total_price'>) {
  store.addWarehouseItem(item)
}
function handleUpdateItem(item: Item) {
  store.updateWarehouseItem(item)
}
function handleRemoveItem(id: string) {
  store.deleteWarehouseItem(id)
}
</script>

<template>
  <div class="warehouse-panel">
    <div class="wh-header card">
      <div class="wh-icon">📦</div>
      <div class="wh-info">
        <div class="wh-name-row">
          <input
            v-if="editingName"
            class="input wh-name-input"
            v-model="nameDraft"
            @blur="saveName"
            @keydown.enter="saveName"
            autofocus
          />
          <h2 v-else class="wh-name" @click="editingName = true; nameDraft = warehouse.name" title="点击编辑名称">
            {{ warehouse.name }}
          </h2>
        </div>
        <div class="wh-desc-row">
          <textarea
            v-if="editingDesc"
            class="input wh-desc-input"
            v-model="descDraft"
            @blur="saveDesc"
            @keydown.enter="saveDesc"
            placeholder="点击添加描述..."
            rows="2"
          ></textarea>
          <div v-else class="wh-desc" @click="editingDesc = true; descDraft = warehouse.description">
            {{ warehouse.description || '点击添加描述...' }}
          </div>
        </div>
      </div>
      <div class="wh-actions">
        <button v-if="!readOnly" class="btn btn-primary btn-sm" @click="showTransfer = true">🔄 转移</button>
        <button class="btn btn-ghost btn-sm" @click="emit('close')">✕ 关闭</button>
      </div>
    </div>

    <!-- 货币概览 -->
    <div class="wh-currencies card">
      <div class="wh-currencies-header">
        <h3 class="section-title">💰 仓库货币</h3>
        <div class="wh-currencies-actions">
          <button
            v-if="!readOnly"
            class="btn btn-primary btn-sm"
            title="GM 直接调整仓库货币余额（添加 / 扣除）"
            @click="emit('open-adjust')"
          >💰 调整</button>
          <button
            v-if="!readOnly"
            class="btn btn-secondary btn-sm"
            title="添加新的货币种类（在战役货币管理中添加，会同步到所有角色和仓库）"
            @click="emit('open-currency')"
          >➕ 新币种</button>
        </div>
      </div>
      <div v-if="currencyBalances.length === 0" class="empty-mini">
        尚无货币配置。点右上角「➕ 添加币种」，或在左侧栏「💰 货币」管理。
      </div>
      <div v-else class="currency-grid">
        <div v-for="b in currencyBalances" :key="b.id" class="currency-card">
          <div class="cc-symbol">{{ b.symbol }}</div>
          <div class="cc-name">{{ b.name }}</div>
          <div class="cc-amount" :class="b.balance >= 0 ? 'amount-income' : 'amount-expense'">
            {{ b.balance.toFixed(2) }}
          </div>
        </div>
      </div>
    </div>

    <!-- 待批准申请（GM 可见） -->
    <div v-if="cloud.isGM && cloud.requests.length" class="wh-requests card">
      <h3 class="section-title">📋 待批准申请 ({{ cloud.requests.length }})</h3>
      <div v-for="r in cloud.requests" :key="r.id" class="req-item" :class="r.status">
        <div class="req-info">
          <div class="req-name">{{ r.character_name }} · {{ r.action === 'take' ? '取出' : '放入' }} {{ r.item_name }} ×{{ r.quantity }}</div>
          <div class="req-status">{{ r.status }}</div>
        </div>
        <div v-if="r.status === 'pending'" class="req-actions">
          <button class="btn btn-primary btn-sm" @click="approve(r)">批准</button>
          <button class="btn btn-ghost btn-sm" @click="reject(r)">拒绝</button>
        </div>
      </div>
    </div>

    <!-- 物品 -->
    <div class="wh-items">
      <template v-if="!readOnly">
        <InventoryView
          :character="virtualCharacter"
          :stats="inventoryStats"
          :hideHeader="true"
          :hideLedgerHint="true"
          @add="handleAddItem"
          @update="handleUpdateItem"
          @remove="handleRemoveItem"
        />
      </template>
      <template v-else>
        <div class="read-only-items">
          <div v-if="warehouse.items.length === 0" class="empty-mini">仓库暂无物品</div>
          <div v-for="it in warehouse.items" :key="it.id" class="ro-item">
            <div class="ro-item-info">
              <div class="ro-item-name">{{ it.name }}</div>
              <div class="ro-item-meta">×{{ it.quantity }} · {{ it.total_price.toFixed(2) }}</div>
            </div>
            <div class="ro-item-actions">
              <button class="btn btn-secondary btn-sm" @click="openRequest({ name: it.name })">申请取出</button>
              <button class="btn btn-secondary btn-sm" @click="openRequest({ name: it.name, deposit: true })">申请放入</button>
            </div>
          </div>
          <div v-if="cloud.myRequests.length" class="my-requests">
            <div class="mr-title">我的申请</div>
            <div v-for="r in cloud.myRequests" :key="r.id" class="mr-item">
              {{ r.action === 'take' ? '取出' : '放入' }} {{ r.item_name }} ×{{ r.quantity }}
              <span :class="'mr-status ' + r.status">{{ r.status }}</span>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- 转移弹窗 -->
    <TransferModal v-if="showTransfer" @close="showTransfer = false" />

    <!-- 申请弹层（玩家） -->
    <div v-if="showRequest" class="req-modal-overlay" @click.self="showRequest = false">
      <div class="req-modal">
        <h4>申请{{ requestAction === 'take' ? '取出' : '放入' }}：{{ requestItem?.name }}</h4>
        <div class="form-group">
          <label>数量</label>
          <input type="number" min="1" v-model.number="requestQty" class="input" />
        </div>
        <div class="req-msg" :class="{ ok: requestMsg.startsWith('已提交') }">{{ requestMsg || ' ' }}</div>
        <div class="req-modal-actions">
          <button class="btn btn-primary" @click="submitRequest">提交申请</button>
          <button class="btn btn-ghost" @click="showRequest = false">取消</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.warehouse-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 20px 24px;
  overflow: hidden;
}

.wh-header {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 18px 20px;
  flex-shrink: 0;
}
.wh-icon { font-size: 40px; flex-shrink: 0; }
.wh-info { flex: 1; min-width: 0; }
.wh-name-row { display: flex; align-items: center; gap: 8px; }
.wh-name { font-size: 18px; font-weight: 700; cursor: pointer; }
.wh-name-input { font-size: 18px; font-weight: 700; max-width: 300px; }
.wh-desc { font-size: 12px; color: var(--color-text-secondary); cursor: pointer; margin-top: 4px; }
.wh-desc-input { font-size: 12px; margin-top: 4px; width: 100%; resize: vertical; }
.wh-actions { display: flex; gap: 6px; flex-shrink: 0; }

.wh-currencies {
  padding: 16px 20px;
  flex-shrink: 0;
}
.wh-currencies-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}
.wh-currencies-header .section-title { margin-bottom: 0; }
.wh-currencies-actions { display: flex; gap: 6px; }
.section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary);
  margin-bottom: 10px;
}
.empty-mini {
  text-align: center;
  color: var(--color-text-muted);
  font-size: 12px;
  padding: 16px;
}
.currency-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 10px;
}
.currency-card {
  background: var(--color-bg);
  border-radius: var(--radius-sm);
  padding: 12px;
  text-align: center;
}
.cc-symbol { font-size: 11px; color: var(--color-text-muted); font-weight: 600; }
.cc-name { font-size: 12px; margin-top: 2px; }
.cc-amount { font-size: 18px; font-weight: 700; margin-top: 6px; }

.wh-items {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* 玩家只读模式 */
.read-only-items { flex: 1; overflow-y: auto; padding: 4px 0; }
.ro-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--color-border);
}
.ro-item-name { font-size: 13px; font-weight: 600; }
.ro-item-meta { font-size: 11px; color: var(--color-text-muted); }
.ro-item-actions { display: flex; gap: 6px; flex-shrink: 0; }
.my-requests { margin-top: 16px; padding: 12px; background: var(--color-bg); border-radius: var(--radius-sm); }
.mr-title { font-size: 12px; font-weight: 600; margin-bottom: 8px; }
.mr-item { font-size: 12px; display: flex; justify-content: space-between; padding: 4px 0; }
.mr-status.pending { color: var(--color-warning); }
.mr-status.approved { color: var(--color-success); }
.mr-status.rejected { color: var(--color-danger); }

/* GM 待批准 */
.wh-requests { padding: 16px 20px; flex-shrink: 0; }
.req-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--color-border);
}
.req-name { font-size: 13px; }
.req-status { font-size: 11px; color: var(--color-text-muted); }
.req-actions { display: flex; gap: 6px; flex-shrink: 0; }

/* 申请弹层 */
.req-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
.req-modal {
  background: var(--color-surface);
  border-radius: var(--radius-md);
  padding: 20px 24px;
  width: 320px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.2);
}
.req-modal h4 { margin-bottom: 12px; }
.req-msg { font-size: 12px; min-height: 16px; margin: 8px 0; color: var(--color-danger); }
.req-msg.ok { color: var(--color-success); }
.req-modal-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 8px; }
</style>