<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCampaignStore } from '../stores/campaign'
import { useCloudStore } from '../stores/cloud'
import CharacterPanel from '../components/CharacterPanel.vue'
import CharacterList from '../components/CharacterList.vue'
import WarehousePanel from '../components/WarehousePanel.vue'
import OverviewView from '../views/OverviewView.vue'
import CampaignEditModal from '../components/CampaignEditModal.vue'
import CharacterModal from '../components/CharacterModal.vue'
import CurrencyModal from '../components/CurrencyModal.vue'
import WarehouseAdjustModal from '../components/WarehouseAdjustModal.vue'
import GiftInboxModal from '../components/GiftInboxModal.vue'
import ShopView from '../components/ShopView.vue'
import WarehouseConflictModal from '../components/WarehouseConflictModal.vue'

const route = useRoute()
const router = useRouter()
const store = useCampaignStore()
const cloud = useCloudStore()

// 玩家模式下只显示自己认领的角色卡；GM / 离线显示全部
const displayCharacters = computed(() => {
  const chars = store.currentCampaign?.characters ?? []
  if (!cloud.connected || cloud.isGM) return chars
  const myId = cloud.myCharacterId
  if (!myId) return chars
  return chars.filter(c => c.id === myId)
})

async function syncFromCloud() {
  await store.syncFromCloud()
}

const showEditCampaign = ref(false)
const showAddCharacter = ref(false)
const showWarehouse = ref(false)
const showCurrency = ref(false)
const showAdjust = ref(false)
const showGiftInbox = ref(false)
const viewMode = ref<'overview' | 'warehouse' | 'character' | 'shop'>('overview')

onMounted(async () => {
  const id = route.params.id as string
  if (!store.currentCampaign || store.currentCampaign.id !== id) {
    await store.loadCampaign(id)
  }
})

watch(() => route.params.id, async (newId) => {
  if (newId && (!store.currentCampaign || store.currentCampaign.id !== newId)) {
    await store.loadCampaign(newId as string)
  }
})

function selectCharacter(id: string) {
  store.selectCharacter(id)
  showWarehouse.value = false
  viewMode.value = 'character'
}

function openWarehouse() {
  showWarehouse.value = true
  store.currentCharacter = null
  viewMode.value = 'warehouse'
}

function openOverview() {
  showWarehouse.value = false
  store.currentCharacter = null
  viewMode.value = 'overview'
}
function openShop() {
  showWarehouse.value = false
  store.currentCharacter = null
  viewMode.value = 'shop'
}

function onCharacterDeleted() {
  store.currentCharacter = null
  viewMode.value = 'overview'
}

function goHome() {
  store.currentCampaign = null
  store.currentCharacter = null
  router.push('/')
}
</script>

