<script setup lang="ts">
import { ref, computed } from 'vue'
import { useCloudStore } from '../stores/cloud'
import { useCampaignStore } from '../stores/campaign'

const cloud = useCloudStore()
const store = useCampaignStore()

const isGM = computed(() => cloud.isGM)
const currencies = computed(() => store.currentCampaign?.currencies ?? [])
const items = computed(() => cloud.shop?.items ?? [])

function curName(id: string): string {
  return currencies.value.find(c => c.id === id)?.name ?? '?'
}
function curSymbol(id: string): string {
  return currencies.value.find(c => c.id === id)?.symbol ?? ''
}

// ─── GM 管理态 ───
const gmTab = ref<'manage' | 'pending' | 'records'>('manage')
const editingItem = ref<any | null>(null)
const showAddForm = ref(false)
const form = ref({ name: '', icon: '', description: '', price_currency_id: '', price_amount: 1, stock: 1 })

function startAdd() {
  form.value = { name: '', icon: '', description: '', price_currency_id: currencies.value[0]?.id ?? '', price_amount: 1, stock: 1 }
  editingItem.value = null
  showAddForm.value = true
}
function startEdit(item: any) {
  form.value = {
    name: item.name, icon: item.icon ?? '', description: item.description ?? '',
    price_currency_id: item.price_currency_id, price_amount: item.price_amount, stock: item.stock,
  }
  editingItem.value = item
  showAddForm.value = true
}
async function saveItem() {
  const f = form.value
  if (!f.name.trim() || !f.price_currency_id) { alert('请填写名称和定价货币'); return }
  const data: any = cloud.shop ? { ...cloud.shop } : { items: [] }
  if (editingItem.value) {
    const it = data.items.find((i: any) => i.id === editingItem.value.id)
    if (it) Object.assign(it, {
      name: f.name.trim(), icon: f.icon || undefined, description: f.description || undefined,
      price_currency_id: f.price_currency_id, price_amount: Number(f.price_amount), stock: Number(f.stock),
    })
  } else {
    data.items.push({
      id: crypto.randomUUID(), name: f.name.trim(), icon: f.icon || undefined,
      description: f.description || undefined, price_currency_id: f.price_currency_id,
      price_amount: Number(f.price_amount), stock: Number(f.stock),
    })
  }
  await cloud.uploadShop(data)
  showAddForm.value = false
  editingItem.value = null
}
async function removeItem(item: any) {
  if (!confirm(`确认下架「${item.name}」？`)) return
  const data = { ...cloud.shop!, items: cloud.shop!.items.filter((i: any) => i.id !== item.id) }
  await cloud.uploadShop(data)
}

// ─── 玩家购买 ───
const buying = ref<{ item: any; curName: string; curSymbol: string } | null>(null)
function confirmBuy(item: any) {
  const cur = currencies.value.find(c => c.id === item.price_currency_id)
  buying.value = { item, curName: cur?.name ?? '', curSymbol: cur?.symbol ?? '' }
}
async function doBuy() {
  if (!buying.value) return
  try {
    await cloud.submitShopOrder(buying.value.item.id)
    buying.value = null
  } catch (e: any) {
    alert(`下单失败: ${e.message || e}`)
  }
}

function fmtTime(iso?: string): string {
  return iso ? new Date(iso).toLocaleString('zh-CN') : ''
}
</script>

