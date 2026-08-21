# fvtt-ja v13 — AGENTS.md

> **スコープ制約**: このファイルはリモートリポジトリに含まれます。
> リポジトリ内部のパス・URL・API規約のみ記述すること。
> ローカルのディレクトリ名、symlink、隣接リポジトリへの参照を含めてはなりません。
> ローカル環境固有の情報は、Git管理外の上位指示ファイルまたはローカル設定に記述してください。

このファイルをClaude CodeとCodexに共通する作業規則の正本とする。Claude Codeはルートの`CLAUDE.md`から本ファイルを読み込み、Codexは本ファイルを自動検出する。

## このブランチのスコープ

- FVTT v13系コアUIの日本語翻訳（`lang/core.json`）
- fvtt-jaモジュール固有UIの翻訳（`lang/fvtt-ja.json`）
- wfrp4e-ja-jpとの連携機能（`script/journal/`のジャーナルコンバータ）
- バグ修正・翻訳更新のみ。v13向けwfrp4e-ja-jp連携を除く新機能は、まず`main`（FVTT v14）で実施し、必要な変更だけを個別にbackportする。

## プロジェクト概要

`fvtt-ja`はFoundry Virtual Tabletop（FVTT）の日本語ローカライズモジュール。FVTTコアの日本語UI文字列と、モジュールごとの言語ファイル上書き機能を提供する。

## リポジトリ構造

- `lang/core.json`: FVTTコアUIの日本語翻訳
- `lang/fvtt-ja.json`: モジュール固有の翻訳文字列
- `module.json`: バージョン、互換性、言語、ES moduleのマニフェスト
- `script/fvtt-ja.js`: FVTT上で読み込まれるモジュールスクリプト（ビルド不要）
- `script/journal/`: ジャーナル変換処理
- `README.md`: 使用方法と変更履歴

## バージョン規約

バージョンはFVTTのバージョン／ビルド番号に合わせて`{fvtt-major}.{fvtt-build}.{patch}`とする。例: `13.351.0`。

## リリース手順

新バージョンのリリースでは以下を同期して更新する。

1. `module.json`の`version`、`compatibility.verified`、`download` URLを更新する。
   - `download`のバージョン部分をタグ名に合わせる（例: `v13.351.6`）。
   - `compatibility.verified`の更新漏れはActionsで警告されるが、失敗にはならない。
2. `README.md`の履歴先頭へ変更内容を追記する。
3. バージョン文字列をメッセージにしてコミットする（例: `13.351.6`）。
4. `v{version}`形式でタグを作る。
5. 対象ブランチとタグをpushする。

タグpush後、`.github/workflows/release.yml`が次を実行する。

- タグと`module.json`の`version`一致確認
- タグと`download` URL内バージョンの一致確認
- GitHub Releaseの作成
- FVTT公式レジストリへの通知（`FVTT_PACKAGE_TOKEN`を使用）

## module.json URL規約

```json
"url": "https://github.com/Yasnen/fvtt-ja",
"download": "https://github.com/Yasnen/fvtt-ja/archive/refs/tags/v{version}.zip",
"manifest": "https://github.com/Yasnen/fvtt-ja/releases/download/v{version}/module.json"
```

`manifest`はリリースごとのタグ固定URLを使用し、`main`参照や`latest` URLを使わない。リリース時は`module.json`をリリースアセットへ添付する。

## FVTT API規約

`script/fvtt-ja.js`などFVTT上で動作するコードは、対象バージョンの公式資料を優先して確認する。

- API Documentation: https://foundryvtt.com/api/v13/
- Official GitHub: https://github.com/foundryvtt

FVTT固有のグローバルやAPIを記憶だけで判断しない。`Hooks`、`game`、`foundry.*`、`FilePicker`、settings APIなどはメジャーバージョン間で変化する。

## script/fvtt-ja.jsの動作

- `init` hook: 設定（`langPath`、`langFiles`）を登録し、翻訳読み込み前にカスタム言語ファイルを対象モジュール／システムへ注入する。既定言語モジュールと競合モジュールも確認する。
- `ready` hook: `FvttJa.resetLangFiles()`で設定フォルダ内の追加・削除を検出し、必要なら再読み込みを促す。
- `FvttJa.scanLangFiles(directory)`: FilePicker APIでファイル一覧を取得して保存値と比較し、変更の有無を返す。自身では再読み込みしない。
- `FvttJa.resetLangFiles(directory)`: `scanLangFiles`を呼び、一覧が変化した場合に再読み込みを促す。
- `langPath`設定: `requiresReload: true`を使用し、`onChange`では`scanLangFiles`だけを呼ぶ。設定保存中に直接`window.location.reload()`を呼ばない。
- カスタム言語ファイル名: `{module-id}.json`または`{module-id}-ja.json`

## 作業規則

- 既存の変更を`git status --short`、`git diff`、`git log --oneline -3`で確認してから編集する。
- 認証情報、端末固有パス、第三者の非公開データをリポジトリへ記録しない。
- `script`の変更と`lang`の変更を同一コミットに混ぜない。
- `main`からのbackportは必要な変更だけを個別に行う。
- 変更後は、管理対象のJavaScript構文とJSON構文を検証し、失敗した状態で先へ進まない。
- `git commit`はユーザーから明示的に依頼された場合だけ実行する。
- `git push`、タグ作成、リリース、外部サービスへの書き込みは自動実行しない。
- Claude CodeとCodexは同じworktreeで同時に作業しない。書き手の交代時にGit差分とバックグラウンド処理を確認する。

### 構文検証コマンド

```bash
git ls-files '*.js' | xargs -r -n1 node --check
node -e 'const fs=require("node:fs"); for (const file of process.argv.slice(1)) JSON.parse(fs.readFileSync(file,"utf8"));' $(git ls-files '*.json')
```
