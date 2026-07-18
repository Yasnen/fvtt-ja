# CLAUDE.md

> **スコープ制約**: このファイルはリモートリポジトリ（GitHub）に含まれます。
> リポジトリ内部のパス・URL・API 規約のみ記述すること。
> ローカルのディレクトリ名・symlink・隣接リポジトリへの参照を含めてはなりません。
> ローカル環境固有の情報は上位の CLAUDE.md（`dev/fvtt-ja/` または `trpg/`）に記述してください。

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

## リリース手順

新バージョンをリリースする際は以下をすべて同期して更新すること:

1. **`module.json`** — `version`・`compatibility.verified`・`download` URL を更新する。
   - `download` の `{version}` 部分をタグ名に合わせる（例: `v13.351.6`）
   - `compatibility.verified` の更新漏れは Actions で警告されるが失敗にはならない
2. **`README.md`** — 履歴セクションの先頭に変更履歴を追記する。
3. バージョン文字列をメッセージにして**コミット**する（例: `13.351.6`）。
4. `v{version}` 形式で**タグ**を打つ（例: `v13.351.6`）。
5. **Push**: `git push origin main && git push origin v{version}`

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

## script/fvtt-ja.js Behavior

The script runs inside FVTT's browser environment using FVTT's global `Hooks`, `game`, and `foundry` APIs — there is no Node.js runtime or bundler involved.

Key behaviors:
- **`init` hook**: Registers settings (`langPath`, `langFiles`), then injects custom language files (from the configured folder) into the appropriate modules/systems before FVTT loads translations. Also enforces that this module is set as the default language module and that the conflicting `foundryVTTja` module is not installed.
- **`ready` hook**: Calls `FvttJa.resetLangFiles()` to detect any new/removed files in the configured folder and prompts for reload if changes are found.
- **`FvttJa.resetLangFiles(directory, reload)`**: Browses the configured folder via FVTT's FilePicker API, compares the file list to the stored setting, saves any changes, and optionally reloads the page.

Custom language file naming convention: `{module-id}.json` or `{module-id}-ja.json`.