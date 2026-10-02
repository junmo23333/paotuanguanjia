/**
 * 跑团管家 - Web 版数据层
 * 基于 IndexedDB（Dexie.js），替代原 Rust 后端 22 个命令
 * 类型统一从 ../types 导入，避免与 stores/types 重复定义
 */
import Dexie, { type Table } from 'dexie'
import type { Campaign, Character, LedgerEntry, Item } from '../types'

// Config 类型用于 Dexie 的 key-value 配置表
interface Config {
  key: string
  value: unknown
}

// ─── Dexie 数据库 ────────────────────────────────────────────────────────────

class TrpgDB extends Dexie {
  campaigns!: Table<Campaign>
  config!: Table<Config>

  constructor() {
    super('TrpgDB')
    this.version(1).stores({
      campaigns: 'id, name, updated_at',
      config: 'key',
    })
  }
}

const db = new TrpgDB()

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

// 与 types/index.ts 保持一致：全部用 ISO 8601 字符串
function now(): string {
  return new Date().toISOString()
}



// ─── Campaign CRUD ────────────────────────────────────────────────────────────

export async function loadCampaign(id: string): Promise<Campaign> {
  const campaign = await db.campaigns.get(id)
  if (!campaign) throw new Error(`战役不存在: ${id}`)
  return campaign
}

export async function saveCampaign(campaign: Campaign): Promise<void> {
  campaign.updated_at = now()
  await db.campaigns.put(campaign)
}

export async function deleteCampaign(id: string): Promise<void> {
  await db.campaigns.delete(id)
}

export async function listCampaigns(): Promise<Campaign[]> {
  return db.campaigns.orderBy('updated_at').reverse().toArray()
}

// ─── Character ────────────────────────────────────────────────────────────────

export async function updateCharacter(
  campaignId: string,
  character: Character,
): Promise<Campaign> {
  const campaign = await loadCampaign(campaignId)
  character.updated_at = now()
  const idx = campaign.characters.findIndex(c => c.id === character.id)
  if (idx === -1) throw new Error(`角色不存在: ${character.id}`)
  campaign.characters[idx] = character
  await saveCampaign(campaign)
  return campaign
}

export async function deleteCharacter(
  campaignId: string,
  characterId: string,
): Promise<Campaign> {
  const campaign = await loadCampaign(campaignId)
  campaign.characters = campaign.characters.filter(c => c.id !== characterId)
  await saveCampaign(campaign)
  return campaign
}

// ─── Ledger ───────────────────────────────────────────────────────────────────

export async function addLedgerEntry(
  campaignId: string,
  characterId: string,
  entry: Omit<LedgerEntry, 'id' | 'timestamp'>,
): Promise<Campaign> {
  const campaign = await loadCampaign(campaignId)
  const character = campaign.characters.find(c => c.id === characterId)
  if (!character) throw new Error(`角色不存在: ${characterId}`)
  character.ledger.unshift({
    ...entry,
    day: entry.day ?? 1,
    id: generateId(),
    timestamp: now(),
  })
  character.updated_at = now()
  await saveCampaign(campaign)
  return campaign
}

export async function removeLedgerEntry(
  campaignId: string,
  characterId: string,
  entryId: string,
): Promise<Campaign> {
  const campaign = await loadCampaign(campaignId)
  const character = campaign.characters.find(c => c.id === characterId)
  if (!character) throw new Error(`角色不存在: ${characterId}`)
  character.ledger = character.ledger.filter(e => e.id !== entryId)
  character.updated_at = now()
  await saveCampaign(campaign)
  return campaign
}

export async function getAllLedgerEntries(
  campaignId: string,
): Promise<{ characterId: string; entries: LedgerEntry[] }[]> {
  const campaign = await loadCampaign(campaignId)
  return campaign.characters.map(c => ({
    characterId: c.id,
    entries: [...c.ledger],
  }))
}