<template>
  <div class="shop-view">
    <!-- ============ GM 管理视图 ============ -->
    <template v-if="isGM">
      <div class="shop-header">
        <h2>🛒 商店管理</h2>
        <div class="gm-tabs">
          <button class="tab-btn" :class="{ active: gmTab === 'manage' }" @click="gmTab = 'manage'">商品</button>
          <button class="tab-btn" :class="{ active: gmTab === 'pending' }" @click="gmTab = 'pending'">
            待批准 <span v-if="cloud.pendingShopOrders.length" class="badge-count">{{ cloud.pendingShopOrders.length }}</span>
          </button>
          <button class="tab-btn" :class="{ active: gmTab === 'records' }" @click="gmTab = 'records'">销售记录</button>
        </div>
      </div>

      <!-- 商品管理 -->
      <div v-if="gmTab === 'manage'" class="gm-panel">
        <button class="btn btn-primary btn-sm" @click="startAdd">+ 上架商品</button>
        <div v-if="showAddForm" class="item-form card">
          <div class="form-grid">
            <input class="input" v-model="form.name" placeholder="商品名称">
            <input class="input" v-model="form.icon" placeholder="图标 emoji（可选）">
            <input class="input" v-model="form.description" placeholder="描述（可选）">
            <select class="input" v-model="form.price_currency_id">
              <option value="">选择定价货币…</option>
              <option v-for="c in currencies" :key="c.id" :value="c.id">{{ c.name }} ({{ c.symbol }})</option>
            </select>
            <input class="input" type="number" min="0" v-model.number="form.price_amount" placeholder="价格">
            <input class="input" type="number" min="0" v-model.number="form.stock" placeholder="库存">
          </div>
          <div class="form-actions">
            <button class="btn btn-secondary btn-sm" @click="showAddForm = false">取消</button>
            <button class="btn btn-primary btn-sm" @click="saveItem">{{ editingItem ? '保存' : '上架' }}</button>
          </div>
        </div>

        <div v-if="items.length === 0" class="empty-hint">尚未上架商品</div>
        <div v-else class="item-list">
          <div v-for="it in items" :key="it.id" class="item-row">
            <span class="item-icon">{{ it.icon || '📦' }}</span>
            <div class="item-main">
              <div class="item-name">{{ it.name }}</div>
              <div class="item-sub">{{ it.description || '—' }}</div>
              <div class="item-price">{{ curSymbol(it.price_currency_id) }} {{ it.price_amount }} {{ curName(it.price_currency_id) }} · 库存 {{ it.stock }}</div>
            </div>
            <div class="item-ops">
              <button class="btn btn-ghost btn-sm" @click="startEdit(it)">编辑</button>
              <button class="btn btn-ghost btn-sm" @click="removeItem(it)">下架</button>
            </div>
          </div>
        </div>
      </div>

      <!-- 待批准订单 -->
      <div v-else-if="gmTab === 'pending'" class="gm-panel">
        <div v-if="cloud.pendingShopOrders.length === 0" class="empty-hint">暂无待批准订单</div>
        <div v-else class="order-list">
          <div v-for="o in cloud.pendingShopOrders" :key="o.id" class="order-card">
            <div class="order-main">
              <div class="order-title">{{ o.item_name }} ×1</div>
              <div class="order-sub">{{ o.buyer_char_name }} 申请 · {{ o.price_currency_name }} {{ o.price_amount }}</div>
              <div class="order-time">{{ fmtTime(o.created_at) }}</div>
            </div>
            <div class="order-ops">
              <button class="btn btn-secondary btn-sm" @click="cloud.rejectShopOrder(o.id)">拒绝</button>
              <button class="btn btn-primary btn-sm" @click="cloud.approveShopOrder(o.id)">批准</button>
            </div>
          </div>
        </div>
      </div>

      <!-- 销售记录 -->
      <div v-else class="gm-panel">
        <div v-if="cloud.approvedShopOrders.length === 0" class="empty-hint">暂无销售记录</div>
        <div v-else class="order-list">
          <div v-for="o in cloud.approvedShopOrders" :key="o.id" class="order-card done">
            <div class="order-main">
              <div class="order-title">{{ o.item_name }} ×1</div>
              <div class="order-sub">{{ o.buyer_char_name }} · {{ o.price_currency_name }} {{ o.price_amount }}</div>
              <div class="order-time">{{ fmtTime(o.processed_at) }}</div>
            </div>
            <span class="order-tag">已售出</span>
          </div>
        </div>
      </div>
    </template>

    <!-- ============ 玩家购买视图 ============ -->
    <template v-else>
      <div class="shop-header">
        <h2>🛒 商店</h2>
        <span class="muted">购买需 GM 批准后才扣费发货</span>
      </div>

      <div v-if="items.length === 0" class="empty-hint">商店暂无商品</div>
      <div v-else class="buy-grid">
        <div v-for="it in items" :key="it.id" class="buy-card" :class="{ soldout: it.stock <= 0 }">
          <div class="buy-icon">{{ it.icon || '📦' }}</div>
          <div class="buy-name">{{ it.name }}</div>
          <div class="buy-desc">{{ it.description || '' }}</div>
          <div class="buy-price">{{ curSymbol(it.price_currency_id) }} {{ it.price_amount }} {{ curName(it.price_currency_id) }}</div>
          <div class="buy-stock">库存 {{ it.stock }}</div>
          <button class="btn btn-primary btn-sm" :disabled="it.stock <= 0" @click="confirmBuy(it)">
            {{ it.stock <= 0 ? '已售罄' : '购买' }}
          </button>
        </div>
      </div>

      <div class="my-orders">
        <h3>我的订单</h3>
        <div v-if="cloud.myShopOrders.length === 0" class="empty-hint">暂无订单</div>
        <div v-else class="order-list">
          <div v-for="o in cloud.myShopOrders" :key="o.id" class="order-card">
            <div class="order-main">
              <div class="order-title">{{ o.item_name }} ×1</div>
              <div class="order-sub">{{ o.price_currency_name }} {{ o.price_amount }} · {{ o.status === 'pending' ? '待批准' : o.status === 'approved' ? '已购买' : '已拒绝' }}</div>
              <div class="order-time">{{ fmtTime(o.created_at) }}</div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- 玩家购买确认弹窗 -->
    <div v-if="buying" class="modal-overlay" @click.self="buying = null">
      <div class="modal">
        <div class="modal-header">
          <h3>确认购买</h3>
          <button class="btn btn-ghost btn-icon" @click="buying = null">✕</button>
        </div>
        <div class="modal-body">
          <p>商品：<b>{{ buying.item.name }}</b></p>
          <p>价格：<b>{{ buying.curSymbol }} {{ buying.item.price_amount }} {{ buying.curName }}</b></p>
          <p class="hint">提交后向 GM 发起购买申请，批准后才扣费并放入背包。</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="buying = null">取消</button>
          <button class="btn btn-primary" @click="doBuy">提交申请</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.shop-view { flex: 1; display: flex; flex-direction: column; padding: 20px 24px; gap: 16px; overflow-y: auto; }
