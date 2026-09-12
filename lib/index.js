/**
 * 壁纸实验室（宿主侧插件）：
 *  - 起两条路由：/wallpaper-assets 静态资源、/wallpaper-mode 模式读写
 *  - 通过 webserver/index-inject 注入 CSS + 一段经典脚本，无需客户端 bundle
 */
import { mkdirSync, readFileSync, writeFileSync, statSync, readdirSync, createReadStream } from 'node:fs'
import { join, extname, basename, normalize, resolve } from 'node:path'
import { homedir } from 'node:os'
import { execFile } from 'node:child_process'
import { WALL_CSS, WALL_SCRIPT } from './inject.js'
import { CATALOG, catalogForUi, downloadToAssets, findDownloaded, sniffCodec, fileSizeMB } from './download.js'

export const name = 'dsh-wallpaper-lab'
// 需要 connection：它的 requestRejection() 是宿主自己用来保护 /api 的同一套校验，
// 复用它才能让本插件的路由也受鉴权保护，而不是自己发明一套。
export const inject = ['webServer', 'connection']

const ASSET_DIR = join(homedir(), '.dsh', 'theme-assets')
const CONFIG_PATH = join(ASSET_DIR, 'wallpaper.json')
/** macOS 记录当前桌面壁纸的地方（Sonoma 及以后）。 */
const DESKTOP_PLIST = join(homedir(), 'Library', 'Application Support', 'com.apple.wallpaper', 'Store', 'Index.plist')
/** 允许读取桌面壁纸的来源目录（避免把任意路径暴露成 HTTP 资源）。 */
const DESKTOP_ROOTS = [
  join(homedir(), 'Pictures'),
  join(homedir(), 'Desktop'),
  join(homedir(), 'Downloads'),
  join(homedir(), 'Movies'),
  '/System/Library/Desktop Pictures',
  '/Library/Desktop Pictures',
]
const MODES = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'off'])
/** 控制条的显示方式：小把手 / 常显 / 完全不显示。 */
const PANELS = new Set(['handle', 'always', 'hidden'])
const MIME = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
}

/** 读取持久化配置，坏文件回落到默认值。 */
function readConfig() {
  const fallback = { mode: 'a', dim: 0.45, source: '', panel: 'handle' }
  try {
    const parsed = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'))
    return {
      mode: typeof parsed.mode === 'string' && MODES.has(parsed.mode) ? parsed.mode : fallback.mode,
      dim: typeof parsed.dim === 'number' ? parsed.dim : fallback.dim,
      source: typeof parsed.source === 'string' ? parsed.source : fallback.source,
      panel: typeof parsed.panel === 'string' && PANELS.has(parsed.panel) ? parsed.panel : fallback.panel,
    }
  } catch {
    return fallback
  }
}

/** 写入配置（合并补丁）。 */
function writeConfig(patch) {
  const next = { ...readConfig(), ...patch }
  if (typeof next.mode === 'string' && !MODES.has(next.mode)) next.mode = 'a'
  if (typeof next.panel === 'string' && !PANELS.has(next.panel)) next.panel = 'handle'
  if (typeof next.dim === 'number') next.dim = Math.min(0.85, Math.max(0.1, next.dim))
  mkdirSync(ASSET_DIR, { recursive: true })
  writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2))
  return next
}

/** 前端显示名映射：素材基名（小写、去掉分辨率后缀）→ 下拉里显示的名字。 */
const DISPLAY_NAMES = {
  'aurora-lake': 'Lake',
  'aurora-milky-way-mountains': 'Milky way',
  'aurora-starry-sky': 'Starry sky',
}

/** 由文件名推"基名"：去掉扩展名 / 分辨率后缀 / live-wallpaper 后缀。 */
function assetBase(file) {
  let base = file.replace(/\.[a-z0-9]+$/i, '').toLowerCase()
  // 反复剥掉尾部后缀：-1920x1080 / -1080 / -1080p / -4k / -2k / -live-wallpaper …
  const SUFFIX = /-(?:\d{3,4}x\d{3,4}|\d{3,4}p?|[24]k|hd|uhd|fhd|qhd|live-wallpaper)$/i
  for (let i = 0; i < 4; i += 1) {
    const next = base.replace(SUFFIX, '')
    if (next === base) break
    base = next
  }
  return base
}

/** 基名 → 显示名；查不到表就退化成 Title Case。 */
function displayNameFor(base) {
  if (DISPLAY_NAMES[base] !== undefined) return DISPLAY_NAMES[base]
  return base.replace(/[-_]+/g, ' ').replace(/\b[a-z]/g, (c) => c.toUpperCase())
}

/**
 * 列出素材目录里可用的媒体文件，并给出显示名。
 * 同一基名（如 1080p 与 4K 版）归为一组，体积最大的那个加 " Pro"。
 * @returns [{ file, label, size }]
 */