export async function getLedgerSummary(
  campaignId: string,
  characterId: string | null,
  startDay: number,
  endDay: number,
): Promise<{
  start_day: number
  end_day: number
  entry_count: number
  total_income_by_currency: Record<string, number>
  total_expense_by_currency: Record<string, number>
  transfer_in_by_currency: Record<string, number>
  transfer_out_by_currency: Record<string, number>
}> {
  const campaign = await loadCampaign(campaignId)

  const characters = characterId
    ? campaign.characters.filter(c => c.id === characterId)
    : campaign.characters

  const result = {
    start_day: startDay,
    end_day: endDay,
    entry_count: 0,
    total_income_by_currency: {} as Record<string, number>,
    total_expense_by_currency: {} as Record<string, number>,
    transfer_in_by_currency: {} as Record<string, number>,
    transfer_out_by_currency: {} as Record<string, number>,
  }

  for (const character of characters) {
    for (const entry of character.ledger) {
      if (entry.day < startDay || entry.day > endDay) continue
      result.entry_count++
      if (entry.entry_type === 'income') {
        result.total_income_by_currency[entry.currency_id] =
          (result.total_income_by_currency[entry.currency_id] ?? 0) + entry.amount
        if (entry.reason?.includes('转账收入') || entry.reason?.includes('转移')) {
          result.transfer_in_by_currency[entry.currency_id] =
            (result.transfer_in_by_currency[entry.currency_id] ?? 0) + entry.amount
        }
      } else if (entry.entry_type === 'expense') {
        result.total_expense_by_currency[entry.currency_id] =
          (result.total_expense_by_currency[entry.currency_id] ?? 0) + entry.amount
        if (entry.reason?.includes('转账支出') || entry.reason?.includes('转移')) {
          result.transfer_out_by_currency[entry.currency_id] =
            (result.transfer_out_by_currency[entry.currency_id] ?? 0) + entry.amount
        }
      }
    }
  }

  return result
}

// ─── Inventory ───────────────────────────────────────────────────────────────

export async function addItem(
  campaignId: string,
  characterId: string,
  item: Omit<Item, 'id' | 'total_price'>,
): Promise<Campaign> {
  const campaign = await loadCampaign(campaignId)
  const character = campaign.characters.find(c => c.id === characterId)
  if (!character) throw new Error(`角色不存在: ${characterId}`)
  const fullItem: Item = {
    ...item,
    id: generateId(),
    total_price: item.unit_price * item.quantity,
  }
  character.inventory.push(fullItem)
  character.updated_at = now()
  await saveCampaign(campaign)
  return campaign
}

export async function updateItem(
  campaignId: string,
  characterId: string,
  item: Item,
): Promise<Campaign> {
  const campaign = await loadCampaign(campaignId)
  const character = campaign.characters.find(c => c.id === characterId)
  if (!character) throw new Error(`角色不存在: ${characterId}`)
  item.total_price = item.unit_price * item.quantity
  const idx = character.inventory.findIndex(i => i.id === item.id)
  if (idx === -1) throw new Error(`物品不存在: ${item.id}`)
  character.inventory[idx] = item
  character.updated_at = now()
  await saveCampaign(campaign)
  return campaign
}

export async function removeItem(
  campaignId: string,
  characterId: string,
  itemId: string,
): Promise<Campaign> {
  const campaign = await loadCampaign(campaignId)
  const character = campaign.characters.find(c => c.id === characterId)
  if (!character) throw new Error(`角色不存在: ${characterId}`)
  character.inventory = character.inventory.filter(i => i.id !== itemId)
  character.updated_at = now()
  await saveCampaign(campaign)
  return campaign
}

// ─── Warehouse ────────────────────────────────────────────────────────────────

export async function updateWarehouseMetadata(
  campaignId: string,
  name: string,
  description: string,
): Promise<Campaign> {
  const campaign = await loadCampaign(campaignId)
  campaign.warehouse.name = name
  campaign.warehouse.description = description
  await saveCampaign(campaign)
  return campaign
}

export async function addWarehouseItem(
  campaignId: string,
  item: Omit<Item, 'id' | 'total_price'>,
): Promise<Campaign> {
  const campaign = await loadCampaign(campaignId)
  const fullItem: Item = {
    ...item,
    id: generateId(),
    total_price: item.unit_price * item.quantity,
  }
  campaign.warehouse.items.push(fullItem)
  await saveCampaign(campaign)
  return campaign
}

export async function updateWarehouseItem(
  campaignId: string,
  item: Item,
): Promise<Campaign> {
  const campaign = await loadCampaign(campaignId)
  item.total_price = item.unit_price * item.quantity
  const idx = campaign.warehouse.items.findIndex(i => i.id === item.id)
  if (idx === -1) throw new Error(`仓库物品不存在: ${item.id}`)
  campaign.warehouse.items[idx] = item
  await saveCampaign(campaign)
  return campaign
}

export async function deleteWarehouseItem(
  campaignId: string,
  itemId: string,
): Promise<Campaign> {
  const campaign = await loadCampaign(campaignId)
  campaign.warehouse.items = campaign.warehouse.items.filter(i => i.id !== itemId)
  await saveCampaign(campaign)
  return campaign
}

// ─── 货币转移 ─────────────────────────────────────────────────────────────────

