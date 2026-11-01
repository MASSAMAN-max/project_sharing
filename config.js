/**
 * =====================================
 * 環境依存パラメータ（デプロイごとに異なる値をここへ設定する。）
 * =====================================
*/
const CONFIG = {
  // LINEログインチャネルのLIFF ID。
  // 案件共有アプリ（index.html）のLINE内蔵ブラウザ認証と、
  // share.html（共有方法選択ページ）のLINE送信リンク生成の両方で使う値をここに一元化した
  LIFF_ID: '2011463016-0MGVvN6M',
  // Googleログイン（Sign In With Google）のクライアントID。
  // Google Cloud ConsoleのOAuthクライアントIDをここに設定する。他の環境依存値(LIFF_ID等)と同様にconfig.jsへ一元化した。
  GOOGLE_CLIENT_ID: '302132186875-fr0lh20940o7k9jrdg3drm4n5r19lm99.apps.googleusercontent.com'
};