function listAssets() {
  let names = []
  try {
    names = readdirSync(ASSET_DIR).filter((f) => MIME[extname(f).toLowerCase()] !== undefined && f !== 'wallpaper.json')
  } catch {
    return []
  }
  const groups = new Map()
  for (const name of names) {
    let size = 0
    try {
      size = statSync(join(ASSET_DIR, name)).size
    } catch {
      size = 0
    }
    const base = assetBase(name)
    if (!groups.has(base)) groups.set(base, [])
    groups.get(base).push({ file: name, size })
  }
  const rows = []
  for (const [base, items] of groups) {
    const label = displayNameFor(base)
    const maxSize = items.reduce((acc, i) => Math.max(acc, i.size), 0)
    const biggest = items.filter((i) => i.size === maxSize)
    const biggestFile = items.length > 1 && biggest.length === 1 ? biggest[0].file : null
    for (const item of items) {
      rows.push({
        file: item.file,
        label: item.file === biggestFile ? label + ' Pro' : label,
        size: item.size,
      })
    }
  }
  rows.sort((a, b) => a.label.localeCompare(b.label))
  return rows
}

/** 只在素材目录内解析请求路径，挡住目录穿越。 */
function resolveAsset(urlPath) {
  const rel = decodeURIComponent(urlPath.replace(/^\/wallpaper-assets\/?/, ''))
  if (rel === '' || rel.includes('\0')) return null
  const abs = resolve(join(ASSET_DIR, normalize(rel)))
  return abs === ASSET_DIR || abs.startsWith(ASSET_DIR + '/') ? abs : null
}

/**
 * 读取 macOS 当前桌面壁纸的文件路径。
 * 用 plutil 把 binary plist 转成 JSON 再遍历（plist 结构随版本变化，故做宽松遍历）。
 */
function readDesktopWallpaper() {
  return new Promise((done) => {
    execFile('plutil', ['-convert', 'json', '-o', '-', DESKTOP_PLIST], { maxBuffer: 8 * 1024 * 1024 }, (error, stdout) => {
      if (error || typeof stdout !== 'string') {
        done(null)
        return
      }
      let doc
      try {
        doc = JSON.parse(stdout)
      } catch {
        done(null)
        return
      }
      const urls = []
      const walk = (node) => {
        if (node === null || typeof node !== 'object') return
        if (Array.isArray(node)) {
          for (const item of node) walk(item)
          return
        }
        if (Array.isArray(node.Files)) {
          for (const item of node.Files) {
            if (typeof item === 'string') urls.push(item)
            else if (item !== null && typeof item === 'object' && typeof item.url === 'string') urls.push(item.url)
          }
        }
        for (const value of Object.values(node)) walk(value)
      }
      walk(doc)
      done(urls.length > 0 ? urls[urls.length - 1] : null)
    })
  })
}

/** 把 file:// URL 转成允许范围内的本地路径；越界返回 null。 */
function desktopWallpaperPath(url) {
  if (typeof url !== 'string' || !url.startsWith('file://')) return null
  let path
  try {
    path = decodeURIComponent(new URL(url).pathname)
  } catch {
    return null
  }
  return DESKTOP_ROOTS.some((root) => path === root || path.startsWith(root + '/')) ? path : null
}

/** 读取请求体（PUT 用）。 */
function readBody(req, limit = 4096) {
  return new Promise((done) => {
    let data = ''
    req.on('data', (chunk) => {
      data += chunk
      if (data.length > limit) req.destroy()
    })
    req.on('end', () => {
      try {
        done(JSON.parse(data || '{}'))
      } catch {
        done({})
      }
    })
    req.on('error', () => done({}))
  })
}