export async function transferCurrency(
  campaignId: string,
  fromKind: 'character' | 'warehouse',
  fromId: string,
  toKind: 'character' | 'warehouse',
  toId: string,
  currencyId: string,
  amount: number,
  reason: string,
  day: number,
): Promise<Campaign> {
  if (amount <= 0) throw new Error('转移金额必须大于 0')
  const campaign = await loadCampaign(campaignId)
  const timestamp = now()

  const deduct = async () => {
    if (fromKind === 'character') {
      const ch = campaign.characters.find(c => c.id === fromId)
      if (!ch) throw new Error(`源角色不存在: ${fromId}`)
      const balance = ch.ledger
        .filter(e => e.currency_id === currencyId)
        .reduce((s, e) => s + (e.entry_type === 'income' ? e.amount : -e.amount), 0)
      if (balance < amount) throw new Error(`余额不足：当前 ${balance}`)
      ch.ledger.unshift({ id: generateId(), currency_id: currencyId, entry_type: 'expense', amount, reason, day, timestamp })
      ch.updated_at = timestamp
    } else {
      const wc = campaign.warehouse.currencies.find(c => c.currency_id === currencyId)
      if (!wc) throw new Error(`仓库货币不存在: ${currencyId}`)
      if (wc.amount < amount) throw new Error(`仓库余额不足：当前 ${wc.amount}`)
      wc.amount -= amount
    }
  }

  const credit = async () => {
    if (toKind === 'character') {
      const ch = campaign.characters.find(c => c.id === toId)
      if (!ch) throw new Error(`目标角色不存在: ${toId}`)
      ch.ledger.unshift({ id: generateId(), currency_id: currencyId, entry_type: 'income', amount, reason, day, timestamp })
      ch.updated_at = timestamp
    } else {
      const wc = campaign.warehouse.currencies.find(c => c.currency_id === currencyId)
      if (wc) {
        wc.amount += amount
      } else {
        campaign.warehouse.currencies.push({ currency_id: currencyId, amount })
      }
    }
  }

  await deduct()
  await credit()
  await saveCampaign(campaign)
  return campaign
}

export async function transferItem(
  campaignId: string,
  fromKind: 'character' | 'warehouse',
  fromId: string,
  toKind: 'character' | 'warehouse',
  toId: string,
  itemId: string,
  quantity: number,
  _reason: string,
  _day: number,
): Promise<Campaign> {
  if (quantity <= 0) throw new Error('转移数量必须大于 0')
  const campaign = await loadCampaign(campaignId)
  const timestamp = now()

  let sourceItem: Item | undefined
  let sourceList: Item[]

  if (fromKind === 'character') {
    const ch = campaign.characters.find(c => c.id === fromId)
    if (!ch) throw new Error(`源角色不存在: ${fromId}`)
    sourceList = ch.inventory
  } else {
    sourceList = campaign.warehouse.items
  }

  sourceItem = sourceList.find(i => i.id === itemId)
  if (!sourceItem) throw new Error(`物品不存在: ${itemId}`)
  if (sourceItem.quantity < quantity) throw new Error(`物品数量不足：当前 ${sourceItem.quantity}`)

  // 扣除源
  sourceItem.quantity -= quantity
  if (sourceItem.quantity === 0) {
    const idx = sourceList.findIndex(i => i.id === itemId)
    sourceList.splice(idx, 1)
  }

  // 增加到目标
  let targetList: Item[]
  if (toKind === 'character') {
    const ch = campaign.characters.find(c => c.id === toId)
    if (!ch) throw new Error(`目标角色不存在: ${toId}`)
    targetList = ch.inventory
    ch.updated_at = timestamp
  } else {
    targetList = campaign.warehouse.items
  }

  const existing = targetList.find(i => i.name === sourceItem!.name && i.unit_price === sourceItem!.unit_price)
  if (existing) {
    existing.quantity += quantity
    existing.total_price = existing.unit_price * existing.quantity
  } else {
    targetList.push({
      id: generateId(),
      name: sourceItem.name,
      quantity,
      unit_price: sourceItem.unit_price,
      total_price: sourceItem.unit_price * quantity,
      weight: sourceItem.weight,
      notes: sourceItem.notes ?? '',
    })
  }

  await saveCampaign(campaign)
  return campaign
}

// ─── 货币兑换 ─────────────────────────────────────────────────────────────────

