<script setup lang="ts">
import { ref, computed } from 'vue'
import { useCloudStore } from '../stores/cloud'
import { useCampaignStore } from '../stores/campaign'

const emit = defineEmits<{ close: [] }>()

const cloud = useCloudStore()
const store = useCampaignStore()

// 可选接收方：房间内角色，排除自己
const recipients = computed(() =>
  (cloud.roomIndex?.characters ?? []).filter(c => c.id !== cloud.myCharacterId)
)

const currencies = computed(() => store.currentCampaign?.currencies ?? [])

const toCharId = ref('')
const note = ref('')
const gives = ref<{ type: 'item' | 'currency'; name: string; quantity: number }[]>([])

const canSubmit = computed(() => !!toCharId.value && gives.value.length > 0 &&
  gives.value.every(g => g.name.trim() && g.quantity > 0))

function addItem() {
  gives.value.push({ type: 'item', name: '', quantity: 1 })
}
function addCurrency() {
  const first = currencies.value[0]
  gives.value.push({ type: 'currency', name: first?.name ?? '', quantity: 1 })
}
function removeGive(i: number) {
  gives.value.splice(i, 1)
}

async function submit() {
  if (!canSubmit.value) return
  try {
    await cloud.submitGift(
      toCharId.value,
      gives.value.map(g => ({ type: g.type, name: g.name.trim(), quantity: Number(g.quantity) })),
      note.value.trim() || undefined
    )
    emit('close')
  } catch (e: any) {
    alert(`发送失败: ${e.message || e}`)
  }
}
</script>

<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="modal">
      <div class="modal-header">
        <h3>🎁 发起赠予</h3>
        <button class="btn btn-ghost btn-icon" @click="emit('close')">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-row">
          <label>赠予给</label>
          <select class="input" v-model="toCharId">
            <option value="">选择接收方…</option>
            <option v-for="r in recipients" :key="r.id" :value="r.id">{{ r.name }}</option>
          </select>
        </div>

        <div class="gives-list">
          <div v-for="(g, i) in gives" :key="i" class="give-row">
            <select class="input give-type" v-model="g.type">
              <option value="item">物品</option>
              <option value="currency">货币</option>
            </select>
            <input v-if="g.type === 'item'" class="input give-name" v-model="g.name" placeholder="物品名称">
            <select v-else class="input give-name" v-model="g.name">
              <option v-for="c in currencies" :key="c.id" :value="c.name">{{ c.name }}</option>
            </select>
            <input class="input give-qty" type="number" min="1" v-model.number="g.quantity">
            <button class="btn btn-ghost btn-icon btn-sm" title="移除" @click="removeGive(i)">✕</button>
          </div>
          <p v-if="gives.length === 0" class="muted">尚未添加赠予内容</p>
        </div>

        <div class="give-actions">
          <button class="btn btn-secondary btn-sm" @click="addItem">+ 物品</button>
          <button class="btn btn-secondary btn-sm" @click="addCurrency">+ 货币</button>
        </div>

        <div class="form-row">
          <label>备注（可选）</label>
          <input class="input" v-model="note" placeholder="说明用途…">
        </div>
        <p class="hint">赠予需接收方在「收件箱」确认后才到账；拒绝则原物返回，你的库存不受影响。</p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" @click="emit('close')">取消</button>
        <button class="btn btn-primary" :disabled="!canSubmit" @click="submit">发送赠予</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal { width: 540px; max-width: 95vw; }
.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 20px; border-bottom: 1px solid var(--color-border); }
.modal-header h3 { font-size: 15px; font-weight: 600; }
.modal-body { padding: 20px; display: flex; flex-direction: column; gap: 16px; }
.modal-footer { display: flex; justify-content: flex-end; gap: 8px; padding: 16px 20px; border-top: 1px solid var(--color-border); }
.form-row { display: flex; flex-direction: column; gap: 6px; }
.form-row label { font-size: 12px; color: var(--color-text-secondary); }
.gives-list { display: flex; flex-direction: column; gap: 8px; }
.give-row { display: flex; gap: 8px; align-items: center; }
.give-type { width: 90px; flex-shrink: 0; }
.give-name { flex: 1; }
.give-qty { width: 80px; flex-shrink: 0; }
.give-actions { display: flex; gap: 8px; }
.muted { color: var(--color-text-muted); font-size: 12px; }
.hint { color: var(--color-text-muted); font-size: 12px; line-height: 1.5; }
</style>