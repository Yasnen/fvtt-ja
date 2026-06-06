// init：設定登録 → 独自言語ファイルをモジュール／システムへ注入 → 動作環境チェック → ジャーナルコンバータ初期化
// 各責務は FvttJa の静的メソッドへ抽出済み（挙動は分割前と同一。実行順も維持すること）
Hooks.once("init", async () => {
    FvttJa.registerSettings();
    FvttJa.injectLanguageFiles();
    FvttJa.enforceEnvironment();
    await FvttJa.initJournalConverter();
});

// ready：言語ファイルフォルダの変更検知 → 言語ファイル追加機能 → 設定オーバーライドの実行
Hooks.on("ready", async () => {
    let langPath = game.settings.get("fvtt-ja", "langPath");
    FvttJa.resetLangFiles(langPath, false);

    if (game.settings.get("fvtt-ja", "langFileAddition")) {
        await FvttJa.processLangFileAdditions();
    }

    await FvttJa.applySettingOverrides();
});

class FvttJa {
    // ── init から抽出した初期化メソッド群 ─────────────────────────────────────────

    // 設定登録：設定画面に表示する設定と内部管理用設定を登録する
    static registerSettings() {
        // langFiles：言語ファイルフォルダのファイルパス一覧（内部管理用、設定画面非表示）
        game.settings.register("fvtt-ja", "langFiles", {
            type: Array,
            default: [],
            scope: 'world',
            config: false
        });
        // langPath：独自言語ファイルを格納するフォルダ（ユーザー設定）
        game.settings.register("fvtt-ja", 'langPath', {
            name: "FVTTJa.Settings.langPath.name",
            hint: "FVTTJa.Settings.langPath.hint",
            type: String,
            default: "",
            scope: 'world',
            config: true,
            filePicker: "folder",
            onChange: directory => {
                FvttJa.resetLangFiles(directory, true)
            }
        });
        // langFileAddition：英語元ファイルに差分キーがある場合に参照用コピーを自動作成するオプション
        game.settings.register("fvtt-ja", "langFileAddition", {
            name: "FVTTJa.Settings.langFileAddition.name",
            hint: "FVTTJa.Settings.langFileAddition.hint",
            type: Boolean,
            default: false,
            scope: 'world',
            config: true
        });
        // settingOverrideEnabled：モジュール設定翻訳の有効/無効
        game.settings.register("fvtt-ja", "settingOverrideEnabled", {
            name: "FVTTJa.Settings.settingOverrideEnabled.name",
            hint: "FVTTJa.Settings.settingOverrideEnabled.hint",
            type: Boolean,
            default: true,
            scope: 'world',
            config: true
        });
        // settingOverrideMismatch：モジュール設定の原文変更時の動作
        game.settings.register("fvtt-ja", "settingOverrideMismatch", {
            name: "FVTTJa.Settings.settingOverrideMismatch.name",
            hint: "FVTTJa.Settings.settingOverrideMismatch.hint",
            type: String,
            choices: {
                "original": "FVTTJa.Settings.settingOverrideMismatch.original",
                "translate": "FVTTJa.Settings.settingOverrideMismatch.translate"
            },
            default: "original",
            scope: 'world',
            config: true
        });
        // settingOverrideUserFile：追加設定翻訳ファイル（ユーザー定義）
        game.settings.register("fvtt-ja", "settingOverrideUserFile", {
            name: "FVTTJa.Settings.settingOverrideUserFile.name",
            hint: "FVTTJa.Settings.settingOverrideUserFile.hint",
            type: String,
            default: "",
            scope: 'world',
            config: true,
            filePicker: "any"
        });
    }

