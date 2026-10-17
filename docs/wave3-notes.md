# Refacton Midnight Wave3設計メモ

## 設計案（未実装）
現行 `recordQuest` は witness（qId、version、userSecret、localSecretKey、salt）から commitment と nullifier を作り、両方を公開Setへ格納する。`checkAttestation` は公開 qId/challenge と witness（version、secret、salt）で同じ commitment を再計算し、Set.member で公開参照して challenge 応答を返す。この再利用は確認同士の結び付きにつながり得る。

個別leafを公開せず、Merkle membershipで集合への包含を扱う案を検討する。確認ごとに新しいchallengeと乱数を使う。ただしfresh responseだけでは同一leafの公開問題は消えない。登録nullifier（重複記録防止）と確認のreplay防止タグは別物とし、scope固定の再利用は相関源になる。issuerは許可鍵、署名、失効、更新の仕組みを定める。rootの更新頻度、旧rootを許す期間・条件、履歴の扱いも設計する。leaf・root・履歴・issuer/key・challengeの公開項目を整理し、公開qId自体も相関源になり得る点を明記する。集合が少ない場合の推測、時刻・ネットワーク情報の残存もリスクとして扱い、完全匿名や確認間の非結合は保証しない。

## やること
1. 公開・非公開項目とleaf形式を定義する。
2. Merkle tree、membership、root更新・履歴許容方針を設計する。
3. issuerの鍵許可、署名、失効、更新手順を決める。
4. 確認ごとのchallenge・乱数とreplay防止タグのscopeを定義する。
5. 登録nullifierとの役割分担、再利用・相関経路を整理する。
6. qId、集合規模、時刻、ネットワーク情報の漏えいリスクを評価する。
7. 実装・試験計画を作成する。現行コントラクトは変更しない。
