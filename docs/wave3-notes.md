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

## 依頼者側の設計論点（未実装・今回は作らない）

8. 依頼者の業務領域・予算・納期などを伏せたまま照合する設計を検討する。現回路の条件は公開questIdと問いの値だけで、業務条件の照合や項目別の公開設定はない。依頼者・売り手双方の非公開入力、共有する判定基準、必要最小限の出力、相関や条件推測の漏えいを整理してから別の設計にする。
9. 依頼者が応答を自分で確かめる処理を設計する。現デモはサーバーによる回路の成否表示に依存し、依頼者側に独立した確認処理はない。問いの値・questId・対象コントラクト・root・応答の対応、使い回し対策、受け取った応答の確認方法を定める。今回は表示調整とメモにとどめ、実装しない。
