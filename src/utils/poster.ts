// 海报绘制工具 —— 用 HTML5 Canvas 生成与软件同款风格的 PNG
// 主色 #4f6ef7（与软件一致），1080×1440 竖版，适合分享
import type { Campaign, Currency, Character, Warehouse } from '../types'

const W = 1080
const H = 1440

// 颜色
const COLORS = {
  bg: '#f6f7fb',
  surface: '#ffffff',
  text: '#1f2937',
  text2: '#6b7280',
  text3: '#9ca3af',
  border: '#e5e7eb',
  primary: '#4f6ef7',
  primarySoft: '#eef0ff',
  warehouseBg: '#fff7e8',
  warehouseBorder: '#f4d28a',
  income: '#16a34a',
  expense: '#dc2626',
  divider: '#e5e7eb',
}

// 工具：圆角矩形
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// 工具：换行文本
function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines = 3): number {
  if (!text) return y
  const words = text.split('')
  let line = ''
  let curY = y
  let lines = 0
  for (const ch of words) {
    const test = line + ch
    if (ctx.measureText(test).width > maxWidth && line.length > 0) {
      ctx.fillText(line, x, curY)
      line = ch
      curY += lineHeight
      lines++
      if (lines >= maxLines - 1) {
        // 最后一行：截断 + …
        let last = ch
        while (ctx.measureText(last + '…').width > maxWidth && last.length > 0) {
          last = last.slice(0, -1)
        }
        ctx.fillText(last + '…', x, curY)
        return curY + lineHeight
      }
    } else {
      line = test
    }
  }
  ctx.fillText(line, x, curY)
  return curY + lineHeight
}

// 计算角色总资产（基准货币）
function calcBalance(char: Character, currencies: Currency[], baseId: string): number {
  const base = currencies.find(c => c.id === baseId) ?? currencies[0]
  const rate = base?.exchange_rate || 1
  let total = 0
  for (const e of char.ledger) {
    const cur = currencies.find(c => c.id === e.currency_id)
    if (!cur) continue
    const curRate = cur.exchange_rate || 1
    total += (e.entry_type === 'income' ? 1 : -1) * e.amount * (curRate / rate)
  }
  return total
}

// 计算角色单币种余额
function calcCurrencyBalances(char: Character, currencies: Currency[]): Record<string, number> {
  const balances: Record<string, number> = {}
  for (const c of currencies) balances[c.id] = 0
  for (const e of char.ledger) {
    if (balances[e.currency_id] !== undefined) {
      balances[e.currency_id] += e.entry_type === 'income' ? e.amount : -e.amount
    }
  }
  return balances
}

// 仓库余额（按币种）
function calcWarehouseBalances(warehouse: Warehouse, currencies: Currency[]): Record<string, number> {
  const balances: Record<string, number> = {}
  for (const c of currencies) balances[c.id] = 0
  for (const wc of warehouse.currencies) {
    if (balances[wc.currency_id] !== undefined) balances[wc.currency_id] = wc.amount
  }
  return balances
}

