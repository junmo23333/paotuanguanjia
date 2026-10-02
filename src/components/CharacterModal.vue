<script setup lang="ts">
import { ref } from 'vue'
import { useCampaignStore } from '../stores/campaign'

defineProps<{ mode: 'create' }>()
const emit = defineEmits<{ close: [] }>()

const store = useCampaignStore()
const form = ref({
  name: '',
  rule_system: store.currentCampaign?.rule_system || '',
  icon: '',
  description: '',
})
const submitting = ref(false)

async function submit() {
  if (!form.value.name.trim()) return
  submitting.value = true
  try {
    const char = await store.createCharacter(
      form.value.name.trim(),
      form.value.rule_system.trim(),
      form.value.icon.trim() || undefined,
      form.value.description.trim()
    )
    store.selectCharacter(char.id)
    emit('close')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="modal card">
      <div class="modal-header">
        <h3>新建角色</h3>
        <button class="btn btn-ghost btn-icon" @click="emit('close')">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-row">
          <label>角色名称 *</label>
          <input class="input" v-model="form.name" placeholder="角色名字" maxlength="50">
        </div>
        <div class="form-row">
          <label>规则系统</label>
          <input class="input" v-model="form.rule_system" placeholder="留空则继承战役规则">
        </div>
        <div class="form-row">
          <label>图标</label>
          <div class="icon-picker">
            <input class="input" v-model="form.icon" placeholder="留空为默认 👤" maxlength="2">
            <span class="icon-preview">{{ form.icon || '👤' }}</span>
          </div>
        </div>
        <div class="form-row">
          <label>描述</label>
          <textarea class="input textarea" v-model="form.description" placeholder="角色背景简介..."></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" @click="emit('close')">取消</button>
        <button class="btn btn-primary" @click="submit" :disabled="!form.name || submitting">
          {{ submitting ? '创建中...' : '创建角色' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { width: 440px; max-width: 95vw; }
.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 20px; border-bottom: 1px solid var(--color-border); }
.modal-header h3 { font-size: 15px; font-weight: 600; }
.modal-body { padding: 20px; display: flex; flex-direction: column; gap: 14px; }
.modal-footer { display: flex; justify-content: flex-end; gap: 8px; padding: 16px 20px; border-top: 1px solid var(--color-border); }
.form-row { display: flex; flex-direction: column; gap: 6px; }
.form-row label { font-size: 12px; font-weight: 600; color: var(--color-text-secondary); }
.icon-picker { display: flex; align-items: center; gap: 10px; }
.icon-preview { font-size: 24px; }
</style>
