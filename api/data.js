export default async function handler(req, res) {
  const { token } = req.query;
  const GAS_URL = process.env.GAS_URL;

  if (!token) {
    return res.status(400).json({ error: "共有トークンが指定されていません" });
  }

  if (!GAS_URL) {
    return res.status(500).json({ error: "サーバーの設定エラー（GAS_URL未設定）" });
  }

  try {
    const gasRes = await fetch(`${GAS_URL}?token=${encodeURIComponent(token)}`);
    
    if (!gasRes.ok) {
      return res.status(gasRes.status).json({ 
        error: `GASからのデータ取得に失敗しました (HTTP ${gasRes.status})` 
      });
    }

    const data = await gasRes.json();
    
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(200).json(data);

  } catch (error) {
    console.error("Data Fetch Error:", error);
    return res.status(500).json({ error: "通信エラーが発生しました" });
  }
}
