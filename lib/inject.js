/**
 * 注入到页面的 CSS 与脚本（宿主侧通过 webserver/index-inject 下发，无需客户端 bundle）。
 * 注意：字符串里不能出现 `</style` 或 `</script` 字面量，否则会提前闭合元素。
 */

/** 壁纸层与「让应用表面透出来」的样式。 */
export const WALL_CSS = `
html, body { background: transparent !important; }
#dsh-wall { position: fixed; inset: 0; z-index: 0; pointer-events: none; overflow: hidden; }
#dsh-wall .wall-layer { position: absolute; inset: 0; }
#dsh-wall video, #dsh-wall img { width: 100%; height: 100%; object-fit: cover; display: block; }
/* 壁纸视频不该有任何原生控件；也不接受指针事件（否则点画面会切到暂停态） */
#dsh-wall video { pointer-events: none; }
/* 显示层与播放层分离：
   .wall-poster 是独立的首帧静帧，一直显示（换壁纸立刻有画面）；
   video 只在真的开始播放时才显示，盖在静帧之上。
   这样自动播放被拦时用户看到的是静帧画面，而不是一个播放键、也不是全黑。 */
#dsh-wall .wall-poster { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
#dsh-wall video { visibility: hidden; position: relative; z-index: 1; }
#dsh-wall video.wall-playing { visibility: visible; }
#dsh-wall video::-webkit-media-controls,
#dsh-wall video::-webkit-media-controls-enclosure,
#dsh-wall video::-webkit-media-controls-panel,
#dsh-wall video::-webkit-media-controls-start-playback-button,
#dsh-wall video::-webkit-media-controls-overlay-play-button {
  display: none !important; -webkit-appearance: none !important; opacity: 0 !important;
}
#dsh-wall .wall-dim { background: var(--wall-dim, rgba(6,6,10,.45)); }
/* 透明遮罩：盖在视频之上，用来压掉 Safari 的原生播放/暂停控件。
   CSS 隐藏 ::-webkit-media-controls-* 在 Safari 上不可靠，这是更稳的做法。 */
#dsh-wall .wall-shield { position: absolute; inset: 0; z-index: 2; background: transparent; }
#dsh-wall .wall-hint { position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%);
  color: rgba(255,255,255,.75); font: 13px/1.6 -apple-system, sans-serif; text-align: center;
  background: rgba(0,0,0,.45); padding: 12px 16px; border-radius: 10px; }
#root { position: relative; z-index: 1; background: transparent !important; }
/* 官方主题层把 --dsw-alias-bg-base 定为不透明色，这里改成半透明，让壁纸透出来 */
:root { --dsw-alias-bg-base: var(--wall-surface, rgba(255,255,255,.45)) !important; }
html[data-ds-dark-theme], body[data-ds-dark-theme] { --dsw-alias-bg-base: var(--wall-surface-dark, rgba(14,14,18,.32)) !important; }
.wall-lab { position: fixed; right: 14px; bottom: 56px; z-index: 2147483000; display: flex; gap: 6px; align-items: center;
  flex-wrap: wrap; max-width: min(760px, calc(100vw - 28px));
  padding: 7px 9px; border-radius: 12px; background: rgba(18,18,22,.88); color: #e8e8ee;
  font: 12px/1.2 -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif;
  border: 1px solid rgba(255,255,255,.16); box-shadow: 0 6px 24px rgba(0,0,0,.4); backdrop-filter: blur(12px); }
.wall-lab button { min-width: 28px; height: 26px; padding: 0 9px; border-radius: 8px; cursor: pointer;
  border: 1px solid rgba(255,255,255,.18); background: rgba(255,255,255,.06); color: inherit; font: inherit; }
.wall-lab button[aria-pressed="true"] { background: rgba(120,170,255,.35); border-color: rgba(140,180,255,.6); }
.wall-lab button.wall-dim-btn { min-width: 24px; padding: 0 6px; }
.wall-lab select { height: 26px; max-width: 240px; border-radius: 8px; font: inherit; cursor: pointer;
  border: 1px solid rgba(255,255,255,.18); background: rgba(255,255,255,.06); color: inherit; }
.wall-lab .wall-sep { width: 1px; height: 18px; background: rgba(255,255,255,.18); margin: 0 2px; }
/* 收起状态的小把手：平时半透明，鼠标移上去才明显 */
.wall-toggle { position: fixed; right: 14px; bottom: 14px; z-index: 2147483000; width: 32px; height: 32px; padding: 0;
  display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 15px; line-height: 1;
  border-radius: 50%; color: #e8e8ee; background: rgba(18,18,22,.72); border: 1px solid rgba(255,255,255,.14);
  box-shadow: 0 4px 16px rgba(0,0,0,.35); backdrop-filter: blur(10px); opacity: .32; transition: opacity .15s ease; }
.wall-toggle:hover, .wall-toggle[aria-expanded="true"] { opacity: 1; }
`

