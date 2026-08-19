export default async function handler(req, res) {
  const { token } = req.query;
  const GAS_URL = process.env.GAS_URL;

  if (!token) {
    return res.status(400).json({ error: "共有トークンが指定されていません" });
  }

  if (!GAS_URL) {
    return res.status(500).json({ 
      error: "サーバー設定エラー: Vercel環境変数『GAS_URL』が読み込めていません。Redeployを実行してください。" 
    });
  }

  try {
    const gasRes = await fetch(`${GAS_URL}?token=${encodeURIComponent(token)}`, {
      redirect: "follow"
    });

    const responseText = await gasRes.text();

    // JSONとしてパースできるか判定
    try {
      const data = JSON.parse(responseText);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.status(200).json(data);
    } catch (parseError) {
      // GASからHTML（ログイン画面やエラー）が返ってきた場合
      return res.status(500).json({ 
        error: "GASからの応答がJSONではありません。GASのアクセス権限が『全員』になっているか確認してください。",
        rawResponse: responseText.substring(0, 150) // レスポンスの先頭を表示
      });
    }

  } catch (error) {
    return res.status(500).json({ error: "GAS通信エラー: " + error.message });
  }
}
