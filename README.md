# dsh-wallpaper-lab

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（dsh）的 Web 界面换动态壁纸。

自带 6 张素材，**默认只显示首帧静帧（零持续解码）**，想看动的点一下 `▶`。
也可以跟随 macOS 当前桌面壁纸。右下角一个小把手，点开是控制条，不用了完全收起。

## 特性

- **默认静帧，零解码** —— 静帧是一张 JPEG，连 `<video>` 都不创建；点 `▶` 才播视频
- **6 张内置素材**（1080p–4K，H.264）随包发布，装完即用，不需要下载
- **跟随 macOS 桌面壁纸**（`桌面` 模式）
- 支持你自己的素材目录 `~/.dsh/theme-assets/`
- 复用宿主鉴权，壁纸接口不会绕开 dsh 的登录校验

## 安装

> 尚未发布到 npm，请从仓库安装。

```sh
dsh plugin --profile web add github:KaoKashj/dsh-wallpaper-lab
```

装完**重启 `dsh web`**，浏览器 `Cmd+Shift+R` 强刷一次，右下角会出现 🎨 把手。

用别的 profile 就把 `web` 换成对应名字。

## 用法

控制条从左到右：

| 控件 | 作用 |
|---|---|
| `视频` / `桌面` / `关` | 壁纸类型（`桌面` = 跟随 macOS 系统壁纸） |
| `▶` / `⏸` | **静帧 ⇄ 动态**，默认静帧 |
| 下拉框 | 选素材：包内 `assets/` + 你的 `~/.dsh/theme-assets/` |

选中下拉框里的一项就立刻切换，没有别的步骤。

### 为什么默认静帧

视频壁纸的代价不是"下载慢"，而是**一直在解码**。4K60 的片源解码量可到约 500 MP/s（而 1080p30 只有约 62 MP/s），一整天循环播放足以让风扇转起来。

所以默认值是静帧：

- 静帧是随包发布的 `<同名>.poster.jpg`（1920×1080，143–326 KB）
- **连 `<video>` 元素都不创建** → 不占解码器、不占 CPU、不占带宽
- 想看动的点 `▶`，切回静帧点 `⏸`

代价是"平时不动"。这是刻意的取舍：壁纸是背景，不该和你的编译任务抢资源。

## 素材

### 内置（`assets/`）

| 显示名 | 文件 | 分辨率 | 体积 |
|---|---|---|---|
| Lake | `aurora-lake.mp4` | 3840×2160 | 17 MB |
| Milky way | `aurora-milky-way-mountains.mp4` | 2560×1440 | 35 MB |
| Night Sky | `night-sky.mp4` | 1920×1080 | 1.7 MB |
| Starry sky | `aurora-starry-sky.mp4` | 3840×2160 | 32 MB |
| Shadow Knight Vs Titan | `shadow-knight-vs-titan.mp4` | 1920×1080 | 16 MB |
| Silent Blade Samurai | `silent-blade-samurai.mp4` | 1920×1080 | 31 MB |

每个视频配一张同名首帧 `<文件名>.poster.jpg`（1920×1080），合计约 1.5 MB。

排序是刻意的：**风景类在前，以人为主体的两张（Shadow Knight / Silent Blade）垫底**。
名单在 `lib/index.js` 的 `PEOPLE_BASES` —— 加新素材时把它的基名加进去，就会自动排到最后。

### 你自己的素材

放进 `~/.dsh/theme-assets/`（只扫顶层文件）也会出现在下拉框里，支持 `mp4` / `webm` / `mov` / `m4v`。

**同名文件以你的为准** —— 包内素材只作为默认值，方便你用自己的版本覆盖内置的那份。

自备素材没有 `.poster.jpg`，静帧会自动回退到"用 video 抓一帧"（一次性解码 1 帧后立即释放解码器），不影响使用。

> 0.9.0 起只支持视频。图片壁纸模式已移除 —— 默认静帧已经覆盖了"零解码"这个诉求，图片模式是重复能力。

### 自备视频注意编码

Chrome 基本只认 H.264（`avc1`）与 VP9（`vp09`）；HEVC（`hvc1` / `hev1`）和 AV1（`av01`）大概率是黑屏。

