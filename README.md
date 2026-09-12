# dsh-wallpaper-lab

给 [DeepSeek Harness](https://www.npmjs.com/package/@deepseek-ai/dsh)（dsh）的 Web 界面换动态壁纸。

视频背景、图片背景、跟随 macOS 桌面壁纸，三种都支持。右下角有个小把手，点开是控制条，不用了可以完全收起。

## 安装

```sh
# 从 npm
dsh plugin --profile web add dsh-wallpaper-lab

# 或者从仓库
dsh plugin --profile web add https://github.com/KaoKashj/dsh-wallpaper-lab
```

装完重启 `dsh web`，浏览器刷新一下就能看到右下角的 🎨 把手。

用的是别的 profile 就把 `web` 换成对应名字（比如 `desktop`）。

## 用

控制条上的东西从左到右是：

| 控件 | 作用 |
|---|---|
| `视频` / `桌面` / `关` | 切换壁纸类型 |
| 素材下拉框 | 选 `~/.dsh/theme-assets/` 里的哪个素材 |
| `⤓` + 下拉框 | **从壁纸站下载素材**（见下） |
| `⟳` | 重新扫描素材目录，新放进来的文件不用刷新页面 |
| `−` / `＋` | 调暗度，让背景别影响看字 |

素材放在 `~/.dsh/theme-assets/`（只扫顶层文件）：

- 视频：`mp4` / `webm` / `mov` / `m4v`
- 图片：`jpg` / `png` / `webp` / `gif` / `avif` / `svg`

放进去，点一下 `⟳` 就出现在下拉框里了。

## 下载素材

插件**不打包壁纸文件**（视频动辄几十 MB，而且那是别人的作品）。控制条里带了个下载入口，从壁纸站现抓：

1. 在 `⤓` 旁边的下拉框里选一张
2. 点 `⤓`，进度显示在旁边
3. 下完自动入库，下拉框里会出现 `✓`

内置的几张（都是星空 / 极光题材）：

| 名称 | 来源 | 大小 |
|---|---|---|
| 银河 · 极光 · 雪山 | moewalls | ~35 MB |
| 极光星空 | moewalls | ~32 MB |
| 极光湖面 | motionbgs | ~3 MB |
| 星空 | motionbgs | ~23 MB |
| 星夜 | motionbgs | ~24 MB |
| 夜空 | motionbgs | ~2 MB |
| 星系 | motionbgs | ~19 MB |

想加自己的，改 `lib/download.js` 里的 `CATALOG` 就行。

### 关于直链

两个站点的取法不一样，都写在 `lib/download.js` 的注释里了：

- **motionbgs**：页面 HTML 里直接有 `https://motionbgs.com/media/<id>/<slug>.<分辨率>.mp4`，
  分辨率可以换成 `960x540` / `1920x1080` / `3840x2160`，所以能直接拼。
- **moewalls**：地址是 `https://go.moewalls.com/download.php?video=<token>`，
  **token 是页面里动态生成的**（按钮 `<a id="moe-download" data-url="...">`），
  每次下载都要先抓一次页面。所以这里存的是**页面地址**，不是直链。

站点改版的话这里会失效，改 `resolveDirect()` 即可。

## 编码与播放

Chrome 只认 H.264（`avc1`）和 VP9（`vp09`）。下载完插件会读文件头报一下编码：

- `avc1` / `vp09` → 能直接播
- `hvc1` / `hev1`（HEVC）/ `av01`（AV1）→ 大概率是黑屏

碰到后者，用本机的 ffmpeg 转一道：

```sh
ffmpeg -i in.mp4 -c:v libx264 -crf 23 -t 15 -vf scale=1920:-2 out.mp4
```

（`-t 15` 只取前 15 秒，壁纸是循环播的，不需要整段。）

## 鉴权

插件的所有路由都复用了宿主的鉴权：调用 `connection.requestRejection(req)`，
和 dsh 自己保护 `/api` 用的是同一套校验（浏览器会话 cookie，由带 token 的启动地址签发）。

也就是说：**没有 token 打不开 dsh 界面，也同样打不开这些接口。**

拿不到 `connection` 服务时（比如脱离 dsh 单独跑）会放行并在注释里说明，避免插件在异常部署下完全不可用。

## 关于「桌面」模式

`桌面` = 跟随 macOS 当前的系统壁纸。实现方式是读
`~/Library/Application Support/com.apple.wallpaper/Store/Index.plist`。

**只在 macOS 上有用**，其他系统上这个按钮会提示不支持——插件本身在 Windows / Linux 上照常工作，
视频和图片模式都不受影响。

只会读这几个目录里的壁纸文件（不把任意路径暴露成 HTTP 资源）：

```
~/Pictures  ~/Desktop  ~/Downloads  ~/Movies
/System/Library/Desktop Pictures  /Library/Desktop Pictures
```

## 常见问题

**背景上有层白雾 / 字看不清**
调 `−` 把暗度加上去，或者换 `关`。

**视频中央有播放三角 / 暂停图标**
Chrome 的自动播放策略。插件按下面这几条处理，正常情况下不该再出现：

1. `muted` / `defaultMuted` / `playsinline` 在**设 src 之前**落定
2. 先插入 DOM，**最后**才设 `src`
3. `attempt()` 带重试：元数据就绪后最多试 40 次（每次间隔 220ms），
   并把 `play()` 的 Promise **真正接住**（早期版本用空 catch 吞掉了拒绝原因，
   所以既不知道失败原因也没有重试时机）
4. 任何一次用户交互（点击 / 按键 / 滚轮 / 触摸）后强制恢复播放 ——
   这是自动播放被拦时唯一 100% 有效的路径
5. 标签页切回来时重试；被浏览器暂停后自动恢复
6. 最后兜底：8 秒后仍没播起来 → 量到视频尺寸后取首帧做静态背景
   （早期版本不量尺寸，取出来是一张空白图）
7. CSS 隐藏 `::-webkit-media-controls-*`，并给 video 关掉 `pointer-events`

顺手记一个踩过的坑：`addEventListener(evt, fn, { passive: true })` 多写一个右括号时，
Chrome 会把 `{passive:true}` 当成**第四个参数** `wantsUntrusted`，
于是报 `Cannot read properties of undefined (reading 'touchstart')` ——
那组兜底监听根本没挂上，自动播放被拦时就真的只能手点了。

**下载卡住 / 失败**
moewalls 有限流：同一个文件 60 秒内只能下一次，短时间下太多会被封 5 分钟。等一会儿再试。

**装完没反应**
`dsh plugin` 会把它加进 profile 的 bundles，但**需要重启 `dsh web`**。
重启后浏览器 `Cmd+Shift+R` 强刷一次。

## 许可

MIT。插件代码随便用。

**壁纸素材的版权归原作者**，插件只提供下载入口，不打包、不再分发。用之前看一眼来源站点的条款。
