/**
 * JournalCollector
 * コンバータ実行時に原文データを収集し、エクスポート用に蓄積する。
 * 収集データは既存の journalPagesJP の出力フォーマットに合わせる。
 *
 * ─── _text と text_ の違い ───────────────────────────────────────────────
 *
 *  _text（翻訳者が書く・エクスポート時に自動生成）
 *    翻訳を作成した時点の原文スナップショット。
 *    翻訳JSONに保存され、次回以降のコンバータ実行時に「ソースが変わったか」を
 *    判定する基準として使われる。
 *    例: _text: "The creature attacks with its claws."
 *
 *  text_（コレクター実行時に自動生成・変更があった場合のみ存在）
 *    _text と現在の原文（page.text.content）を比較した結果、
 *    差異があった場合に現在の原文を格納する省略可能フィールド。
 *    このフィールドが存在する = ソースが更新されており翻訳の見直しが必要。
 *    例: text_: "The creature attacks with its claws, dealing 1d6 damage."
 *
 *  比較のイメージ:
 *    _text          ← 翻訳JSONに保存済みのスナップショット（過去）
 *    page.content   ← 今のゲームデータ（現在）
 *    text_          ← 両者が一致しない場合に現在値を記録（差分の証拠）
 *
 *  ── ソース更新後の翻訳ファイルの更新手順 ──────────────────────────────
 *
 *  text_ が存在するページ（ソース更新あり）:
 *    1. text_  の内容を確認し、変更箇所を把握する
 *    2. text   を新しいソースに合わせて翻訳し直す
 *    3. _text  を text_ の値で上書きする（新しいスナップショットとして保存）
 *    4. text_  フィールドを削除する（一時的な差分フィールドのため保存しない）
 *
 *  new_id が存在するページ（ページIDの変更あり）:
 *    1. _id    を new_id の値で上書きする
 *    2. new_id フィールドを削除する
 *
 *  更新後の正常な状態:
 *    { text: "翻訳テキスト", _text: "現在の原文", _id: "現在のid" }
 *    ← text_・new_id は存在しない
 *
 * ─────────────────────────────────────────────────────────────────────────
 *
 * 収集データ構造：
 * Map<packCollection, {
 *   label:   string,   // Compendiumのラベル
 *   entries: {
 *     [entryName]: {
 *       name:     string,  // 翻訳名（あれば）、なければ原文名
 *       _id:      string,
 *       pages: {
 *         [pageName]: {
 *           name:    string,   // 翻訳名（あれば）、なければ原文名
 *           text:    string,   // 翻訳テキスト（あれば）、なければ原文テキスト
 *           _id:     string,   // 翻訳JSONの_id
 *           _text:   string,   // 翻訳時点の原文スナップショット（→上記参照）
 *           new_id?: string,   // _idが変化していた場合の現在の_id
 *           text_?:  string,   // ソースが更新された場合の現在の原文（→上記参照）
 *         }
 *       }
 *     }
 *   }
 * }>
 */

const _collected = new Map();
let _noTextCount = 0;
let _updatedCount = 0;
let _lastReportedTotal = 0;
let _summaryTimer = null;
let _silent = false;

function _scheduleSummary() {
    if (_silent) return;
    if (_summaryTimer !== null) return;
    _summaryTimer = setTimeout(() => {
        _summaryTimer = null;
        const total = _noTextCount + _updatedCount;
        if (total <= _lastReportedTotal) return;
        _lastReportedTotal = total;
        console.warn(
            `fvtt-ja | ソース更新検出：合計 ${total} 件` +
            `（_textなし：${_noTextCount} 件、更新：${_updatedCount} 件）\n` +
            "  更新手順：1. FVTTJa_collectJournals() → 2. FVTTJa_exportJournals() でJSONをダウンロード → 3. 翻訳ファイルの text・_text を更新"
        );
    }, 0);
}

export const JournalCollector = {

    /**
     * ページデータを収集する。
     * コンバータの convert() から各ページごとに呼ばれる。
     *
     * @param {string}      entryName      - ジャーナルエントリ名
     * @param {string}      entryId        - ジャーナルエントリの_id
     * @param {object}      page           - 原文ページオブジェクト
     * @param {object|null} pageTrans      - 翻訳データ（未翻訳の場合はnull）
     * @param {string}      packCollection - Compendiumのcollection識別子
     * @param {string}      packLabel      - Compendiumの表示ラベル
     */
    collect(entryName, entryId, page, pageTrans, packCollection = "unknown", packLabel = "Journals") {
        if (!entryName || !page.text?.content) return;

        if (!_collected.has(packCollection)) {
            _collected.set(packCollection, { label: packLabel, entries: {} });
        }

        const pack    = _collected.get(packCollection);
        const entries = pack.entries;

        if (!(entryName in entries)) {
            entries[entryName] = { name: entryName, _id: entryId, pages: {} };
        }

        const pages = entries[entryName].pages;

        // 同名ページの重複登録はスキップ
        // （Babeleの仕様上、参照で読み込まれたジャーナルが複数回呼ばれることがある）
        if (page.name in pages) return;

        const pageData = {
            name:  pageTrans?.name  ?? page.name,
            text:  pageTrans?.text  ?? page.text.content,
            _id:   pageTrans?._id   ?? page._id,
            _text: pageTrans?._text ?? page.text.content
        };

        // _id の変化を記録
        if (pageTrans?._id && pageTrans._id !== page._id) {
            pageData.new_id = page._id;
        }

        // _text（保存済み原文）の変化を記録
        if (pageTrans?._text && pageTrans._text !== page.text.content) {
            pageData.text_ = page.text.content;
        }

        pages[page.name] = pageData;

        // ソース更新検出（checkSourceUpdate設定が有効な場合のみカウント）
        if (pageTrans && page.type === "text" && game.settings.get("fvtt-ja", "checkSourceUpdate")) {
            if (!pageTrans._text) {
                _noTextCount++;
                _scheduleSummary();
            } else if (pageTrans._text !== page.text.content) {
                _updatedCount++;
                _scheduleSummary();
            }
        }
    },

    /**
     * 収集済みの全データを返す。
     *
     * @returns {Map<string, { label: string, entries: object }>}
     */
    getAll() {
        return _collected;
    },

    /**
     * 収集済みエントリの総数を返す。
     *
     * @returns {number}
     */
    countEntries() {
        let total = 0;
        for (const { entries } of _collected.values()) {
            total += Object.keys(entries).length;
        }
        return total;
    },

    /**
     * サマリー出力を抑制する（手動収集中など）。
     * @param {boolean} flag
     */
    setSilent(flag) {
        _silent = flag;
    },

    /**
     * 収集データをクリアする。
     */
    clear() {
        _collected.clear();
        _noTextCount = 0;
        _updatedCount = 0;
        _lastReportedTotal = 0;
        if (_summaryTimer !== null) {
            clearTimeout(_summaryTimer);
            _summaryTimer = null;
        }
    }
};
