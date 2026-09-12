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

**视频中央有个播放三角**
Chrome 拦了自动播放。插件已经按 `muted` + `playsinline` 处理过，如果还出现，
检查一下素材是不是损坏（用播放器打开看看）。

**下载卡住 / 失败**
moewalls 有限流：同一个文件 60 秒内只能下一次，短时间下太多会被封 5 分钟。等一会儿再试。

**装完没反应**
`dsh plugin` 会把它加进 profile 的 bundles，但**需要重启 `dsh web`**。
重启后浏览器 `Cmd+Shift+R` 强刷一次。

## 许可

MIT。插件代码随便用。

**壁纸素材的版权归原作者**，插件只提供下载入口，不打包、不再分发。用之前看一眼来源站点的条款。
