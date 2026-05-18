# CLAUDE.md

> **スコープ制約**: このファイルはリモートリポジトリ（GitHub）に含まれます。
> リポジトリ内部のパス・URL・API 規約のみ記述すること。
> ローカルのディレクトリ名・symlink・隣接リポジトリへの参照を含めてはなりません。
> ローカル環境固有の情報は上位の CLAUDE.md（`dev/fvtt-ja/` または `trpg/`）に記述してください。

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## このブランチのスコープ

- FVTT v13 系コア UI の日本語翻訳（lang/core.json）
- fvtt-ja モジュール固有 UI の翻訳（lang/fvtt-ja.json）
- wfrp4e-ja-jp との連携機能（script/journal/ — ジャーナルコンバータ）
- バグ修正・翻訳更新のみ。v13 向け wfrp4e-ja-jp 連携を除く新機能追加は v14 リポジトリ（gitlab.com/MRyas.jp/fvtt-ja）で実施。

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

Example: `13.351.0` = FVTT v13 build 351, patch 0.

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
"manifest": "https://raw.githubusercontent.com/Yasnen/fvtt-ja/main/module.json"
```

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