    // 言語ファイル注入：設定フォルダの言語ファイルを各モジュール／システムへ反映する
    static injectLanguageFiles() {
        // ready フックで processLangFileAdditions に渡すキュー（サブフォルダ方式・完全一致なし）
        FvttJa._additionQueue = [];

        let langPath = game.settings.get("fvtt-ja", "langPath");
        if (langPath != "") {
            let langFiles = game.settings.get("fvtt-ja", "langFiles");

            // langFiles をサブフォルダ方式とフラット方式に分類
            // サブフォルダ方式：{langPath}/{modId}/ 以下のファイル（-ja 必須、それ以外はスキップ）
            //   subfolderMap の構造: { modId: { [suffix]: [{path, version}] } }
            //   suffix = "" が主ファイル（ja.json / ja-{ver}.json）、それ以外が副ファイル（ja-compendium.json 等）
            // フラット方式：{langPath}/ 直下のファイル（-ja.json 必須）
            const subfolderMap = {};
            const flatFiles = [];

            langFiles.forEach(fname => {
                if (!fname.endsWith(".json")) return;
                const relPath = fname.slice(langPath.length).replace(/^\//, '');
                const parts = relPath.split('/');
                if (parts.length >= 2) {
                    const modId = parts[0];
                    const basename = parts[parts.length - 1];
                    const parsed = FvttJa.extractVersion(basename, modId);
                    if (parsed === false) return; // -ja なし（英語参照ファイル等）→ スキップ
                    const { suffix, version } = parsed;
                    if (!subfolderMap[modId]) subfolderMap[modId] = {};
                    if (!subfolderMap[modId][suffix]) subfolderMap[modId][suffix] = [];
                    subfolderMap[modId][suffix].push({ path: fname, version });
                } else {
                    if (fname.endsWith("-ja.json")) flatFiles.push(fname);
                }
            });

            // ── サブフォルダ方式 ──────────────────────────────────────────────────────
            for (const [modId, suffixGroups] of Object.entries(subfolderMap)) {
                const mod = game.modules.get(modId);
                const isSystem = modId === game.system.id || (!game.system.id && modId === game.system.name);

                let modVersion;
                if (mod) {
                    modVersion = mod.version ?? "0";
                } else if (isSystem) {
                    modVersion = game.system.version ?? "0";
                } else {
                    continue; // 対応するモジュール／システムが存在しない
                }

                // 言語ファイル追加機能用：選択した全日本語ファイルパスと完全一致の有無を追跡
                const selectedPaths = [];
                let hasAllExactVersions = true;

                if (mod) {
                    const lang = game.i18n.lang;
                    let ja = mod.languages.filter(l => l.lang == lang);
                    if (ja.size > 0) {
                        // 元ファイルのサフィックスに対応するグループを 1:1 でマッチング
                        // 対応グループがない元ファイルは置き換えない
                        ja.forEach(l => {
                            const suffix = FvttJa._origFileSuffix(l.path, lang);
                            if (suffix === null) return; // 命名規則外 → 置き換えない
                            const group = suffixGroups[suffix];
                            if (!group) return; // 対応グループなし → 置き換えない
                            const bestFile = FvttJa.selectBestFile(group, modVersion);
                            if (!bestFile) return;
                            const hasExact = group.some(f =>
                                f.version !== null && FvttJa.compareVersions(f.version, modVersion) === 0
                            );
                            if (!hasExact) hasAllExactVersions = false;
                            selectedPaths.push(bestFile);
                            FvttJa.log(`言語ファイル置換（サブフォルダ v${modVersion}${suffix ? ` suffix="${suffix}"` : ''}）「${l.path}」⇒「${bestFile}」`);
                            l.path = bestFile;
                        });
                    } else {
                        // ja ファイルなし → suffix '' のグループ（主ファイル）のみ追加
                        const group = suffixGroups[''];
                        if (group) {
                            const bestFile = FvttJa.selectBestFile(group, modVersion);
                            if (bestFile) {
                                FvttJa.log(`言語ファイル追加（サブフォルダ v${modVersion}）「${bestFile}」`);
                                mod.languages.add({ "lang": lang, "name": "日本語", "path": bestFile });
                                selectedPaths.push(bestFile);
                                const hasExact = group.some(f =>
                                    f.version !== null && FvttJa.compareVersions(f.version, modVersion) === 0
                                );
                                if (!hasExact) hasAllExactVersions = false;
                            }
                        }
                    }
                } else { // isSystem
                    // 検討（今後判断）：上の mod 分岐とほぼ重複。差分は言語ソース
                    //   （mod.languages / game.system.languages）と lang 値のみ。
                    //   (langSource, lang) を取るヘルパーへ統合可能。
                    //   なお mod 側は game.i18n.lang、システム側は "ja" 固定という非対称がある点に注意。
                    let ja = game.system.languages.filter(l => l.lang == "ja");
                    if (ja.size > 0) {
                        ja.forEach(l => {
                            const suffix = FvttJa._origFileSuffix(l.path, "ja");
                            if (suffix === null) return;
                            const group = suffixGroups[suffix];
                            if (!group) return;
                            const bestFile = FvttJa.selectBestFile(group, modVersion);
                            if (!bestFile) return;
                            const hasExact = group.some(f =>
                                f.version !== null && FvttJa.compareVersions(f.version, modVersion) === 0
                            );
                            if (!hasExact) hasAllExactVersions = false;
                            selectedPaths.push(bestFile);
                            FvttJa.log(`システム言語ファイル置換（サブフォルダ v${modVersion}${suffix ? ` suffix="${suffix}"` : ''}）「${l.path}」⇒「${bestFile}」`);
                            l.path = bestFile;
                        });
                    } else {
                        const group = suffixGroups[''];
                        if (group) {
                            const bestFile = FvttJa.selectBestFile(group, modVersion);
                            if (bestFile) {
                                FvttJa.log(`システム言語ファイル追加（サブフォルダ v${modVersion}）「${bestFile}」`);
                                game.system.languages.add({ "lang": "ja", "name": "日本語", "path": `${bestFile}` });
                                selectedPaths.push(bestFile);
                                const hasExact = group.some(f =>
                                    f.version !== null && FvttJa.compareVersions(f.version, modVersion) === 0
                                );
                                if (!hasExact) hasAllExactVersions = false;
                            }
                        }
                    }
                }

                // 言語ファイル追加機能：選択ファイルがあり、かつ完全一致でないものがある場合にキューへ積む
                if (selectedPaths.length > 0 && !hasAllExactVersions) {
                    const langSrc = mod ? mod.languages : game.system.languages;
                    const origEnPaths = langSrc
                        .filter(l => l.lang === "en")
                        .map(l => l.path)
                        .filter(Boolean);
                    if (origEnPaths.length > 0) {
                        FvttJa._additionQueue.push({ modId, modVersion, langPath, origEnPaths, selectedPaths });
                    }
                }
            }

            // ── フラット方式（サブフォルダ方式で処理済みのモジュールはスキップ）────────
            // 注意：複数の日本語ファイルを持つモジュールの場合、すべて同一ファイルに置き換わる
            flatFiles.forEach(fname => {
                let mod_name = fname.slice(fname.lastIndexOf('/') + 1, fname.lastIndexOf("-ja.json"));
                if (subfolderMap[mod_name]) return;

                let mod = game.modules.get(mod_name);
                if (mod) {
                    let ja = mod.languages.filter(lang => lang.lang == game.i18n.lang);
                    if (ja.size > 0) {
                        ja.forEach(lang => {
                            FvttJa.log(`言語ファイル置換「${lang.path}」⇒「${fname}」`);
                            lang.path = fname;
                        });
                    } else {
                        FvttJa.log(`言語ファイル追加「${fname}」`);
                        mod.languages.add({
                            "lang": game.i18n.lang,
                            "name": "日本語",
                            "path": fname
                        })
                    }
                } else if (mod_name == game.system.id || (!game.system.id && mod_name == game.system.name)) {
                    let ja = game.system.languages.filter(lang => lang.lang == "ja");
                    if (ja.size > 0) {
                        ja.forEach(lang => {
                            FvttJa.log(`システム言語ファイル置換「${lang.path}」⇒「${fname}」`);
                            lang.path = fname;
                        });
                    } else {
                        FvttJa.log(`システム言語ファイル追加「${fname}」`);
                        game.system.languages.add({ "lang": "ja", "name": "日本語", "path": `${fname}` });
                    }
                } else {
//                    FvttJa.log(`言語ファイル「${fname}」に対応するモジュール「${mod_name}」が有りません`);
                }
            });
        }
    }

    // 動作環境チェック：本モジュールが正しく使われているか検証し、不適合なら停止する
    // 検討（今後判断）：現在は injectLanguageFiles の後に実行している。
    //   不適合環境では言語注入が無駄になるため、init 先頭への移動を将来検討。
    static enforceEnvironment() {
        // このモジュールがデフォルト言語モジュールに設定されていない場合は警告して停止
        if (game.i18n.defaultModule !== "fvtt-ja") {
            window.alert("fvtt-ja：本モジュールを使用する場合\nFVTT本体の設定で、デフォルト言語に「日本語：Foundry VTT（MRyas私家版）」に設定してください。");
            game.shutDown();
            game.logOut();
        } else {
            // 競合モジュール foundryVTTja が導入されている場合は警告して停止
            // 検討（今後判断）：game.modules.get("foundryVTTja") で直引きに簡略化可能。
            game.modules.forEach(module => {
                if (module.id === "foundryVTTja") {
                    window.alert("fvtt-ja：You must uninstall foundryVTTja to use fvtt-ja.");
                    game.shutDown();
                    game.logOut();
                }
            })
        }
    }

    // ジャーナルコンバータ初期化（Babeleがある場合のみ）
    // 注意（今後判断）：init フックのハンドラ Promise は core に await されない。
    //   末尾の registerToBabele / journalReady は init 完了後に解決し得るため、
    //   babele 側の登録タイミングへの依存が崩れていないか変更時に確認すること。
    static async initJournalConverter() {
        if (game.modules.get("babele")?.active) {
            const { JournalConverterRegistry } =
                await import("./journal/converter-registry.js");
            const { BaseJournalConverter } =
                await import("./journal/base-converter.js");
            const { JournalCollector } =
                await import("./journal/collector.js");
            const { JournalExporter } =
                await import("./journal/exporter.js");

            game.settings.register("fvtt-ja", "bilingualJournal", {
                name: "FVTTJa.Settings.bilingualJournal.name",
                hint: "FVTTJa.Settings.bilingualJournal.hint",
                type: Boolean,
                scope: "world",
                default: false,
                config: true
            });
            game.settings.register("fvtt-ja", "checkSourceUpdate", {
                name: "FVTTJa.Settings.checkSourceUpdate.name",
                hint: "FVTTJa.Settings.checkSourceUpdate.hint",
                type: Boolean,
                scope: "world",
                default: true,
                config: true
            });

            JournalConverterRegistry.register(
                "generic", new BaseJournalConverter("generic")
            );
            JournalConverterRegistry.registerToBabele();

            globalThis.FVTTJa = {
                journal: {
                    BaseJournalConverter,
                    JournalConverterRegistry,
                    JournalCollector,
                    JournalExporter
                }
            };

            globalThis.FVTTJa_collectJournals =
                JournalExporter.collectAll.bind(JournalExporter);
            globalThis.FVTTJa_exportJournals =
                JournalExporter.export.bind(JournalExporter);
            globalThis.FVTTJa_listUpdated =
                JournalCollector.listUpdated.bind(JournalCollector);

            Hooks.callAll("fvtt-ja.journalReady");
            FvttJa.log("Babele検出：ジャーナルコンバータ登録完了");
        }
    }

    // ── 既存メソッド群 ────────────────────────────────────────────────────────────

    // 言語ファイルフォルダをスキャンし、前回からの変更があれば設定を更新してリロードを促す
    // フォルダ直下（フラット）とサブフォルダ1段階（モジュールIDフォルダ）を対象とする
    static async resetLangFiles(directory, reload = false) {
        if (directory != "") {
            let langFiles = game.settings.get("fvtt-ja", "langFiles");
            let ret = await foundry.applications.apps.FilePicker.implementation.browse("data", directory);

            let allFiles = [...ret.files];
            for (const subdir of ret.dirs) {
                let subRet = await foundry.applications.apps.FilePicker.implementation.browse("data", subdir);
                allFiles = allFiles.concat(subRet.files);
            }

            if (JSON.stringify(langFiles.sort()) != JSON.stringify(allFiles.sort())) {
                await game.settings.set("fvtt-ja", "langFiles", allFiles);
                if (reload || confirm("言語ファイルが変更されています\nリロードしますか？")) {
                    window.location.reload()
                }
            }
        }
        if (reload) window.location.reload()
    }

    // 言語ファイル追加機能：init で積まれたキューを処理する
    // 実行条件（両方を満たす場合）：
    //   1. サブフォルダ内にモジュールの現バージョンと完全一致するファイルが存在しない
    //   2. 英語元ファイル群に、選択済み日本語ファイル群にないキーが存在する
    // 処理：英語元ファイルを {元のbasename}-{version}-en.json としてサブフォルダへ個別複製
    static async processLangFileAdditions() {
        if (!FvttJa._additionQueue || FvttJa._additionQueue.length === 0) return;

        for (const { modId, modVersion, langPath, origEnPaths, selectedPaths } of FvttJa._additionQueue) {
            try {
                // 英語元ファイルをすべて取得
                const origDataMap = new Map(); // path → data
                for (const origPath of origEnPaths) {
                    const resp = await fetch(origPath);
                    if (!resp.ok) {
                        FvttJa.log(`言語ファイル追加機能：「${modId}」英語ファイル取得失敗（${origPath}）`);
                        continue;
                    }
                    origDataMap.set(origPath, await resp.json());
                }
                if (origDataMap.size === 0) continue;

                // 選択済み日本語ファイルを全て取得してキーを合算
                const selKeys = new Set();
                for (const selectedPath of selectedPaths) {
                    const selResp = await fetch(selectedPath);
                    if (!selResp.ok) {
                        FvttJa.log(`言語ファイル追加機能：「${modId}」選択ファイル取得失敗（${selectedPath}）`);
                        continue;
                    }
                    FvttJa._getLeafKeys(await selResp.json()).forEach(k => selKeys.add(k));
                }

                // 全英語ファイルの葉キーを合算し、選択ファイル群にないキーを検出
                const allOrigKeys = new Set();
                for (const data of origDataMap.values()) {
                    FvttJa._getLeafKeys(data).forEach(k => allOrigKeys.add(k));
                }
                const newKeys = [...allOrigKeys].filter(k => !selKeys.has(k));

                if (newKeys.length === 0) {
                    FvttJa.log(`言語ファイル追加機能：「${modId}」v${modVersion} 差分キーなし`);
                    continue;
                }

                FvttJa.log(`言語ファイル追加機能：「${modId}」v${modVersion} 差分キー ${newKeys.length} 件`);

                // 英語元ファイルを個別に複製（既存ファイルはスキップ）
                const dirPath = `${langPath}/${modId}`;
                for (const [origPath, origData] of origDataMap) {
                    const origBasename = origPath.slice(origPath.lastIndexOf('/') + 1, -5); // .json 除去
                    const filename = `${origBasename}-${modVersion}-en.json`;
                    const destPath = `${dirPath}/${filename}`;

                    const existCheck = await fetch(destPath);
                    if (existCheck.ok) {
                        FvttJa.log(`言語ファイル追加機能：「${filename}」は既に存在するためスキップ`);
                        continue;
                    }

                    const file = new File(
                        [JSON.stringify(origData, null, 2)],
                        filename,
                        { type: "application/json" }
                    );
                    await foundry.applications.apps.FilePicker.implementation.upload("data", dirPath, file, {}, { notify: false });
                    FvttJa.log(`言語ファイル追加機能：「${destPath}」を作成`);
                }

            } catch (e) {
                FvttJa.log(`言語ファイル追加機能：「${modId}」処理中にエラー`);
                FvttJa.log(e);
            }
        }
    }

    // バージョン文字列を数値配列へ変換（例：「13.351」→ [13, 351]）
    // 先頭の "v"/"V" 接頭辞は除去する（module.json が "v9.2.0" のように宣言する場合に対応）。
    static parseVersion(vStr) {
        return String(vStr).replace(/^[vV]/, '').split('.').map(n => parseInt(n, 10) || 0);
    }

    // バージョン文字列を比較：a < b → -1, a === b → 0, a > b → 1
    static compareVersions(a, b) {
        const pa = FvttJa.parseVersion(a);
        const pb = FvttJa.parseVersion(b);
        const len = Math.max(pa.length, pb.length);
        for (let i = 0; i < len; i++) {
            const na = pa[i] ?? 0;
            const nb = pb[i] ?? 0;
            if (na !== nb) return na < nb ? -1 : 1;
        }
        return 0;
    }

    // サブフォルダ内ファイル名からサフィックスとバージョンを抽出する（-ja 必須）
    //
    // 戻り値：
    //   { suffix: string, version: string | null }
    //     suffix  対応する元ファイルのサフィックス（"" = 主ファイル、"compendium" 等 = 副ファイル）
    //     version バージョン文字列、またはバージョン指定なしの場合 null（フォールバック）
    //   false  翻訳ファイルではない（-ja なし）→ 呼び出し元でスキップ
    //
    // 対応パターン（modId 付き）：{modId}-ja[{-suffix}][{-ver}].json
    // 対応パターン（省略形）　　：ja[{-suffix}][{-ver}].json
    static extractVersion(basename, modId) {
        const name = basename.endsWith('.json') ? basename.slice(0, -5) : basename;
        const isVer = s => /^\d+(\.\d+)*$/.test(s);

        // modId 付きパターン
        if (name.startsWith(`${modId}-ja`)) {
            return FvttJa._parseSuffixAndVersion(name.slice(`${modId}-ja`.length), isVer);
        }

        // 省略形パターン
        if (name === 'ja' || name.startsWith('ja-')) {
            return FvttJa._parseSuffixAndVersion(name.slice(2), isVer);
        }

        return false;
    }

    // extractVersion のヘルパー："-ja" 以降の文字列からサフィックスとバージョンを分解する
    // rest: "" | "-{ver}" | "-{suffix}" | "-{suffix}-{ver}"
    static _parseSuffixAndVersion(rest, isVer) {
        if (rest === '') return { suffix: '', version: null };
        if (!rest.startsWith('-')) return false;
        const after = rest.slice(1);
        if (isVer(after)) return { suffix: '', version: after };
        const lastDash = after.lastIndexOf('-');
        if (lastDash !== -1) {
            const possibleVer = after.slice(lastDash + 1);
            if (isVer(possibleVer)) return { suffix: after.slice(0, lastDash), version: possibleVer };
        }
        return { suffix: after, version: null };
    }

    // 元ファイルのパスからサフィックスを抽出する
    // lang: 対象言語コード（例: "ja"）
    // 戻り値: "" | "compendium" 等 | null（命名規則外 → 置き換えない）
    static _origFileSuffix(filePath, lang) {
        const name = filePath.slice(filePath.lastIndexOf('/') + 1, -5);
        if (name === lang) return '';
        if (name.startsWith(`${lang}-`)) return name.slice(lang.length + 1);
        return null;
    }

    // サブフォルダ内の翻訳ファイル群から modVersion に最適な1件を選択して返す
    // fileInfos: [{path, version}]（version は string | null）
    //
    // 選択優先順位：
    //   1. modVersion と完全一致するバージョン
    //   2. modVersion 以下で最も高いバージョン
    //   3. すべて modVersion 超過の場合は最小バージョン
    //   4. バージョン付きファイルがない場合のみバージョン指定なし（null）のファイルを使用
    static selectBestFile(fileInfos, modVersion) {
        const versioned = fileInfos.filter(f => f.version !== null);
        const unversioned = fileInfos.filter(f => f.version === null);

        if (versioned.length === 0) {
            return unversioned.length > 0 ? unversioned[0].path : null;
        }

        const exact = versioned.find(f => FvttJa.compareVersions(f.version, modVersion) === 0);
        if (exact) return exact.path;

        const lowerOrEqual = versioned
            .filter(f => FvttJa.compareVersions(f.version, modVersion) <= 0)
            .sort((a, b) => FvttJa.compareVersions(b.version, a.version));
        if (lowerOrEqual.length > 0) return lowerOrEqual[0].path;

        const sorted = [...versioned].sort((a, b) => FvttJa.compareVersions(a.version, b.version));
        return sorted[0].path;
    }

    // JSON オブジェクトの全葉キーをドット区切りパスの配列で返す（ネスト対応）
    static _getLeafKeys(obj, prefix = '') {
        const keys = [];
        for (const [k, v] of Object.entries(obj)) {
            const key = prefix ? `${prefix}.${k}` : k;
            if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
                keys.push(...FvttJa._getLeafKeys(v, key));
            } else {
                keys.push(key);
            }
        }
        return keys;
    }

