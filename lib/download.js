/**
 * 壁纸素材：内置清单、直链解析、下载、入库。
 *
 * 分成三块：
 *  1. CATALOG —— 精选壁纸清单（页面地址 + 下载策略）
 *  2. resolveDirect() —— 把"页面地址"变成"可下载的直链"
 *  3. downloadToAssets() —— 下载并入库到 ~/.dsh/theme-assets/
 *
 * 关于直链：两类站点的取法不同，都是实测过的。
 *  - motionbgs：页面 HTML 里直接有 https://motionbgs.com/media/<id>/<slug>.<分辨率>.mp4，
 *    可以拼不同分辨率（960x540 / 1920x1080 / 3840x2160）。
 *  - moewalls：视频地址是 https://go.moewalls.com/download.php?video=<token>，
 *    其中 token 在页面里动态生成（按钮 <a id="moe-download" data-url="...">），
 *    所以每次下载都要先抓一次页面拿当期 token —— **不能把直链写死**。
 */
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { homedir } from 'node:os'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36'

const ASSET_DIR = join(homedir(), '.dsh', 'theme-assets')
const TMP_DIR = join(ASSET_DIR, '.downloads')

/** 支持的分辨率（仅 motionbgs 可切换）。 */
export const RESOLUTIONS = ['1920x1080', '3840x2160', '960x540']

/**
 * 精选壁纸清单。
 * `page` 是给人看的页面地址；`kind` 决定用哪种方式解析直链；`category` 用于界面分组。
 */
export const CATEGORIES = [
  { id: 'human', name: '人物' },
  { id: 'sky', name: '天空 · 极光' },
]

export const CATALOG = [
  // ── 人物 ──
  {
    id: 'silent-blade-samurai',
    name: '静刃武士（黑白）',
    category: 'human',
    site: 'moewalls',
    kind: 'moewalls',
    page: 'https://moewalls.com/fantasy/silent-blade-samurai-monochrome-live-wallpaper/',
    approxMB: 145,
  },
  {
    id: 'shadow-knight-vs-titan',
    name: '影骑士对泰坦',
    category: 'human',
    site: 'moewalls',
    kind: 'moewalls',
    page: 'https://moewalls.com/fantasy/shadow-knight-vs-titan-flame-live-wallpaper/',
    approxMB: 16,
  },

  // ── 天空 · 极光 ──
  {
    id: 'milky-way-aurora-mountains',
    name: '银河 · 极光 · 雪山',
    category: 'sky',
    site: 'moewalls',
    kind: 'moewalls',
    page: 'https://moewalls.com/landscape/milky-way-aurora-mountains-live-wallpaper/',
    approxMB: 35,
  },
  {
    id: 'aurora-starry-sky',
    name: '极光星空',
    category: 'sky',
    site: 'moewalls',
    kind: 'moewalls',
    page: 'https://moewalls.com/landscape/aurora-starry-sky-live-wallpaper/',
    approxMB: 32,
  },
  {
    id: 'aurora-over-the-lake',
    name: '湖上极光',
    category: 'sky',
    site: 'moewalls',
    kind: 'moewalls',
    page: 'https://moewalls.com/landscape/aurora-over-the-lake-live-wallpaper/',
    approxMB: 34,
  },
  {
    id: 'aurora-lake-starry-night-sky',
    name: '极光湖 · 星夜',
    category: 'sky',
    site: 'moewalls',
    kind: 'moewalls',
    page: 'https://moewalls.com/landscape/aurora-lake-starry-night-sky-live-wallpaper/',
    approxMB: 22,
  },
  {
    id: 'aurora-lake',
    name: '极光湖面',
    category: 'sky',
    site: 'motionbgs',
    kind: 'motionbgs',
    stem: 'https://motionbgs.com/media/7365/aurora-lake',
    approxMB: 3,
  },
  {
    id: 'starry-night',
    name: '星夜',
    category: 'sky',
    site: 'motionbgs',
    kind: 'motionbgs',
    stem: 'https://motionbgs.com/media/2938/starry-night',
    approxMB: 24,
  },
  {
    id: 'night-sky',
    name: '夜空',
    category: 'sky',
    site: 'motionbgs',
    kind: 'motionbgs',
    stem: 'https://motionbgs.com/media/3339/night-sky',
    approxMB: 2,
  },
  {
    id: 'galaxy',
    name: '星系',
    category: 'sky',
    site: 'motionbgs',
    kind: 'motionbgs',
    stem: 'https://motionbgs.com/media/3564/galaxy',
    approxMB: 19,
  },
]