.shop-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.shop-header h2 { font-size: 18px; }
.muted { color: var(--color-text-muted); font-size: 12px; }
.gm-tabs { display: flex; gap: 8px; }
.gm-panel { display: flex; flex-direction: column; gap: 12px; }
.badge-count { background: var(--color-primary); color: #fff; border-radius: 10px; padding: 0 6px; font-size: 11px; margin-left: 4px; }
.empty-hint { color: var(--color-text-muted); font-size: 13px; padding: 12px 0; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.form-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
.item-list, .order-list { display: flex; flex-direction: column; gap: 8px; }
.item-row { display: flex; align-items: center; gap: 12px; padding: 12px; border: 1px solid var(--color-border); border-radius: 8px; }
.item-icon { font-size: 24px; }
.item-main { flex: 1; }
.item-name { font-weight: 600; }
.item-sub { font-size: 12px; color: var(--color-text-muted); }
.item-price { font-size: 13px; color: var(--color-primary); margin-top: 2px; }
.item-ops { display: flex; gap: 6px; }
.order-card { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px; border: 1px solid var(--color-border); border-radius: 8px; }
.order-card.done { opacity: 0.8; }
.order-main { flex: 1; }
.order-title { font-weight: 600; }
.order-sub { font-size: 12px; color: var(--color-text-muted); }
.order-time { font-size: 11px; color: var(--color-text-muted); margin-top: 2px; }
.order-ops { display: flex; gap: 6px; }
.order-tag { font-size: 12px; color: #1e7e34; }
.buy-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; }
.buy-card { display: flex; flex-direction: column; gap: 6px; padding: 14px; border: 1px solid var(--color-border); border-radius: 10px; }
.buy-card.soldout { opacity: 0.55; }
.buy-icon { font-size: 32px; }
.buy-name { font-weight: 600; }
.buy-desc { font-size: 12px; color: var(--color-text-muted); min-height: 16px; }
.buy-price { color: var(--color-primary); font-weight: 600; }
.buy-stock { font-size: 12px; color: var(--color-text-muted); }
.my-orders { margin-top: 8px; }
.my-orders h3 { font-size: 14px; margin-bottom: 8px; }
.modal { width: 420px; max-width: 95vw; }
.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 20px; border-bottom: 1px solid var(--color-border); }
.modal-header h3 { font-size: 15px; }
.modal-body { padding: 20px; display: flex; flex-direction: column; gap: 8px; font-size: 14px; }
.modal-footer { display: flex; justify-content: flex-end; gap: 8px; padding: 16px 20px; border-top: 1px solid var(--color-border); }
.hint { color: var(--color-text-muted); font-size: 12px; }
</style>