// ─── 数据模型类型定义 ────────────────────────────────────────────────────────

export type CurrencyKind = 'currency' | 'experience'

export interface Currency {
  id: string
  name: string       // 如 "金币(GP)" 或 "经验值(XP)"
  symbol: string     // 如 "GP" 或 "XP"
  exchange_rate: number  // 相对基准货币的汇率
  kind: CurrencyKind  // 'currency' = 金钱系统 / 'experience' = 经验系统（不能互相转换）
}

export interface LedgerEntry {
  id: string
  currency_id: string
  entry_type: 'income' | 'expense'
  amount: number
  reason: string
  day: number        // 剧本内天数（1-N）
  timestamp: string   // ISO 8601（现实时间）
}

export interface Item {
  id: string
  name: string
  quantity: number
  unit_price: number
  total_price: number
  weight: number
  notes: string
}

export interface Character {
  id: string
  name: string
  rule_system: string
  icon?: string
  description: string
  ledger: LedgerEntry[]
  inventory: Item[]
  created_at: string
  updated_at: string
  claimed_by?: string  // 认领该角色的玩家标识（GM 可强制覆盖）
}

export interface WarehouseCurrency {
  currency_id: string
  amount: number
}

export interface Warehouse {
  name: string
  description: string
  currencies: WarehouseCurrency[]
  items: Item[]
}

export interface Campaign {
  id: string
  name: string
  rule_system: string
  icon?: string
  description: string
  currencies: Currency[]
  base_currency: string
  characters: Character[]
  warehouse: Warehouse
  created_at: string
  updated_at: string
}

export interface CampaignSummary {
  id: string
  name: string
  rule_system: string
  icon?: string
  description: string
  character_count: number
  updated_at: string
}

export interface AppConfig {
  last_campaign_id?: string
  last_character_id?: string
  recent_campaign_ids: string[]
}

export interface LedgerEntryDisplay {
  id: string
  character_id: string
  character_name: string
  currency_id: string
  entry_type: 'income' | 'expense'
  amount: number
  reason: string
  day: number
  timestamp: string
}

export interface LedgerSummary {
  start_day: number
  end_day: number
  entry_count: number
  total_income_by_currency: Record<string, number>
  total_expense_by_currency: Record<string, number>
  transfer_in_by_currency: Record<string, number>
  transfer_out_by_currency: Record<string, number>
}

// ─── UI 状态类型 ─────────────────────────────────────────────────────────────

export type ViewMode = 'campaign' | 'character' | 'ledger' | 'inventory' | 'warehouse'

export interface Tab {
  id: ViewMode
  label: string
  icon: string
}

// ─── 转移表单类型 ────────────────────────────────────────────────────────────

export type TransferTargetKind = 'character' | 'warehouse'
export type TransferItemKind = 'currency' | 'item'

export interface TransferForm {
  item_kind: TransferItemKind
  from_kind: TransferTargetKind
  from_id: string
  to_kind: TransferTargetKind
  to_id: string
  currency_id?: string
  item_id?: string
  amount?: number
  quantity?: number
  reason: string
  day: number
}

// ─── 联网房间：物品申请 ─────────────────────────────────────────────────────
export interface ItemRequest {
  id: string
  character_id: string
  character_name: string
  item_name: string
  quantity: number
  action: 'take' | 'deposit'  // 取出 / 放入
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  processed_at?: string
}

// ─── 联网房间：礼物赠予（单方赠予，接收方确认才到账）─────────────────────────────
export interface GiftGive {
  type: 'item' | 'currency'
  name: string
  quantity: number
}

export interface GiftRequest {
  id: string
  room: string
  from_char_id: string
  from_char_name: string
  to_char_id: string
  to_char_name: string
  gives: GiftGive[]
  note?: string
  status: 'pending' | 'accepted' | 'rejected'
  created_at: string
  processed_at?: string
}

// ─── 联网房间：商店（GM 上架 + 玩家购买，GM 批准后扣费发货）──────────────────────
export interface ShopItem {
  id: string
  name: string
  icon?: string
  description?: string
  price_currency_id: string
  price_amount: number
  stock: number  // 有限库存，>=0
}

export interface ShopData {
  items: ShopItem[]
  updated_at: string
}

export interface ShopOrder {
  id: string
  room: string
  item_id: string
  item_name: string
  buyer_char_id: string
  buyer_char_name: string
  price_currency_id: string
  price_currency_name: string
  price_amount: number
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  processed_at?: string
}