<template>
  <div class="campaign-view">
    <div v-if="store.loading" class="loading-center">
      <div class="loading-spinner"></div>
      <p>加载中...</p>
    </div>

    <div v-else-if="!store.currentCampaign" class="empty-state">
      <div class="empty-icon">🎴</div>
      <p>战役不存在</p>
      <button class="btn btn-primary" @click="goHome">返回主页</button>
    </div>

    <div v-else class="campaign-layout">
      <!-- 角色列表（左侧） -->
      <aside class="character-sidebar">
        <div class="sidebar-header">
          <div class="campaign-info">
            <div class="ci-icon">{{ store.currentCampaign.icon || '🎴' }}</div>
            <div>
              <div class="ci-name">{{ store.currentCampaign.name }}</div>
              <div class="ci-rule badge">{{ store.currentCampaign.rule_system }}</div>
            </div>
          </div>
          <div class="sidebar-actions">
            <button class="btn btn-secondary btn-sm" title="货币（战役级）" @click="showCurrency = true">💰 货币</button>
            <button class="btn btn-ghost btn-icon btn-sm" title="编辑战役" @click="showEditCampaign = true">✏️</button>
            <button class="btn btn-primary btn-sm" @click="showAddCharacter = true">+ 角色</button>
          </div>
        </div>

        <!-- 概览入口（默认） -->
        <div v-if="cloud.connected" class="cloud-bar">
          <span class="cloud-tag">☁️ {{ cloud.roomPassword }}<b v-if="cloud.isGM"> · GM</b><span v-else> · 玩家</span></span>
          <div class="cloud-bar-actions">
            <button
              v-if="!cloud.isGM && cloud.myIncomingGifts.length > 0"
              class="btn btn-ghost btn-sm gift-inbox-btn"
              title="礼物收件箱"
              @click="showGiftInbox = true"
            >🎁 {{ cloud.myIncomingGifts.length }}</button>
            <button class="btn btn-ghost btn-sm" title="拉取最新并推送我的角色" @click="syncFromCloud">🔄 同步</button>
          </div>
        </div>

        <div class="sidebar-special">
          <button
            class="overview-entry"
            :class="{ active: viewMode === 'overview' }"
            @click="openOverview"
          >
            <div class="ov-icon">📊</div>
            <div class="ov-info">
              <div class="ov-name">概览主页</div>
              <div class="ov-meta">所有角色 · 仓库 · 货币总览</div>
            </div>
          </button>

          <button
            class="warehouse-entry"
            :class="{ active: viewMode === 'warehouse' }"
            @click="openWarehouse"
          >
            <div class="we-icon">📦</div>
            <div class="we-info">
              <div class="we-name">{{ store.currentCampaign.warehouse.name }}</div>
              <div class="we-meta">
                {{ store.currentCampaign.warehouse.items.length }} 件物品 ·
                {{ store.currentCampaign.warehouse.currencies.length }} 种货币
              </div>
            </div>
          </button>

          <button
            class="shop-entry"
            :class="{ active: viewMode === 'shop' }"
            @click="openShop"
          >
            <div class="se-icon">🛒</div>
            <div class="se-info">
              <div class="se-name">商店</div>
              <div class="se-meta">{{ cloud.isGM ? '上架 / 审批' : '浏览 / 购买' }}</div>
            </div>
          </button>
        </div>

        <div class="sidebar-divider">
          <span>玩家档案</span>
        </div>

        <CharacterList
          :characters="displayCharacters"
          :activeId="store.currentCharacter?.id || null"
          @select="selectCharacter"
          @delete="onCharacterDeleted"
        />
      </aside>

      <!-- 主内容区 -->
      <main class="content-area">
        <!-- 概览主页（默认） -->
        <OverviewView v-if="viewMode === 'overview'" />

        <!-- 仓库面板 -->
        <WarehousePanel
          v-else-if="viewMode === 'warehouse'"
          :warehouse="store.currentCampaign.warehouse"
          :read-only="cloud.connected && !cloud.isGM"
          @close="openOverview"
          @open-currency="showCurrency = true"
          @open-adjust="showAdjust = true"
        />

        <!-- 商店 -->
        <ShopView v-else-if="viewMode === 'shop'" />

        <!-- 角色详情 -->
        <CharacterPanel
          v-else-if="viewMode === 'character' && store.currentCharacter"
          :character="store.currentCharacter"
          :campaignId="store.currentCampaign.id"
        />

        <!-- 兜底 -->
        <div v-else class="empty-state">
          <div class="empty-icon">📦</div>
          <p>选择团队仓库或某个角色，或新建一个角色</p>
          <div class="empty-actions">
            <button class="btn btn-secondary" @click="openOverview">📊 概览</button>
            <button class="btn btn-primary" @click="showAddCharacter = true">+ 新建角色</button>
          </div>
        </div>
      </main>
    </div>

    <!-- 模态框 -->
    <CampaignEditModal v-if="showEditCampaign" :campaign="store.currentCampaign!" @close="showEditCampaign = false" />
    <CharacterModal v-if="showAddCharacter" mode="create" @close="showAddCharacter = false" />
    <CurrencyModal v-if="showCurrency" @close="showCurrency = false" />
    <WarehouseAdjustModal v-if="showAdjust" @close="showAdjust = false" />
    <GiftInboxModal v-if="showGiftInbox" @close="showGiftInbox = false" />
    <WarehouseConflictModal />
  </div>