转码用 macOS 自带的 `avconvert` 就够，不用装 ffmpeg：

```sh
# 转 1080p
avconvert -p Preset1920x1080 -s in.mp4 -o out.mp4

# 壁纸是循环播放的，只取前 15 秒往往就够（体积小很多）
avconvert -p Preset1920x1080 -s in.mp4 -o out.mp4 --duration 15
```

已有 ffmpeg 的话：

```sh
ffmpeg -i in.mp4 -c:v libx264 -crf 23 -t 15 -vf scale=1920:-2 out.mp4
```

## 「桌面」模式

`桌面` = 跟随 macOS 当前的系统壁纸。实现方式是读
`~/Library/Application Support/com.apple.wallpaper/Store/Index.plist`。

**只在 macOS 上有用**，其他系统上这个按钮会提示不支持 —— 插件本身在 Windows / Linux 上照常工作，
视频模式不受影响。

只会读这几个目录里的壁纸文件（不把任意路径暴露成 HTTP 资源）：

```
~/Pictures  ~/Desktop  ~/Downloads  ~/Movies
/System/Library/Desktop Pictures  /Library/Desktop Pictures
```

## 鉴权

插件的所有路由都复用了宿主的鉴权：调用 `connection.requestRejection(req)`，
和 dsh 自己保护 `/api` 用的是同一套校验（浏览器会话 cookie，由带 token 的启动地址签发）。

也就是说：**没有 token 打不开 dsh 界面，也同样打不开这些接口。**

拿不到 `connection` 服务时（比如脱离 dsh 单独跑）会放行并在注释里说明，避免插件在异常部署下完全不可用。

## 常见问题

**背景上有层白雾 / 字看不清**

暗度没有做进控制条（`−` / `＋` 两个按钮在 0.9.0 去掉了）。要调就编辑
`~/.dsh/theme-assets/wallpaper.json` 里的 `dim`（0.1 最透亮 → 0.85 最暗），存盘后刷新页面。
不想看见壁纸就直接点 `关`。

**视频中央有播放三角 / 暂停图标（Safari 尤其容易）**

Safari 会拒绝静音视频的自动播放（实测 `NotAllowedError`，而且忽略"允许全部自动播放"设置）。
所以插件**不依赖自动播放成功**：

- 默认静帧模式下根本没有 `<video>`，不可能出现播放键
- 点了 `▶` 之后：视频元素初始 `visibility: hidden`，播放真的开始（`playing` 事件）才加
  `.wall-playing` 类露出来
- 于是：**自动播放被拦 → 你看到的是静帧画面；播放成功 → 无缝变成动态**

如果点了 `▶` 还是不动，在页面上点一下（点击 / 按键 / 滚轮 / 触摸都算），插件会借这次用户交互重试播放。
控制台可以看这两个值：

```js
window.__wallPlayState    // playing / blocked
window.__wallPlayError    // 被拒原因
window.__wallPoster       // ok / failed:xxx / missing
```

相关背景：Safari 的自动播放策略见 [WebKit 的 autoplay 政策说明](https://webkit.org/blog/7734/auto-play-policy-changes-for-macos/)；
静音自动播放突然失效的近期报告见 [WebKit bug 321264](https://bugs.webkit.org/show_bug.cgi?id=321264)。

**装完没反应**

`dsh plugin` 会把它加进 profile 的 `dsh.profile.bundles`，但**需要重启 `dsh web`**，
之后浏览器 `Cmd+Shift+R` 强刷一次。

## 目录结构

```
dsh-wallpaper-lab/
├── assets/            内置素材（6 个视频 + 6 张首帧 JPEG）
├── lib/
│   ├── index.js       宿主端：素材路由、列举、配置读写
│   └── inject.js      浏览器端：注入 CSS + 控制条（经典脚本，无客户端 bundle）
├── cordis.patch.yml   bundle 层：往 loader 里插一行
└── package.json       dsh.bundle.patch 指向上面的 yml
```

## 许可

代码 MIT，随便用。

**素材**：`assets/` 里的视频与首帧来自公开壁纸站，版权归原作者，打包只为开箱即用。
如果你是权利人且不希望被分发，提个 issue，我会移除对应素材。
