/**
 * JournalExporter
 * 収集した翻訳データをJSON形式でエクスポートする。
 * マクロや手動操作からGMが任意のタイミングで実行する。
 */
import { JournalCollector } from "./collector.js";

export const JournalExporter = {

    /**
     * 収集済みデータをCompendiumごとのBabele翻訳JSONとしてダウンロードする。
     * パック1つにつき1ファイル（{collection}.json）を生成する。
     *
     * @param {object}  options
     * @param {string}  [options.mappingConverter="fvttJaJournalPages"] - mappingに記載するコンバータ名
     * @param {boolean} [options.changedOnly=false] - true の場合、ソースが変更されたページのみ出力
     */
    export({ mappingConverter = "fvttJaJournalPages", changedOnly = false } = {}) {
        const collected = JournalCollector.getAll();

        if (collected.size === 0) {
            ui.notifications?.warn(
                "fvtt-ja: エクスポートするデータがありません。" +
                "先にジャーナルを開くか、FVTTJa_collectJournals() を実行してください。"
            );
            return;
        }

        let fileCount  = 0;
        let entryCount = 0;

        for (const [packCollection, { label, entries }] of collected) {
            const filteredEntries = {};

            for (const [entryName, data] of Object.entries(entries)) {
                const filteredPages = {};
                for (const [pageName, pageData] of Object.entries(data.pages)) {
                    if (changedOnly && !pageData.text_ && !pageData.new_id) continue;
                    filteredPages[pageName] = pageData;
                }
                if (Object.keys(filteredPages).length === 0) continue;
                filteredEntries[entryName] = {
                    name:  data.name,
                    _id:   data._id,
                    pages: filteredPages
                };
            }

            if (Object.keys(filteredEntries).length === 0) continue;

            const output = {
                label,
                mapping: {
                    pages: {
                        path:      "pages",
                        converter: mappingConverter
                    }
                },
                entries: filteredEntries
            };

            foundry.utils.saveDataToFile(
                JSON.stringify(output, null, 2),
                "application/json",
                `${packCollection}.json`
            );
            fileCount++;
            entryCount += Object.keys(filteredEntries).length;
        }

        if (fileCount === 0) {
            ui.notifications?.info("fvtt-ja: 変更されたページはありません。");
            return;
        }

        console.log(
            `fvtt-ja | JournalExporter: ${fileCount}パック ${entryCount}件のエントリをエクスポートしました` +
            (changedOnly ? "（変更分のみ）" : "")
        );
    },

    /**
     * ゲーム内の全JournalEntry Compendiumを走査して翻訳データを収集する。
     * getDocument() を呼ぶことでコンバータが起動し、JournalCollector に蓄積される。
     * GMがマクロから実行することを想定。
     *
     * 実行後に export() を呼ぶことでJSONをダウンロードできる。
     */
    async collectAll() {
        if (!game.modules.get("babele")?.active) {
            console.warn("fvtt-ja | JournalExporter: Babeleが無効です");
            return;
        }

        ui.notifications?.info("fvtt-ja: ジャーナル収集を開始します...");
        JournalCollector.setSilent(true);
        let count = 0;

        for (const pack of game.packs) {
            if (pack.metadata.type !== "JournalEntry") continue;

            let index;
            try {
                index = await pack.getIndex();
            } catch (err) {
                console.warn(
                    `fvtt-ja | JournalExporter: パック "${pack.collection}" のインデックス取得失敗`,
                    err
                );
                continue;
            }

            for (const idx of index) {
                try {
                    // getDocument() を呼ぶことで Babele コンバータが起動し
                    // JournalCollector.collect() が実行される
                    await pack.getDocument(idx._id);
                    count++;
                } catch (err) {
                    console.warn(
                        `fvtt-ja | JournalExporter: ドキュメント取得失敗 "${idx.name}"`,
                        err
                    );
                }
            }
        }

        JournalCollector.setSilent(false);
        ui.notifications?.info(
            `fvtt-ja: ジャーナル収集完了（${count}件 / ` +
            `${JournalCollector.countEntries()}エントリ）`
        );
    }
};
