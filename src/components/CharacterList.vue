<script setup lang="ts">
import { ref } from 'vue'
import { useCampaignStore } from '../stores/campaign'
import type { Character } from '../types'

defineProps<{
  characters: Character[]
  activeId: string | null
}>()

const emit = defineEmits<{
  select: [id: string]
  delete: [id: string]
}>()

const store = useCampaignStore()
const confirmDelete = ref<string | null>(null)

function getBalance(char: Character): string {
  if (char.ledger.length === 0) return '—'
  const campaign = store.currentCampaign
  if (!campaign || campaign.currencies.length === 0) return '—'
  const base = campaign.currencies.find(c => c.id === campaign.base_currency) ?? campaign.currencies[0]
  const rate = base?.exchange_rate || 1
  let total = 0
  for (const entry of char.ledger) {
    const cur = campaign.currencies.find(c => c.id === entry.currency_id)
    if (!cur) continue
    const curRate = cur.exchange_rate || 1
    total += (entry.entry_type === 'income' ? 1 : -1) * entry.amount * (curRate / rate)
  }
  return `${total >= 0 ? '+' : ''}${total.toFixed(2)} ${base?.symbol || ''}`
}

async function deleteChar(id: string) {
  await store.deleteCharacter(id)
  confirmDelete.value = null
  emit('delete', id)
}
</script>

<template>
  <div class="character-list">
    <div v-if="characters.length === 0" class="empty-state" style="padding: 32px 16px;">
      <div class="empty-icon" style="font-size:32px">👤</div>
      <p>暂无角色</p>
    </div>

    <div
      v-for="char in characters"
      :key="char.id"
      class="char-item"
      :class="{ active: char.id === activeId }"
      @click="emit('select', char.id)"
    >
      <div class="char-item-icon">{{ char.icon || '👤' }}</div>
      <div class="char-item-info">
        <div class="char-item-name">{{ char.name }}</div>
        <div class="char-item-meta">{{ char.rule_system }} · {{ char.ledger.length }}笔记账</div>
        <div class="char-item-balance" :class="getBalance(char).startsWith('+') ? 'amount-income' : getBalance(char).startsWith('-') ? 'amount-expense' : ''">
          {{ getBalance(char) }}
        </div>
      </div>
      <div class="char-item-actions" @click.stop>
        <button
          v-if="confirmDelete !== char.id"
          class="btn btn-ghost btn-icon btn-sm"
          title="删除角色"
          @click="confirmDelete = char.id"
        >🗑</button>
        <div v-else class="confirm-delete">
          <button class="btn btn-danger btn-sm" @click="deleteChar(char.id)">确认</button>
          <button class="btn btn-ghost btn-sm" @click="confirmDelete = null">取消</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.character-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.char-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background 0.12s;
  position: relative;
}
.char-item:hover { background: var(--color-bg); }
.char-item.active { background: #eef0ff; }

.char-item-icon { font-size: 24px; flex-shrink: 0; }
.char-item-info { flex: 1; min-width: 0; }
.char-item-name { font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.char-item-meta { font-size: 11px; color: var(--color-text-muted); }
.char-item-balance { font-size: 11px; font-weight: 600; margin-top: 2px; }

.char-item-actions { flex-shrink: 0; }

.confirm-delete { display: flex; gap: 4px; }
</style>