// 主入口：返回 canvas 元素
// - 网页版：直接 canvas.toBlob() → clipboard
// - 桌面版（Tauri）：保持 Image.new(rgba) 兼容（见下方分支）
export async function generatePoster(campaign: Campaign): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!

  // 背景
  ctx.fillStyle = COLORS.bg
  ctx.fillRect(0, 0, W, H)

  // 边距
  const M = 48
  const contentW = W - M * 2
  let yCursor = M

  // === 顶栏（跑团管家 logo）===
  ctx.fillStyle = COLORS.surface
  roundRect(ctx, M, yCursor, contentW, 56, 12)
  ctx.fill()
  ctx.fillStyle = COLORS.text
  ctx.font = 'bold 22px "PingFang SC", "Microsoft YaHei", sans-serif'
  ctx.textBaseline = 'middle'
  ctx.fillText('🎴 跑团管家', M + 20, yCursor + 28)
  ctx.fillStyle = COLORS.text3
  ctx.font = '14px "PingFang SC", "Microsoft YaHei", sans-serif'
  ctx.textAlign = 'right'
  ctx.fillText(`生成于 ${new Date().toLocaleDateString('zh-CN')}`, M + contentW - 20, yCursor + 28)
  ctx.textAlign = 'left'
  yCursor += 56 + 20

  // === 战役头 ===
  const currencies = campaign.currencies
  const baseCurrency = currencies.find(c => c.id === campaign.base_currency) ?? currencies[0]
  const charCount = campaign.characters.length
  const itemCount = campaign.characters.reduce((s, c) => s + c.inventory.length, 0) + campaign.warehouse.items.length
  const entryCount = campaign.characters.reduce((s, c) => s + c.ledger.length, 0)

  ctx.fillStyle = COLORS.surface
  roundRect(ctx, M, yCursor, contentW, 140, 16)
  ctx.fill()
  // 图标
  ctx.font = '60px serif'
  ctx.fillText(campaign.icon || '🎴', M + 28, yCursor + 70)
  // 名称
  ctx.fillStyle = COLORS.text
  ctx.font = 'bold 32px "PingFang SC", "Microsoft YaHei", sans-serif'
  ctx.textBaseline = 'top'
  ctx.fillText(campaign.name, M + 130, yCursor + 28)
  // 规则系统
  ctx.fillStyle = COLORS.primary
  ctx.font = '14px "PingFang SC", "Microsoft YaHei", sans-serif'
  roundRect(ctx, M + 130, yCursor + 70, 80, 28, 6)
  ctx.fillStyle = COLORS.primarySoft
  ctx.fill()
  ctx.fillStyle = COLORS.primary
  ctx.textBaseline = 'middle'
  ctx.fillText(campaign.rule_system, M + 130 + 40, yCursor + 84)
  ctx.textBaseline = 'top'

  // 描述
  if (campaign.description) {
    ctx.fillStyle = COLORS.text2
    ctx.font = '15px "PingFang SC", "Microsoft YaHei", sans-serif'
    yCursor = wrapText(ctx, campaign.description, M + 130, yCursor + 105, contentW - 160, 22, 2) + 4
  }

  // 统计
  ctx.fillStyle = COLORS.text3
  ctx.font = '14px "PingFang SC", "Microsoft YaHei", sans-serif'
  ctx.fillText(`${charCount} 位角色  ·  ${entryCount} 笔记账  ·  ${itemCount} 件物品`, M + 130, yCursor + (campaign.description ? 24 : 60))

  yCursor += 140 + 20

  // === 仓库区块 ===
  yCursor = drawWarehouseSection(ctx, campaign, currencies, M, yCursor, contentW)

  // === 角色区块（每个角色一张卡）===
  for (const char of campaign.characters) {
    if (yCursor > H - 200) break // 空间不够
    yCursor = drawCharacterSection(ctx, char, currencies, baseCurrency, M, yCursor, contentW)
  }

  if (campaign.characters.length === 0) {
    ctx.fillStyle = COLORS.surface
    roundRect(ctx, M, yCursor, contentW, 80, 12)
    ctx.fill()
    ctx.fillStyle = COLORS.text3
    ctx.font = '15px "PingFang SC", "Microsoft YaHei", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('暂无角色', W / 2, yCursor + 40)
    ctx.textAlign = 'left'
    yCursor += 80 + 16
  }

  // === 底栏 ===
  ctx.fillStyle = COLORS.text3
  ctx.font = '13px "PingFang SC", "Microsoft YaHei", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText('由 跑团管家 自动生成', W / 2, H - 36)

  return canvas
}

