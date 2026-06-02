// ============================================================
// api.js — Yahoo Finance 資料獲取層
// ============================================================
import { PROXY_GENERATORS } from './config.js';
import { calculateKD, analyzeData } from './indicators.js';

// 記憶當前穩定運作的代理伺服器索引
let currentProxyIndex = 0;

// 一般載入允許短秒級快取，手動刷新可強制繞過
const CACHE_WINDOW_MS = 60000;

function buildCacheKey(forceFresh = false) {
    if (forceFresh) return Date.now();
    return Math.floor(Date.now() / CACHE_WINDOW_MS);
}

function formatLocalDate(date) {
    const pad = n => String(n).padStart(2, '0');
    return `${date.getMonth() + 1}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export async function fetchYahooData(symbol, options = {}) {
    const { forceFresh = false } = options;

    // 一般情況採短秒級快取；強制刷新時改為毫秒鍵，盡量取最新
    const cacheKey = buildCacheKey(forceFresh);

    const endpoints = [
        `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=6mo&_=${cacheKey}`,
        `https://query2.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=6mo&_=${cacheKey}`,
    ];

    let lastError;

    for (let endpoint of endpoints) {
        for (let attempt = 0; attempt < PROXY_GENERATORS.length; attempt++) {
            // 優先使用上次成功運作的代理器 (Sticky Proxy 機制)
            let proxyIndex = (currentProxyIndex + attempt) % PROXY_GENERATORS.length;
            let proxy = PROXY_GENERATORS[proxyIndex];
            let proxyUrl = proxy.build(endpoint);

            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 18000);

                let response;
                try {
                    response = await fetch(proxyUrl, {
                        signal: controller.signal,
                        headers: { 'Accept': 'application/json' },
                        cache: 'no-store',
                    });
                } catch (fetchErr) {
                    throw new Error(`NETWORK_ERROR (${fetchErr.name || fetchErr.message})`);
                } finally {
                    clearTimeout(timeoutId);
                }

                if (response.status === 404) throw new Error('NOT_FOUND');

                let text = await response.text();

                // 針對 allorigins /get 的特例解析
                if (proxy.id === 'allorigins_get') {
                    let jsonWrap;
                    try {
                        jsonWrap = JSON.parse(text);
                    } catch (e) {
                        throw new Error('INVALID_PROXY_JSON');
                    }
                    if (jsonWrap.status && jsonWrap.status.http_code === 404) throw new Error('NOT_FOUND');
                    text = jsonWrap.contents || '';
                }

                // 過濾非預期的純文字錯誤或 HTML（被阻擋或 Rate Limit）
                if (!text || text.trim().startsWith('<') || text.includes('Too Many Requests') || text.startsWith('Edge:')) {
                    throw new Error('PROXY_BLOCKED_OR_RATE_LIMIT');
                }

                let data;
                try {
                    data = JSON.parse(text);
                } catch (e) {
                    throw new Error('INVALID_YAHOO_JSON');
                }

                if (data && data.chart && data.chart.result) {
                    currentProxyIndex = proxyIndex; // 成功，記住此代理
                    return data;
                } else {
                    throw new Error('INVALID_YAHOO_FORMAT');
                }
            } catch (e) {
                lastError = e;
                console.warn(`[嘗試 ${proxy.id} 失敗]: ${e.message}`);

                if (e.message === 'NOT_FOUND') {
                    throw e; // 標的真的不存在，直接拋出
                }

                // 失敗後稍等 1.5 秒再試下一個代理
                await new Promise(resolve => setTimeout(resolve, 1500));
            }
        }
    }
    throw lastError || new Error('All endpoints and proxies failed');
}

