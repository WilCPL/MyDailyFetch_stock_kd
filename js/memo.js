// ============================================================
// memo.js — 股票筆記 (Memo) 狀態管理 + localStorage 讀寫
// 資料結構: { [symbol]: { text: string, updatedAt: string } }
// ============================================================

const MEMO_STORAGE_KEY = 'stockMemos';

function loadMemos() {
    try {
        const saved = localStorage.getItem(MEMO_STORAGE_KEY);
        if (saved) return JSON.parse(saved);
    } catch (e) {
        console.warn('讀取 stockMemos 失敗，使用空物件', e);
    }
    return {};
}

let memos = loadMemos();

function persistMemos() {
    localStorage.setItem(MEMO_STORAGE_KEY, JSON.stringify(memos));
}

/**
 * 取得某支股票的筆記
 * @param {string} symbol
 * @returns {{ text: string, updatedAt: string } | null}
 */
export function getMemo(symbol) {
    return memos[symbol] || null;
}

/**
 * 判斷某支股票是否有筆記內容
 * @param {string} symbol
 * @returns {boolean}
 */
export function hasMemo(symbol) {
    const m = memos[symbol];
    return !!(m && m.text && m.text.trim());
}

/**
 * 儲存筆記
 * @param {string} symbol
 * @param {string} text
 */
export function saveMemo(symbol, text) {
    const trimmed = text.trim();
    if (!trimmed) {
        // 空文字 → 刪除
        delete memos[symbol];
    } else {
        memos[symbol] = {
            text: trimmed,
            updatedAt: new Date().toISOString(),
        };
    }
    persistMemos();
}

/**
 * 刪除筆記
 * @param {string} symbol
 */
export function deleteMemo(symbol) {
    delete memos[symbol];
    persistMemos();
}

/**
 * 取得所有筆記（供匯出用）
 * @returns {object}
 */
export function getAllMemos() {
    return JSON.parse(JSON.stringify(memos));
}

/**
 * 批次匯入筆記（供匯入備份用）
 * @param {object} imported - { [symbol]: { text, updatedAt } }
 * @param {'merge' | 'replace'} mode - merge: 合併（匯入覆蓋同 symbol），replace: 完全取代
 */
export function importMemos(imported, mode = 'merge') {
    if (!imported || typeof imported !== 'object') return;
    if (mode === 'replace') {
        memos = { ...imported };
    } else {
        // merge: 匯入的覆蓋既有的
        Object.assign(memos, imported);
    }
    persistMemos();
}