function drawWarehouseSection(
  ctx: CanvasRenderingContext2D,
  campaign: Campaign,
  currencies: Currency[],
  x: number,
  y: number,
  w: number,
): number {
  const sectionPadding = 20
  const headerH = 44
  const balances = calcWarehouseBalances(campaign.warehouse, currencies)
  const items = campaign.warehouse.items

  // 计算卡片内容高度
  const currencyCount = currencies.filter(c => balances[c.id] !== 0).length
  const itemRows = Math.min(items.length, 8)
  const currenciesH = currencyCount > 0 ? 100 : 0
  const itemsH = items.length > 0 ? 28 + Math.min(itemRows, 8) * 28 + 16 : 0
  const sectionH = headerH + currenciesH + itemsH + sectionPadding * 2 + 16

  // 背景卡
  ctx.fillStyle = COLORS.surface
  roundRect(ctx, x, y, w, sectionH, 14)
  ctx.fill()
  // 顶栏色带（橙黄）
  ctx.fillStyle = COLORS.warehouseBg
  roundRect(ctx, x, y, w, headerH + 8, 14)
  ctx.fill()
  ctx.fillStyle = COLORS.warehouseBg
  ctx.fillRect(x, y + headerH - 8, w, 8)

  // 标题
  ctx.fillStyle = COLORS.text
  ctx.font = 'bold 20px "PingFang SC", "Microsoft YaHei", sans-serif'
  ctx.textBaseline = 'middle'
  ctx.fillText(`📦 ${campaign.warehouse.name}`, x + 20, y + 22)

  let innerY = y + headerH + 8

  // 货币卡
  if (currencyCount > 0) {
    ctx.fillStyle = COLORS.text2
    ctx.font = '13px "PingFang SC", "Microsoft YaHei", sans-serif'
    ctx.textBaseline = 'top'
    ctx.fillText('货币余额', x + 20, innerY + 6)
    innerY += 26

    const cardsPerRow = Math.min(currencyCount, 4)
    const cardW = (w - 40 - (cardsPerRow - 1) * 10) / cardsPerRow
    const cardH = 56
    let idx = 0
    for (const c of currencies) {
      if (balances[c.id] === 0) continue
      const col = idx % cardsPerRow
      const row = Math.floor(idx / cardsPerRow)
      const cx = x + 20 + col * (cardW + 10)
      const cy = innerY + row * (cardH + 10)

      ctx.fillStyle = COLORS.warehouseBg
      roundRect(ctx, cx, cy, cardW, cardH, 8)
      ctx.fill()

      ctx.fillStyle = COLORS.text3
      ctx.font = '12px "PingFang SC", "Microsoft YaHei", sans-serif'
      ctx.fillText(`${c.symbol} · ${c.name}`, cx + 10, cy + 12)

      ctx.fillStyle = COLORS.text
      ctx.font = 'bold 18px "PingFang SC", "Microsoft YaHei", sans-serif'
      ctx.fillText(balances[c.id].toFixed(2), cx + 10, cy + 32)

      idx++
    }
    const rows = Math.ceil(idx / cardsPerRow)
    innerY += rows * (cardH + 10) + 8
  } else {
    ctx.fillStyle = COLORS.text3
    ctx.font = '13px "PingFang SC", "Microsoft YaHei", sans-serif'
    ctx.fillText('暂无货币', x + 20, innerY + 6)
    innerY += 32
  }

  // 物品列表
  if (items.length > 0) {
    ctx.fillStyle = COLORS.text2
    ctx.font = '13px "PingFang SC", "Microsoft YaHei", sans-serif'
    ctx.fillText(`物品清单（${items.length}）`, x + 20, innerY)
    innerY += 22

    ctx.font = '14px "PingFang SC", "Microsoft YaHei", sans-serif'
    ctx.textBaseline = 'top'
    const display = items.slice(0, 8)
    for (let i = 0; i < display.length; i++) {
      const item = display[i]
      const rowY = innerY + i * 26
      // 序号
      ctx.fillStyle = COLORS.text3
      ctx.fillText(`${i + 1}.`, x + 20, rowY)
      // 名称
      ctx.fillStyle = COLORS.text
      const nameMax = w - 220
      let name = item.name
      while (ctx.measureText(name).width > nameMax && name.length > 0) name = name.slice(0, -1)
      if (name !== item.name) name += '…'
      ctx.fillText(name, x + 44, rowY)
      // 数量
      ctx.fillStyle = COLORS.text2
      ctx.textAlign = 'right'
      ctx.fillText(`×${item.quantity}`, x + w - 100, rowY)
      // 单价
      ctx.fillStyle = COLORS.text3
      ctx.fillText(`${item.unit_price.toFixed(2)}/件`, x + w - 20, rowY)
      ctx.textAlign = 'left'
    }
    if (items.length > 8) {
      ctx.fillStyle = COLORS.text3
      ctx.font = '13px "PingFang SC", "Microsoft YaHei", sans-serif'
      ctx.fillText(`…还有 ${items.length - 8} 件`, x + 44, innerY + 8 * 26)
    }
  }

  return y + sectionH + 16
}

