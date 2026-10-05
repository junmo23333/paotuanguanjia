import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Campaign, CampaignSummary, Character, Currency, LedgerEntry, Item, AppConfig, LedgerSummary, Warehouse } from '../types'
import * as db from '../db'
import { useCloudStore } from './cloud'

// ─── 工具函数 ────────────────────────────────────────────────────────────────
function generateId(): string {
  return crypto.randomUUID()
}

function now(): string {
  return new Date().toISOString()
}

// ─── Store ───────────────────────────────────────────────────────────────────
export const useCampaignStore = defineStore('campaign', () => {
  // 状态
  const campaigns = ref<CampaignSummary[]>([])
  const currentCampaign = ref<Campaign | null>(null)
  const currentCharacter = ref<Character | null>(null)
  const config = ref<AppConfig>({ recent_campaign_ids: [] })
  const loading = ref(false)
  const error = ref('')

  // 计算属性
  const hasRecentCampaign = computed(() => !!config.value.last_campaign_id)

  // ─── 配置 ───────────────────────────────────────────────────────────────
  async function loadConfig() {
    try {
      const saved = await db.loadConfig<AppConfig>('app-config')
      if (saved) config.value = saved
    } catch (e) {
      console.error('loadConfig error:', e)
    }
  }

  async function saveConfig() {
    try {
      await db.saveConfig('app-config', config.value)
    } catch (e) {
      console.error('saveConfig error:', e)
    }
  }

  async function setRecentCampaign(campaignId: string, characterId?: string) {
    config.value.last_campaign_id = campaignId
    config.value.last_character_id = characterId ?? undefined
    config.value.recent_campaign_ids = [
      campaignId,
      ...config.value.recent_campaign_ids.filter(id => id !== campaignId)
    ].slice(0, 5)
    await saveConfig()
  }

  // ─── 战役 ───────────────────────────────────────────────────────────────
  async function loadCampaignList() {
    loading.value = true
    error.value = ''
    try {
      const list = await db.listCampaigns()
      campaigns.value = list.map(c => ({
        id: c.id,
        name: c.name,
        icon: c.icon,
        rule_system: c.rule_system,
        description: c.description,
        character_count: c.characters.length,
        updated_at: c.updated_at,
        created_at: c.created_at,
      }))
    } catch (e: any) {
      error.value = e.toString()
    } finally {
      loading.value = false
    }
  }

  // 仓库冲突检测
  const warehouseBaseline = ref<string>('')
  const warehouseConflict = ref<{ local: Warehouse; cloud: Campaign } | null>(null)

  async function loadCampaign(id: string) {
    loading.value = true
    error.value = ''
    try {
      currentCampaign.value = await db.loadCampaign(id)
      await setRecentCampaign(id)
      warehouseBaseline.value = JSON.stringify(currentCampaign.value?.warehouse ?? {})
    } catch (e: any) {
      error.value = e.toString()
    } finally {
      loading.value = false
    }
  }

  async function createCampaign(name: string, ruleSystem: string, icon?: string, description = '') {
    const id = generateId()
    const goldId = generateId()
    const xpId = generateId()
    const campaign: Campaign = {
      id,
      name,
      icon: icon || '🎴',
      rule_system: ruleSystem,
      description,
      currencies: [
        { id: goldId, name: '金币', symbol: 'GP', exchange_rate: 1, kind: 'currency' },
        { id: xpId, name: '经验', symbol: 'XP', exchange_rate: 1, kind: 'experience' },
      ],
      base_currency: goldId,
      characters: [],
      warehouse: { name: '团队仓库', description: '', currencies: [], items: [] },
      created_at: now(),
      updated_at: now(),
    }
    await db.saveCampaign(campaign)
    await loadCampaignList()
    return campaign
  }

  async function updateCampaign(campaign: Campaign) {
    campaign.updated_at = now()
    await db.saveCampaign(campaign)
    await loadCampaignList()
    if (currentCampaign.value?.id === campaign.id) {
      currentCampaign.value = campaign
    }
  }

  async function deleteCampaign(id: string) {
    await db.deleteCampaign(id)
    if (currentCampaign.value?.id === id) {
      currentCampaign.value = null
      currentCharacter.value = null
    }
    await loadCampaignList()
  }

  // ─── 角色 ───────────────────────────────────────────────────────────────
  async function createCharacter(name: string, ruleSystem: string, icon?: string, description = '') {
    if (!currentCampaign.value) throw new Error('未选中战役')
    const id = generateId()
    const character: Character = {
      id,
      name,
      icon: icon || '👤',
      description,
      rule_system: ruleSystem,
      inventory: [],
      ledger: [],
      created_at: now(),
      updated_at: now(),
    }
    currentCampaign.value.characters.push(character)
    currentCampaign.value.updated_at = now()
    await db.saveCampaign(currentCampaign.value)
    return character
  }

  async function selectCharacter(charId: string) {
    if (!currentCampaign.value) return
    currentCharacter.value = currentCampaign.value.characters.find(c => c.id === charId) || null
    if (currentCharacter.value) {
      await setRecentCampaign(currentCampaign.value.id, charId)
    }
  }

  async function updateCharacter(character: Character) {
    if (!currentCampaign.value) throw new Error('未选中战役')
    const campaignId = currentCampaign.value.id
    character.updated_at = now()
    currentCampaign.value = await db.updateCharacter(campaignId, character)
    if (currentCharacter.value?.id === character.id) {
      currentCharacter.value = currentCampaign.value.characters.find(c => c.id === character.id) ?? null
    }
    // 联网：自动 push 角色
    const cloud = useCloudStore()
    if (cloud.connected && (cloud.isGM || cloud.myCharacterId === character.id)) {
      cloud.pushCharacter(character).catch(console.error)
    }
  }

  async function deleteCharacter(charId: string) {
    if (!currentCampaign.value) throw new Error('未选中战役')
    const campaignId = currentCampaign.value.id
    currentCampaign.value = await db.deleteCharacter(campaignId, charId)
    if (currentCharacter.value?.id === charId) currentCharacter.value = null
  }

  // ─── 货币（战役级） ───────────────────────────────────────────────────────────────
  function addCurrency(currency: Omit<Currency, 'id'>) {
    if (!currentCampaign.value) return
    currentCampaign.value.currencies.push({ ...currency, id: generateId() })
    saveCurrentCampaign()
  }

  function removeCurrency(currencyId: string) {
    if (!currentCampaign.value) return
    currentCampaign.value.currencies = currentCampaign.value.currencies.filter(c => c.id !== currencyId)
    if (currentCampaign.value.base_currency === currencyId && currentCampaign.value.currencies.length > 0) {
      currentCampaign.value.base_currency = currentCampaign.value.currencies[0].id
    }
    saveCurrentCampaign()
  }

  function updateCurrency(currency: Currency) {
    if (!currentCampaign.value) return
    const idx = currentCampaign.value.currencies.findIndex(c => c.id === currency.id)
    if (idx !== -1) {
      currentCampaign.value.currencies[idx] = currency
      saveCurrentCampaign()
    }
  }

  async function saveCurrentCampaign() {
    if (!currentCampaign.value) return
    await db.saveCampaign(currentCampaign.value)
    // 联网模式下自动推送
    const cloud = useCloudStore()
    if (cloud.connected) {
      cloud.pushMeta(currentCampaign.value).catch(console.error)
      if (cloud.isGM) {
        cloud.pushWarehouse(currentCampaign.value.warehouse).catch(console.error)
      }
    }
  }

  // ─── 账本 ───────────────────────────────────────────────────────────────
  function addLedgerEntry(charId: string, entry: Omit<LedgerEntry, 'id' | 'timestamp'>) {
    if (!currentCampaign.value) return
    const campaignId = currentCampaign.value.id
    db.addLedgerEntry(campaignId, charId, entry).then(updated => {
      currentCampaign.value = updated
      if (currentCharacter.value?.id === charId) {
        currentCharacter.value = updated.characters.find(c => c.id === charId) ?? null
      }
      // 联网自动 push
      const cloud = useCloudStore()
      if (cloud.connected && (cloud.isGM || cloud.myCharacterId === charId)) {
        const ch = updated.characters.find(c => c.id === charId)
        if (ch) cloud.pushCharacter(ch).catch(console.error)
      }
    }).catch(console.error)
  }

  function removeLedgerEntry(charId: string, entryId: string) {
    if (!currentCampaign.value) return
    const campaignId = currentCampaign.value.id
    db.removeLedgerEntry(campaignId, charId, entryId).then(updated => {
      currentCampaign.value = updated
      if (currentCharacter.value?.id === charId) {
        currentCharacter.value = updated.characters.find(c => c.id === charId) ?? null
      }
      const cloud = useCloudStore()
      if (cloud.connected && (cloud.isGM || cloud.myCharacterId === charId)) {
        const ch = updated.characters.find(c => c.id === charId)
        if (ch) cloud.pushCharacter(ch).catch(console.error)
      }
    }).catch(console.error)
  }

  async function getAllLedgerEntries(campaignId: string) {
    const raw = await db.getAllLedgerEntries(campaignId)
    return raw.map(r => r.entries).flat()
  }

  async function getLedgerSummary(
    campaignId: string,
    characterId: string | null,
    startDay: number,
    endDay: number,
  ): Promise<LedgerSummary> {
    return await db.getLedgerSummary(campaignId, characterId, startDay, endDay)
  }

  // ─── 背包 ───────────────────────────────────────────────────────────────
  function addItem(charId: string, item: Omit<Item, 'id' | 'total_price'>) {
    if (!currentCampaign.value) return
    const campaignId = currentCampaign.value.id
    db.addItem(campaignId, charId, item).then(updated => {
      currentCampaign.value = updated
      if (currentCharacter.value?.id === charId) {
        currentCharacter.value = updated.characters.find(c => c.id === charId) ?? null
      }
      const cloud = useCloudStore()
      if (cloud.connected && (cloud.isGM || cloud.myCharacterId === charId)) {
        const ch = updated.characters.find(c => c.id === charId)
        if (ch) cloud.pushCharacter(ch).catch(console.error)
      }
    }).catch(console.error)
  }

  function updateItem(charId: string, item: Item) {
    if (!currentCampaign.value) return
    const campaignId = currentCampaign.value.id
    db.updateItem(campaignId, charId, item).then(updated => {
      currentCampaign.value = updated
      if (currentCharacter.value?.id === charId) {
        currentCharacter.value = updated.characters.find(c => c.id === charId) ?? null
      }
      const cloud = useCloudStore()
      if (cloud.connected && (cloud.isGM || cloud.myCharacterId === charId)) {
        const ch = updated.characters.find(c => c.id === charId)
        if (ch) cloud.pushCharacter(ch).catch(console.error)
      }
    }).catch(console.error)
  }

  function removeItem(charId: string, itemId: string) {
    if (!currentCampaign.value) return
    const campaignId = currentCampaign.value.id
    db.removeItem(campaignId, charId, itemId).then(updated => {
      currentCampaign.value = updated
      if (currentCharacter.value?.id === charId) {
        currentCharacter.value = updated.characters.find(c => c.id === charId) ?? null
      }
      const cloud = useCloudStore()
      if (cloud.connected && (cloud.isGM || cloud.myCharacterId === charId)) {
        const ch = updated.characters.find(c => c.id === charId)
        if (ch) cloud.pushCharacter(ch).catch(console.error)
      }
    }).catch(console.error)
  }

  // ─── 导入导出 ───────────────────────────────────────────────────────────
  async function exportCampaign(id: string): Promise<string> {
    const campaign = await db.loadCampaign(id)
    return JSON.stringify(campaign, null, 2)
  }

  async function importCampaign(jsonData: string) {
    const parsed = JSON.parse(jsonData) as Campaign
    parsed.id = generateId()
    parsed.created_at = now()
    parsed.updated_at = now()
    parsed.name = `${parsed.name} (导入)`
    // 重编角色 ID
    for (const ch of parsed.characters) {
      ch.id = generateId()
    }
    await db.saveCampaign(parsed)
    await loadCampaignList()
    return parsed
  }

  // ── 导出到文件（浏览器下载）─────────────────────────────────────────────────
  async function exportAllCampaignsToFile(campaignIds?: string[]) {
    const ids = campaignIds && campaignIds.length > 0
      ? campaignIds
      : campaigns.value.map(c => c.id)
    if (ids.length === 0) throw new Error('没有可导出的战役')

    const data: Campaign[] = []
    for (const id of ids) {
      const campaign = await db.loadCampaign(id)
      data.push(campaign)
    }
    const content = JSON.stringify(data, null, 2)
    const dateStr = new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')
    db.downloadJson(content, `跑团管家_备份_${dateStr}.json`)
  }

  // ── 导入文件（浏览器上传）─────────────────────────────────────────────────
  async function importFromFile() {
    const campaign = await db.importFromFile()
    if (campaign) await loadCampaignList()
    return campaign
  }

  // ── 仓库 / 转移 ────────────────────────────────────────────────────────────────
  async function updateWarehouse(name: string, description: string) {
    if (!currentCampaign.value) return
    const campaignId = currentCampaign.value.id
    currentCampaign.value = await db.updateWarehouseMetadata(campaignId, name, description)
    await saveCurrentCampaign()
  }

  async function addWarehouseItem(item: Omit<Item, 'id' | 'total_price'>) {
    if (!currentCampaign.value) return
    const campaignId = currentCampaign.value.id
    currentCampaign.value = await db.addWarehouseItem(campaignId, item)
    await saveCurrentCampaign()
  }

  async function updateWarehouseItem(item: Item) {
    if (!currentCampaign.value) return
    const campaignId = currentCampaign.value.id
    currentCampaign.value = await db.updateWarehouseItem(campaignId, item)
    await saveCurrentCampaign()
  }

  async function deleteWarehouseItem(itemId: string) {
    if (!currentCampaign.value) return
    const campaignId = currentCampaign.value.id
    currentCampaign.value = await db.deleteWarehouseItem(campaignId, itemId)
    await saveCurrentCampaign()
  }

  async function transferCurrency(
    fromKind: 'character' | 'warehouse',
    fromId: string,
    toKind: 'character' | 'warehouse',
    toId: string,
    currencyId: string,
    amount: number,
    reason: string,
    day: number,
  ) {
    if (!currentCampaign.value) return
    const campaignId = currentCampaign.value.id
    currentCampaign.value = await db.transferCurrency(
      campaignId, fromKind, fromId, toKind, toId, currencyId, amount, reason, day,
    )
    if (currentCharacter.value) {
      const updated = currentCampaign.value.characters.find(c => c.id === currentCharacter.value!.id)
      if (updated) currentCharacter.value = updated
    }
    // 联网推送
    const cloud = useCloudStore()
    if (cloud.connected && currentCampaign.value) {
      if (fromKind === 'character') {
        const ch = currentCampaign.value.characters.find(c => c.id === fromId)
        if (ch && (cloud.isGM || cloud.myCharacterId === fromId)) {
          cloud.pushCharacter(ch).catch(console.error)
        }
      }
      if (toKind === 'character') {
        const ch = currentCampaign.value.characters.find(c => c.id === toId)
        if (ch && (cloud.isGM || cloud.myCharacterId === toId)) {
          cloud.pushCharacter(ch).catch(console.error)
        }
      }
      if ((fromKind === 'warehouse' || toKind === 'warehouse') && cloud.isGM) {
        cloud.pushWarehouse(currentCampaign.value.warehouse).catch(console.error)
      }
    }
  }

  async function transferItem(
    fromKind: 'character' | 'warehouse',
    fromId: string,
    toKind: 'character' | 'warehouse',
    toId: string,
    itemId: string,
    quantity: number,
    reason: string,
    day: number,
  ) {
    if (!currentCampaign.value) return
    const campaignId = currentCampaign.value.id
    currentCampaign.value = await db.transferItem(
      campaignId, fromKind, fromId, toKind, toId, itemId, quantity, reason, day,
    )
    if (currentCharacter.value) {
      const updated = currentCampaign.value.characters.find(c => c.id === currentCharacter.value!.id)
      if (updated) currentCharacter.value = updated
    }
    // 联网推送
    const cloud = useCloudStore()
    if (cloud.connected && currentCampaign.value) {
      if (fromKind === 'character') {
        const ch = currentCampaign.value.characters.find(c => c.id === fromId)
        if (ch && (cloud.isGM || cloud.myCharacterId === fromId)) {
          cloud.pushCharacter(ch).catch(console.error)
        }
      }
      if (toKind === 'character') {
        const ch = currentCampaign.value.characters.find(c => c.id === toId)
        if (ch && (cloud.isGM || cloud.myCharacterId === toId)) {
          cloud.pushCharacter(ch).catch(console.error)
        }
      }
      if ((fromKind === 'warehouse' || toKind === 'warehouse') && cloud.isGM) {
        cloud.pushWarehouse(currentCampaign.value.warehouse).catch(console.error)
      }
    }
  }

  // ─── 货币兑换 ────────────────────────────────────────────────────────────────
  async function exchangeCurrency(
    kind: 'character' | 'warehouse',
    ownerId: string,
    fromCurrencyId: string,
    toCurrencyId: string,
    amount: number,
    day: number,
  ) {
    if (!currentCampaign.value) return
    const campaignId = currentCampaign.value.id
    currentCampaign.value = await db.exchangeCurrency(
      campaignId, kind, ownerId, fromCurrencyId, toCurrencyId, amount, day,
    )
    if (kind === 'character' && currentCharacter.value) {
      const updated = currentCampaign.value.characters.find(c => c.id === currentCharacter.value!.id)
      if (updated) currentCharacter.value = updated
    }
    await saveCurrentCampaign()
  }

  // ─── GM 仓库货币调整 ───────────────────────────────────────────────────────────
  async function adjustWarehouseCurrency(
    currencyId: string,
    amount: number,
    action: 'add' | 'subtract',
    reason: string,
    day: number,
  ) {
    if (!currentCampaign.value) return
    const campaignId = currentCampaign.value.id
    currentCampaign.value = await db.adjustWarehouseCurrency(
      campaignId, currencyId, amount, action, reason, day,
    )
    await saveCurrentCampaign()
  }

  // ─── 骰子（纯前端实现）──────────────────────────────────────────────────────
  function rollDice(notation: string): number[] {
    // 格式：NdM[±N]，如 2d6+3，1d20-1，d6
    const results: number[] = []
    const normalized = notation.replace(/\s/g, '')
    const patterns = normalized.split(/(?=[+-])/)
    for (const p of patterns) {
      const match = p.match(/^([+-]?)(\d*)d(\d+)([+-]\d+)?$/)
      if (!match) continue
      const sign = match[1] === '-' ? -1 : 1
      const count = parseInt(match[2] || '1', 10)
      const sides = parseInt(match[3], 10)
      const bonus = parseInt(match[4] || '0', 10)
      for (let i = 0; i < count; i++) {
        const roll = Math.floor(Math.random() * sides) + 1
        results.push(sign * roll + bonus)
      }
    }
    return results
  }

  // ─── 联网同步 ─────────────────────────────────────────────────────────────
  async function syncFromCloud() {
    const cloud = useCloudStore()
    if (!cloud.connected || !currentCampaign.value) return
    const myId = cloud.myCharacterId
    if (myId) {
      const mine = currentCampaign.value.characters.find(c => c.id === myId)
      if (mine) await cloud.pushCharacter(mine)
    }
    const campaign = await cloud.pullRoom()
    if (!campaign) return
    const localWh = currentCampaign.value.warehouse
    const cloudWh = campaign.warehouse
    const baselineStr = warehouseBaseline.value
    if (baselineStr) {
      const localChanged = JSON.stringify(localWh) !== baselineStr
      const cloudChanged = JSON.stringify(cloudWh) !== baselineStr
      if (localChanged && cloudChanged && JSON.stringify(localWh) !== JSON.stringify(cloudWh)) {
        warehouseConflict.value = { local: localWh, cloud: campaign }
        return
      }
    }
    currentCampaign.value = campaign
    warehouseBaseline.value = JSON.stringify(campaign.warehouse)
  }

  async function resolveWarehouseConflict(mode: 'cloud' | 'local') {
    const conflict = warehouseConflict.value
    if (!conflict) return
    const cloud = useCloudStore()
    if (mode === 'cloud') {
      currentCampaign.value = conflict.cloud
      warehouseBaseline.value = JSON.stringify(conflict.cloud.warehouse)
    } else {
      currentCampaign.value = conflict.cloud
      currentCampaign.value.warehouse = conflict.local
      warehouseBaseline.value = JSON.stringify(conflict.local)
      await cloud.pushWarehouse(conflict.local)
    }
    warehouseConflict.value = null
  }

  return {
    // 状态
    campaigns, currentCampaign, currentCharacter, config, loading, error,
    // 计算属性
    hasRecentCampaign,
    // 配置
    loadConfig, saveConfig, setRecentCampaign,
    // 战役
    loadCampaignList, loadCampaign, createCampaign, updateCampaign, deleteCampaign,
    // 角色
    createCharacter, selectCharacter, updateCharacter, deleteCharacter,
    // 货币
    addCurrency, removeCurrency, updateCurrency,
    // 账本
    addLedgerEntry, removeLedgerEntry, getAllLedgerEntries, getLedgerSummary,
    // 背包
    addItem, updateItem, removeItem,
    // 导入导出
    exportCampaign, importCampaign, exportAllCampaignsToFile, importFromFile,
    // 仓库 / 转移
    updateWarehouse, addWarehouseItem, updateWarehouseItem, deleteWarehouseItem,
    transferCurrency, transferItem, exchangeCurrency, adjustWarehouseCurrency,
    // 骰子
    rollDice,
    // 联网
    syncFromCloud, warehouseConflict, resolveWarehouseConflict,
  }
})
