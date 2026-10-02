<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useCampaignStore } from '../stores/campaign'
import { useCloudStore } from '../stores/cloud'
import type { Character, Item } from '../types'

const props = defineProps<{
  character: Character
  stats: { totalValue: string; totalWeight: string }
  hideHeader?: boolean
  hideLedgerHint?: boolean
}>()

const emit = defineEmits<{
  add: [item: Omit<Item, 'id' | 'total_price'>]
  update: [item: Item]
  remove: [id: string]
}>()

const store = useCampaignStore()
const cloud = useCloudStore()
const showAdd = ref(false)
const editItem = ref<Item | null>(null)
const depositItem = ref<Item | null>(null)
const depositQty = ref('1')

const showRequestButton = computed(() =>
  cloud.connected && !cloud.isGM && cloud.myCharacterId === props.character.id
)
const canSubmitDeposit = computed(() => {
  if (!depositItem.value) return false
  const qty = parseInt(depositQty.value) || 0
  return qty > 0 && qty <= depositItem.value.quantity
})

const form = ref({
  name: '',
  quantity: '1',
  unit_price: '0',
  weight: '0',
  notes: '',
})

const isWarehouse = () => props.character.id === 'warehouse'

const baseCurrencySymbol = computed(() => {
  const campaign = store.currentCampaign
  if (!campaign) return ''
  return campaign.currencies.find(c => c.id === campaign.base_currency)?.symbol || campaign.currencies[0]?.symbol || ''
})

function openDeposit(item: Item) {
  depositItem.value = item
  depositQty.value = '1'
}

async function submitDeposit() {
  if (!depositItem.value || !canSubmitDeposit.value) return
  const qty = parseInt(depositQty.value) || 0
  try {
    await cloud.submitItemRequest(
      props.character.id,
      props.character.name,
      depositItem.value.name,
      qty,
      'deposit'
    )
    depositItem.value = null
  } catch (e: any) {
    alert(`提交失败: ${e.message || e}`)
  }
}

function resetForm() {
  form.value = { name: '', quantity: '1', unit_price: '0', weight: '0', notes: '' }
}

function openAdd() {
  resetForm()
  showAdd.value = true
}

function openEdit(item: Item) {
  editItem.value = item
  form.value = {
    name: item.name,
    quantity: item.quantity.toString(),
    unit_price: item.unit_price.toString(),
    weight: item.weight.toString(),
    notes: item.notes,
  }
}

function saveItem() {
  const data = {
    name: form.value.name,
    quantity: parseInt(form.value.quantity) || 1,
    unit_price: parseFloat(form.value.unit_price) || 0,
    weight: parseFloat(form.value.weight) || 0,
    notes: form.value.notes,
  }

  if (editItem.value) {
    if (isWarehouse()) {
      emit('update', {
        ...editItem.value,
        ...data,
        total_price: data.unit_price * data.quantity,
      })
    } else {
      store.updateItem(props.character.id, {
        ...editItem.value,
        ...data,
        total_price: data.unit_price * data.quantity,
      })
    }
    editItem.value = null
  } else {
    if (isWarehouse()) {
      emit('add', data)
    } else {
      store.addItem(props.character.id, data)
    }
    showAdd.value = false
    resetForm()
  }
}

function deleteItem(id: string) {
  if (isWarehouse()) {
    emit('remove', id)
  } else {
    store.removeItem(props.character.id, id)
  }
  editItem.value = null
}

// 重置弹窗状态当 props.character 改变
watch(() => props.character.id, () => {
  showAdd.value = false
  editItem.value = null
})
</script>

