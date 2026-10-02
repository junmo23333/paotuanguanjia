<script setup lang="ts">
import { computed } from 'vue'
import { useCampaignStore } from '../stores/campaign'

const store = useCampaignStore()
const conflict = computed(() => store.warehouseConflict)

function countItems(wh: any): number {
  return wh?.items?.length ?? 0
}
function countCurrencies(wh: any): number {
  return wh?.currencies?.length ?? 0
}
</script>

<template>
  <div v-if="conflict" class="modal-overlay">
    <div class="modal conflict-modal">
      <div class="modal-header">
        <h3>⚠️ 仓库同步冲突</h3>
      </div>
      <div class="modal-body">
        <p>
          检测到<strong>本地</strong>和<strong>云端</strong>的仓库都被修改过，无法自动合并。
          请选择保留哪一版（另一版的改动将被放弃）：
        </p>
        <div class="conflict-cols">
          <div class="conflict-col">
            <div class="cc-title">📍 本地版本</div>
            <div class="cc-stat">{{ countItems(conflict.local) }} 件物品 · {{ countCurrencies(conflict.local) }} 种货币</div>
          </div>
          <div class="conflict-col">
            <div class="cc-title">☁️ 云端版本</div>
            <div class="cc-stat">{{ countItems(conflict.cloud.warehouse) }} 件物品 · {{ countCurrencies(conflict.cloud.warehouse) }} 种货币</div>
          </div>
        </div>
        <p class="hint">
          选择「保留本地」会把你的仓库改动上传到云端（覆盖队友/其他设备版本）；
          选择「使用云端」会用云端版本覆盖你本地的仓库改动。
        </p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" @click="store.resolveWarehouseConflict('cloud')">
          使用云端版本
        </button>
        <button class="btn btn-primary" @click="store.resolveWarehouseConflict('local')">
          保留本地并上传
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.modal {
  width: 440px;
  max-width: 95vw;
  background: var(--color-surface);
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
}
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px;
  border-bottom: 1px solid var(--color-border);
}
.modal-header h3 { font-size: 15px; }
.modal-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  font-size: 14px;
  line-height: 1.6;
}
.conflict-cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.conflict-col {
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 12px;
  background: var(--color-bg);
}
.cc-title { font-weight: 600; font-size: 13px; margin-bottom: 6px; }
.cc-stat { font-size: 13px; color: var(--color-text-muted); }
.hint { font-size: 12px; color: var(--color-text-muted); margin: 0; }
.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 20px;
  border-top: 1px solid var(--color-border);
}
</style>