export async function fetchStockData(item, options = {}) {
    const { forceFresh = false } = options;
    const fetchedAt = formatLocalDate(new Date());

    try {
        let parsed;
        try {
            parsed = await fetchYahooData(item.apiSymbol, { forceFresh });
        } catch (error) {
            if (error.message === 'NOT_FOUND') {
                // 嘗試另一個交易所後綴（.TW ↔ .TWO 互換）
                let fallbackSymbol = null;
                if (item.apiSymbol.endsWith('.TW')) {
                    fallbackSymbol = `${item.symbol}.TWO`;
                } else if (item.apiSymbol.includes('.TWO')) {
                    fallbackSymbol = `${item.symbol}.TW`;
                }
                if (fallbackSymbol) {
                    parsed = await fetchYahooData(fallbackSymbol, { forceFresh });
                } else {
                    throw error;
                }
            } else {
                throw error;
            }
        }

        const result = parsed.chart.result[0];
        const quotes = result.indicators.quote[0];

        // 取得最新股價
        const validCloses = quotes.close.filter(v => v !== null);
        const currentPrice = validCloses.length > 0 ? validCloses[validCloses.length - 1] : 'N/A';
        const formattedPrice = currentPrice !== 'N/A'
            ? currentPrice.toLocaleString('en-US', { maximumFractionDigits: 2 })
            : 'N/A';

        const kdData = calculateKD(quotes.high, quotes.low, quotes.close);
        const last = kdData[kdData.length - 1];
        const prev = kdData[kdData.length - 2];

        // 找最後一個有效的 K 値（防範未交易日派發 NaN 的情況）
        let kVal = NaN;
        for (let i = kdData.length - 1; i >= 0; i--) {
            if (Number.isFinite(kdData[i].k)) { kVal = kdData[i].k; break; }
        }
        let kdCross = '無';
        let remark = '';

        if (item.step !== 1) {
            // KD 狀態判斷：僅看最近 3 根是否發生有意義的交叉事件
            // 條件：K 穿越 D，且穿越當下 K <= 50（黃金交叉）或 K >= 50（死亡交叉）
            // 過濾高位/低位小幅震盪造成的假穿越訊號
            const EPS = 1e-6;
            const lookbackBars = 3;
            const startIdx = Math.max(1, kdData.length - lookbackBars);

            for (let i = kdData.length - 1; i >= startIdx; i--) {
                const p = kdData[i - 1];
                const c = kdData[i];
                if (!p || !c) continue;
                if (!Number.isFinite(p.k) || !Number.isFinite(p.d) || !Number.isFinite(c.k) || !Number.isFinite(c.d)) continue;

                const wasBelowOrEqual = p.k <= p.d + EPS;
                const wasAboveOrEqual = p.k >= p.d - EPS;
                const isAbove = c.k > c.d + EPS;
                const isBelow = c.k < c.d - EPS;

                // 黃金交叉：K 向上穿越 D，且穿越時 K 值 <= 50（排除高位震盪）
                if (wasBelowOrEqual && isAbove && c.k <= 50) {
                    kdCross = '黃金交叉';
                    break;
                }
                // 死亡交叉：K 向下穿越 D，且穿越時 K 值 >= 50（排除低位震盪）
                if (wasAboveOrEqual && isBelow && c.k >= 50) {
                    kdCross = '死亡交叉';
                    break;
                }
            }
        } else {
            kdCross = '—';
        }

        const analysis = analyzeData(item.step, kVal, kdCross);

        const sourceEpoch = Array.isArray(result.timestamp)
            ? result.timestamp.filter(v => Number.isFinite(v)).at(-1)
            : null;
        const sourceTime = sourceEpoch
            ? formatLocalDate(new Date(sourceEpoch * 1000))
            : fetchedAt;

        return {
            ...item,
            price: formattedPrice,
            kVal: kVal.toFixed(2),
            kdCross,
            location: analysis.location,
            advice: analysis.advice,
            remark,
            updateTime: sourceTime,
            fetchedAt,
            status: 'success',
        };
    } catch (error) {
        console.warn(`獲取 ${item.symbol} 失敗:`, error.message || error);

        return {
            ...item,
            price: 'N/A',
            kVal: 'N/A',
            kdCross: 'N/A',
            location: 'N/A',
            advice: '請你自行查詢',
            remark: '網路或伺服器阻擋',
            updateTime: fetchedAt,
            fetchedAt,
            status: 'error',
        };
    }
}
