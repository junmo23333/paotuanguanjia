import COS from 'cos-js-sdk-v5'

// ─── COS 配置（环境变量注入）──────────────────────────────────────────────────
// 密钥通过 Cloudflare Pages 环境变量注入，代码中不存放明文密钥
const COS_CONFIG = {
  SecretId: (import.meta.env.VITE_COS_SECRET_ID as string) || '',
  SecretKey: (import.meta.env.VITE_COS_SECRET_KEY as string) || '',
  Bucket: (import.meta.env.VITE_COS_BUCKET as string) || 'paotuanguanjia-1493592486',
  Region: (import.meta.env.VITE_COS_REGION as string) || 'ap-guangzhou',
}

// ─── 密码哈希工具（防误碰，非安全加密）──────────────────────────────────────
/** 简单哈希：非加密安全，仅用于防止房间号撞车时误进入 */
export function hashPassword(password: string): string {
  let hash = 0
  const str = password + '::trpg-salt-v1'
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + ch
    hash |= 0
  }
  // 转为无符号 hex
  return (hash >>> 0).toString(16).padStart(8, '0')
}

let cosInstance: COS | null = null

/** 获取 COS 实例（永久密钥直传，单例） */
async function getCOS(): Promise<COS> {
  if (!cosInstance) {
    cosInstance = new COS({
      SecretId: COS_CONFIG.SecretId,
      SecretKey: COS_CONFIG.SecretKey,
    })
  }
  return cosInstance
}

// ─── 文件路径工具 ────────────────────────────────────────────────────────────

const BUCKET = COS_CONFIG.Bucket
const REGION = COS_CONFIG.Region

/** 房间密码 → COS 路径前缀 */
function roomPrefix(roomPassword: string): string {
  return `campaigns/${roomPassword}`
}

// ─── COS 操作 ────────────────────────────────────────────────────────────────

/** 上传 JSON 对象到 COS */
export async function uploadJSON(roomPassword: string, filePath: string, data: unknown): Promise<void> {
  const cos = await getCOS()
  const key = `${roomPrefix(roomPassword)}/${filePath}`

  return new Promise((resolve, reject) => {
    cos.putObject({
      Bucket: BUCKET,
      Region: REGION,
      Key: key,
      Body: JSON.stringify(data, null, 2),
      ContentType: 'application/json',
    }, (_err, _data) => {
      if (_err) reject(new Error(`上传失败: ${_err.message || JSON.stringify(_err)}`))
      else resolve()
    })
  })
}

/** 下载 JSON 对象 from COS */
export async function downloadJSON<T = unknown>(roomPassword: string, filePath: string): Promise<T> {
  const cos = await getCOS()
  const key = `${roomPrefix(roomPassword)}/${filePath}`

  return new Promise((resolve, reject) => {
    cos.getObject({
      Bucket: BUCKET,
      Region: REGION,
      Key: key,
    }, (err, data) => {
      if (err) {
        reject(new Error(`下载失败: ${err.message || JSON.stringify(err)}`))
      } else {
        try {
          const text = data.Body.toString('utf-8')
          resolve(JSON.parse(text) as T)
        } catch (e) {
          reject(new Error(`JSON 解析失败: ${e}`))
        }
      }
    })
  })
}

/** 列出目录下的文件 */
export async function listFiles(roomPassword: string, dirPath: string = ''): Promise<string[]> {
  const cos = await getCOS()
  const prefix = `${roomPrefix(roomPassword)}/${dirPath}`

  return new Promise((resolve, reject) => {
    cos.getBucket({
      Bucket: BUCKET,
      Region: REGION,
      Prefix: prefix,
    }, (err, data) => {
      if (err) {
        reject(new Error(`列目录失败: ${err.message || JSON.stringify(err)}`))
      } else {
        const files = (data.Contents || []).map((item: any) => item.Key)
        resolve(files)
      }
    })
  })
}

/** 删除文件 */
export async function deleteFile(roomPassword: string, filePath: string): Promise<void> {
  const cos = await getCOS()
  const key = `${roomPrefix(roomPassword)}/${filePath}`

  return new Promise((resolve, reject) => {
    cos.deleteObject({
      Bucket: BUCKET,
      Region: REGION,
      Key: key,
    }, (err) => {
      if (err) reject(new Error(`删除失败: ${err.message || JSON.stringify(err)}`))
      else resolve()
    })
  })
}

/** 检查文件是否存在 */
export async function fileExists(roomPassword: string, filePath: string): Promise<boolean> {
  const cos = await getCOS()
  const key = `${roomPrefix(roomPassword)}/${filePath}`

  return new Promise((resolve) => {
    cos.headObject({
      Bucket: BUCKET,
      Region: REGION,
      Key: key,
    }, (err) => {
      // 没有错误 = 存在
      resolve(!err)
    })
  })
}

// ─── 房间操作 ────────────────────────────────────────────────────────────────

export interface RoomIndex {
  characters: { id: string; name: string; rule_system: string; icon?: string }[]
  updated_at: string
}

