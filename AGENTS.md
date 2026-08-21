# fvtt-ja — AGENTS.md

> **スコープ制約**: このファイルはリモートリポジトリ（GitHub）に含まれます。
> リポジトリ内部のパス・URL・API 規約のみ記述すること。
> ローカルのディレクトリ名・symlink・隣接リポジトリへの参照を含めてはなりません。
> ローカル環境固有の情報は、Git管理外の上位指示ファイルまたはローカル設定に記述してください。

このファイルをClaude CodeとCodexに共通する作業規則の正本とする。Claude Codeはルートの`CLAUDE.md`から本ファイルを読み込み、Codexは本ファイルを自動検出する。

## このブランチのスコープ

- `main` = FVTT v14 トランク。FVTT v14 系コア UI の日本語翻訳（lang/core.json）
- fvtt-ja モジュール固有 UI の翻訳（lang/fvtt-ja.json）
- wfrp4e-ja-jp との連携機能（script/journal/ — ジャーナルコンバータ）
- v13 系は `v13` ブランチで保守（個別 backport のみ）。新機能・翻訳更新はまず `main`（v14）に対して行い、必要なもののみ `v13` へ cherry-pick する。
- コミット規約: **`script` の変更と `lang` の変更は同一コミットに混ぜない**（`v13` への cherry-pick 可搬性を確保するため）。

## Overview

`fvtt-ja` is a Japanese localization module for Foundry Virtual Tabletop (FVTT), created by MRyas as a private edition. It provides Japanese UI strings for the FVTT core system and supports custom per-module language file overrides.

## Repository Structure

- `lang/core.json` — FVTT コア UI の日本語翻訳（メイン）
- `lang/fvtt-ja.json` — モジュール固有の翻訳文字列
- `module.json` — FVTT module manifest (version, compatibility, language registration, esmodule registration)
- `script/fvtt-ja.js` — Module script loaded by FVTT at runtime (no build step required)
- `README.md` — Japanese changelog and usage instructions

## Version Numbering Convention

Versions follow FVTT's own version/build numbers: `{fvtt-major}.{fvtt-build}.{patch}`

Example: `14.360.0` = FVTT v14 build 360, patch 0.

## 上流 en.json との同期（fvtt-tools）

`lang/core.json` は FVTT コア本体の `lang/en.json` に追従する翻訳ファイル。コアがビルド更新された際は `@yasnen/fvtt-tools`（`github:Yasnen/fvtt-tools`）の `sync-lang` コマンドで三方向マージ同期する。

```bash
fvtt-tools sync-lang <新しいen.jsonのパス> \
  --ja lang/core.json \
  --placeholder-sep "<build><versionLetter>" \
  --placeholder-mark "===" \
  --placeholder-digits 3 \
  --dry-run   # 差分確認後、問題なければ --dry-run を外して適用

# 適用時は --update-base を付けて lang/en-base.json も更新する
fvtt-tools sync-lang <新しいen.jsonのパス> --ja lang/core.json \
  --placeholder-sep "<build><versionLetter>" --placeholder-mark "===" --placeholder-digits 3 \
  --update-base
```

- `lang/en-base.json`：前回同期時点の en.json スナップショット。**リポジトリにコミットして管理する**（次回同期時の `[CHANGED]`＝英語原文変更検知に必須）。
- 出力は新 en.json の構造・キー順をそのまま使うため、独自の並べ替えや全文書き換えをしないこと。
- 新規キーには自動でプレースホルダが付与され未翻訳として可視化される。削除された upstream キー（ORPHAN）は自動で出力から除外される。
- 独自追加キー（upstream に存在しない fvtt-ja 固有キー、例: ブランディング用の `COMMON.FoundryVirtualTabletop` 上書き）は ORPHAN 判定で消えるため、同期後に手動で復元・確認すること。

### プレースホルダ規約

未翻訳文字列には `===(<build><versionLetter><seq>)===` 形式のプレースホルダを付与する（`<seq>` は3桁連番）。

`<versionLetter>` は FVTT メジャーバージョンをアルファベットに対応させたもの：

| FVTT メジャーバージョン | 文字 |
|---|---|
| v12 | C |
| v13 | D |
| v14 | E |

例: FVTT v14 build 365 由来の1件目の新規未翻訳文字列 → `===(365E001)===`

過去に `---(...)---` 形式や `.NNN` 区切りが混在している箇所があるが、今後の新規プレースホルダは上記形式（`===` 囲み・`<build><versionLetter>` 区切り）に統一する。

## module.json フィールドの変更タイミング（重要）

`compatibility.verified` と `version`/`download`/`manifest` はライフサイクルが異なるため、**分離して運用する**。

| フィールド | 性質 | 変更してよいタイミング |
|---|---|---|
| `compatibility.verified` | コスメティック（バッジ表示のみ・インストール可否に影響しない） | **開発中いつでも自由に変更してよい**。実際にテストした FVTT build に随時追従させる。リリース（タグ）不要 |
| `compatibility.minimum` / `maximum` | FVTT コアがハード強制するインストール可否ゲート | 全ユーザーのインストール可否に影響する実質的な仕様変更。**必ずリリース（タグ）を伴わせる**。先行してコミットしない |
| `version` / `download` / `manifest` | 配布URLと直結（3者は同じバージョン文字列で連動） | **タグ・pushを直後に実行できる状態になって初めて変更する**。「準備として先に編集しておく」運用はしない |

