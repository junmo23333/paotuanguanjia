<script setup lang="ts">
import { computed } from 'vue'
import { useCloudStore } from '../stores/cloud'

const emit = defineEmits<{ close: [] }>()
const cloud = useCloudStore()

const pending = computed(() => cloud.myIncomingGifts)
const history = computed(() => cloud.gifts.filter(g => g.status !== 'pending'))

function fmtTime(iso?: string): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString('zh-CN')
}

async function accept(id: string) {
  try {
    await cloud.acceptGift(id)
  } catch (e: any) {
    alert(`接收失败: ${e.message || e}`)
  }
}
async function reject(id: string) {
  try {
    await cloud.rejectGift(id)
  } catch (e: any) {
    alert(`拒绝失败: ${e.message || e}`)
  }
}
</script>

<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="modal">
      <div class="modal-header">
        <h3>🎁 礼物收件箱</h3>
        <button class="btn btn-ghost btn-icon" @click="emit('close')">✕</button>
      </div>
      <div class="modal-body">
        <h4 class="section-title">待接收（{{ pending.length }}）</h4>
        <div v-if="pending.length === 0" class="empty-hint">暂无待接收的赠予</div>
        <div v-for="g in pending" :key="g.id" class="gift-card">
          <div class="gift-from">来自 <b>{{ g.from_char_name }}</b></div>
          <ul class="gift-items">
            <li v-for="(give, i) in g.gives" :key="i">
              {{ give.type === 'item' ? '🎒' : '💰' }} {{ give.name }} × {{ give.quantity }}
            </li>
          </ul>
          <div v-if="g.note" class="gift-note">「{{ g.note }}」</div>
          <div class="gift-actions">
            <button class="btn btn-secondary btn-sm" @click="reject(g.id)">拒绝</button>
            <button class="btn btn-primary btn-sm" @click="accept(g.id)">接受</button>
          </div>
        </div>

        <template v-if="history.length > 0">
          <h4 class="section-title">历史</h4>
          <div v-for="g in history" :key="g.id" class="gift-card history">
            <div class="gift-from">
              来自 <b>{{ g.from_char_name }}</b>
              <span class="gift-status" :class="g.status">{{ g.status === 'accepted' ? '已接收' : '已拒绝' }}</span>
            </div>
            <ul class="gift-items">
              <li v-for="(give, i) in g.gives" :key="i">
                {{ give.type === 'item' ? '🎒' : '💰' }} {{ give.name }} × {{ give.quantity }}
              </li>
            </ul>
            <div v-if="g.note" class="gift-note">「{{ g.note }}」</div>
            <div class="gift-time">{{ fmtTime(g.processed_at) }}</div>
          </div>
        </template>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" @click="emit('close')">关闭</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal { width: 480px; max-width: 95vw; max-height: 85vh; display: flex; flex-direction: column; }
.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 20px; border-bottom: 1px solid var(--color-border); }
.modal-header h3 { font-size: 15px; font-weight: 600; }
.modal-body { padding: 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }
.modal-footer { display: flex; justify-content: flex-end; padding: 16px 20px; border-top: 1px solid var(--color-border); }
.section-title { font-size: 13px; font-weight: 600; color: var(--color-text-secondary); margin-top: 4px; }
.empty-hint { color: var(--color-text-muted); font-size: 13px; }
.gift-card { border: 1px solid var(--color-border); border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
.gift-card.history { opacity: 0.7; }
.gift-from { font-size: 13px; }
.gift-items { margin: 0; padding-left: 18px; font-size: 13px; display: flex; flex-direction: column; gap: 2px; }
.gift-status { margin-left: 8px; font-size: 11px; padding: 1px 6px; border-radius: 4px; }
.gift-status.accepted { background: #e6f4ea; color: #1e7e34; }
.gift-status.rejected { background: #fde8e8; color: #c0392b; }
.gift-actions { display: flex; justify-content: flex-end; gap: 8px; }
.gift-note { color: var(--color-text-muted); font-size: 12px; font-style: italic; }
.gift-time { color: var(--color-text-muted); font-size: 11px; }
</style>