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
#dsh-wall canvas { width: 100%; height: 100%; display: block; }
/* 壁纸视频不该有任何原生控件；也不接受指针事件（否则点画面会切到暂停态） */
#dsh-wall video { pointer-events: none; }
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
@keyframes wallDrift {
  0%   { background-position:   0% 50%; }
  50%  { background-position: 100% 50%; }
  100% { background-position:   0% 50%; }
}
@keyframes wallPan {
  from { background-position: 0 0; }
  to   { background-position: 240px 120px; }
}
.wall-lab { position: fixed; right: 14px; bottom: 56px; z-index: 2147483000; display: flex; gap: 6px; align-items: center;
  flex-wrap: wrap; max-width: min(760px, calc(100vw - 28px));
  padding: 7px 9px; border-radius: 12px; background: rgba(18,18,22,.88); color: #e8e8ee;
  font: 12px/1.2 -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif;
  border: 1px solid rgba(255,255,255,.16); box-shadow: 0 6px 24px rgba(0,0,0,.4); backdrop-filter: blur(12px); }
.wall-lab b { font-weight: 600; opacity: .68; margin-right: 2px; }
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

  var state = { mode: 'a', dim: 0.45, source: '' };
  var assets = [];
  var videoEl = null, canvasEl = null, rafId = 0, canvasRun = false;
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
    return (list || []).map(function (a) {
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
        body: JSON.stringify({ mode: state.mode, dim: state.dim, source: state.source })
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
    canvasEl = null;
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    canvasRun = false;
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

  function renderModeA(host) {
    var layer = el('div', 'wall-layer', host);
    layer.style.backgroundImage = 'linear-gradient(120deg, #16233f 0%, #3a2a5c 28%, #123c3f 55%, #241a3d 78%, #16233f 100%)';
    layer.style.backgroundSize = '420% 420%';
    layer.style.animation = 'wallDrift 44s ease-in-out infinite';
  }

  function renderModeB(host) {
    var svg = "<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'>" +
      "<rect width='240' height='240' fill='#0b0e14'/>" +
      "<g stroke='rgba(255,255,255,0.055)' stroke-width='1' fill='none'>" +
      "<path d='M0 60h240M0 120h240M0 180h240M60 0v240M120 0v240M180 0v240'/></g>" +
      "<g fill='rgba(255,255,255,0.085)'>" +
      "<circle cx='60' cy='60' r='2'/><circle cx='180' cy='120' r='2'/><circle cx='120' cy='180' r='2'/>" +
      "<circle cx='240' cy='240' r='2'/></g></svg>";
    var layer = el('div', 'wall-layer', host);
    layer.style.backgroundImage = 'url("data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg) + '")';
    layer.style.backgroundSize = '240px 240px';
    layer.style.animation = 'wallPan 60s linear infinite';
  }

  function renderModeC(host) {
    var src = pick('video');
    if (!src) { hint(host, '还没有视频素材：把 mp4/webm/mov 放进 ~/.dsh/theme-assets/ 后刷新'); return; }

    // 关键顺序（顺序错了 Chrome 就不让播，画面中央会出现 ▶）：
    //   1) 先落定 muted / playsinline —— 必须在设 src 之前，否则自动播放策略不认
    //   2) 先插进 DOM —— 游离节点上 play() 可能被忽略
    //   3) 最后才设 src
    var v = document.createElement('video')
    v.muted = true
    v.defaultMuted = true
    v.setAttribute('muted', '')
    v.setAttribute('playsinline', '')
    v.setAttribute('webkit-playsinline', '')
    // Safari 对前缀属性更敏感，几个历史前缀都补上
    v.setAttribute('x5-playsinline', '')
    v.setAttribute('x5-video-player-type', 'h5')
    v.setAttribute('disablepictureinpicture', '')
    v.setAttribute('controls', 'false')
    v.loop = true
    v.autoplay = true
    v.preload = 'auto'
    v.disablePictureInPicture = true
    v.controls = false

    host.appendChild(v)
    v.src = '/wallpaper-assets/' + src

    videoEl = v
    window.__wallVideo = v
    window.__wallSource = src

    var stopped = false
    var attempts = 0
    // Safari 的自动播放策略比 Chrome 严，重试窗口给长一些
    var MAX_ATTEMPTS = 90
    var lastError = null

    /// 播放成功：清掉之前的失败标记，否则诊断里会一直挂着一条过期的 NotAllowedError
    function markPlaying() {
      window.__wallPlayState = 'playing'
      window.__wallPlayError = null
    }

    function attempt() {
      if (stopped || videoEl !== v) return
      if (document.visibilityState !== 'visible') return
      if (!v.paused) { markPlaying(); return }

      // readyState < 2（还没有当前帧数据）时 play() 必被拒，等事件驱动即可，不用白试
      if (v.readyState < 2 && attempts < 70) { scheduleRetry(); return }

      // 有些浏览器会以"属性没同步到内部状态"为由拒绝播放，每次重试前再压一遍。
      // Safari 即使设了 muted，也可能因为"音轨存在"而拒绝，所以音量也压到 0。
      try { v.muted = true } catch (e) { /* 忽略 */ }
      try { v.defaultMuted = true } catch (e) { /* 忽略 */ }
      try { v.volume = 0 } catch (e) { /* 忽略 */ }

      attempts += 1
      var pr
      try {
        pr = v.play()
      } catch (e) {
        lastError = e
        scheduleRetry()
        return
      }
      if (pr && typeof pr.then === 'function') {
        pr.then(function () {
          markPlaying()
        }).catch(function (err) {
          lastError = err
          window.__wallPlayState = 'blocked'
          // 区分"策略拒绝"与"其他错误"：Safari 的策略拒绝是 NotAllowedError
          window.__wallPlayError = String((err && err.name) || err) +
            (err && err.name === 'NotAllowedError' ? '（浏览器拦了自动播放，等待一次用户交互）' : '')
          scheduleRetry()
        })
      }
    }

    function scheduleRetry() {
      if (stopped || attempts >= MAX_ATTEMPTS) return
      window.setTimeout(attempt, 220)
    }

    // 元数据就绪后开始尝试
    v.addEventListener('loadedmetadata', attempt)
    v.addEventListener('loadeddata', attempt)
    v.addEventListener('canplay', attempt)
    v.addEventListener('canplaythrough', attempt)

    // 播放被浏览器中断（切走标签页、系统休眠）后，回到可见就恢复
    v.addEventListener('pause', function () {
      if (document.visibilityState === 'visible') scheduleRetry()
    })

    document.addEventListener('visibilitychange', function () {
      if (videoEl !== v) return
      if (document.visibilityState === 'hidden') {
        try { v.pause() } catch (e) { /* 忽略 */ }
      } else {
        attempts = 0
        attempt()
      }
    })

    // 兜底：任何一次用户交互后（此时必然有 user activation）强制恢复播放。
    // 这是 Chrome 自动播放策略下唯一 100% 有效的路径。
    ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(function (evt) {
      document.addEventListener(evt, function () {
        if (stopped || videoEl !== v) return
        if (v.paused) { attempts = 0; attempt() }
      }, { passive: true })
    })

    attempt()

    // 最后兜底：8 秒后仍没播起来（浏览器就是不让），改用首帧静态图，
    // 但先量到视频尺寸再取帧，否则会得到一张 1920x1080 的空白。
    window.setTimeout(function () {
      if (stopped || videoEl !== v) return
      if (!v.paused) return   // 已经在播，什么都不做
      frameFallback()
    }, 8000)

    function frameFallback() {
      function draw() {
        try {
          var c = document.createElement('canvas')
          c.width = v.videoWidth || 1920
          c.height = v.videoHeight || 1080
          c.getContext('2d').drawImage(v, 0, 0, c.width, c.height)
          var img = document.createElement('img')
          img.alt = ''
          img.src = c.toDataURL('image/jpeg', 0.85)
          stopped = true
          while (host.firstChild) host.removeChild(host.firstChild)
          host.appendChild(img)
          window.__wallVideo = null
          window.__wallFallback = 'first-frame'
        } catch (e) {
          window.__wallFallback = 'failed:' + String(e && e.name)
        }
      }
      if (v.readyState >= 2) { draw(); return }
      // 还没拿到帧数据：等到能取帧再画，最多再等 6 秒
      var waited = 0
      var timer = window.setInterval(function () {
        waited += 300
        if (stopped || videoEl !== v) { window.clearInterval(timer); return }
        if (!v.paused) { window.clearInterval(timer); return }
        if (v.readyState >= 2) { window.clearInterval(timer); draw(); return }
        if (waited >= 6000) { window.clearInterval(timer); window.__wallFallback = 'no-frame-data'; }
      }, 300)
    }

    // 换素材/换模式时清理计时器与监听，避免上一支视频继续抢播放
    v.addEventListener('emptied', function () { stopped = true })
    window.__wallStopVideo = function () { stopped = true }
  }

  function renderModeE(host) {
    var src = pick('image');
    if (!src) { hint(host, '还没有图片素材：把 jpg/png/webp/gif 放进 ~/.dsh/theme-assets/ 后刷新'); return; }
    var img = document.createElement('img');
    img.src = '/wallpaper-assets/' + src;
    img.alt = '';
    host.appendChild(img);
    window.__wallSource = src;
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

  function renderModeD(host) {
    var c = document.createElement('canvas');
    c.style.width = '100%'; c.style.height = '100%';
    host.appendChild(c);
    canvasEl = c;
    window.__wallCanvas = c;
    var ctx = c.getContext('2d');
    var blobs = [];
    for (var i = 0; i < 5; i++) {
      blobs.push({
        x: Math.random(), y: Math.random(),
        r: 0.35 + Math.random() * 0.3,
        sx: (Math.random() - 0.5) * 0.00013,
        sy: (Math.random() - 0.5) * 0.00013,
        c: ['#5b8cff', '#8b5bd6', '#2fb6a6', '#d68b5b', '#5bd6c0'][i % 5]
      });
    }
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function frame() {
      var w = c.width, h = c.height;
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#0a0c12';
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      for (var i = 0; i < blobs.length; i++) {
        var b = blobs[i];
        if (!reduce) { b.x += b.sx; b.y += b.sy; }
        if (b.x < -0.2 || b.x > 1.2) b.sx = -b.sx;
        if (b.y < -0.2 || b.y > 1.2) b.sy = -b.sy;
        var g = ctx.createRadialGradient(b.x * w, b.y * h, 0, b.x * w, b.y * h, b.r * w);
        g.addColorStop(0, b.c + 'cc');
        g.addColorStop(1, b.c + '00');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }
      if (!reduce && canvasRun) rafId = requestAnimationFrame(frame);
    }
    function resize() {
      var dpr = Math.min(2, window.devicePixelRatio || 1);
      c.width = Math.max(1, Math.floor(c.clientWidth * dpr));
      c.height = Math.max(1, Math.floor(c.clientHeight * dpr));
    }
    resize();
    window.addEventListener('resize', resize);
    canvasRun = true;
    rafId = requestAnimationFrame(frame);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') { canvasRun = false; if (rafId) cancelAnimationFrame(rafId); rafId = 0; }
      else if (canvasEl === c && !canvasRun) { canvasRun = true; rafId = requestAnimationFrame(frame); }
    });
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
    if (state.mode === 'a') renderModeA(host);
    else if (state.mode === 'b') renderModeB(host);
    else if (state.mode === 'c') renderModeC(host);
    else if (state.mode === 'd') renderModeD(host);
    else if (state.mode === 'e') renderModeE(host);
    else if (state.mode === 'f') renderModeF(host);
  }

  function syncUI() {
    var buttons = window.__wallButtons || {};
    Object.keys(buttons).forEach(function (m) { buttons[m].setAttribute('aria-pressed', String(m === state.mode)); });
    var sel = window.__wallSelect;
    if (!sel) return;
      if (assets.length === 0) {
      sel.innerHTML = '';
      var none = document.createElement('option');
      none.textContent = '（无素材）';
      sel.appendChild(none);
      sel.disabled = true;
      return;
    }
    sel.disabled = false;
    sel.innerHTML = '';
    ['video', 'image'].forEach(function (kind) {
      var list = assetsOf(kind);
      if (!list.length) return;
      var group = document.createElement('optgroup');
      group.label = kind === 'video' ? '视频' : '图片/动图';
      list.forEach(function (item) {
        var opt = document.createElement('option');
        opt.value = item.file;
        opt.textContent = item.label;
        group.appendChild(opt);
      });
      sel.appendChild(group);
    });
    var wanted = pick(state.mode === 'e' ? 'image' : 'video');
    if (!wanted) wanted = pick(kindOf(state.source) === 'image' ? 'image' : 'video');
    if (wanted) sel.value = wanted;
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
    if (state.mode !== 'off') render();
    save();
  }

  /**
   * 构建控制条与小把手。
   * @param mode 'handle' = 默认收起成小把手；'always' = 常显；'hidden' = 完全不显示
   */
  function panel(mode) {
    if (mode === 'hidden') return;
    var bar = el('div', 'wall-lab', document.body);
    el('b', null, bar).textContent = '壁纸实验室';
    // 只保留「视频 / 桌面 / 关」三项（去掉了 A/B/D/E 与字母前缀）
    var labels = { c: '视频', f: '桌面', off: '关' };
    var buttons = {};
    ['c', 'f', 'off'].forEach(function (m) {
      var b = el('button', null, bar);
      b.textContent = labels[m];
      b.addEventListener('click', function () { switchMode(m); });
      buttons[m] = b;
    });
    el('div', 'wall-sep', bar);
    var sel = document.createElement('select');
    sel.title = '选择 ~/.dsh/theme-assets/ 里的素材';
    sel.addEventListener('change', function () { switchSource(sel.value); });
    bar.appendChild(sel);
    el('div', 'wall-sep', bar);
    var dlSel = document.createElement('select');
    dlSel.title = '从壁纸站下载素材到 ~/.dsh/theme-assets/';
    var dlBtn = el('button', 'wall-dim-btn', bar);
    dlBtn.textContent = '⤓';
    dlBtn.title = '下载选中的壁纸';
    var dlHint = el('span', null, bar);
    dlHint.style.cssText = 'font-size:11px;opacity:.7;margin-left:6px;white-space:nowrap';

    function pollJob() {
      fetch('/wallpaper-catalog').then(function (r) { return r.json(); }).then(function (d) {
        var j = d && d.job;
        if (!j) { dlBtn.disabled = false; return; }
        if (j.state === 'running') {
          var pct = j.total ? Math.round(j.received / j.total * 100) : 0;
          dlHint.textContent = '下载中 ' + pct + '%';
          dlBtn.disabled = true;
          setTimeout(pollJob, 700);
          return;
        }
        dlBtn.disabled = false;
        if (j.state === 'done') {
          var r = j.result || {};
          dlHint.textContent = '完成 ' + (r.mb || '?') + ' MB' + (r.codec ? ' · ' + r.codec : '');
          if (window.__wallReload) window.__wallReload();
          setTimeout(refreshCatalog, 800);
        } else if (j.state === 'error') {
          dlHint.textContent = '失败：' + (j.error || '未知错误');
        }
      }).catch(function () { dlBtn.disabled = false; });
    }

    function refreshCatalog() {
      fetch('/wallpaper-catalog').then(function (r) { return r.json(); }).then(function (d) {
        if (!d || !d.items) return;
        dlSel.innerHTML = '';
        d.items.forEach(function (it) {
          var opt = document.createElement('option');
          opt.value = it.id;
          opt.textContent = it.name + ' · ' + it.approxMB + 'MB' + (it.downloaded ? ' ✓' : '');
          dlSel.appendChild(opt);
        });
        if (d.job && d.job.state === 'running') pollJob();
      }).catch(function () { dlHint.textContent = '清单加载失败'; });
    }

    dlBtn.addEventListener('click', function () {
      var id = dlSel.value;
      if (!id) return;
      dlHint.textContent = '准备中…';
      dlBtn.disabled = true;
      fetch('/wallpaper-download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: id })
      }).then(function (r) { return r.json(); }).then(function (d) {
        if (!d || !d.ok) {
          dlBtn.disabled = false;
          dlHint.textContent = '失败：' + ((d && d.error) || '未知错误');
          return;
        }
        pollJob();
      }).catch(function (e) {
        dlBtn.disabled = false;
        dlHint.textContent = '失败：' + e;
      });
    });

    refreshCatalog();

    var reload = el('button', 'wall-dim-btn', bar);
    reload.textContent = '⟳';
    reload.title = '重新扫描素材目录（新下载的文件不用刷新页面）';
    reload.addEventListener('click', function () { if (window.__wallReload) window.__wallReload(); });
    var minus = el('button', 'wall-dim-btn', bar);
    minus.textContent = '−';
    minus.title = '更暗';
    minus.addEventListener('click', function () { setDim(state.dim + 0.1); });
    var plus = el('button', 'wall-dim-btn', bar);
    plus.textContent = '＋';
    plus.title = '更透亮';
    plus.addEventListener('click', function () { setDim(state.dim - 0.1); });
    window.__wallButtons = buttons;
    window.__wallSelect = sel;
    window.__wallReload = function () {
      fetch('/wallpaper-mode').then(function (r) { return r.json(); }).then(function (cfg) {
        assets = normAssets(cfg && cfg.assets);
        render();
        syncUI();
      });
    };

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