<template>
  <div class="inventory-view">
    <!-- 统计栏 -->
    <div class="stats-bar">
      <div class="stat-item">
        <div class="stat-label">物品数</div>
        <div class="stat-value">{{ character.inventory.length }}</div>
      </div>
      <div class="stat-item">
        <div class="stat-label">总价值</div>
        <div class="stat-value">{{ stats.totalValue }} {{ baseCurrencySymbol }}</div>
      </div>
      <div class="stat-item">
        <div class="stat-label">总重量</div>
        <div class="stat-value">{{ stats.totalWeight }} lbs</div>
      </div>
      <button class="btn btn-primary btn-sm" @click="openAdd" style="margin-left: auto">+ 添加物品</button>
    </div>

    <!-- 物品列表 -->
    <div class="item-list">
      <div v-if="character.inventory.length === 0" class="empty-state">
        <div class="empty-icon">🎒</div>
        <p>背包空空如也</p>
      </div>

      <div
        v-for="item in character.inventory"
        :key="item.id"
        class="item-card card"
        @click="openEdit(item)"
      >
        <div class="item-main">
          <div class="item-name">{{ item.name }}</div>
          <div v-if="item.notes" class="item-notes">{{ item.notes }}</div>
          <div class="item-meta">
            <span>×{{ item.quantity }}</span>
            <span v-if="item.weight > 0">| {{ item.weight }} lbs/件</span>
            <span v-if="item.unit_price > 0">| 单价 {{ item.unit_price }}</span>
          </div>
        </div>
        <div class="item-right">
          <div class="item-price">{{ item.total_price.toFixed(2) }}</div>
          <button
            v-if="showRequestButton"
            class="btn btn-ghost btn-icon btn-sm"
            title="申请放入仓库"
            @click.stop="openDeposit(item)"
          >📥</button>
          <button class="btn btn-ghost btn-icon btn-sm" @click.stop="deleteItem(item.id)">🗑</button>
        </div>
      </div>
    </div>

    <!-- 申请放入仓库弹窗 -->
    <div v-if="depositItem" class="modal-overlay" @click.self="depositItem = null">
      <div class="modal card">
        <div class="modal-header">
          <h3>申请放入仓库：{{ depositItem.name }}</h3>
          <button class="btn btn-ghost btn-icon" @click="depositItem = null">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-row">
            <label>数量（背包现有 {{ depositItem.quantity }} 件）</label>
            <input class="input" type="number" v-model="depositQty" :max="depositItem.quantity" min="1">
          </div>
          <p class="muted">提交后需 GM 端批准，批准前物品不会移动。</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="depositItem = null">取消</button>
          <button class="btn btn-primary" :disabled="!canSubmitDeposit" @click="submitDeposit">提交申请</button>
        </div>
      </div>
    </div>

    <!-- 弹窗 -->
    <div v-if="showAdd || editItem" class="modal-overlay" @click.self="showAdd = false; editItem = null">
      <div class="modal card">
        <div class="modal-header">
          <h3>{{ editItem ? '编辑物品' : '添加物品' }}</h3>
          <button class="btn btn-ghost btn-icon" @click="showAdd = false; editItem = null">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-row">
            <label>物品名称</label>
            <input class="input" v-model="form.name" placeholder="例如：治愈药水、铁剑、地图...">
          </div>
          <div class="form-row-2">
            <div class="form-row">
              <label>数量</label>
              <input class="input" type="number" v-model="form.quantity" min="1">
            </div>
            <div class="form-row">
              <label>单价 ({{ baseCurrencySymbol }})</label>
              <input class="input" type="number" v-model="form.unit_price" min="0" step="0.01">
            </div>
          </div>
          <div class="form-row">
            <label>单件重量 (lbs)</label>
            <input class="input" type="number" v-model="form.weight" min="0" step="0.1" placeholder="0">
          </div>
          <div class="form-row">
            <label>备注</label>
            <input class="input" v-model="form.notes" placeholder="可选备注...">
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="showAdd = false; editItem = null">取消</button>
          <button class="btn btn-primary" @click="saveItem" :disabled="!form.name">确认</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.inventory-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.stats-bar {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 12px 4px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}
.stat-item { text-align: center; }
.stat-label { font-size: 11px; color: var(--color-text-muted); }
.stat-value { font-size: 15px; font-weight: 700; margin-top: 2px; }

.item-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.item-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  cursor: pointer;
  transition: transform 0.12s, box-shadow 0.12s;
  gap: 16px;
}
.item-card:hover { transform: translateX(2px); box-shadow: var(--shadow-sm); }

.item-name { font-size: 14px; font-weight: 600; }
.item-notes { font-size: 12px; color: var(--color-text-secondary); margin-top: 2px; }
.item-meta { font-size: 11px; color: var(--color-text-muted); margin-top: 4px; display: flex; gap: 8px; }

.item-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.item-price { font-size: 14px; font-weight: 700; color: var(--color-warning); }

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
.modal { width: 440px; max-width: 95vw; }
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px;
  border-bottom: 1px solid var(--color-border);
}
.modal-header h3 { font-size: 15px; font-weight: 600; }
.modal-body { padding: 20px; display: flex; flex-direction: column; gap: 14px; }
.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 20px;
  border-top: 1px solid var(--color-border);
}

.form-row { display: flex; flex-direction: column; gap: 6px; }
.form-row label { font-size: 12px; font-weight: 600; color: var(--color-text-secondary); }
.form-row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
</style>