/** 拉取房间索引 */
export async function fetchRoomIndex(roomPassword: string): Promise<RoomIndex | null> {
  try {
    return await downloadJSON<RoomIndex>(roomPassword, 'index.json')
  } catch {
    return null
  }
}

/** 更新房间索引 */
export async function uploadRoomIndex(roomPassword: string, index: RoomIndex): Promise<void> {
  await uploadJSON(roomPassword, 'index.json', index)
}

/** 拉取战役元数据 */
export async function fetchRoomMeta(roomPassword: string): Promise<any | null> {
  try {
    return await downloadJSON<any>(roomPassword, 'meta.json')
  } catch {
    return null
  }
}

/** 上传战役元数据 */
export async function uploadRoomMeta(roomPassword: string, meta: any): Promise<void> {
  await uploadJSON(roomPassword, 'meta.json', meta)
}

/** 拉取仓库数据 */
export async function fetchRoomWarehouse(roomPassword: string): Promise<any | null> {
  try {
    return await downloadJSON<any>(roomPassword, 'warehouse.json')
  } catch {
    return null
  }
}

/** 上传仓库数据 */
export async function uploadRoomWarehouse(roomPassword: string, warehouse: any): Promise<void> {
  await uploadJSON(roomPassword, 'warehouse.json', warehouse)
}

/** 上传单个角色数据 */
export async function uploadCharacter(roomPassword: string, character: any): Promise<void> {
  await uploadJSON(roomPassword, `characters/${character.id}.json`, character)
}

/** 拉取单个角色数据 */
export async function fetchCharacter(roomPassword: string, characterId: string): Promise<any | null> {
  try {
    return await downloadJSON<any>(roomPassword, `characters/${characterId}.json`)
  } catch {
    return null
  }
}

/** 拉取房间内所有角色数据 */
export async function fetchAllCharacters(roomPassword: string, index: RoomIndex): Promise<any[]> {
  const promises = index.characters.map(c => fetchCharacter(roomPassword, c.id))
  const results = await Promise.all(promises)
  return results.filter(r => r !== null)
}

// ─── 物品申请 ────────────────────────────────────────────────────────────────

/** 上传/更新一个物品申请（路径 requests/<id>.json） */
export async function uploadRequest(roomPassword: string, request: any): Promise<void> {
  await uploadJSON(roomPassword, `requests/${request.id}.json`, request)
}

/** 拉取房间内所有物品申请 */
export async function listRequests(roomPassword: string): Promise<any[]> {
  try {
    const files = await listFiles(roomPassword, 'requests')
    const ids = files
      .filter(f => f.endsWith('.json'))
      .map(f => f.split('/').pop()!.replace('.json', ''))
    const promises = ids.map(id => downloadJSON<any>(roomPassword, `requests/${id}.json`))
    const results = await Promise.all(promises)
    return results.filter(r => r !== null)
  } catch {
    return []
  }
}

// ─── 商店 ──────────────────────────────────────────────────────────────────
export async function uploadShop(roomPassword: string, data: any): Promise<void> {
  await uploadJSON(roomPassword, 'shop.json', data)
}

export async function fetchShop(roomPassword: string): Promise<any | null> {
  try {
    return await downloadJSON<any>(roomPassword, 'shop.json')
  } catch {
    return null
  }
}

export async function uploadShopOrder(roomPassword: string, order: any): Promise<void> {
  await uploadJSON(roomPassword, `shop_orders/${order.id}.json`, order)
}

export async function listShopOrders(roomPassword: string): Promise<any[]> {
  try {
    const files = await listFiles(roomPassword, 'shop_orders')
    const ids = files
      .filter(f => f.endsWith('.json'))
      .map(f => f.split('/').pop()!.replace('.json', ''))
    const promises = ids.map(id => downloadJSON<any>(roomPassword, `shop_orders/${id}.json`))
    const results = await Promise.all(promises)
    return results.filter(r => r !== null)
  } catch {
    return []
  }
}

/** 删除整个云端房间（meta + warehouse + index + characters/* + requests/* + trades/* + gifts/* + shop_orders/*） */
export async function deleteRoom(roomPassword: string): Promise<void> {
  const files = await listFiles(roomPassword, '')
  for (const file of files) {
    const relativePath = file.replace(`campaigns/${roomPassword}/`, '')
    await deleteFile(roomPassword, relativePath)
  }
}

// ─── 礼物赠予 ────────────────────────────────────────────────────────────────

/** 上传一个礼物请求（路径 gifts/<id>.json） */
export async function uploadGift(roomPassword: string, gift: any): Promise<void> {
  await uploadJSON(roomPassword, `gifts/${gift.id}.json`, gift)
}

/** 拉取房间内所有礼物请求 */
export async function listGifts(roomPassword: string): Promise<any[]> {
  try {
    const files = await listFiles(roomPassword, 'gifts')
    const ids = files
      .filter(f => f.endsWith('.json'))
      .map(f => f.split('/').pop()!.replace('.json', ''))
    const promises = ids.map(id => downloadJSON<any>(roomPassword, `gifts/${id}.json`))
    const results = await Promise.all(promises)
    return results.filter(r => r !== null)
  } catch {
    return []
  }
}