export function apply(ctx) {
  mkdirSync(ASSET_DIR, { recursive: true })
  const webServer = ctx.get('webServer')
  const connection = ctx.get('connection')

  /**
   * 请求鉴权：复用宿主的 connection.requestRejection()。
   * 它校验的是浏览器会话 cookie（由带 token 的启动地址签发）。
   * 拿不到 connection（比如脱离 dsh 单独跑）时放行，并在日志里说明，
   * 免得插件在异常部署下直接不可用。
   */
  function reject(req, res) {
    if (connection === undefined) return false
    let code
    try {
      code = connection.requestRejection(req)
    } catch {
      return false
    }
    if (code === undefined || code === null) return false
    res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' })
    res.end(code === 401 ? 'unauthorized\n' : 'forbidden\n')
    return true
  }

  ctx.effect(() => webServer.register({
    kind: 'prefix',
    path: '/wallpaper-assets',
    handler: (req, res) => {
      if (reject(req, res)) return
      const abs = resolveAsset(req.url ?? '')
      if (abs === null) {
        res.writeHead(404).end()
        return
      }
      let size
      try {
        const stat = statSync(abs)
        if (!stat.isFile()) throw new Error('not a file')
        size = stat.size
      } catch {
        res.writeHead(404).end()
        return
      }
      const type = MIME[extname(abs).toLowerCase()] ?? 'application/octet-stream'
      const range = req.headers?.range
      if (typeof range === 'string') {
        const m = /bytes=(\d*)-(\d*)/.exec(range)
        if (m !== null) {
          const start = m[1] === '' ? Math.max(0, size - Number(m[2])) : Number(m[1])
          const end = m[1] !== '' && m[2] !== '' ? Math.min(Number(m[2]), size - 1) : size - 1
          res.writeHead(206, {
            'Content-Type': type,
            'Content-Range': `bytes ${start}-${end}/${size}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': String(end - start + 1),
            'Cache-Control': 'no-cache',
          })
          createReadStream(abs, { start, end }).pipe(res)
          return
        }
      }
      res.writeHead(200, {
        'Content-Type': type,
        'Content-Length': String(size),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache',
      })
      createReadStream(abs).pipe(res)
    },
  }), 'wallpaper-lab: assets route')

  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: '/wallpaper-mode',
    handler: (req, res) => {
      if (reject(req, res)) return
      if (req.method === 'PUT' || req.method === 'POST') {
        void readBody(req).then((patch) => {
          const next = writeConfig(patch)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true, ...next }))
        })
        return
      }
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' })
      res.end(JSON.stringify({ ...readConfig(), assets: listAssets() }))
    },
  }), 'wallpaper-lab: mode route')

  // ---- 素材下载 ----
  // 下载是长任务（几十 MB），所以用「后台任务 + 轮询进度」而不是一个长连接。
  let job = null   // { id, name, received, total, state, error }

  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: '/wallpaper-catalog',
    handler: (req, res) => {
      if (reject(req, res)) return
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' })
      res.end(JSON.stringify({ ok: true, items: catalogForUi(), job }))
    },
  }), 'wallpaper-lab: catalog route')

  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: '/wallpaper-download',
    handler: (req, res) => {
      if (reject(req, res)) return
      if (req.method !== 'POST') {
        res.writeHead(405).end()
        return
      }
      void readBody(req).then((body) => {
        const id = typeof body?.id === 'string' ? body.id : ''
        const w = CATALOG.find((x) => x.id === id)
        if (w === undefined) {
          res.writeHead(404, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: '清单里没有这个壁纸：' + id }))
          return
        }
        if (job !== null && job.state === 'running') {
          res.writeHead(409, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: '已有下载在进行中' }))
          return
        }

        job = { id: w.id, name: w.name, received: 0, total: 0, state: 'running', error: null }
        res.writeHead(202, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, job }))

        void (async () => {
          try {
            const path = await downloadToAssets(w, {
              resolution: typeof body?.resolution === 'string' ? body.resolution : '1920x1080',
              onProgress: (p) => {
                if (job !== null) { job.received = p.received; job.total = p.total }
              },
            })
            const codec = sniffCodec(path)
            if (job !== null) {
              job.state = 'done'
              job.received = job.total || job.received
              job.result = { path, codec, mb: Number(fileSizeMB(path).toFixed(1)) }
            }
          } catch (err) {
            if (job !== null) {
              job.state = 'error'
              job.error = err instanceof Error ? err.message : String(err)
            }
          }
        })()
      })
    },
  }), 'wallpaper-lab: download route')

  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: '/wallpaper-downloaded',
    handler: (req, res) => {
      if (reject(req, res)) return
      const ids = CATALOG.filter((w) => findDownloaded(w) !== null).map((w) => w.id)
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' })
      res.end(JSON.stringify({ ok: true, ids }))
    },
  }), 'wallpaper-lab: downloaded route')

  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: '/wallpaper-desktop',
    handler: (req, res) => {
      if (reject(req, res)) return
      void readDesktopWallpaper().then((url) => {
        const path = desktopWallpaperPath(url ?? '')
        if (path === null) {
          res.writeHead(404, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({
            ok: false,
            error: url === null
              ? '当前用的是系统默认壁纸：请到「系统设置 → 墙纸」选一张自定义图片后重试'
              : '当前壁纸文件不在允许读取的目录内（仅支持 图片/桌面/下载/影片 与系统壁纸目录）',
          }))
          return
        }
        let size
        try {
          const stat = statSync(path)
          if (!stat.isFile()) throw new Error('not a file')
          size = stat.size
        } catch {
          res.writeHead(404, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: '壁纸文件读不到：' + path }))
          return
        }
        const type = MIME[extname(path).toLowerCase()] ?? 'application/octet-stream'
        res.writeHead(200, {
          'Content-Type': type,
          'Content-Length': String(size),
          'Cache-Control': 'no-cache',
        })
        createReadStream(path).pipe(res)
      })
    },
  }), 'wallpaper-lab: desktop wallpaper route')

  ctx.on('webserver/index-inject', (table) => {
    table.push({ kind: 'style', text: WALL_CSS })
    table.push({ kind: 'script', placement: 'body', text: WALL_SCRIPT })
  })
}

// 便于单独验证：显示名与素材列表的纯函数
export { listAssets, assetBase, displayNameFor }