function drawCharacterSection(
  ctx: CanvasRenderingContext2D,
  char: Character,
  currencies: Currency[],
  baseCurrency: Currency | undefined,
  x: number,
  y: number,
  w: number,
): number {
  const balances = calcCurrencyBalances(char, currencies)
  const totalAssets = baseCurrency ? calcBalance(char, currencies, baseCurrency.id) : 0
  const balanceStr = totalAssets >= 0 ? `+${totalAssets.toFixed(2)}` : totalAssets.toFixed(2)
  const balanceColor = totalAssets >= 0 ? COLORS.income : COLORS.expense
  const itemRows = Math.min(char.inventory.length, 6)
  const itemH = char.inventory.length > 0 ? 28 + itemRows * 24 + 16 : 0
  const cardH = 100 + itemH

  // 卡片背景
  ctx.fillStyle = COLORS.surface
  roundRect(ctx, x, y, w, cardH, 14)
  ctx.fill()
  // 左侧色条
  ctx.fillStyle = COLORS.primary
  roundRect(ctx, x, y, 6, cardH, 3)
  ctx.fill()

  // 头像
  ctx.font = '40px serif'
  ctx.textBaseline = 'middle'
  ctx.fillText(char.icon || '👤', x + 26, y + 50)

  // 名字
  ctx.fillStyle = COLORS.text
  ctx.font = 'bold 22px "PingFang SC", "Microsoft YaHei", sans-serif'
  ctx.fillText(char.name, x + 90, y + 36)

  // 规则
  ctx.fillStyle = COLORS.text3
  ctx.font = '13px "PingFang SC", "Microsoft YaHei", sans-serif'
  ctx.fillText(char.rule_system, x + 90, y + 66)

  // 总资产（右侧）
  ctx.textAlign = 'right'
  ctx.fillStyle = COLORS.text3
  ctx.font = '12px "PingFang SC", "Microsoft YaHei", sans-serif'
  ctx.fillText('总资产', x + w - 20, y + 32)
  ctx.fillStyle = balanceColor
  ctx.font = 'bold 22px "PingFang SC", "Microsoft YaHei", sans-serif'
  ctx.fillText(`${balanceStr} ${baseCurrency?.symbol || ''}`, x + w - 20, y + 62)
  ctx.textAlign = 'left'

  // 货币余额条（chips）
  const nonZero = currencies.filter(c => balances[c.id] !== 0)
  if (nonZero.length > 0) {
    ctx.font = '12px "PingFang SC", "Microsoft YaHei", sans-serif'
    let chipX = x + 90
    const chipY = y + 88
    const maxChipX = x + w - 20
    for (const c of nonZero) {
      const val = balances[c.id]
      const txt = `${c.symbol} ${val.toFixed(2)}`
      const tw = ctx.measureText(txt).width + 16
      if (chipX + tw > maxChipX) break
      ctx.fillStyle = val >= 0 ? COLORS.primarySoft : '#fef0f0'
      roundRect(ctx, chipX, chipY, tw, 22, 11)
      ctx.fill()
      ctx.fillStyle = val >= 0 ? COLORS.primary : COLORS.expense
      ctx.fillText(txt, chipX + 8, chipY + 14)
      chipX += tw + 6
    }
  }

  // 物品列表
  if (char.inventory.length > 0) {
    ctx.fillStyle = COLORS.text2
    ctx.font = '13px "PingFang SC", "Microsoft YaHei", sans-serif'
    ctx.textBaseline = 'top'
    ctx.fillText(`背包（${char.inventory.length}）`, x + 26, y + 124)

    ctx.font = '14px "PingFang SC", "Microsoft YaHei", sans-serif'
    const display = char.inventory.slice(0, 6)
    for (let i = 0; i < display.length; i++) {
      const item = display[i]
      const rowY = y + 148 + i * 24
      ctx.fillStyle = COLORS.text3
      ctx.fillText(`•`, x + 26, rowY)
      ctx.fillStyle = COLORS.text
      const nameMax = w - 180
      let name = item.name
      while (ctx.measureText(name).width > nameMax && name.length > 0) name = name.slice(0, -1)
      if (name !== item.name) name += '…'
      ctx.fillText(name, x + 44, rowY)
      ctx.fillStyle = COLORS.text2
      ctx.textAlign = 'right'
      ctx.fillText(`×${item.quantity}`, x + w - 100, rowY)
      ctx.fillStyle = COLORS.text3
      ctx.fillText(`${item.total_price.toFixed(2)}`, x + w - 20, rowY)
      ctx.textAlign = 'left'
    }
    if (char.inventory.length > 6) {
      ctx.fillStyle = COLORS.text3
      ctx.font = '13px "PingFang SC", "Microsoft YaHei", sans-serif'
      ctx.fillText(`…还有 ${char.inventory.length - 6} 件`, x + 44, y + 148 + 6 * 24)
    }
  }

  return y + cardH + 12
}