export async function exchangeCurrency(
  campaignId: string,
  kind: 'character' | 'warehouse',
  ownerId: string,
  fromCurrencyId: string,
  toCurrencyId: string,
  amount: number,
  day: number,
): Promise<Campaign> {
  if (amount <= 0) throw new Error('兑换金额必须大于 0')
  if (fromCurrencyId === toCurrencyId) throw new Error('源和目标不能是同一种货币')

  const campaign = await loadCampaign(campaignId)
  const timestamp = now()

  const fromRate = campaign.currencies.find(c => c.id === fromCurrencyId)?.exchange_rate
  const toRate = campaign.currencies.find(c => c.id === toCurrencyId)?.exchange_rate
  if (!fromRate || !toRate) throw new Error('货币不存在')
  if (fromRate <= 0 || toRate <= 0) throw new Error('货币汇率必须大于 0')

  const ratio = fromRate / toRate
  if (Math.abs(ratio - Math.round(ratio)) > 0.0001) throw new Error('两种货币汇率必须成整数倍')
  const targetAmount = amount * ratio

  if (kind === 'character') {
    const ch = campaign.characters.find(c => c.id === ownerId)
    if (!ch) throw new Error(`角色不存在: ${ownerId}`)
    const balance = ch.ledger
      .filter(e => e.currency_id === fromCurrencyId)
      .reduce((s, e) => s + (e.entry_type === 'income' ? e.amount : -e.amount), 0)
    if (balance < amount) throw new Error(`源货币余额不足：当前 ${balance}`)

    ch.ledger.unshift({ id: generateId(), currency_id: fromCurrencyId, entry_type: 'expense', amount, reason: '货币兑换', day, timestamp })
    ch.ledger.unshift({ id: generateId(), currency_id: toCurrencyId, entry_type: 'income', amount: targetAmount, reason: '货币兑换', day, timestamp })
    ch.updated_at = timestamp
  } else {
    const wcFrom = campaign.warehouse.currencies.find(c => c.currency_id === fromCurrencyId)
    if (!wcFrom) throw new Error(`仓库源货币不存在: ${fromCurrencyId}`)
    if (wcFrom.amount < amount) throw new Error(`仓库源货币余额不足：当前 ${wcFrom.amount}`)

    wcFrom.amount -= amount
    const wcTo = campaign.warehouse.currencies.find(c => c.currency_id === toCurrencyId)
    if (wcTo) {
      wcTo.amount += targetAmount
    } else {
      campaign.warehouse.currencies.push({ currency_id: toCurrencyId, amount: targetAmount })
    }
  }

  await saveCampaign(campaign)
  return campaign
}

// ─── GM 仓库货币调整 ───────────────────────────────────────────────────────────

export async function adjustWarehouseCurrency(
  campaignId: string,
  currencyId: string,
  amount: number,
  action: 'add' | 'subtract',
  _reason: string,
  _day: number,
): Promise<Campaign> {
  if (amount <= 0) throw new Error('金额必须大于 0')

  const campaign = await loadCampaign(campaignId)
  const wc = campaign.warehouse.currencies.find(c => c.currency_id === currencyId)

  if (action === 'add') {
    if (wc) {
      wc.amount += amount
    } else {
      campaign.warehouse.currencies.push({ currency_id: currencyId, amount })
    }
  } else {
    if (!wc) throw new Error('仓库中没有该货币')
    if (wc.amount < amount) throw new Error(`仓库余额不足：当前 ${wc.amount}`)
    wc.amount -= amount
  }

  await saveCampaign(campaign)
  return campaign
}

// ─── 导出 / 导入 ───────────────────────────────────────────────────────────────

export function downloadJson(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function downloadText(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export async function importFromFile(): Promise<Campaign | null> {
  return new Promise(resolve => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) { resolve(null); return }
      try {
        const text = await file.text()
        const campaign: Campaign = JSON.parse(text)
        // 重新生成 ID，避免覆盖本地已有战役
        campaign.id = generateId()
        campaign.name = `${campaign.name} (导入)`
        campaign.created_at = now()
        campaign.updated_at = now()
        // 重编角色 ID
        for (const ch of campaign.characters) {
          ch.id = generateId()
        }
        await db.campaigns.add(campaign)
        resolve(campaign)
      } catch (e) {
        console.error('导入失败:', e)
        resolve(null)
      }
    }
    input.click()
  })
}

// ─── Config ───────────────────────────────────────────────────────────────────

export async function loadConfig<T = any>(key: string): Promise<T | null> {
  const row = await db.config.get(key)
  return row ? (row.value as T) : null
}

export async function saveConfig(key: string, value: any): Promise<void> {
  await db.config.put({ key, value })
}

// ─── 导出数据库实例（供外部实时查询）──────────────────────────────────────────

export { db }