</template>

<style scoped>
.campaign-view {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.loading-center {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: var(--color-text-muted);
}
.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.campaign-layout {
  flex: 1;
  display: flex;
  overflow: hidden;
}

/* 侧边栏 */
.character-sidebar {
  width: 280px;
  flex-shrink: 0;
  background: var(--color-surface);
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sidebar-header {
  padding: 16px;
  border-bottom: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.campaign-info {
  display: flex;
  align-items: center;
  gap: 10px;
}
.ci-icon { font-size: 28px; }
.ci-name { font-size: 14px; font-weight: 600; }
.ci-rule { margin-top: 3px; }
.sidebar-actions { display: flex; justify-content: flex-end; gap: 6px; }

.cloud-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 16px;
  background: var(--color-primary-soft);
  border-bottom: 1px solid var(--color-border);
  font-size: 12px;
}
.cloud-tag { font-weight: 600; }

/* 仓库入口（顶部） */
.sidebar-special {
  padding: 12px 16px 4px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.overview-entry {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: linear-gradient(135deg, #eef0ff 0%, #dfe5ff 100%);
  border: 1px solid #c4cefb;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.15s;
  text-align: left;
}
.overview-entry:hover {
  background: linear-gradient(135deg, #dfe5ff 0%, #c4cefb 100%);
  transform: translateY(-1px);
}
.overview-entry.active {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px rgba(79, 110, 247, 0.15);
}
.ov-icon { font-size: 26px; flex-shrink: 0; }
.ov-info { flex: 1; min-width: 0; }
.ov-name { font-size: 13px; font-weight: 600; }
.ov-meta { font-size: 11px; color: var(--color-text-muted); margin-top: 2px; }

.warehouse-entry {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: linear-gradient(135deg, #fff7e8 0%, #fff1d6 100%);
  border: 1px solid #f4d28a;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.15s;
  text-align: left;
}
.warehouse-entry:hover {
  background: linear-gradient(135deg, #fff1d6 0%, #ffe4a8 100%);
  transform: translateY(-1px);
}
.warehouse-entry.active {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px rgba(79, 110, 247, 0.15);
}
.we-icon { font-size: 26px; flex-shrink: 0; }
.we-info { flex: 1; min-width: 0; }
.we-name { font-size: 13px; font-weight: 600; }
.we-meta { font-size: 11px; color: var(--color-text-muted); margin-top: 2px; }

.shop-entry {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-surface);
  cursor: pointer;
  text-align: left;
  transition: all 0.15s;
}
.shop-entry:hover {
  background: linear-gradient(135deg, #e8ecff 0%, #d8e0ff 100%);
  transform: translateY(-1px);
}
.shop-entry.active {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px rgba(79, 110, 247, 0.15);
}
.se-icon { font-size: 26px; flex-shrink: 0; }
.se-info { flex: 1; min-width: 0; }
.se-name { font-size: 13px; font-weight: 600; }
.se-meta { font-size: 11px; color: var(--color-text-muted); margin-top: 2px; }

/* 分隔线 */
.sidebar-divider {
  display: flex;
  align-items: center;
  padding: 12px 16px 8px 16px;
  font-size: 10px;
  font-weight: 700;
  color: var(--color-text-muted);
  letter-spacing: 1px;
}
.sidebar-divider::before {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--color-border);
  margin-left: 8px;
}

/* 内容区 */
.content-area {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.empty-actions { display: flex; gap: 8px; margin-top: 12px; }
</style>