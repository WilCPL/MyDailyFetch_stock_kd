// ============================================================
// ui.js — 渲染層（badge 產生、table row 等）
// ============================================================
import { getMemo, hasMemo, saveMemo } from './memo.js';

export function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

export function escapeAttr(str) {
    return String(str).replace(/"/g, '&quot;');
}

export function getYahooLink(apiSymbol) {
    // apiSymbol 已帶交易所後綴，如 2317.TW、00719B.TWO、^TWII
    const encodeSym = encodeURIComponent(apiSymbol);
    return `https://tw.stock.yahoo.com/quote/${encodeSym}/technical-analysis`;
}

function kBarColor(k) {
    if (k < 20) return '#3fb950';
    if (k > 80) return '#f85149';
    return '#d29922';
}

function locationBadge(loc) {
    if (loc === '低點') return `<span class="badge bdg-low">低點</span>`;
    if (loc === '高點') return `<span class="badge bdg-high">高點</span>`;
    if (loc === '中性') return `<span class="badge bdg-mid">中性</span>`;
    return `<span style="color:var(--text-dim);">—</span>`;
}

function kdBadge(kd) {
    if (kd === '黃金交叉') return `<span class="badge bdg-gold">↗ 黃金交叉</span>`;
    if (kd === '死亡交叉') return `<span class="badge bdg-dead">↘ 死亡交叉</span>`;
    if (kd === '無')       return `<span class="badge bdg-none">無</span>`;
    return `<span style="color:var(--text-dim);">${escapeHtml(kd)}</span>`;
}

function adviceHtml(advice, status) {
    if (status === 'error') return `<span class="adv-err">無法取得</span>`;
    const isBuy  = advice.includes('買');
    const isSell = advice.includes('賣');
    if (isBuy)  return `<span class="adv-buy">▲ ${escapeHtml(advice)}</span>`;
    if (isSell) return `<span class="adv-sell">▼ ${escapeHtml(advice)}</span>`;
    return `<span class="adv-hold">— ${escapeHtml(advice)}</span>`;
}

export function renderRow(row) {
    const tr = document.createElement('tr');
    tr.className = 'data-row row-in';
    tr.id = `row-${row.symbol}`;
    // data-advice: used by mobile CSS card left-border colour
    const _isBuy  = row.status !== 'error' && row.advice.includes('買');
    const _isSell = row.status !== 'error' && row.advice.includes('賣');
    tr.dataset.advice = _isBuy ? 'buy' : _isSell ? 'sell' : 'hold';

    const kNum = parseFloat(row.kVal);
    const kCellHtml = !isNaN(kNum)
        ? `<div class="k-cell">
               <span class="k-label">K</span>
               <div class="k-track"><div class="k-fill" style="width:${Math.min(100, Math.max(0, kNum)).toFixed(1)}%;background:${kBarColor(kNum)};"></div></div>
               <span class="k-val">${row.kVal}</span>
           </div>`
        : `<span style="color:var(--text-dim);">—</span>`;

    const sourceTime = row.updateTime || '';
    const fetchedAt = row.fetchedAt || '';
    const showFetchedLine = fetchedAt && fetchedAt !== sourceTime;
    const updateCell = `<div class="update-wrap">
            <span class="ts update-source" title="資料來源時間">源 ${escapeHtml(sourceTime)}</span>
            <span class="ts update-fetch" style="display:${showFetchedLine ? 'inline' : 'none'};" title="本次抓取時間">抓 ${escapeHtml(fetchedAt)}</span>
        </div>`;

    if (row.isAttention) {
        tr.classList.add('row-attention');
    }

    tr.innerHTML = `
        <td>
            <div class="name-cell">
                <button class="btn-star ${row.isAttention ? 'star-active' : ''}" onclick="toggleAttention('${row.symbol}')" aria-label="標記關注">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="${row.isAttention ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                    </svg>
                </button>
                <a href="${getYahooLink(row.apiSymbol)}" target="_blank" rel="noopener" class="stock-link">${escapeHtml(row.name)}</a>
            </div>
        </td>
        <td><span class="code-tag">${escapeHtml(row.symbol)}</span></td>
        <td><span class="price-val" style="color:${row.status === 'error' ? 'var(--text-dim)' : 'var(--text-primary)'};">${escapeHtml(row.price)}</span></td>
        <td>${kCellHtml}</td>
        <td>${kdBadge(row.kdCross)}</td>
        <td>${locationBadge(row.location)}</td>
        <td>
            <div class="advice-cell">
                ${adviceHtml(row.advice, row.status)}
                <button class="btn-memo ${hasMemo(row.symbol) ? 'memo-has-content' : ''}" onclick="toggleMemoPanel('${row.symbol}')" aria-label="筆記" title="筆記">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="${hasMemo(row.symbol) ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                    </svg>
                </button>
            </div>
        </td>
        <td>${updateCell}</td>
    `;
    return tr;
}

export function renderSkeletonRow() {
    const tr = document.createElement('tr');
    tr.className = 'data-row';
    tr.innerHTML = `
        <td><span class="skel" style="width:88px;height:13px;"></span></td>
        <td><span class="skel" style="width:52px;height:20px;border-radius:4px;"></span></td>
        <td><span class="skel" style="width:60px;height:13px;"></span></td>
        <td><span class="skel" style="width:64px;height:4px;border-radius:2px;"></span></td>
        <td><span class="skel" style="width:76px;height:20px;border-radius:20px;"></span></td>
        <td><span class="skel" style="width:44px;height:20px;border-radius:20px;"></span></td>
        <td><span class="skel" style="width:80px;height:13px;"></span></td>
        <td><span class="skel" style="width:72px;height:11px;"></span></td>
    `;
    return tr;
}

// ── Memo Drawer ──────────────────────────────────────────────

let currentDrawerSymbol = null;
let originalMemoText    = '';

function getOrCreateDrawer() {
    let drawer = document.getElementById('memoDrawer');
    if (!drawer) {
        drawer = document.createElement('div');
        drawer.id = 'memoDrawer';
        drawer.className = 'memo-drawer';
        drawer.innerHTML = `
            <div class="memo-drawer-backdrop" onclick="closeMemoDrawer()"></div>
            <div class="memo-drawer-content">
                <div class="memo-drawer-header">
                    <div class="memo-drawer-title-wrap">
                        <span id="memoDrawerStockName" class="memo-drawer-stock-name"></span>
                        <span id="memoDrawerStockSymbol" class="code-tag memo-drawer-stock-symbol"></span>
                    </div>
                    <button class="memo-drawer-close" onclick="closeMemoDrawer()" aria-label="關閉">✕</button>
                </div>
                <div class="memo-drawer-body">
                    <div class="memo-drawer-meta">
                        <span class="memo-title">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--accent-blue)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                            </svg>
                            投資筆記
                        </span>
                        <span id="memoDrawerTimestamp" class="memo-timestamp"></span>
                    </div>
                    <textarea id="memoDrawerTextarea" class="memo-textarea" placeholder="在這裡寫下研究筆記、目標價位、操作策略…" rows="12"></textarea>
                    <div class="memo-actions">
                        <button id="memoDrawerSaveBtn" class="btn btn-primary memo-save-btn">儲存筆記</button>
                        <span id="memoDrawerStatus" class="memo-save-status"></span>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(drawer);
    }
    return drawer;
}

export function toggleMemoPanel(symbol) {
    if (currentDrawerSymbol === symbol) {
        closeMemoDrawer();
        return;
    }

    // 如果切換到別的股票，先確認當前打開的股票是否可正常關閉
    if (currentDrawerSymbol !== null) {
        const closed = closeMemoDrawer();
        if (!closed) return; // 使用者取消關閉，不切換
    }

    openMemoDrawer(symbol);
}

export function openMemoDrawer(symbol) {
    const drawer = getOrCreateDrawer();

    // 從表格行中獲取股票名稱
    const dataRow = document.getElementById(`row-${symbol}`);
    let stockName = symbol;
    if (dataRow) {
        const link = dataRow.querySelector('.stock-link');
        if (link) stockName = link.textContent.trim();
    }

    currentDrawerSymbol = symbol;

    const nameEl   = document.getElementById('memoDrawerStockName');
    const symbolEl = document.getElementById('memoDrawerStockSymbol');
    const textarea = document.getElementById('memoDrawerTextarea');
    const tsEl     = document.getElementById('memoDrawerTimestamp');
    const saveBtn  = document.getElementById('memoDrawerSaveBtn');
    const statusEl = document.getElementById('memoDrawerStatus');

    if (nameEl)   nameEl.textContent   = stockName;
    if (symbolEl) symbolEl.textContent = symbol;
    if (statusEl) statusEl.textContent = '';

    const memo     = getMemo(symbol);
    const memoText = memo ? memo.text : '';
    if (textarea) textarea.value = memoText;
    originalMemoText = memoText; // 紀錄原始文字，用於偵測未儲存變更

    // 更新最後儲存時間
    const pad = n => String(n).padStart(2, '0');
    if (tsEl) {
        if (memo && memo.updatedAt) {
            const d = new Date(memo.updatedAt);
            tsEl.textContent = `最後儲存：${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
        } else {
            tsEl.textContent = '';
        }
    }

    // 綁定儲存按鈕
    if (saveBtn) {
        saveBtn.onclick = () => saveMemoFromDrawer(symbol);
    }

    // 顯示 drawer
    drawer.classList.add('drawer-active');
    document.body.classList.add('drawer-open');

    // 自動聚焦並移動游標至末尾
    if (textarea) {
        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    }
}

export function closeMemoDrawer() {
    const textarea = document.getElementById('memoDrawerTextarea');
    if (textarea) {
        const currentVal = textarea.value.trim();
        // 如果有修改且未儲存，提示使用者
        if (currentVal !== originalMemoText) {
            const confirmClose = confirm('您有尚未儲存的筆記修改，確定要直接關閉嗎？');
            if (!confirmClose) {
                return false; // 使用者選擇取消，保持開啟
            }
        }
    }

    const drawer = document.getElementById('memoDrawer');
    if (drawer) {
        drawer.classList.remove('drawer-active');
        document.body.classList.remove('drawer-open');
    }
    currentDrawerSymbol = null;
    originalMemoText    = '';
    return true; // 順利關閉
}

export function saveMemoFromDrawer(symbol) {
    const textarea = document.getElementById('memoDrawerTextarea');
    const statusEl = document.getElementById('memoDrawerStatus');
    const tsEl     = document.getElementById('memoDrawerTimestamp');
    if (!textarea) return;

    const currentVal = textarea.value;
    saveMemo(symbol, currentVal);
    originalMemoText = currentVal.trim(); // 儲存後更新基準，避免誤觸提示

    // 更新列表上的筆記按鈕高亮狀態
    const dataRow = document.getElementById(`row-${symbol}`);
    if (dataRow) {
        const memoBtn = dataRow.querySelector('.btn-memo');
        if (memoBtn) {
            const has = hasMemo(symbol);
            memoBtn.classList.toggle('memo-has-content', has);
            const svg = memoBtn.querySelector('svg');
            if (svg) svg.setAttribute('fill', has ? 'currentColor' : 'none');
        }
    }

    // 更新抽屜內的時間戳
    const pad   = n => String(n).padStart(2, '0');
    const d     = new Date();
    const stamp = `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    if (tsEl) tsEl.textContent = `最後儲存：${stamp}`;

    // 成功提示
    if (statusEl) {
        statusEl.textContent = '✓ 已儲存';
        statusEl.classList.add('memo-status-show');
        setTimeout(() => {
            statusEl.classList.remove('memo-status-show');
            setTimeout(() => { statusEl.textContent = ''; }, 300);
        }, 2000);
    }
}
