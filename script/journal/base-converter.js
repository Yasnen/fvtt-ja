/**
 * BaseJournalConverter
 * ジャーナルページ翻訳の基底クラス。
 * 各システム固有のコンバータはこのクラスを継承して実装する。
 */
import { JournalCollector } from "./collector.js";

export class BaseJournalConverter {

    /**
     * @param {string} moduleId - このコンバータを持つモジュールのID
     */
    constructor(moduleId) {
        this.moduleId = moduleId;
    }

    /**
     * Babeleから呼び出されるメインのコンバータ関数。
     * JournalConverterRegistry.registerToBabele() から呼ばれる。
     *
     * @param {object[]} pages       - 原文のページ配列
     * @param {object}   translations - 翻訳JSONのentryデータ
     * @param {object}   context     - Babeleが渡すコンテキスト（document等）
     * @returns {object[]} 翻訳適用後のページ配列
     */
    convert(pages, translations, context, tc) {
        const entryName      = context?.name                    ?? "unknown";
        const entryId        = context?._id                     ?? "unknown";
        const packCollection = context?.pack?.collection        ?? "unknown";
        const packLabel      = context?.pack?.metadata?.label   ?? "Journals";
        const transPages     = translations ?? {};

        return pages.map(page => {
            const pageTrans = transPages[page._id] ?? transPages[page.name];

            // 収集（エクスポート用、ソース更新検出を含む）
            this.collect(entryName, entryId, page, pageTrans, packCollection, packLabel);

            if (!pageTrans) return page;

            return this.mergePageTranslation(page, pageTrans);
        });
    }

    /**
     * 翻訳データをページにマージする。
     * transformPage() を呼び出すため、継承先での追加処理はそちらに書く。
     *
     * @param {object} page      - 原文ページ
     * @param {object} pageTrans - 翻訳データ
     * @returns {object} マージ後のページ
     */
    mergePageTranslation(page, pageTrans) {
        const result = foundry.utils.deepClone(page);

        if (pageTrans.name) {
            result.name = pageTrans.name;
        }
        if (pageTrans.text && page.type === "text") {
            result.text = foundry.utils.mergeObject(
                result.text ?? {},
                { content: pageTrans.text }
            );
        }
        result.translated = true;

        return this.transformPage(result, pageTrans);
    }

    /**
     * ページの追加変換処理。
     * - bilingualJournal 設定が有効な場合に原文（_text）を翻訳後テキストへ付加
     *
     * @param {object} page      - mergePageTranslation() 適用後のページ
     * @param {object} pageTrans - 翻訳データ
     * @returns {object} 変換後のページ
     */
    transformPage(page, pageTrans) {
        if (page.type !== "text" || !page.text?.content) return page;

        if (game.settings.get("fvtt-ja", "bilingualJournal") && pageTrans?._text) {
            page.text.content += `<br /><hr />${pageTrans._text}`;
        }

        return page;
    }

    /**
     * ページデータを収集する（エクスポート用）。
     * 継承先でオーバーライドして追加の収集処理を行うことができる。
     *
     * @param {string}      entryName - ジャーナルエントリ名
     * @param {string}      entryId   - ジャーナルエントリID
     * @param {object}      page      - 原文ページ
     * @param {object|null} pageTrans - 翻訳データ（未翻訳の場合はnull）
     */
    collect(entryName, entryId, page, pageTrans, packCollection, packLabel) {
        JournalCollector.collect(entryName, entryId, page, pageTrans, packCollection, packLabel);
    }
}
