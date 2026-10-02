<script setup lang="ts">
import { ref } from 'vue'
import { useCampaignStore } from '../stores/campaign'

const emit = defineEmits<{ close: [] }>()
const store = useCampaignStore()

const importJson = ref('')
const importError = ref('')
const importSuccess = ref('')
const exporting = ref(false)

async function exportAll() {
  if (store.campaigns.length === 0) {
    alert('没有可导出的战役')
    return
  }
  exporting.value = true
  importSuccess.value = ''
  importError.value = ''
  try {
    await store.exportAllCampaignsToFile()
    importSuccess.value = '✓ 备份文件已开始下载'
  } catch (e: any) {
    importError.value = `导出失败: ${e.toString()}`
  } finally {
    exporting.value = false
  }
}

async function importData() {
  if (!importJson.value.trim()) return
  importError.value = ''
  importSuccess.value = ''
  try {
    let data = JSON.parse(importJson.value)
    // 如果是数组，取第一个；如果是对象，直接用
    if (Array.isArray(data)) {
      if (data.length === 0) { importError.value = 'JSON 数据为空'; return; }
      data = data[0]
    }
    const campaign = await store.importCampaign(JSON.stringify(data))
    importSuccess.value = `导入成功: ${campaign.name}`
    importJson.value = ''
  } catch (e: any) {
    importError.value = `导入失败: ${e.toString()}`
  }
}

function loadFile() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json'
  input.onchange = (e: any) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev: any) => {
      importJson.value = ev.target.result
    }
    reader.readAsText(file)
  }
  input.click()
}
</script>

<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="modal card">
      <div class="modal-header">
        <h3>📥 导入导出</h3>
        <button class="btn btn-ghost btn-icon" @click="emit('close')">✕</button>
      </div>

      <div class="modal-body">
        <!-- 导出 -->
        <div class="section">
          <h4>📤 导出</h4>
          <p class="section-desc">将所有战役导出为 JSON 备份文件，可用于换设备迁移或数据备份。</p>
          <button class="btn btn-secondary" @click="exportAll" :disabled="exporting">
            {{ exporting ? '导出中...' : `导出全部（${store.campaigns.length} 个战役）` }}
          </button>
          <div v-if="importSuccess" class="msg success">{{ importSuccess }}</div>
          <div v-if="importError" class="msg error">{{ importError }}</div>
        </div>

        <div class="divider"></div>

        <!-- 导入 -->
        <div class="section">
          <h4>📥 导入</h4>
          <p class="section-desc">粘贴战役 JSON 数据，或上传 .json 文件。导入的战役会生成新 ID，不会覆盖现有数据。</p>
          <div class="import-area">
            <textarea
              class="input textarea"
              v-model="importJson"
              placeholder="粘贴战役 JSON 数据..."
              rows="5"
            ></textarea>
            <button class="btn btn-secondary btn-sm" @click="loadFile">📁 上传文件</button>
          </div>

          <div v-if="importError" class="msg error">{{ importError }}</div>
          <div v-if="importSuccess" class="msg success">{{ importSuccess }}</div>

          <button class="btn btn-primary" @click="importData" :disabled="!importJson.trim()">
            导入数据
          </button>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn btn-secondary" @click="emit('close')">关闭</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { width: 500px; max-width: 95vw; }
.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 20px; border-bottom: 1px solid var(--color-border); }
.modal-header h3 { font-size: 15px; font-weight: 600; }
.modal-body { padding: 20px; display: flex; flex-direction: column; gap: 20px; }
.modal-footer { display: flex; justify-content: flex-end; padding: 16px 20px; border-top: 1px solid var(--color-border); }

.section { display: flex; flex-direction: column; gap: 10px; }
.section h4 { font-size: 14px; font-weight: 600; }
.section-desc { font-size: 12px; color: var(--color-text-secondary); }

.divider { height: 1px; background: var(--color-border); }

.import-area { display: flex; flex-direction: column; gap: 6px; }
.msg { padding: 8px 12px; border-radius: var(--radius-sm); font-size: 13px; }
.msg.error { background: #fef0f0; color: var(--color-danger); }
.msg.success { background: #e8fdf3; color: var(--color-success); }
</style>
