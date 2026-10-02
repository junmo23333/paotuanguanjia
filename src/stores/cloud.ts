import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as cos from '../utils/cos'
import { useCampaignStore } from './campaign'
import type { Campaign, Character, GiftRequest, GiftGive, ShopData, ShopOrder } from '../types'

// ─── Store ───────────────────────────────────────────────────────────────────
export const useCloudStore = defineStore('cloud', () => {
  // 状态
  const connected = ref(false)
  const roomPassword = ref('')       // 房间号（COS 路径用）
  const roomSecret = ref('')         // 房间密码（访问校验用）
  const roomIndex = ref<cos.RoomIndex | null>(null)
  const syncing = ref(false)
  const syncMessage = ref('')
  const lastSyncTime = ref<string | null>(null)

  // 权限与认领
  const isGM = ref(false)
  const myCharacterId = ref<string | null>(null)
  const requests = ref<any[]>([])      // GM 视角：房间内所有物品申请
  const myRequests = ref<any[]>([])    // 玩家视角：我提交的申请
  const currentRoomCampaignId = ref<string | null>(null)  // 当前房间对应的战役 id

  // 礼物赠予
  const gifts = ref<GiftRequest[]>([])

  // 商店
  const shop = ref<ShopData | null>(null)
  const shopOrders = ref<ShopOrder[]>([])

  // 计算属性
  const isOnline = computed(() => connected.value)

  const myIncomingGifts = computed(() =>
    gifts.value.filter(g => g.status === 'pending' && g.to_char_id === myCharacterId.value)
  )
  const myOutgoingGifts = computed(() =>
    gifts.value.filter(g => g.status === 'pending' && g.from_char_id === myCharacterId.value)
  )
  const myShopOrders = computed(() =>
    shopOrders.value.filter(o => o.buyer_char_id === myCharacterId.value)
  )
  const pendingShopOrders = computed(() =>
    shopOrders.value.filter(o => o.status === 'pending')
  )
  const approvedShopOrders = computed(() =>
    shopOrders.value.filter(o => o.status === 'approved')
  )

  // 自动重连（持久化房间密码）
  const autoReconnected = ref(false)
  const SESSION_KEY = 'trpg-cloud-room'

  function persistSession() {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        room: roomPassword.value,
        secret: roomSecret.value,
        isGM: isGM.value,
        myCharacterId: myCharacterId.value,
      }))
    } catch {}
  }

  function clearSession() {
    try { localStorage.removeItem(SESSION_KEY) } catch {}
  }

  /** 应用启动时自动重连上次房间（仅恢复在线状态，不覆盖本地战役） */
  async function restoreSession(): Promise<boolean> {
    try {
      const raw = localStorage.getItem(SESSION_KEY)
      if (!raw) return false
      const saved = JSON.parse(raw)
      if (!saved.room) return false
      // 自动重连：房间号 + 密码
      const res = await connectRoom(saved.room, saved.secret || '', saved.isGM || false)
      if (!res.success) { clearSession(); return false }
      if (saved.myCharacterId) claimCharacter(saved.myCharacterId)
      if (saved.isGM) { try { await pullRequests() } catch {} }
      autoReconnected.value = true
      return true
    } catch {
      return false
    }
  }

  // ─── 连接房间 ───────────────────────────────────────────────────────────────
  /**
   * 连接房间
   * @param roomId    房间号（COS 路径标识）
   * @param secret    房间密码（访问校验）
   * @param autoGM    自动重连时直接传入是否 GM（跳过后缀解析）
   */
  async function connectRoom(roomId: string, secret: string, autoGM?: boolean): Promise<{ success: boolean; error?: string; meta?: any; index?: cos.RoomIndex; isGM?: boolean }> {
    const room = roomId.trim()
    autoReconnected.value = false

    // GM 判定：优先用 autoGM（自动重连），否则检查房间号是否以 GM 结尾
    let gm = false
    let pathRoom = room
    if (autoGM !== undefined) {
      gm = autoGM
    } else if (room.toUpperCase().endsWith('GM')) {
      gm = true
      pathRoom = room.slice(0, -2)
    }

    roomPassword.value = pathRoom
    roomSecret.value = secret
    isGM.value = gm

    // 尝试拉取 meta + index
    const [meta, index] = await Promise.all([
      cos.fetchRoomMeta(pathRoom),
      cos.fetchRoomIndex(pathRoom),
    ])

    if (!meta && !index) {
      // 房间不存在
      connected.value = false
      return { success: false, error: '房间不存在或尚未初始化。如果你是 DM，请先创建房间。' }
    }

    // 校验房间密码（meta 中存了哈希）
    if (meta?.room_password_hash) {
      const inputHash = cos.hashPassword(secret)
      if (inputHash !== meta.room_password_hash) {
        connected.value = false
        return { success: false, error: '房间密码不正确。' }
      }
    }

    connected.value = true
    if (meta?.id) currentRoomCampaignId.value = meta.id
    roomIndex.value = index
    myCharacterId.value = null
    requests.value = []
    myRequests.value = []
    persistSession()
    await pullGifts()
    await pullShop()
    await pullShopOrders()

    return { success: true, meta, index: index || undefined, isGM: gm }
  }

  /** 玩家认领一个角色卡（仅本地记录，控制可编辑范围） */
  function claimCharacter(characterId: string | null) {
    myCharacterId.value = characterId
    persistSession()
  }

  /** host 模式创建房间时，标记 GM 权限（密码已外部解析） */
  function setGM(flag: boolean) {
    isGM.value = flag
  }

  /** DM 初始化新房间：把当前战役上传到云端 */
  async function initRoomFromCampaign(campaign: Campaign): Promise<void> {
    syncing.value = true
    syncMessage.value = '正在初始化房间...'

    try {
      const password = roomPassword.value

      // 上传 meta（战役基本信息 + 房间密码哈希）
      const meta = {
        id: campaign.id,
        name: campaign.name,
        rule_system: campaign.rule_system,
        icon: campaign.icon,
        description: campaign.description,
        currencies: campaign.currencies,
        base_currency: campaign.base_currency,
        room_password_hash: cos.hashPassword(roomSecret.value),  // 房间密码哈希
        created_at: campaign.created_at,
        updated_at: new Date().toISOString(),
      }
      await cos.uploadRoomMeta(password, meta)

      // 上传仓库
      await cos.uploadRoomWarehouse(password, campaign.warehouse)

      // 上传每个角色
      for (const char of campaign.characters) {
        await cos.uploadCharacter(password, char)
      }

      // 上传索引
      const index: cos.RoomIndex = {
        characters: campaign.characters.map(c => ({
          id: c.id,
          name: c.name,
          rule_system: c.rule_system,
          icon: c.icon,
        })),
        updated_at: new Date().toISOString(),
      }
      await cos.uploadRoomIndex(password, index)
      roomIndex.value = index

      connected.value = true
      currentRoomCampaignId.value = campaign.id
      lastSyncTime.value = new Date().toISOString()
      syncMessage.value = '房间初始化完成'
      await pullGifts()
      await pullShop()
      await pullShopOrders()
    } catch (e: any) {
      syncMessage.value = `初始化失败: ${e.message || e}`
      throw e
    } finally {
      syncing.value = false
    }
  }

  /** 拉取房间的全部数据到本地 */
  async function pullRoom(): Promise<Campaign | null> {
    if (!connected.value) return null

    syncing.value = true
    syncMessage.value = '正在拉取房间数据...'

    try {
      const password = roomPassword.value
      const meta = await cos.fetchRoomMeta(password)
      if (!meta) {
        syncMessage.value = '房间元数据不存在'
        return null
      }

      const index = await cos.fetchRoomIndex(password)
      if (!index) {
        syncMessage.value = '房间索引不存在'
        return null
      }
      roomIndex.value = index

      const warehouse = await cos.fetchRoomWarehouse(password)
      const characters = await cos.fetchAllCharacters(password, index)

      // 组装成 Campaign
      const campaign: Campaign = {
        id: meta.id,
        name: meta.name,
        rule_system: meta.rule_system,
        icon: meta.icon,
        description: meta.description,
        currencies: meta.currencies,
        base_currency: meta.base_currency,
        characters: characters as Character[],
        warehouse: warehouse || { name: '团队仓库', description: '', currencies: [], items: [] },
        created_at: meta.created_at,
        updated_at: new Date().toISOString(),
      }

      if (meta?.id) currentRoomCampaignId.value = meta.id
      lastSyncTime.value = new Date().toISOString()
      syncMessage.value = '拉取完成'
      await pullGifts()
      await pullShop()
      await pullShopOrders()
      return campaign
    } catch (e: any) {
      syncMessage.value = `拉取失败: ${e.message || e}`
      throw e
    } finally {
      syncing.value = false
    }
  }

  /** 推送单个角色的更新到云端 */
  async function pushCharacter(character: Character): Promise<void> {
    if (!connected.value) return

    try {
      await cos.uploadCharacter(roomPassword.value, character)

      // 更新索引（如果新角色）
      if (roomIndex.value) {
        const exists = roomIndex.value.characters.find(c => c.id === character.id)
        if (!exists) {
          roomIndex.value.characters.push({
            id: character.id,
            name: character.name,
            rule_system: character.rule_system,
            icon: character.icon,
          })
          roomIndex.value.updated_at = new Date().toISOString()
          await cos.uploadRoomIndex(roomPassword.value, roomIndex.value)
        }
      }

      lastSyncTime.value = new Date().toISOString()
    } catch (e: any) {
      console.error('推送角色失败:', e)
      throw e
    }
  }

  /** 推送仓库数据到云端 */
  async function pushWarehouse(warehouse: any): Promise<void> {
    if (!connected.value) return

    await cos.uploadRoomWarehouse(roomPassword.value, warehouse)
    lastSyncTime.value = new Date().toISOString()
  }

  /** 推送战役元数据到云端 */
  async function pushMeta(campaign: Campaign): Promise<void> {
    if (!connected.value) return

    const meta = {
      id: campaign.id,
      name: campaign.name,
      rule_system: campaign.rule_system,
      icon: campaign.icon,
      description: campaign.description,
      currencies: campaign.currencies,
      base_currency: campaign.base_currency,
      room_password_hash: cos.hashPassword(roomSecret.value),
      created_at: campaign.created_at,
      updated_at: new Date().toISOString(),
    }
    await cos.uploadRoomMeta(roomPassword.value, meta)
    lastSyncTime.value = new Date().toISOString()
  }

  /** 全量推送（所有角色 + 仓库 + meta + index） */
  async function pushAll(campaign: Campaign): Promise<void> {
    if (!connected.value) return

    syncing.value = true
    syncMessage.value = '正在推送全部数据...'

    try {
      await pushMeta(campaign)
      await pushWarehouse(campaign.warehouse)

      for (const char of campaign.characters) {
        await cos.uploadCharacter(roomPassword.value, char)
      }

      const index: cos.RoomIndex = {
        characters: campaign.characters.map(c => ({
          id: c.id,
          name: c.name,
          rule_system: c.rule_system,
          icon: c.icon,
        })),
        updated_at: new Date().toISOString(),
      }
      await cos.uploadRoomIndex(roomPassword.value, index)
      roomIndex.value = index

      lastSyncTime.value = new Date().toISOString()
      syncMessage.value = '全量推送完成'
    } catch (e: any) {
      syncMessage.value = `推送失败: ${e.message || e}`
      throw e
    } finally {
      syncing.value = false
    }
  }

  // ─── 物品申请（玩家 → GM）─────────────────────────────────────────────────
  function genId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  }

  /** 玩家提交物品取出/放入申请（写入云端 requests/<id>.json） */
  async function submitItemRequest(characterId: string, characterName: string, itemName: string, quantity: number, action: 'take' | 'deposit') {
    if (!connected.value) return
    const request = {
      id: genId(),
      character_id: characterId,
      character_name: characterName,
      item_name: itemName,
      quantity,
      action,
      status: 'pending',
      created_at: new Date().toISOString(),
    }
    await cos.uploadRequest(roomPassword.value, request)
    myRequests.value.push(request)
  }

  /** GM 拉取房间内所有物品申请 */
  async function pullRequests() {
    if (!connected.value) return
    requests.value = await cos.listRequests(roomPassword.value)
  }

  /** GM 批准申请：自动扣/加仓库库存 */
  async function approveRequest(request: any) {
    if (!connected.value || !isGM.value) return
    const campaignStore = useCampaignStore()
    const wh = campaignStore.currentCampaign?.warehouse
    if (!wh) throw new Error('未加载战役，无法处理申请')

    const item = wh.items.find(i => i.name === request.item_name)
    if (request.action === 'take') {
      if (!item || item.quantity < request.quantity) {
        throw new Error(`仓库中「${request.item_name}」不足（现存 ${item ? item.quantity : 0}）`)
      }
      const newQty = item.quantity - request.quantity
      if (newQty <= 0) await campaignStore.deleteWarehouseItem(item.id)
      else await campaignStore.updateWarehouseItem({ ...item, quantity: newQty })
    } else {
      if (item) await campaignStore.updateWarehouseItem({ ...item, quantity: item.quantity + request.quantity })
      else await campaignStore.addWarehouseItem({ name: request.item_name, quantity: request.quantity, unit_price: 0, weight: 0, notes: '' })
    }

    request.status = 'approved'
    request.processed_at = new Date().toISOString()
    await cos.uploadRequest(roomPassword.value, request)
    await pullRequests()
  }

  /** GM 拒绝申请 */
  async function rejectRequest(request: any) {
    if (!connected.value || !isGM.value) return
    request.status = 'rejected'
    request.processed_at = new Date().toISOString()
    await cos.uploadRequest(roomPassword.value, request)
    await pullRequests()
  }

  // ─── 礼物赠予（单方赠予，接收方确认才到账）────────────────────────────────
  /** 角色内某货币净余额 */
  function calcCharBalance(char: any, currencyId: string): number {
    let bal = 0
    for (const e of char.ledger || []) {
      if (e.currency_id !== currencyId) continue
      bal += e.entry_type === 'income' ? e.amount : -e.amount
    }
    return bal
  }

  /** 发起赠予（从自己认领的角色送出） */
  async function submitGift(toCharId: string, gives: GiftGive[], note?: string): Promise<void> {
    if (!connected.value) throw new Error('未连接云端')
    if (!myCharacterId.value) throw new Error('未认领角色')
    if (toCharId === myCharacterId.value) throw new Error('不能赠予给自己')
    const store = useCampaignStore()
    const campaign = store.currentCampaign
    if (!campaign) throw new Error('未加载战役')
    const fromChar = campaign.characters.find(c => c.id === myCharacterId.value)
    if (!fromChar) throw new Error('未找到当前角色')
    const toInfo = roomIndex.value?.characters.find(c => c.id === toCharId)
    if (!toInfo) throw new Error('未找到接收方角色')

    for (const g of gives) {
      if (g.type === 'item') {
        const it = fromChar.inventory.find(i => i.name === g.name)
        if (!it || it.quantity < g.quantity) throw new Error(`你的物品「${g.name}」库存不足`)
      } else {
        const cur = campaign.currencies.find(c => c.name === g.name)
        if (!cur) throw new Error(`货币「${g.name}」不存在`)
        if (calcCharBalance(fromChar, cur.id) < g.quantity) throw new Error(`你的货币「${g.name}」余额不足`)
      }
    }

    const gift: GiftRequest = {
      id: crypto.randomUUID(),
      room: roomPassword.value,
      from_char_id: myCharacterId.value,
      from_char_name: fromChar.name,
      to_char_id: toCharId,
      to_char_name: toInfo.name,
      gives,
      note,
      status: 'pending',
      created_at: new Date().toISOString(),
    }
    await cos.uploadGift(roomPassword.value, gift)
    await pullGifts()
  }

  /** 拉取房间内所有礼物请求 */
  async function pullGifts(): Promise<void> {
    if (!connected.value) return
    gifts.value = await cos.listGifts(roomPassword.value)
  }

  /** 接收方接受：执行转移（扣发起方 + 加接收方） */
  async function acceptGift(giftId: string): Promise<void> {
    if (!connected.value || !myCharacterId.value) throw new Error('未连接或未认领角色')
    const store = useCampaignStore()
    const campaign = store.currentCampaign
    if (!campaign) throw new Error('未加载战役')
    const gift = gifts.value.find(g => g.id === giftId)
    if (!gift || gift.status !== 'pending') throw new Error('礼物不存在或已处理')
    if (gift.to_char_id !== myCharacterId.value) throw new Error('你不是接收方')

    const fromChar = (await cos.fetchCharacter(roomPassword.value, gift.from_char_id)) as Character | null
    if (!fromChar) throw new Error('发起方角色不存在')

    for (const g of gift.gives) {
      if (g.type === 'item') {
        const it = fromChar.inventory.find(i => i.name === g.name)
        if (!it || it.quantity < g.quantity) throw new Error(`发起方物品「${g.name}」库存不足`)
        it.quantity -= g.quantity
        if (it.quantity <= 0) {
          fromChar.inventory = fromChar.inventory.filter(i => i.id !== it.id)
        }
      } else {
        const cur = campaign.currencies.find(c => c.name === g.name)
        if (!cur) throw new Error(`货币「${g.name}」不存在`)
        if (calcCharBalance(fromChar, cur.id) < g.quantity) throw new Error(`发起方货币「${g.name}」余额不足`)
        fromChar.ledger.push({
          id: crypto.randomUUID(),
          currency_id: cur.id,
          entry_type: 'expense',
          amount: g.quantity,
          reason: `赠予给 ${gift.to_char_name}`,
          day: 1,
          timestamp: new Date().toISOString(),
        })
      }
    }

    for (const g of gift.gives) {
      if (g.type === 'item') {
        const existing = campaign.characters
          .find(c => c.id === myCharacterId.value)!
          .inventory.find(i => i.name === g.name)
        if (existing) {
          store.updateItem(myCharacterId.value, { ...existing, quantity: existing.quantity + g.quantity })
        } else {
          store.addItem(myCharacterId.value, {
            name: g.name,
            quantity: g.quantity,
            unit_price: 0,
            weight: 0,
            notes: '来自赠予',
          })
        }
      } else {
        const cur = campaign.currencies.find(c => c.name === g.name)
        if (!cur) throw new Error(`货币「${g.name}」不存在`)
        store.addLedgerEntry(myCharacterId.value, {
          currency_id: cur.id,
          entry_type: 'income',
          amount: g.quantity,
          reason: `来自 ${gift.from_char_name} 的赠予`,
          day: 1,
        })
      }
    }

    await cos.uploadCharacter(roomPassword.value, fromChar)
    const localA = campaign.characters.find(c => c.id === fromChar.id)
    if (localA) Object.assign(localA, fromChar)

    gift.status = 'accepted'
    gift.processed_at = new Date().toISOString()
    await cos.uploadGift(roomPassword.value, gift)
    await pullGifts()
  }

  /** 接收方拒绝：原物返回（发起方库存不动） */
  async function rejectGift(giftId: string): Promise<void> {
    if (!connected.value || !myCharacterId.value) throw new Error('未连接或未认领角色')
    const gift = gifts.value.find(g => g.id === giftId)
    if (!gift || gift.status !== 'pending') throw new Error('礼物不存在或已处理')
    if (gift.to_char_id !== myCharacterId.value) throw new Error('你不是接收方')
    gift.status = 'rejected'
    gift.processed_at = new Date().toISOString()
    await cos.uploadGift(roomPassword.value, gift)
    await pullGifts()
  }

  // ─── 商店（GM 上架 + 玩家购买，GM 批准后扣费发货）──────────────────────────
  async function pullShop(): Promise<void> {
    if (!connected.value) return
    shop.value = await cos.fetchShop(roomPassword.value)
  }

  async function pullShopOrders(): Promise<void> {
    if (!connected.value) return
    shopOrders.value = await cos.listShopOrders(roomPassword.value)
  }

  /** GM 保存商店（上架/编辑/下架/改价/改库存） */
  async function uploadShop(data: any): Promise<void> {
    if (!connected.value) throw new Error('未连接云端')
    if (!isGM.value) throw new Error('仅 GM 可编辑商店')
    await cos.uploadShop(roomPassword.value, { ...data, updated_at: new Date().toISOString() })
    await pullShop()
  }

  /** 玩家发起购买申请（不立即扣费，等 GM 批准） */
  async function submitShopOrder(itemId: string): Promise<void> {
    if (!connected.value) throw new Error('未连接云端')
    if (!myCharacterId.value) throw new Error('未认领角色')
    if (isGM.value) throw new Error('GM 不能购买')
    const item = shop.value?.items.find(i => i.id === itemId)
    if (!item) throw new Error('商品不存在')
    const store = useCampaignStore()
    const campaign = store.currentCampaign
    if (!campaign) throw new Error('未加载战役')
    const cur = campaign.currencies.find(c => c.id === item.price_currency_id)
    if (!cur) throw new Error('货币不存在')
    const me = campaign.characters.find(c => c.id === myCharacterId.value)
    if (!me) throw new Error('未找到当前角色')

    const order = {
      id: crypto.randomUUID(),
      room: roomPassword.value,
      item_id: item.id,
      item_name: item.name,
      buyer_char_id: myCharacterId.value,
      buyer_char_name: me.name,
      price_currency_id: cur.id,
      price_currency_name: cur.name,
      price_amount: item.price_amount,
      status: 'pending',
      created_at: new Date().toISOString(),
    }
    await cos.uploadShopOrder(roomPassword.value, order)
    await pullShopOrders()
  }

  /** GM 批准购买：扣买家货币 + 发货 + 减库存 */
  async function approveShopOrder(orderId: string): Promise<void> {
    if (!connected.value || !isGM.value) throw new Error('仅 GM 可批准')
    const store = useCampaignStore()
    const campaign = store.currentCampaign
    if (!campaign) throw new Error('未加载战役')
    const order = shopOrders.value.find(o => o.id === orderId)
    if (!order || order.status !== 'pending') throw new Error('订单不存在或已处理')
    const item = shop.value?.items.find(i => i.id === order.item_id)
    if (!item) throw new Error('商品已下架')
    if (item.stock <= 0) throw new Error('库存不足')
    const cur = campaign.currencies.find(c => c.id === order.price_currency_id)
    if (!cur) throw new Error('货币不存在')

    // 扣买家货币 + 加买家背包（store 自动推送买家角色）
    store.addLedgerEntry(order.buyer_char_id, {
      currency_id: cur.id,
      entry_type: 'expense',
      amount: order.price_amount,
      reason: `购买 ${order.item_name}`,
      day: 1,
    })
    const buyerChar = campaign.characters.find(c => c.id === order.buyer_char_id)
    const existing = buyerChar?.inventory.find(i => i.name === order.item_name)
    if (existing) {
      store.updateItem(order.buyer_char_id, { ...existing, quantity: existing.quantity + 1 })
    } else {
      store.addItem(order.buyer_char_id, {
        name: order.item_name,
        quantity: 1,
        unit_price: order.price_amount,
        weight: 0,
        notes: '商店购买',
      })
    }

    // 减库存
    item.stock -= 1
    await cos.uploadShop(roomPassword.value, shop.value)

    // 标记订单
    order.status = 'approved'
    order.processed_at = new Date().toISOString()
    await cos.uploadShopOrder(roomPassword.value, order)
    await pullShopOrders()
    await pullShop()
  }

  /** GM 拒绝购买 */
  async function rejectShopOrder(orderId: string): Promise<void> {
    if (!connected.value || !isGM.value) throw new Error('仅 GM 可操作')
    const order = shopOrders.value.find(o => o.id === orderId)
    if (!order || order.status !== 'pending') throw new Error('订单不存在或已处理')
    order.status = 'rejected'
    order.processed_at = new Date().toISOString()
    await cos.uploadShopOrder(roomPassword.value, order)
    await pullShopOrders()
  }

  /** 删除整个云端房间（meta + warehouse + index + characters/* + requests/* + trades/*） */
  async function deleteRoom(): Promise<void> {
    if (!connected.value) throw new Error('未连接云端')
    if (!isGM.value) throw new Error('仅 GM（密码加 GM 后缀）可清空云端房间')
    await cos.deleteRoom(roomPassword.value)
    disconnect()
  }

  /** 断开连接 */
  function disconnect() {
    connected.value = false
    roomPassword.value = ''
    roomSecret.value = ''
    roomIndex.value = null
    syncMessage.value = ''
    lastSyncTime.value = null
    isGM.value = false
    myCharacterId.value = null
    requests.value = []
    myRequests.value = []
    currentRoomCampaignId.value = null
    autoReconnected.value = false
    clearSession()
  }

  return {
    // 状态
    connected, roomPassword, roomSecret, roomIndex, syncing, syncMessage, lastSyncTime,
    isGM, myCharacterId, requests, myRequests, currentRoomCampaignId,
    // 计算属性
    isOnline,
    // 操作
    connectRoom, initRoomFromCampaign, pullRoom,
    pushCharacter, pushWarehouse, pushMeta, pushAll,
    claimCharacter, setGM, submitItemRequest, pullRequests, approveRequest, rejectRequest,
    submitGift, acceptGift, rejectGift, pullGifts,
    gifts, myIncomingGifts, myOutgoingGifts,
    shop, shopOrders, myShopOrders, pendingShopOrders, approvedShopOrders,
    pullShop, uploadShop, submitShopOrder, approveShopOrder, rejectShopOrder,
    deleteRoom, disconnect, restoreSession, autoReconnected,
  }
})