**理由**：`download`/`manifest` はタグ固定URL（例 `releases/download/v14.360.1/...`）のため、対応するタグ・リリースが存在しない間はこれらのURLが404になる。この状態で `main` を（symlink 等で）実機に読み込ませていると、FVTT の定期的な更新チェックがそのままエラーになる。したがって version 系3フィールドの変更は、コミット→タグ→push を**同一作業内で連続して**行い、未タグの状態で `main` に置きっぱなしにしないこと。

## リリース手順

新バージョンをリリースする際は以下をすべて同期して更新すること（version系3フィールドは上表の通りリリース直前まで変更しない）:

1. **`module.json`** — `version`・`compatibility.verified`・`download` URL を更新する。
   - `download` の `{version}` 部分をタグ名に合わせる（例: `v13.351.6`）
   - `compatibility.verified` の更新漏れは Actions で警告されるが失敗にはならない
2. **`README.md`** — 履歴セクションの先頭に変更履歴を追記する。
3. バージョン文字列をメッセージにして**コミット**する（例: `13.351.6`）。
4. `v{version}` 形式で**タグ**を打つ（例: `v13.351.6`）。
5. **Push**: `git push origin main && git push origin v{version}`

Step 3〜5 は連続して実行し、間を空けない（コミットしたままタグ・pushを翌日以降に持ち越さない）。

タグ push 後、`.github/workflows/release.yml` が自動で以下を実行する:
- タグと `module.json` の `version` 一致チェック（不一致の場合は失敗）
- タグと `module.json` の `download` URL 内バージョン一致チェック（不一致の場合は失敗）
- GitHub Release の作成（コミット差分からリリースノート自動生成）
- FVTT 公式レジストリへのバージョン通知（要: `FVTT_PACKAGE_TOKEN` シークレット）

## module.json URL Pattern

```json
"url": "https://github.com/Yasnen/fvtt-ja",
"download": "https://github.com/Yasnen/fvtt-ja/archive/refs/tags/v{version}.zip",
"manifest": "https://github.com/Yasnen/fvtt-ja/releases/download/v{version}/module.json"
```

`manifest` はリリースごとにタグ固定URLを使用すること（`main` ブランチ参照・`latest` URL は禁止）。
リリース時は `module.json` 自体をリリースアセットとして添付する（workflow の `gh release create` に `module.json` を含める）。

## Coding Conventions (FVTT API)

This module runs entirely inside FVTT's browser environment. When modifying `script/fvtt-ja.js` or any FVTT-facing code, always verify correct API usage against the official sources:

- **API Documentation**: https://foundryvtt.com/api/ — authoritative reference for `Hooks`, `game`, `foundry.*`, `FilePicker`, settings API, etc.
- **Official GitHub**: https://github.com/foundryvtt — source code and example modules for cross-referencing behavior

Do not rely on memory or general JavaScript conventions for FVTT-specific globals; the API changes between major versions (e.g., v12 → v13 introduced `foundry.applications.apps.FilePicker`). Always check the docs for the target `compatibility.verified` version in `module.json`.

## 作業規則

- 既存の変更を`git status --short`、`git diff`、`git log --oneline -3`で確認してから編集する。
- 認証情報、端末固有パス、第三者の非公開データをリポジトリへ記録しない。
- `script`の変更と`lang`の変更を同一コミットに混ぜない。
- 翻訳同期では最初に`--dry-run`を使用し、差分を確認してから適用する。
- 変更後は、管理対象のJavaScript構文とJSON構文を検証し、失敗した状態で先へ進まない。
- `git commit`はユーザーから明示的に依頼された場合だけ実行する。
- `git push`、タグ作成、リリース、外部サービスへの書き込みは自動実行しない。
- Claude CodeとCodexは同じworktreeで同時に作業しない。書き手の交代時にGit差分とバックグラウンド処理を確認する。

### 構文検証コマンド

```bash
git ls-files '*.js' | xargs -r -n1 node --check
node -e 'const fs=require("node:fs"); for (const file of process.argv.slice(1)) JSON.parse(fs.readFileSync(file,"utf8"));' $(git ls-files '*.json')
```

## script/fvtt-ja.js Behavior

The script runs inside FVTT's browser environment using FVTT's global `Hooks`, `game`, and `foundry` APIs — there is no Node.js runtime or bundler involved.

Key behaviors:
- **`init` hook**: Registers settings (`langPath`, `langFiles`), then injects custom language files (from the configured folder) into the appropriate modules/systems before FVTT loads translations. Also enforces that this module is set as the default language module and that the conflicting `foundryVTTja` module is not installed.
- **`ready` hook**: Calls `FvttJa.resetLangFiles()` to detect any new/removed files in the configured folder and prompts for reload if changes are found.
- **`FvttJa.scanLangFiles(directory)`**: Browses the configured folder via FVTT's FilePicker API, compares the file list to the stored `langFiles` setting, and saves any changes. Never reloads — that's the caller's responsibility. Returns whether the file list changed.
- **`FvttJa.resetLangFiles(directory)`**: Calls `scanLangFiles`, then prompts the user to reload if the list changed. Used from the `ready` hook only.
- **`langPath` setting**: registered with `requiresReload: true` and an `onChange` that only calls `scanLangFiles` (no reload). This lets FVTT's own settings-form reload confirmation fire once, after the whole form's save loop has finished — calling `window.location.reload()` directly from `onChange` previously raced with (and could abort) the save of other settings changed in the same form submission, since `onChange` is not awaited by `game.settings.set()`.

Custom language file naming convention: `{module-id}.json` or `{module-id}-ja.json`.
