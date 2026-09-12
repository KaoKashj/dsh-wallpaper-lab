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
3. **选一项即开始下载**（不用再点 ⤓），下完**自动入库并切换为当前壁纸**；
   已下载过的条目会标 `✓ 已下载`，选中它**直接切换**，不会重复下载

> 下载与启用是两步：下载只是把文件放进素材库，插件随后会自动把它设为当前壁纸。
> 早期版本只下载不启用，点完看不出变化，容易误以为"没反应"。

内置十张，界面上按分类分组：

**人物**

| 名称 | 来源 | 大小 |
|---|---|---|
| 静刃武士（黑白） | moewalls | ~145 MB ⚠️ |
| 影骑士对泰坦 | moewalls | ~16 MB |

**天空 · 极光**

| 名称 | 来源 | 大小 |
|---|---|---|
| 银河 · 极光 · 雪山 | moewalls | ~35 MB |
| 极光星空 | moewalls | ~32 MB |
| 湖上极光 | moewalls | ~34 MB |
| 极光湖 · 星夜 | moewalls | ~22 MB |
| 极光湖面 | motionbgs | ~3 MB |
| 星夜 | motionbgs | ~24 MB |
| 夜空 | motionbgs | ~2 MB |
| 星系 | motionbgs | ~19 MB |

> 界面里超过 100 MB 的会标 `⚠大`。静刃武士那张实测 145 MB，
> 下载会比较久，也不适合当循环播放的背景（体积大、解码吃资源）。

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

**视频中央有播放三角 / 暂停图标（Safari 尤其容易）**

Safari 会拒绝静音视频的自动播放（实测 `NotAllowedError`，而且忽略"允许全部自动播放"设置，
属于 [WebKit 已知问题](https://wiki.webkit.org/show_bug.cgi?id=321264)）。所以插件**不依赖自动播放成功**：

- 视频元素初始 `visibility: hidden`，并在加载时把**第一帧画成 poster 静帧**（`.wall-poster`）
- 播放真的开始（`playing` 事件）时，才加 `.wall-playing` 类把视频露出来
- 于是：**自动播放被拦 → 你看到的是静帧画面；播放成功 → 无缝变成动态**

这样画面上永远不会出现播放键。想看动的，在页面上点一下（点击/按键/滚轮/触摸都算），
插件会借这次用户交互重新尝试播放。

如果点了还是不动，控制台看这两个值：

```js
window.__wallPlayState    // playing / blocked
window.__wallPlayError    // 被拒原因
window.__wallPoster       // ok / failed:xxx / missing
```

`__wallPoster` 不是 `ok` 说明连首帧都没取到（素材可能损坏）。

**下载卡住 / 失败**
moewalls 有限流：同一个文件 60 秒内只能下一次，短时间下太多会被封 5 分钟。等一会儿再试。

**装完没反应**
`dsh plugin` 会把它加进 profile 的 bundles，但**需要重启 `dsh web`**。
重启后浏览器 `Cmd+Shift+R` 强刷一次。

## 许可

MIT。插件代码随便用。

**壁纸素材的版权归原作者**，插件只提供下载入口，不打包、不再分发。用之前看一眼来源站点的条款。
