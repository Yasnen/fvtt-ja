# ジャーナル翻訳機能 詳細ガイド

**前提：Babele モジュールが有効な場合のみ動作します。**

---

## 翻訳 JSON の書き方

Babele の翻訳 JSON に以下の `mapping` を記載し、コンバータとして `fvttJaJournalPages` を指定します。

```json
{
  "label": "Core Journals",
  "mapping": {
    "pages": {
      "path": "pages",
      "converter": "fvttJaJournalPages"
    }
  },
  "entries": {
    "The Enemy Within": {
      "name": "宿敵なる者",
      "_id": "xxxxxxxxxxxxxxxx",
      "pages": {
        "Introduction": {
          "name": "はじめに",
          "text": "<p>翻訳済み本文</p>",
          "_id": "yyyyyyyyyyyyyyyy",
          "_text": "<p>原文本文（ソース変更検出用）</p>"
        }
      }
    }
  }
}
```

### ページデータの各フィールド

| フィールド | 説明 |
|-----------|------|
| `name` | 翻訳後のページ名 |
| `text` | 翻訳後の本文 HTML |
| `_id` | 翻訳 JSON 作成時点のページ `_id`（ID 変化の追跡に使用） |
| `_text` | 翻訳 JSON 作成時点の原文テキスト。ソース更新チェックの比較元になる |

---

## 翻訳テンプレートのエクスポート

新規翻訳作成時は、コンソールまたはマクロから以下を実行します。

```javascript
// ステップ1：全コンペンディアムのジャーナルを走査して収集
await FVTTJa_collectJournals();

// ステップ2：収集データを JSON ファイルとしてダウンロード
//   引数1：label フィールドの値（省略可、デフォルト "Journals"）
//   引数2：mapping.converter の値（省略可、デフォルト "fvttJaJournalPages"）
FVTTJa_exportJournals("Core Journals");
```

引数なしで呼び出した場合は `label: "Journals"`・`converter: "fvttJaJournalPages"` が設定された JSON が出力されます。コンバータ名はそのまま使用できるため、ダウンロード後に JSON の `label` フィールドを Compendium のラベルに書き換えるだけで翻訳ファイルとして使用できます。

```javascript
// 引数なし：最短手順（label は後で JSON 内を編集）
await FVTTJa_collectJournals();
FVTTJa_exportJournals();
```

エクスポートされた JSON には各ページの `_text`（原文）と `_id` が含まれます。`text` フィールドを翻訳することで翻訳 JSON として使用できます。

---

## 他モジュールからの利用

`Hooks.on("fvtt-ja.journalReady")` フックが発火した後、`globalThis.FVTTJa.journal` に各クラスが公開されます。独自のコンバータを実装する場合は `BaseJournalConverter` を継承し、`JournalConverterRegistry.register()` で登録してください。

```javascript
Hooks.on("fvtt-ja.journalReady", () => {
    const { BaseJournalConverter, JournalConverterRegistry } = FVTTJa.journal;

    class MyConverter extends BaseJournalConverter {
        transformPage(page, pageTrans) {
            // 追加処理
            return super.transformPage(page, pageTrans);
        }
    }

    JournalConverterRegistry.register("my-system-id", new MyConverter("my-module"));
});
```
