<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useCampaignStore } from '../stores/campaign'
import DiceModal from './DiceModal.vue'
import ImportExportModal from './ImportExportModal.vue'

const router = useRouter()
const store = useCampaignStore()
const showDice = ref(false)
const showImportExport = ref(false)


</script>

<template>
  <header class="app-header">
    <div class="header-left">
      <button class="back-btn btn btn-ghost btn-icon" @click="router.push('/')" title="返回主页">
        <span class="icon">←</span>
      </button>
      <div class="app-brand">
        <span class="brand-icon">🎲</span>
        <span class="brand-name">跑团管家</span>
      </div>
      <div v-if="store.currentCampaign" class="breadcrumb">
        <span class="sep">/</span>
        <span class="crumb-name">{{ store.currentCampaign.name }}</span>
        <template v-if="store.currentCharacter">
          <span class="sep">/</span>
          <span class="crumb-name">{{ store.currentCharacter.name }}</span>
        </template>
      </div>
    </div>

    <div class="header-right">
      <button class="btn btn-secondary btn-sm" @click="showDice = true" title="骰点">
        🎲 骰子
      </button>
      <button class="btn btn-secondary btn-sm" @click="showImportExport = true" title="导入导出">
        📥 导入导出
      </button>
    </div>
  </header>

  <DiceModal v-if="showDice" @close="showDice = false" />
  <ImportExportModal v-if="showImportExport" @close="showImportExport = false" />
</template>

<style scoped>
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  height: 52px;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
  z-index: 10;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.back-btn {
  display: none;
}

.app-header:has(~ main .campaign-view) .back-btn {
  display: flex;
}

.app-brand {
  display: flex;
  align-items: center;
  gap: 8px;
}

.brand-icon { font-size: 20px; }
.brand-name {
  font-size: 15px;
  font-weight: 700;
  color: var(--color-text);
  letter-spacing: 0.5px;
}

.breadcrumb {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--color-text-secondary);
}
.sep { color: var(--color-text-muted); }
.crumb-name { font-weight: 500; color: var(--color-text); }

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
