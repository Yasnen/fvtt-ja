/**
 * JournalConverterRegistry
 * システム別ジャーナルコンバータを管理するレジストリ。
 * fvtt-ja が Babele に登録するコンバータ "fvttJaJournalPages" の
 * ディスパッチャとして機能する。
 */

const _registry = new Map();

export const JournalConverterRegistry = {

    /**
     * システム固有のコンバータを登録する。
     * すでに同じsystemIdで登録済みの場合は警告を出してスキップする。
     *
     * @param {string}               systemId  - game.system.id に対応するキー。
     *                                           フォールバック用は "generic" を使う。
     * @param {BaseJournalConverter} converter - コンバータインスタンス
     */
    register(systemId, converter) {
        if (_registry.has(systemId)) {
            console.warn(
                `fvtt-ja | JournalConverterRegistry: ` +
                `"${systemId}" はすでに登録済みです。スキップします。`
            );
            return;
        }
        _registry.set(systemId, converter);
        console.log(
            `fvtt-ja | JournalConverterRegistry: コンバータ登録 "${systemId}"`
        );
    },

    /**
     * 現在のシステムに対応するコンバータを返す。
     * 見つからない場合は "generic" にフォールバックする。
     *
     * @returns {BaseJournalConverter|undefined}
     */
    getForCurrentSystem() {
        return (
            _registry.get(game.system.id) ??
            _registry.get("generic")
        );
    },

    /**
     * "fvttJaJournalPages" としてBabeleにコンバータを登録する。
     * fvtt-ja の init 時に1度だけ呼ぶ。
     */
    registerToBabele() {
        game.babele.registerConverters({
            "fvttJaJournalPages": (pages, translations, context, tc) => {
                const converter = JournalConverterRegistry.getForCurrentSystem();
                if (!converter) {
                    console.warn(
                        `fvtt-ja | JournalConverterRegistry: ` +
                        `システム "${game.system.id}" に対応するコンバータがありません`
                    );
                    return pages;
                }
                return converter.convert(pages, translations, context, tc);
            }
        });
        console.log(
            "fvtt-ja | JournalConverterRegistry: " +
            '"fvttJaJournalPages" をBabeleに登録しました'
        );
    }
};
