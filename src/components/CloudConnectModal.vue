<script setup lang="ts">
import { ref, computed } from 'vue'
import { useCloudStore } from '../stores/cloud'
import { useCampaignStore } from '../stores/campaign'

const emit = defineEmits<{ close: [] }>()

const cloud = useCloudStore()
const campaignStore = useCampaignStore()

// 模式：join（加入房间）或 host（创建新房间）
const mode = ref<'join' | 'host'>('join')
const roomId = ref('')       // 房间号
const roomSecret = ref('')   // 房间密码
const step = ref<'input' | 'connecting' | 'claim' | 'success' | 'error'>('input')
const errorMsg = ref('')

// host 模式：选择本地战役
const selectedCampaignId = ref('')
const localCampaigns = computed(() => campaignStore.campaigns)

async function handleJoin() {
  if (!roomId.value.trim()) {
    errorMsg.value = '请输入房间号'
    return
  }
  if (!roomSecret.value.trim()) {
    errorMsg.value = '请输入房间密码'
    return
  }
  step.value = 'connecting'
  errorMsg.value = ''

  try {
    // GM 密码规则：房间号以 GM 结尾则为 GM 身份
    const inputRoom = roomId.value.trim()
    let gm = false
    let actualRoom = inputRoom
    if (actualRoom.toUpperCase().endsWith('GM')) {
      gm = true
      actualRoom = actualRoom.slice(0, -2)
    }
    const result = await cloud.connectRoom(actualRoom, roomSecret.value.trim(), gm)
    if (result.success) {
      const campaign = await cloud.pullRoom()
      if (campaign) {
        await campaignStore.updateCampaign(campaign)
        step.value = cloud.isGM ? 'success' : 'claim'
      } else {
        step.value = 'error'
        errorMsg.value = '房间数据拉取失败'
      }
    } else {
      step.value = 'error'
      errorMsg.value = result.error || '连接失败'
    }
  } catch (e: any) {
    step.value = 'error'
    errorMsg.value = e.message || e.toString()
  }
}

async function handleHost() {
  if (!roomId.value.trim()) {
    errorMsg.value = '请设置房间号'
    return
  }
  if (!roomSecret.value.trim()) {
    errorMsg.value = '请设置房间密码'
    return
  }
  if (!selectedCampaignId.value) {
    errorMsg.value = '请选择一个本地战役作为房间数据'
    return
  }
  step.value = 'connecting'
  errorMsg.value = ''

  try {
    await campaignStore.loadCampaign(selectedCampaignId.value)
    const campaign = campaignStore.currentCampaign
    if (!campaign) {
      step.value = 'error'
      errorMsg.value = '加载战役失败'
      return
    }
    // host 模式：房间号即路径，密码单独存储
    cloud.roomPassword = roomId.value.trim()
    cloud.roomSecret = roomSecret.value.trim()
    cloud.setGM(true)

    await cloud.initRoomFromCampaign(campaign)
    step.value = 'success'
  } catch (e: any) {
    step.value = 'error'
    errorMsg.value = e.message || e.toString()
  }
}

const claimId = ref('')
function handleClaim() {
  if (!claimId.value) return
  cloud.claimCharacter(claimId.value)
  step.value = 'success'
}

function handleClose() {
  if (step.value === 'success') {
    emit('close')
  } else {
    step.value = 'input'
    emit('close')
  }
}
</script>

