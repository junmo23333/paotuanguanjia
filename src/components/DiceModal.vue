<script setup lang="ts">
import { ref } from 'vue'
import { useCampaignStore } from '../stores/campaign'

const emit = defineEmits<{ close: [] }>()
const store = useCampaignStore()

const notation = ref('1d20')
const result = ref<number[]>([])
const errorMsg = ref('')
const rolling = ref(false)

const presets = ['1d4', '1d6', '1d8', '1d10', '1d12', '1d20', '2d6', '1d100']

async function roll(n?: string) {
  if (n) notation.value = n
  if (!notation.value.trim()) return
  rolling.value = true
  errorMsg.value = ''
  result.value = []
  try {
    result.value = await store.rollDice(notation.value)
  } catch (e: any) {
    errorMsg.value = e.toString()
  } finally {
    rolling.value = false
  }
}
</script>

<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="modal card">
      <div class="modal-header">
        <h3>🎲 骰点</h3>
        <button class="btn btn-ghost btn-icon" @click="emit('close')">✕</button>
      </div>

      <div class="modal-body">
        <!-- 快捷按钮 -->
        <div class="presets">
          <button
            v-for="p in presets"
            :key="p"
            class="preset-btn"
            :class="{ active: notation === p }"
            @click="roll(p)"
          >{{ p }}</button>
        </div>

        <!-- 输入框 -->
        <div class="roll-input-row">
          <input
            class="input"
            v-model="notation"
            placeholder="输入骰子，如 2d6+3, 1d20-2"
            @keyup.enter="roll()"
          >
          <button class="btn btn-primary" @click="roll()" :disabled="rolling">
            {{ rolling ? '...' : '投掷' }}
          </button>
        </div>

        <!-- 结果 -->
        <div v-if="errorMsg" class="error-msg">{{ errorMsg }}</div>

        <div v-if="result.length > 0" class="result-area">
          <div class="result-main">
            {{ result[0] }}
          </div>
          <div v-if="result.length > 1" class="result-detail">
            各骰结果: {{ result.join(', ') }}
          </div>
        </div>

        <!-- 说明 -->
        <div class="hint">
          支持格式：<code>2d6+3</code> <code>1d20-2</code> <code>d100</code> <code>4d8</code> <code>2d6,1d20</code>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { width: 420px; max-width: 95vw; }
.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 20px; border-bottom: 1px solid var(--color-border); }
.modal-header h3 { font-size: 15px; font-weight: 600; }
.modal-body { padding: 20px; display: flex; flex-direction: column; gap: 16px; }

.presets { display: flex; flex-wrap: wrap; gap: 6px; }
.preset-btn {
  padding: 6px 12px;
  border: 1px solid var(--color-border);
  border-radius: 20px;
  background: var(--color-surface);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  font-family: monospace;
}
.preset-btn:hover, .preset-btn.active { border-color: var(--color-primary); background: #eef0ff; color: var(--color-primary); }

.roll-input-row { display: flex; gap: 8px; }

.error-msg { color: var(--color-danger); font-size: 13px; }

.result-area { text-align: center; padding: 20px; background: linear-gradient(135deg, #4f6ef7, #6c8ff8); border-radius: var(--radius-md); color: #fff; }
.result-main { font-size: 56px; font-weight: 900; line-height: 1; }
.result-detail { font-size: 12px; opacity: 0.8; margin-top: 8px; }

.hint { font-size: 11px; color: var(--color-text-muted); display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
.hint code { background: var(--color-bg); padding: 1px 5px; border-radius: 3px; font-family: monospace; }
</style>
