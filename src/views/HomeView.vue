<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useCampaignStore } from '../stores/campaign'
import { useCloudStore } from '../stores/cloud'
import CampaignModal from '../components/CampaignModal.vue'
import CloudConnectModal from '../components/CloudConnectModal.vue'
import DeleteCampaignModal from '../components/DeleteCampaignModal.vue'
import type { CampaignSummary } from '../types'

const router = useRouter()
const store = useCampaignStore()
const cloud = useCloudStore()
const showCreateModal = ref(false)
const showCloudModal = ref(false)
const showDeleteModal = ref<CampaignSummary | null>(null)
const recentCampaign = ref<CampaignSummary | null>(null)

onMounted(async () => {
  await store.loadCampaignList()
  if (store.config.last_campaign_id) {
    const found = store.campaigns.find(c => c.id === store.config.last_campaign_id)
    if (found) recentCampaign.value = found
  }
  // 自动重连上次联网房间（恢复在线状态）
  await cloud.restoreSession()
})

async function openCampaign(id: string) {
  await store.loadCampaign(id)
  router.push(`/campaign/${id}`)
}

async function handleConfirmDelete(payload: { deleteCloud: boolean }) {
  const target = showDeleteModal.value
  if (!target) return
  showDeleteModal.value = null
  try {
    if (payload.deleteCloud) {
      await cloud.deleteRoom()
    }
    await store.deleteCampaign(target.id)
  } catch (e: any) {
    alert(`删除失败: ${e.message || e}`)
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff/60000)}分钟前`
  if (diff < 86400000) return `${Math.floor(diff/3600000)}小时前`
  if (diff < 604800000) return `${Math.floor(diff/86400000)}天前`
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}
</script>

<template>
  <div class="home-view">
    <!-- 快速继续 -->
    <div v-if="recentCampaign" class="quick-continue" @click="openCampaign(recentCampaign.id)">
      <div class="qc-label">📂 最近战役</div>
      <div class="qc-content">
        <div class="qc-icon">🎴</div>
        <div class="qc-info">
          <div class="qc-name">{{ recentCampaign.name }}</div>
          <div class="qc-meta">{{ recentCampaign.rule_system }} · {{ recentCampaign.character_count }}个角色 · {{ formatDate(recentCampaign.updated_at) }}</div>
        </div>
        <div class="qc-arrow">→</div>
      </div>
    </div>

    <!-- 全部战役 -->
    <div class="section">
      <div class="section-header">
        <h2 class="section-title">全部战役</h2>
        <div class="section-actions">
          <button class="btn btn-secondary btn-sm" @click="showCloudModal = true">☁️ 联网房间</button>
          <button class="btn btn-primary btn-sm" @click="showCreateModal = true">
            + 新建战役
          </button>
        </div>
      </div>

      <div v-if="store.loading" class="loading">加载中...</div>

      <div v-else-if="store.campaigns.length === 0" class="empty-state">
        <div class="empty-icon">🎴</div>
        <p>还没有战役，创建一个开始吧</p>
        <button class="btn btn-primary" @click="showCreateModal = true">新建战役</button>
      </div>

      <div v-else class="campaign-grid">
        <div
          v-for="c in store.campaigns"
          :key="c.id"
          class="campaign-card card"
          @click="openCampaign(c.id)"
        >
          <div class="card-header">
            <div class="card-icon">{{ c.icon || '🎴' }}</div>
            <div class="card-meta">
              <div class="card-name">{{ c.name }}</div>
              <div class="card-rule badge">{{ c.rule_system }}</div>
            </div>
            <div class="card-actions" @click.stop>
              <button class="btn btn-ghost btn-icon btn-sm" title="删除" @click.stop="showDeleteModal = c">🗑</button>
            </div>
          </div>
          <div v-if="c.description" class="card-desc">{{ c.description }}</div>
          <div class="card-footer">
            <span class="card-chars">{{ c.character_count }} 个角色</span>
            <span class="card-time">{{ formatDate(c.updated_at) }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 云端连接状态 -->
    <div v-if="cloud.connected" class="cloud-status-bar" @click="showCloudModal = true">
      <div class="cs-icon">☁️</div>
      <div class="cs-info">
        <div class="cs-title">已连接房间: {{ cloud.roomPassword }}</div>
        <div class="cs-meta">
          {{ cloud.lastSyncTime ? '上次同步: ' + new Date(cloud.lastSyncTime).toLocaleTimeString('zh-CN') : '未同步' }}
          <span v-if="cloud.autoReconnected"> · 自动重连</span>
          <span v-if="cloud.syncing"> · {{ cloud.syncMessage }}</span>
        </div>
      </div>
      <button class="btn btn-ghost btn-sm" @click.stop="cloud.disconnect()">断开</button>
    </div>

    <CampaignModal v-if="showCreateModal" mode="create" @close="showCreateModal = false" />
    <CloudConnectModal v-if="showCloudModal" @close="showCloudModal = false" />
    <DeleteCampaignModal
      v-if="showDeleteModal"
      :campaign="showDeleteModal"
      @close="showDeleteModal = null"
      @confirm="handleConfirmDelete"
    />
  </div>
</template>

<style scoped>
.home-view {
  flex: 1;
  overflow-y: auto;
  padding: 28px 32px;
  display: flex;
  flex-direction: column;
  gap: 28px;
}

/* 快速继续 */
.quick-continue {
  background: linear-gradient(135deg, #4f6ef7 0%, #6c8ff8 100%);
  border-radius: var(--radius-lg);
  padding: 20px 24px;
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s;
  color: #fff;
}
.quick-continue:hover { transform: translateY(-2px); box-shadow: var(--shadow-lg); }
.qc-label { font-size: 12px; opacity: 0.85; margin-bottom: 10px; }
.qc-content { display: flex; align-items: center; gap: 16px; }
.qc-icon { font-size: 36px; }
.qc-info { flex: 1; }
.qc-name { font-size: 17px; font-weight: 700; }
.qc-meta { font-size: 12px; opacity: 0.8; margin-top: 3px; }
.qc-arrow { font-size: 20px; opacity: 0.7; }

/* 区块 */
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.section-title { font-size: 15px; font-weight: 600; }

/* 战役网格 */
.campaign-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.campaign-card {
  padding: 18px;
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.campaign-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); }

.card-header { display: flex; align-items: flex-start; gap: 12px; }
.card-icon { font-size: 28px; flex-shrink: 0; }
.card-meta { flex: 1; min-width: 0; }
.card-name { font-size: 15px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.card-rule { margin-top: 4px; }
.card-actions { flex-shrink: 0; }
.card-desc { font-size: 12px; color: var(--color-text-secondary); overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.card-footer { display: flex; justify-content: space-between; font-size: 12px; color: var(--color-text-muted); }

.loading { padding: 40px; text-align: center; color: var(--color-text-muted); }

/* 联网状态栏 */
.cloud-status-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 18px;
  background: linear-gradient(135deg, #e8f4ff 0%, #d6ebff 100%);
  border: 1px solid #b8d8f8;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: transform 0.15s;
}
.cloud-status-bar:hover { transform: translateY(-1px); }
.cs-icon { font-size: 24px; }
.cs-info { flex: 1; }
.cs-title { font-size: 13px; font-weight: 600; color: #1a5fa3; }
.cs-meta { font-size: 11px; color: #5a8ab8; margin-top: 2px; }

/* 区块按钮组 */
.section-actions {
  display: flex;
  gap: 8px;
}
</style>