<template>
  <div class="modal-overlay" @click.self="handleClose">
    <div class="modal-card cloud-modal">
      <div class="modal-header">
        <h3>☁️ 联网房间</h3>
        <button class="btn btn-ghost btn-icon" @click="handleClose">✕</button>
      </div>

      <div v-if="step === 'input'" class="modal-body">
        <!-- 模式切换 -->
        <div class="mode-tabs">
          <button :class="{ active: mode === 'join' }" @click="mode = 'join'">加入房间</button>
          <button :class="{ active: mode === 'host' }" @click="mode = 'host'">创建新房间</button>
        </div>

        <div class="form-group">
          <label>{{ mode === 'join' ? '房间号' : '设置房间号' }}</label>
          <input
            v-model="roomId"
            type="text"
            class="input"
            :placeholder="mode === 'join' ? '输入 DM 提供的房间号' : '为你的房间设一个号'"
            @keydown.enter="mode === 'join' ? handleJoin() : handleHost()"
          />
          <div class="hint">房间号用于标识存档，GM 在房间号后加 GM 登录（如 521321GM）</div>
        </div>

        <div class="form-group">
          <label>{{ mode === 'join' ? '房间密码' : '设置房间密码' }}</label>
          <input
            v-model="roomSecret"
            type="password"
            class="input"
            :placeholder="mode === 'join' ? '输入房间密码' : '设一个只有你知道的密码'"
            @keydown.enter="mode === 'join' ? handleJoin() : handleHost()"
          />
          <div class="hint">密码用于防止他人误进入你的房间</div>
        </div>

        <!-- host 模式：选择战役 -->
        <div v-if="mode === 'host'" class="form-group">
          <label>选择本地战役上传</label>
          <select v-model="selectedCampaignId" class="input">
            <option value="">— 选择战役 —</option>
            <option v-for="c in localCampaigns" :key="c.id" :value="c.id">
              {{ c.icon || '🎴' }} {{ c.name }} ({{ c.character_count }}个角色)
            </option>
          </select>
        </div>

        <button class="btn btn-primary btn-block" @click="mode === 'join' ? handleJoin() : handleHost()">
          {{ mode === 'join' ? '🔗 加入房间' : '☁️ 创建房间' }}
        </button>
      </div>

      <div v-else-if="step === 'connecting'" class="modal-body center-body">
        <div class="loading-spinner"></div>
        <p>{{ cloud.syncMessage || '连接中...' }}</p>
      </div>

      <div v-else-if="step === 'claim'" class="modal-body">
        <h4>认领你的角色卡</h4>
        <p class="hint">选择你将要操作的角色（进入后只能编辑你认领的角色）</p>
        <div class="char-list">
          <button
            v-for="c in (cloud.roomIndex?.characters || [])"
            :key="c.id"
            :class="{ active: claimId === c.id }"
            class="char-option"
            @click="claimId = c.id"
          >
            {{ c.icon || '🎴' }} {{ c.name }}
          </button>
        </div>
        <button class="btn btn-primary btn-block" :disabled="!claimId" @click="handleClaim">确认认领</button>
      </div>

      <div v-else-if="step === 'success'" class="modal-body center-body">
        <div class="success-icon">✅</div>
        <p>{{ mode === 'join' ? '已加入房间！' : '房间已创建！' }}</p>
        <p class="success-detail">房间号: {{ roomId }}</p>
        <button class="btn btn-primary" @click="handleClose">完成</button>
      </div>

      <div v-else-if="step === 'error'" class="modal-body center-body">
        <div class="error-icon">❌</div>
        <p class="error-text">{{ errorMsg }}</p>
        <button class="btn btn-secondary" @click="step = 'input'">返回重试</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cloud-modal {
  width: 460px;
  max-width: 90vw;
}

.modal-body {
  padding: 20px 24px 24px;
}

.mode-tabs {
  display: flex;
  gap: 0;
  margin-bottom: 20px;
  border-bottom: 2px solid var(--color-border);
}
.mode-tabs button {
  flex: 1;
  padding: 10px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary);
  transition: all 0.15s;
}
.mode-tabs button.active {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
  font-weight: 600;
}

.form-group {
  margin-bottom: 16px;
}
.form-group label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 6px;
}
.hint {
  font-size: 11px;
  color: var(--color-text-muted);
  margin-top: 4px;
}

.center-body {
  text-align: center;
  padding: 40px 24px;
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin: 0 auto 16px;
}
@keyframes spin { to { transform: rotate(360deg); } }

.success-icon, .error-icon {
  font-size: 48px;
  margin-bottom: 12px;
}
.success-detail {
  font-size: 12px;
  color: var(--color-text-muted);
  margin: 4px 0 16px;
}
.error-text {
  color: var(--color-danger);
  font-size: 13px;
  margin-bottom: 16px;
  word-break: break-word;
}
.char-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 8px 0 16px;
}
.char-option {
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface);
  cursor: pointer;
  text-align: left;
  font-size: 13px;
}
.char-option.active {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
}

/* ─── 手机响应式 ─────────────────────────────────────────────────────── */
@media (max-width: 768px) {
  .modal-content,
  .cloud-modal-content,
  .modal-body {
    width: 92vw !important;
    max-width: 92vw !important;
    max-height: 85vh !important;
  }
}
</style>
