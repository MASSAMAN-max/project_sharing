/**
 * =====================================
 * 環境依存パラメータ（デプロイごとに異なる値をここへ設定する。）
 * =====================================
 */
const CONFIG = {
  GAS_URL: 'https://script.google.com/macros/s/AKfycbyEDEDqBM9EsSS0Vtm2foHbybAG-q0IqjJhE0dgwL621vFcZywT4DcVHTIkfUkjgzcP0w/exec',
  // LINEログインチャネルのLIFF ID。
  // 案件共有アプリ（index.html）のLINE内蔵ブラウザ認証と、
  // share.html（共有方法選択ページ）のLINE送信リンク生成の両方で使う値を
  // ここに一元化した（以前はindex.html側にハードコードされていた）。
  LIFF_ID: '2011463016-0MGVvN6M'
};