/** 壁纸实验室运行时（经典脚本，注入到 body 起始处）。 */
export const WALL_SCRIPT = String.raw`
(function () {
  if (window.__wallLab) return;
  window.__wallLab = 'v2';

  var state = { mode: 'c', dim: 0.45, source: '', dynamic: false };
  var assets = [];
  var videoEl = null;
  var VIDEO_EXT = ['mp4', 'm4v', 'webm', 'mov'];
  var IMAGE_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'svg', 'bmp'];

  function ext(name) { var i = String(name).lastIndexOf('.'); return i < 0 ? '' : name.slice(i + 1).toLowerCase(); }
  function kindOf(name) {
    var e = ext(name);
    if (VIDEO_EXT.indexOf(e) >= 0) return 'video';
    if (IMAGE_EXT.indexOf(e) >= 0) return 'image';
    return 'other';
  }
  /** 兼容两种数据形状：旧版是字符串数组，新版是 {file,label,size}。 */
  function normAssets(list) {
    // 后端正常返回 [{file,label}]，但也容忍 {video:[...], image:[...]} 这种分组写法，
    // 否则 (list||[]).map 会抛 "map is not a function"。
    var arr;
    if (Array.isArray(list)) {
      arr = list;
    } else if (list && typeof list === 'object') {
      arr = [];
      ['video', 'image'].forEach(function (k) {
        if (Array.isArray(list[k])) arr = arr.concat(list[k]);
      });
    } else {
      arr = [];
    }
    return arr.map(function (a) {
      if (typeof a === 'string') return { file: a, label: a };
      return { file: a.file, label: a.label || a.file };
    });
  }
  function assetsOf(kind) { return assets.filter(function (a) { return kindOf(a.file) === kind; }); }
  function pick(kind) {
    if (kindOf(state.source) === kind) return state.source;
    var list = assetsOf(kind);
    return list.length ? list[0].file : '';
  }

  function el(tag, cls, parent) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (parent) parent.appendChild(n);
    return n;
  }

  function save() {
    try {
      fetch('/wallpaper-mode', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: state.mode, dim: state.dim, source: state.source, dynamic: state.dynamic })
      });
    } catch (e) {}
  }

  function applySurface(dim) {
    var root = document.documentElement;
    var surface = Math.min(0.9, Math.max(0.12, dim * 0.72));
    root.style.setProperty('--wall-dim', 'rgba(6,6,10,' + dim.toFixed(2) + ')');
    root.style.setProperty('--wall-surface', 'rgba(255,255,255,' + Math.min(0.9, surface + 0.18).toFixed(2) + ')');
    root.style.setProperty('--wall-surface-dark', 'rgba(14,14,18,' + surface.toFixed(2) + ')');
  }

  function buildWall() {
    var wall = document.getElementById('dsh-wall');
    if (!wall) {
      wall = el('div', null, document.body);
      wall.id = 'dsh-wall';
      el('div', 'wall-layer wall-host', wall);
      el('div', 'wall-layer wall-dim', wall);
      // 透明遮罩，z-index 在 host 之上、dim 之下
      el('div', 'wall-shield', wall);
    }
    return wall.querySelector('.wall-host');
  }

  function clearLayers() {
    if (videoEl) { try { videoEl.pause(); } catch (e) {} videoEl = null; }
    window.__wallSource = null;
    var wall = document.getElementById('dsh-wall');
    if (!wall) return null;
    var host = wall.querySelector('.wall-host');
    while (host.firstChild) host.removeChild(host.firstChild);
    return host;
  }

  function hint(host, text) {
    el('div', 'wall-hint', host).textContent = text;
  }

  /**
   * 静帧渲染（默认路径）：只显示首帧 JPEG，连 <video> 都不建 —— 零持续解码。
   * 首帧优先用随包发布的同名 .poster.jpg；加载失败再回退到"用 video 抓一帧"。
   * @param host - 壁纸层容器。
   * @param src - 素材文件名。
   */
  function renderPoster(host, src) {
    var img = document.createElement('img');
    img.className = 'wall-poster';
    img.alt = '';
    img.onerror = function () {
      if (window.__wallSource !== src) return;
      while (host.firstChild) host.removeChild(host.firstChild);
      grabFirstFrame(host, src);
    };
    img.src = '/wallpaper-assets/' + src.replace(/\.[^.]+$/, '') + '.poster.jpg';
    host.appendChild(img);
    window.__wallFallback = 'poster-file';
  }

  /**
   * 回退路径：包内没有首帧图时，用 video 解码一帧画成静态图，取到后立刻释放解码器。
   * @param host - 壁纸层容器。
   * @param src - 素材文件名。
   */
  function grabFirstFrame(host, src) {
    var v = document.createElement('video');
    v.muted = true;
    v.defaultMuted = true;
    v.setAttribute('muted', '');
    v.setAttribute('playsinline', '');
    v.preload = 'auto';
    v.src = '/wallpaper-assets/' + src;
    host.appendChild(v);
    var grabbed = false;
    function grab() {
      if (grabbed || window.__wallSource !== src) return;
      grabbed = true;
      try {
        var vw = v.videoWidth || 1920, vh = v.videoHeight || 1080;
        // 静帧按最长边 1920 降采样：壁纸够用，dataURL 也小得多
        var scale = Math.min(1, 1920 / Math.max(vw, vh));
        var c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(vw * scale));
        c.height = Math.max(1, Math.round(vh * scale));
        c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
        var url = c.toDataURL('image/jpeg', 0.85);
        try { v.pause(); } catch (e) { /* 忽略 */ }
        v.removeAttribute('src');
        try { v.load(); } catch (e) { /* 忽略 */ }   // 释放解码器
        if (window.__wallSource !== src) return;
        var out = document.createElement('img');
        out.className = 'wall-poster';
        out.alt = '';
        out.src = url;
        while (host.firstChild) host.removeChild(host.firstChild);
        host.appendChild(out);
        window.__wallFallback = 'poster-canvas';
      } catch (e) {
        while (host.firstChild) host.removeChild(host.firstChild);
        hint(host, '无法读取该视频的首帧，可点击 ▶ 直接播放');
      }
    }
    v.addEventListener('loadeddata', grab);
    v.addEventListener('seeked', grab);
    v.addEventListener('error', function () {
      if (grabbed) return;
      while (host.firstChild) host.removeChild(host.firstChild);
      hint(host, '该视频无法读取首帧，可点击 ▶ 直接播放');
    });
  }

  function renderModeC(host) {
    var src = pick('video');
    if (!src) { hint(host, '还没有视频素材：把 mp4/webm/mov 放进 ~/.dsh/theme-assets/ 后刷新'); return; }

    window.__wallSource = src;
    // 默认静帧：只显示包内首帧 JPEG，连 <video> 都不建 → 零持续解码。点 ▶ 才进动态。
    if (!state.dynamic) { renderPoster(host, src); return; }

    // ── 设计要点 ──────────────────────────────────────────────────────────
    // Safari 会拒绝静音视频的自动播放（实测 NotAllowedError，且忽略"允许自动播放"设置），
    // 所以"先试着播、失败再降级"这条路在 Safari 上不可靠 —— 用户会先看到一个播放键。
    //
    // 改成"显示层与播放层分离"：
    //   .wall-poster 是一张静帧，用 CSS(visibility) 决定露不露；
    //   video 一旦真的开始播，CSS 自动切到视频、静帧隐藏。
    // 于是自动播放被拦时用户看到的是静帧（不是播放键），一旦播放成功就无缝变动态。
    // ──────────────────────────────────────────────────────────────────────
    var v = document.createElement('video');
    // 顺序很关键：muted / playsinline 先落定 → 先入 DOM → 最后设 src
    v.muted = true;
    v.defaultMuted = true;
    v.setAttribute('muted', '');
    v.setAttribute('playsinline', '');
    v.setAttribute('webkit-playsinline', '');
    v.setAttribute('x5-playsinline', '');
    v.setAttribute('controls', 'false');
    v.loop = true;
    v.autoplay = true;
    v.preload = 'auto';
    v.controls = false;
    v.disablePictureInPicture = true;

    host.appendChild(v);
    v.src = '/wallpaper-assets/' + src;

    videoEl = v;
    window.__wallVideo = v;
    window.__wallSource = src;
    window.__wallFallback = null;

    var stopped = false;
    var attempts = 0;
    var MAX_ATTEMPTS = 90;
    var posterMade = false;

    function markPlaying() {
      window.__wallPlayState = 'playing';
      window.__wallPlayError = null;
      try { v.classList.add('wall-playing'); } catch (e) { /* 忽略 */ }
    }

    /**
     * 取第一帧做成**独立的 <img>**，铺在视频下面。
     *
     * 早先版本是把首帧设成 v.poster，但 CSS 里 video 默认 visibility:hidden
     * （为了在 Safari 拦自动播放时不露出播放键），poster 会跟着一起隐形 ——
     * 结果是"换了壁纸但画面完全不变"。
     * 改成独立 img 之后，静帧和视频的可见性互不影响：
     *   静帧：一直显示（换壁纸立刻有画面）
     *   视频：只有真的在播才显示，盖在静帧上
     */
    function makePoster() {
      if (posterMade || stopped || videoEl !== v) return;
      if (v.readyState < 2 || !v.videoWidth) return;
      try {
        var c = document.createElement('canvas');
        c.width = v.videoWidth;
        c.height = v.videoHeight;
        c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
        var img = document.createElement('img');
        img.className = 'wall-poster';
        img.alt = '';
        img.src = c.toDataURL('image/jpeg', 0.85);
        host.insertBefore(img, v);   // 插在 video 之前，天然在底层
        posterMade = true;
        window.__wallPoster = 'ok';
      } catch (e) {
        window.__wallPoster = 'failed:' + String(e && e.name);
      }
    }

    function attempt() {
      if (stopped || videoEl !== v) return;
      if (document.visibilityState !== 'visible') return;
      if (!v.paused) { markPlaying(); return; }
      if (v.readyState < 2) { makePoster(); scheduleRetry(); return; }

      // 每次重试前再压一遍：有些实现会以"属性没同步到内部状态"为由拒绝
      try { v.muted = true; v.defaultMuted = true; v.volume = 0; } catch (e) { /* 忽略 */ }

      attempts += 1;
      var pr;
      try {
        pr = v.play();
      } catch (e) {
        window.__wallPlayState = 'blocked';
        window.__wallPlayError = String(e && e.name) || String(e);
        scheduleRetry();
        return;
      }
      if (pr && typeof pr.then === 'function') {
        pr.then(function () {
          markPlaying();
        }).catch(function (err) {
          window.__wallPlayState = 'blocked';
          window.__wallPlayError = String((err && err.name) || err) +
            (err && err.name === 'NotAllowedError' ? '（浏览器拦了自动播放，等一次用户交互）' : '');
          scheduleRetry();
        });
      }
    }

    function scheduleRetry() {
      if (stopped || attempts >= MAX_ATTEMPTS) return;
      window.setTimeout(attempt, 220);
    }

    v.addEventListener('loadedmetadata', function () { makePoster(); attempt(); });
    v.addEventListener('progress', makePoster);
    v.addEventListener('loadeddata', function () { makePoster(); attempt(); });
    v.addEventListener('canplay', function () { makePoster(); attempt(); });
    v.addEventListener('canplaythrough', function () { makePoster(); attempt(); });

    // 被浏览器暂停（切标签、系统休眠）后回到可见就恢复
    v.addEventListener('pause', function () {
      if (document.visibilityState === 'visible') scheduleRetry();
    });

    document.addEventListener('visibilitychange', function () {
      if (videoEl !== v) return;
      if (document.visibilityState === 'hidden') {
        try { v.pause(); } catch (e) { /* 忽略 */ }
      } else {
        attempts = 0;
        attempt();
      }
    });

    // 用户交互后必然有 user activation —— 这是自动播放被拦时唯一可靠的恢复路径
    ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(function (evt) {
      document.addEventListener(evt, function () {
        if (stopped || videoEl !== v) return;
        if (v.paused) { attempts = 0; attempt(); }
      }, { passive: true });
    });

    attempt();

    // 兜底：8 秒后仍未播放，至少保证静帧已经就位（并再取一次，避免首帧取空）
    window.setTimeout(function () {
      if (stopped || videoEl !== v) return;
      if (!v.paused) return;
      makePoster();
      if (!posterMade) window.__wallPoster = 'missing';
    }, 8000);

    // playing / pause 事件驱动显示切换（比在 promise 回调里切更可靠）
    v.addEventListener('playing', function () {
      v.classList.add('wall-playing');
      markPlaying();
    });
    v.addEventListener('pause', function () {
      if (stopped) return;
      v.classList.remove('wall-playing');
    });
    v.addEventListener('waiting', function () {
      // 缓冲中：保持现状即可，不要切回静帧（会闪）
    });

    v.addEventListener('emptied', function () { stopped = true; });
    window.__wallStopVideo = function () { stopped = true; };
  }

  /** F 模式：跟随 macOS 当前桌面壁纸（宿主侧读 com.apple.wallpaper 的记录）。 */
  function renderModeF(host) {
    var img = document.createElement('img');
    img.alt = '';
    img.onerror = function () {
      fetch('/wallpaper-desktop').then(function (r) { return r.json(); }).then(function (body) {
        while (host.firstChild) host.removeChild(host.firstChild);
        hint(host, (body && body.error) || '读取桌面壁纸失败');
      }).catch(function () {
        while (host.firstChild) host.removeChild(host.firstChild);
        hint(host, '读取桌面壁纸失败');
      });
    };
    img.src = '/wallpaper-desktop?ts=' + Date.now();
    host.appendChild(img);
    window.__wallSource = '(桌面壁纸)';
  }

  function stopOldVideo() {
    if (typeof window.__wallStopVideo === 'function') {
      try { window.__wallStopVideo() } catch (e) { /* 忽略 */ }
    }
    window.__wallStopVideo = null
  }

  function render() {
    stopOldVideo()
    var host = clearLayers() || buildWall();
    var wall = document.getElementById('dsh-wall');
    window.__wallMode = state.mode;
    if (state.mode === 'off') { if (wall) wall.style.display = 'none'; return; }
    if (wall) wall.style.display = '';
    applySurface(state.dim);
    if (state.mode === 'f') renderModeF(host);
    else renderModeC(host);
  }

  function syncUI() {
    var buttons = window.__wallButtons || {};
    Object.keys(buttons).forEach(function (m) { buttons[m].setAttribute('aria-pressed', String(m === state.mode)); });
    var dyn = window.__wallDyn;
    if (dyn) {
      dyn.textContent = state.dynamic ? '⏸' : '▶';
      dyn.title = state.dynamic
        ? '动态播放中（持续解码）—— 点击切回静帧'
        : '当前静帧（零解码）—— 点击开启动态播放';
      dyn.setAttribute('aria-pressed', String(state.dynamic));
    }
    var sel = window.__wallSelect;
    if (!sel) return;
    var videos = assetsOf('video');
    if (videos.length === 0) {
      sel.innerHTML = '';
      var none = document.createElement('option');
      none.textContent = '（无视频素材）';
      sel.appendChild(none);
      sel.disabled = true;
      return;
    }
    sel.disabled = false;
    sel.innerHTML = '';
    videos.forEach(function (item) {
      var opt = document.createElement('option');
      opt.value = item.file;
      opt.textContent = item.label;
      sel.appendChild(opt);
    });
    var wanted = pick('video');
    if (wanted) sel.value = wanted;
  }

  /** 静帧 ⇄ 动态。开启动态时若当前不是视频模式，自动切过去。 */
  function toggleDynamic() {
    state.dynamic = !state.dynamic;
    if (state.dynamic && state.mode !== 'c') state.mode = 'c';
    render();
    syncUI();
    save();
  }

  function switchMode(mode) {
    state.mode = mode;
    render();
    syncUI();
    save();
  }

  function switchSource(name) {
    state.source = name;
    var k = kindOf(name);
    if (k === 'video') state.mode = 'c';
    else if (k === 'image') state.mode = 'e';
    render();
    syncUI();
    save();
  }

  function setDim(dim) {
    state.dim = Math.min(0.85, Math.max(0.1, dim));
    // 亮度只改 CSS 变量（--wall-dim / --wall-surface*），不必重建壁纸层：
    // 调 render() 会销毁 video / 重新拉流，白白丢掉正在解码的进度。
    if (state.mode !== 'off') applySurface(state.dim);
    save();
  }

  /**
   * 构建控制条与小把手。
   * @param mode 'handle' = 默认收起成小把手；'always' = 常显；'hidden' = 完全不显示
   */
  function panel(mode) {
    if (mode === 'hidden') return;
    var bar = el('div', 'wall-lab', document.body);
    // 只保留「视频 / 桌面 / 关」三项
    var labels = { c: '视频', f: '桌面', off: '关' };
    var buttons = {};
    ['c', 'f', 'off'].forEach(function (m) {
      var b = el('button', null, bar);
      b.textContent = labels[m];
      b.addEventListener('click', function () { switchMode(m); });
      buttons[m] = b;
    });
    // 静帧 / 动态开关：默认静帧（零解码）
    var dyn = el('button', 'wall-dim-btn', bar);
    dyn.type = 'button';
    dyn.addEventListener('click', function () { toggleDynamic(); });
    window.__wallDyn = dyn;
    el('div', 'wall-sep', bar);
    var sel = document.createElement('select');
    sel.title = '选择壁纸（包内 assets/ 与 ~/.dsh/theme-assets/）';
    sel.addEventListener('change', function () { switchSource(sel.value); });
    bar.appendChild(sel);
    window.__wallButtons = buttons;
    window.__wallSelect = sel;

    if (mode === 'always') {
      bar.style.display = 'flex';
      return;
    }

    bar.style.display = 'none';
    var toggle = el('button', 'wall-toggle', document.body);
    toggle.type = 'button';
    toggle.textContent = '🎨';
    toggle.title = '壁纸设置（点一下展开，再点收起）';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.addEventListener('click', function () {
      var open = bar.style.display !== 'none';
      bar.style.display = open ? 'none' : 'flex';
      toggle.setAttribute('aria-expanded', String(!open));
    });
    window.__wallToggle = toggle;
  }

  function boot() {
    fetch('/wallpaper-mode').then(function (r) { return r.json(); }).then(function (cfg) {
      if (cfg) {
        if (typeof cfg.mode === 'string') state.mode = cfg.mode;
        if (typeof cfg.dim === 'number') state.dim = cfg.dim;
        if (typeof cfg.source === 'string') state.source = cfg.source;
        if (typeof cfg.dynamic === 'boolean') state.dynamic = cfg.dynamic;
        assets = normAssets(cfg.assets);
      }
      panel(typeof (cfg && cfg.panel) === 'string' ? cfg.panel : 'handle');
      render();
      syncUI();
    }).catch(function () {
      panel('handle');
      render();
      syncUI();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
`