    // サードパーティモジュールの設定 name/hint を翻訳データで日本語化する
    // 組み込みデータ（lang/module-setting-overrides.json）と settingOverrideUserFile の設定で
    // 指定されたユーザーファイルをディープマージして適用する
    static async applySettingOverrides() {
        if (!game.settings.get('fvtt-ja', 'settingOverrideEnabled')) return;
        const builtinRes = await fetch('modules/fvtt-ja/lang/module-setting-overrides.json').catch(() => null);
        let overrides = builtinRes?.ok ? await builtinRes.json() : {};

        const userFilePath = game.settings.get('fvtt-ja', 'settingOverrideUserFile');
        if (userFilePath) {
            const userRes = await fetch(userFilePath).catch(() => null);
            if (userRes?.ok) {
                overrides = FvttJa._deepMerge(overrides, await userRes.json());
            }
        }

        const mismatchBehavior = game.settings.get('fvtt-ja', 'settingOverrideMismatch');
        const mismatches = [];

        for (const [moduleId, settings] of Object.entries(overrides)) {
            if (!game.modules.get(moduleId)?.active) continue;
            for (const [settingKey, fields] of Object.entries(settings)) {
                // settings と menus の両方を対象にする
                const entry = game.settings.settings.get(`${moduleId}.${settingKey}`)
                           ?? game.settings.menus?.get(`${moduleId}.${settingKey}`);
                if (!entry) continue;
                for (const [field, data] of Object.entries(fields)) {
                    if (!data.translation) continue; // 翻訳が空の場合はスキップ（original のまま）
                    const current = entry[field];
                    if (current === data.original) {
                        entry[field] = data.translation;
                    } else {
                        mismatches.push(`${moduleId}.${settingKey}.${field}`);
                        if (mismatchBehavior === 'translate') entry[field] = data.translation;
                    }
                }
            }
        }

        if (mismatches.length > 0) {
            const msg = game.i18n.format('FVTTJa.SettingOverride.mismatchWarning', { keys: mismatches.join(', ') });
            FvttJa.warn(msg);
        }
    }

