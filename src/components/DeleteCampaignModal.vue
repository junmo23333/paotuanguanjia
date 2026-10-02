<script setup lang="ts">
import { ref, computed } from 'vue'
import { useCloudStore } from '../stores/cloud'
import type { CampaignSummary } from '../types'

const props = defineProps<{ campaign: CampaignSummary }>()
const emit = defineEmits<{
  close: []
  confirm: [payload: { deleteCloud: boolean }]
}>()

const cloud = useCloudStore()
const confirmText = ref('')
const submitting = ref(false)

const CONFIRM_PHRASE = '确认删除云端战役'

const isCurrentRoom = computed(() =>
  cloud.connected && cloud.isGM && cloud.currentRoomCampaignId === props.campaign.id
)
const isPlayerInRoom = computed(() =>
  cloud.connected && !cloud.isGM && cloud.currentRoomCampaignId === props.campaign.id
)
const canDeleteCloud = computed(() => confirmText.value === CONFIRM_PHRASE)

function close() {
  emit('close')
}

function confirm() {
  if (submitting.value) return
  submitting.value = true
  emit('confirm', { deleteCloud: isCurrentRoom.value })
}
</script>

<template>
  <div class="modal-overlay" @click.self="close">
    <div class="modal">
      <div class="modal-header">
        <h3>删除战役</h3>
        <button class="btn btn-ghost btn-icon" @click="close">✕</button>
      </div>
      <div class="modal-body">
        <p>确定删除战役 <strong>「{{ campaign.name }}」</strong>？</p>
        <p class="muted">本地存档将永久删除，无法恢复。</p>

        <div v-if="isCurrentRoom" class="cloud-warning">
          <p>⚠️ 此战役关联到当前云端房间 <strong>「{{ cloud.roomPassword }}」</strong></p>
          <p>删除战役将一并清空云端房间（meta / 仓库 / 角色 / 申请 / 交易等所有数据）。</p>
          <label class="confirm-input-label">
            请输入 <code>{{ CONFIRM_PHRASE }}</code> 以启用删除按钮：
          </label>
          <input
            class="input"
            v-model="confirmText"
            :placeholder="CONFIRM_PHRASE"
            spellcheck="false"
            autocomplete="off"
          >
          <p v-if="confirmText && !canDeleteCloud" class="hint-warn">确认短语不正确</p>
        </div>
        <div v-else-if="isPlayerInRoom" class="player-note">
          <p>☁️ 此战役关联到当前云端房间 <strong>「{{ cloud.roomPassword }}」</strong></p>
          <p>云端数据仅 GM 可清空。删除只会移除你的本地副本，云端房间不受影响。</p>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" @click="close">取消</button>
        <button
          class="btn btn-danger"
          @click="confirm"
          :disabled="isCurrentRoom && !canDeleteCloud"
        >{{ isCurrentRoom ? '删除战役 + 云端房间' : '删除战役' }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal {
  width: 480px;
  max-width: 95vw;
}
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px;
  border-bottom: 1px solid var(--color-border);
}
.modal-header h3 { font-size: 15px; font-weight: 600; }
.modal-body { padding: 20px; }
.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 20px;
  border-top: 1px solid var(--color-border);
}
.muted { color: var(--color-text-muted); font-size: 12px; margin-top: 4px; }

.cloud-warning {
  margin-top: 16px;
  padding: 12px 14px;
  background: #fff4e6;
  border: 1px solid #f5b76d;
  border-radius: 8px;
}
.cloud-warning p { font-size: 13px; margin-bottom: 6px; }
.cloud-warning code {
  background: #fff;
  padding: 1px 6px;
  border-radius: 4px;
  font-weight: 700;
  color: #b85d00;
}
.player-note {
  margin-top: 16px;
  padding: 12px 14px;
  background: #e8f4ff;
  border: 1px solid #b8d8f8;
  border-radius: 8px;
}
.player-note p { font-size: 13px; margin-bottom: 6px; color: #1a5fa3; }
.player-note strong { color: #0d4a8a; }

.confirm-input-label {
  display: block;
  margin: 12px 0 6px;
  font-size: 12px;
  color: var(--color-text-secondary);
}
.hint-warn {
  margin-top: 6px;
  font-size: 11px;
  color: var(--color-danger);
}

.btn-danger {
  background: var(--color-danger);
  color: #fff;
}
.btn-danger:hover:not(:disabled) {
  filter: brightness(1.05);
}
.btn-danger:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>