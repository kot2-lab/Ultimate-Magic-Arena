# オンライン対戦 API 参照案

状態: 設計案。APIサーバーは未実装であり、パス・認証・保存契約は実装前に確定する。
仕様の背景と権限境界は[`NETWORK_PROTOCOL.md`](./NETWORK_PROTOCOL.md)を参照。

## 1. 共通契約（提案）

- API prefix: `/api/v1`。本番ホスト名は未決定。
- HTTPSのみ。対戦ソケットは`wss://`のみ。
- JSON本文は許可リスト型で検証し、サイズ上限を設ける。未定義フィールドは拒否する。
- 認証方式は未決定。認証が必要な全要求で、サーバー側が本人と対象リソースへの権限を検査する。
- 書き込み要求には一意な`requestId`を含め、同じ要求の再送が二重適用されないようにする。
- 応答に内部スタック、秘密情報、他ユーザーの非公開データを含めない。

標準エラー形式（提案）:

```json
{
  "error": {
    "code": "TURN_OUT_OF_DATE",
    "message": "手番が更新されています。最新の状態を確認してください。",
    "requestId": "client-generated-uuid"
  }
}
```

## 2. HTTPエンドポイント案

認証プロバイダー確定前のため、ログイン・トークン発行エンドポイントは定義しない。

| Method | Path | 用途 | 認可 |
|---|---|---|---|
| `GET` | `/api/v1/me` | ログイン中の自分の公開プロフィール概要 | 本人 |
| `POST` | `/api/v1/matches/rooms` | 招待ルームを作成 | 本人 |
| `POST` | `/api/v1/matches/rooms/{roomId}/join` | 招待ルームへの参加要求 | 本人、招待条件を満たすこと |
| `POST` | `/api/v1/matchmaking/queue` | カジュアル対戦の待機列へ入る（後続フェーズ） | 本人 |
| `DELETE` | `/api/v1/matchmaking/queue` | 待機列から退出 | 本人 |
| `GET` | `/api/v1/matches/{matchId}` | 自分が参加する対戦の最新スナップショット | 試合参加者 |
| `POST` | `/api/v1/matches/{matchId}/forfeit` | 降参を申告 | 試合参加者 |

### 2.1 ルーム作成要求（案）

```json
{
  "requestId": "client-generated-uuid",
  "mode": "casual-invite"
}
```

成功時はサーバーが予測不能な`roomId`を発行する。秘密の合言葉・招待トークンを使う場合、URL・ログ・解析イベントに残さない。ルームの参加者上限は2人とする。

### 2.2 手番操作（WebSocketメッセージ案）

クライアントから送れる操作は行動意図だけに限定する。

```json
{
  "protocolVersion": 1,
  "type": "submit_action",
  "requestId": "client-generated-uuid",
  "matchId": "opaque-match-id",
  "expectedTurn": 12,
  "action": {
    "kind": "cast_spell",
    "spellId": "owned-spell-id",
    "targetLane": "center"
  }
}
```

許可する`action.kind`候補は`cast_spell`、`move`、`pass`。`spellId`の所持・有効性、MP、対象レーン、移動可否、手番、締切をサーバーが検査する。HP、MP残量、命中結果、ダメージ、乱数、状態異常、勝敗、報酬をクライアント入力で変更してはならない。

サーバーからのイベント案:

- `match_snapshot`: 接続直後・再接続時の確定状態と現在の`eventSequence`。
- `turn_started`: 手番番号、手番プレイヤー、サーバー時刻の締切。
- `action_accepted`: 要求IDと適用されたイベント番号。
- `action_rejected`: 要求ID、安定したエラーコード、最新手番番号。
- `battle_event`: サーバーが確定した詠唱・命中・ダメージ・回復・移動・状態変化。
- `match_finished`: 勝敗、終了理由、確定した報酬・レーティング結果。
- `reconnect_required` / `match_resumed`: 再接続猶予と復帰結果。

すべてのサーバーイベントに`protocolVersion`、`matchId`、単調増加する`eventSequence`を含める。クライアントは欠けた番号を検知したら最新スナップショットを取得し、古いイベントを状態に再適用しない。

## 3. 入力制限とエラーコード案

最低限の拒否理由:

- `AUTH_REQUIRED`: 有効なログイン状態がない。
- `FORBIDDEN`: 操作者がルーム・試合・データに参加していない。
- `MATCH_NOT_FOUND` / `MATCH_FINISHED`: 試合が存在しない、または終了済み。
- `NOT_YOUR_TURN` / `TURN_OUT_OF_DATE`: 手番不一致。
- `ACTION_INVALID` / `SPELL_UNAVAILABLE`: ルール上無効な行動・魔法。
- `REQUEST_DUPLICATE`: 適用済み要求。既存の結果を返す。
- `RATE_LIMITED`: 操作頻度の上限。
- `RECONNECT_EXPIRED`: 復帰猶予終了。

同一試合の接続数、メッセージ数/秒、本文サイズ、ルーム作成数、待機列参加回数に上限を設定する。値は負荷・悪用テストと運用予算を見て決め、ここでは固定しない。

## 4. データ境界（案）

- **対戦ルーム**: 進行中状態・接続状態・イベント順序をルーム単位で管理し、終了後に必要最小限の結果を永続化する。
- **永続プロフィール**: アカウントID、表示名、ランキング値、必要な進行情報。認証プロバイダーの秘密情報やパスワードはUMA側に複製しない。
- **試合履歴**: 試合ID、参加者ID、開始/終了時刻、結果、ルール版。完全な通信内容や秘密情報は保存しない。
- **管理操作**: 将来の監査対象。ユーザー向け対戦APIと認可境界・秘密情報を分け、ここでは管理APIを設けない。

この表は要求境界案であり、DBスキーマ・保存期間・削除要求の実装契約ではない。アカウント、移行、プライバシー仕様の合意後に確定する。