    // アクティブモジュールの未翻訳設定をスキャンしてオーバーライドテンプレート JSON を生成する
    // 使い方: ブラウザコンソールで FvttJa.generateSettingOverrideTemplate() を実行
    // 結果は module-setting-overrides-template.json としてブラウザのダウンロードフォルダへ保存する
    static async generateSettingOverrideTemplate() {
        const builtinRes = await fetch('modules/fvtt-ja/lang/module-setting-overrides.json').catch(() => null);
        const builtinData = builtinRes?.ok ? await builtinRes.json() : {};

        const userFilePath = game.settings.get('fvtt-ja', 'settingOverrideUserFile');
        let userData = {};
        if (userFilePath) {
            const userRes = await fetch(userFilePath).catch(() => null);
            if (userRes?.ok) userData = await userRes.json();
        }

        const template = {};

        const addEntries = (moduleId, map, fieldNames) => {
            for (const [fullKey, entry] of map.entries()) {
                if (!fullKey.startsWith(`${moduleId}.`)) continue;
                if ('config' in entry && !entry.config) continue;
                const entryKey = fullKey.slice(moduleId.length + 1);
                const fields = {};
                for (const field of fieldNames) {
                    const val = entry[field];
                    if (!val || game.i18n.localize(val) !== val) continue;
                    // 非ASCII文字を含む場合は既に翻訳済み（登録前にlocalize解決済み）→スキップ
                    if (/[^\x00-\x7f]/.test(val)) continue;
                    // 組み込みデータまたはユーザーファイルに既存エントリがあればスキップ
                    if (builtinData[moduleId]?.[entryKey]?.[field]) continue;
                    if (userData[moduleId]?.[entryKey]?.[field]) continue;
                    fields[field] = { original: val, translation: "" };
                }
                if (Object.keys(fields).length > 0) {
                    template[moduleId] ??= {};
                    template[moduleId][entryKey] = fields;
                }
            }
        };

        for (const [moduleId, mod] of game.modules.entries()) {
            if (!mod.active || moduleId === 'fvtt-ja') continue;
            // 通常設定（name, hint）
            addEntries(moduleId, game.settings.settings, ['name', 'hint']);
            // 設定メニュー（name, hint, label）
            if (game.settings.menus) addEntries(moduleId, game.settings.menus, ['name', 'hint', 'label']);
        }

        const json = JSON.stringify(template, null, 2);
        console.log('[fvtt-ja] Setting Override Template:\n', json);

        foundry.utils.saveDataToFile(json, 'application/json', 'module-setting-overrides-template.json');
        FvttJa.log('設定翻訳テンプレートをダウンロードしました: module-setting-overrides-template.json');
    }

    // ディープマージ（override のキーが base を上書き）
    static _deepMerge(base, override) {
        const result = { ...base };
        for (const [k, v] of Object.entries(override)) {
            result[k] = (v && typeof v === 'object' && !Array.isArray(v) && result[k] && typeof result[k] === 'object')
                ? FvttJa._deepMerge(result[k], v)
                : v;
        }
        return result;
    }

    static get log() {
        return console.log.bind(console, "fvtt-ja |");
    }

    static get warn() {
        return console.warn.bind(console, "fvtt-ja |");
    }
}

// コンソールからアクセスできるよう FvttJa クラスをグローバルに公開
globalThis.FvttJa = FvttJa;