export function catalogForUi() {
  return CATALOG.map((w) => ({
    id: w.id,
    name: w.name,
    category: w.category,
    site: w.site,
    approxMB: w.approxMB,
    page: w.page ?? w.stem,
    downloaded: findDownloaded(w) !== null,
  }))
}

/** 该壁纸是否已经下载过（按文件名前缀匹配）。 */
export function findDownloaded(w) {
  for (const ext of ['.mp4', '.m4v', '.webm', '.mov']) {
    const f = join(ASSET_DIR, w.id + ext)
    if (existsSync(f)) return f
  }
  return null
}

async function getText(url, referer) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, ...(referer ? { Referer: referer } : {}) },
    redirect: 'follow',
  })
  if (!res.ok) throw new Error(`页面返回 HTTP ${res.status}`)
  return await res.text()
}

/**
 * 把清单条目解析成可下载的直链。
 * @returns {Promise<{url: string, referer?: string, filename: string}>}
 */
export async function resolveDirect(w, { resolution = '1920x1080' } = {}) {
  if (w.kind === 'motionbgs') {
    const res = resolution && RESOLUTIONS.includes(resolution) ? resolution : '1920x1080'
    const url = `${w.stem}.${res}.mp4`
    return { url, filename: `${w.id}.mp4`, referer: w.page ?? w.stem }
  }

  if (w.kind === 'moewalls') {
    const html = await getText(w.page)
    const m = /id="moe-download"[^>]*data-url="([^"]+)"/.exec(html)
    if (m === null) {
      throw new Error('页面里没找到下载按钮（站点结构可能变了，或本页需要登录）')
    }
    // 实测正确形式是 ?video=<token>；写成 ?=video<token> 会返回 err=1001
    const url = `https://go.moewalls.com/download.php?video=${m[1]}`
    return { url, filename: `${w.id}.mp4`, referer: w.page }
  }

  throw new Error('未知的下载来源：' + String(w.kind))
}

/**
 * 下载并入库。返回落盘路径。
 * @param {(p: {received: number, total: number}) => void} [onProgress]
 */
export async function downloadToAssets(w, { resolution, onProgress } = {}) {
  mkdirSync(ASSET_DIR, { recursive: true })
  mkdirSync(TMP_DIR, { recursive: true })

  const { url, referer, filename } = await resolveDirect(w, { resolution })
  const tmpPath = join(TMP_DIR, filename + '.part')
  const finalPath = join(ASSET_DIR, filename)

  const res = await fetch(url, {
    headers: { 'User-Agent': UA, ...(referer ? { Referer: referer } : {}) },
    redirect: 'follow',
  })
  if (!res.ok) throw new Error(`下载失败：HTTP ${res.status}`)

  const total = Number(res.headers.get('content-length') ?? 0)
  let received = 0

  const body = Readable.fromWeb(res.body)
  body.on('data', (chunk) => {
    received += chunk.length
    if (onProgress) onProgress({ received, total })
  })

  try {
    await pipeline(body, createWriteStream(tmpPath))
  } catch (err) {
    try { unlinkSync(tmpPath) } catch { /* 忽略 */ }
    throw err
  }

  // 有些站点被限流时返回的是 HTML 错误页，别把它当视频入库
  if (total > 0 && total < 4096) {
    try { unlinkSync(tmpPath) } catch { /* 忽略 */ }
    throw new Error('拿到的不是视频（多半被站点限流或需要登录），请稍后重试')
  }

  renameSync(tmpPath, finalPath)
  return finalPath
}

/** 读文件头判断视频编码，用于提示浏览器能否直接播放。 */
export function sniffCodec(path) {
  const FOURCC = ['avc1', 'hvc1', 'hev1', 'av01', 'vp09']
  try {
    const buf = readFileSync(path)
    const hit = FOURCC.find((cc) => buf.includes(Buffer.from(cc)))
    return hit ?? null
  } catch {
    return null
  }
}

export function assetDir() {
  return ASSET_DIR
}

export function fileSizeMB(path) {
  try {
    return statSync(path).size / 1048576
  } catch {
    return 0
  }
}

export { basename, extname }
