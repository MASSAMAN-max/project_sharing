/**
 * =====================================
 * 環境依存パラメータ（デプロイごとに異なる値をここへ設定する。）
 * =====================================

const CONFIG = {
  GAS_URL: 'https://script.google.com/macros/s/AKfycbyEDEDqBM9EsSS0Vtm2foHbybAG-q0IqjJhE0dgwL621vFcZywT4DcVHTIkfUkjgzcP0w/exec',
  // LINEログインチャネルのLIFF ID。
  // 案件共有アプリ（index.html）のLINE内蔵ブラウザ認証と、
  // share.html（共有方法選択ページ）のLINE送信リンク生成の両方で使う値を
  // ここに一元化した（以前はindex.html側にハードコードされていた）。
  LIFF_ID: '2011463016-0MGVvN6M',
  // Googleログイン（Sign In With Google）のクライアントID。
  // Google Cloud ConsoleのOAuthクライアントIDをここに設定する。
  // 以前index.html内に直接ハードコードしていたが、他の環境依存値
  // （LIFF_ID等）と同様にconfig.jsへ一元化した。
  GOOGLE_CLIENT_ID: '302132186875-fr0lh20940o7k9jrdg3drm4n5r19lm99.apps.googleusercontent.com'
};
 */


// =====================================================================
// config
// -----------------------------------------------------------------------
// このGASプロジェクト（案件共有GAS。ID取得.js・Main.js・LINE.js相当が
// 動くプロジェクト）内で共通して使う設定値をまとめるファイル。
//
// 【方針】
// ・スプレッドシートID等、秘密性は低いが環境依存の値はスクリプト
//   プロパティ（PropertiesService）で管理する（このファイルには書かない）。
// ・シート名等、コード内で複数箇所から参照される「名前」は、ここに
//   定数としてまとめる。直接文字列をあちこちに書くと、タイプミスや
//   変更時の修正漏れで「意図しないシートに書き込む」事故に繋がるため。
// =====================================================================

// 操作ログ（友だち追加・トーク・案件ページ開封等）を記録するシート名。
// ensureLogSheetHeaders / logShareAppAction / doPost（Webhook側）が
// この定数を参照する。
const LOG_SHEET_NAME = "操作ログ";

// 案件データが入っているシート名（Main.js の findCaseRowByToken が参照）。
// スプレッドシートID自体はスクリプトプロパティ「MAIN_SPREADSHEET_ID」で
// 管理し、このファイルにはシート名のみを置く。
const CASE_DATA_SHEET_NAME = "data";

// =====================================================================
// 【Vercelからの呼び出し確認】共有シークレット照合
// -----------------------------------------------------------------------
// このGASのウェブアプリURL（.../exec）は「アクセスできるユーザー：全員」で
// 公開しているため、URLを知っていれば誰でも直接リクエストを送れてしまう。
// そこで、Vercel（サーバー側）だけが知っている共有シークレットを
// リクエストに付けてもらい、一致しない場合は処理を拒否する。
//
// ・スクリプトプロパティ「SHARE_API_SECRET」に、32文字以上のランダムな
//   文字列を設定する。Vercel側の環境変数「SHARE_API_SECRET」および
//   メインアプリGAS側のスクリプトプロパティと【全く同じ値】にすること。
// ・SHARE_URL_SALT（共有トークン計算用）とは別の値・別の用途。
//   兼用すると、片方が漏れたときの被害が広がるため使い回さない。
// ・未設定の場合は全リクエストを拒否する（設定漏れのまま
//   公開状態になるのを防ぐため、例外を投げる）。
// ・LINEのWebhook（友だち追加・トーク）は、LINE側がシークレットを
//   付けられないため、この照合の対象外（ID取得.js の doPost 参照）。
// =====================================================================
function isValidApiSecret(secret) {
  const expected = PropertiesService.getScriptProperties().getProperty("SHARE_API_SECRET");
  if (!expected) {
    throw new Error("スクリプトプロパティ「SHARE_API_SECRET」が設定されていません。");
  }
  return String(secret || "") === expected;
}
