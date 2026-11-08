// =====================================================================
// /api/line-webhook
// -----------------------------------------------------------------------
// LINEプラットフォームからのWebhook（友だち追加・トーク）を受け取り、
// 「LINEが送ったものだ」と署名で確認できたものだけを、案件共有GASへ記録させる中継API。
//
// 【なぜVercelで受けるのか】
// 以前はLINEのWebhook URLを案件共有GASに直接向けていた。しかしGASは、LINEが付ける署名ヘッダー
// （X-Line-Signature）を読めないため、リクエストが本当にLINEから来たか確認できず、
// URLを知っていれば誰でも偽のイベントを送って、ログシートを埋められた。
// Vercelなら署名ヘッダーと生のリクエスト本文を読めるので、ここで署名を検証する。
//
// 【署名の検証】
//   署名 ＝ Base64( HMAC-SHA256( チャネルシークレット, リクエスト本文そのまま ) )
//   ※ 本文は「届いたままの文字列」で計算する必要があるため、bodyParser を無効にして生のまま読む。
//
// 【必要なVercel環境変数】
//   LINE_CHANNEL_SECRET … LINE Developers「Messaging APIチャネル」の基本設定にある「チャネルシークレット」
//                         （LIFFで使う「LINEログインチャネル」ではなく、公式アカウント側のチャネル）
//   GAS_URL             … 案件共有GASのURL
//   SHARE_API_SECRET    … 案件共有GASへの呼び出しに付ける共有シークレット
//
// 【GASへ送る内容】
//   記録に必要な「イベントの種類」と「LINEuserId」だけを送る（トークの本文などは送らない）。
//   記録はwaitUntilで応答後に行い、LINEへの応答（200）を遅らせない。
// =====================================================================

import crypto from "node:crypto";
import { waitUntil } from "@vercel/functions";

// 署名の計算には、届いたままの本文が必要なため、本文の自動解析を無効にする
export const config = {
  api: {
    bodyParser: false,
  },
};

// 記録の対象にするイベントの種類（GAS側の recordLineEvents_ と同じ）
const RECORDED_EVENT_TYPES = ["follow", "message"];

// リクエスト本文を、解析せずにそのまま（Buffer）読み込む
async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

// LINEの署名が正しいか確認する（比較は、処理時間から推測されないよう timingSafeEqual を使う）
function isValidLineSignature(rawBody, signature, channelSecret) {
  if (!signature) return false;
  const expected = crypto.createHmac("sha256", channelSecret).update(rawBody).digest("base64");
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(String(signature));
  return expectedBuffer.length === actualBuffer.length
    && crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "このAPIはPOSTメソッドのみ受け付けます" });
  }

  const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET;
  const GAS_URL = process.env.GAS_URL;
  const SHARE_API_SECRET = process.env.SHARE_API_SECRET;

  if (!LINE_CHANNEL_SECRET || !GAS_URL || !SHARE_API_SECRET) {
    console.error("❌ 環境変数『LINE_CHANNEL_SECRET』『GAS_URL』『SHARE_API_SECRET』のいずれかが読み込めていません。");
    return res.status(500).json({ error: "サーバー設定エラー" });
  }

  const rawBody = await readRawBody(req);

  // 署名が合わないものは、LINE以外から届いたものとして拒否する（ログにも記録しない）
  if (!isValidLineSignature(rawBody, req.headers["x-line-signature"], LINE_CHANNEL_SECRET)) {
    return res.status(401).json({ error: "署名が正しくありません" });
  }

  let body;
  try {
    body = JSON.parse(rawBody.toString("utf8"));
  } catch (parseError) {
    return res.status(400).json({ error: "リクエストの形式が正しくありません" });
  }

  // 記録に必要な項目だけを取り出す（トークの本文などは、GASへ送らない）
  const events = (Array.isArray(body.events) ? body.events : [])
    .filter(event => event && RECORDED_EVENT_TYPES.includes(event.type) && event.source && event.source.userId)
    .map(event => ({ type: event.type, source: { userId: event.source.userId } }));

  if (events.length > 0) {
    const logPromise = fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ action: "recordLineEvents", secret: SHARE_API_SECRET, events: events }),
      redirect: "follow"
    })
      .then(response => response.json())
      .then(result => {
        if (result.status !== "success") {
          console.error("❌ LINEイベントの記録に失敗しました:", result.message);
        }
      })
      .catch(err => console.error("❌ LINEイベントの記録に失敗しました:", err));

    waitUntil(logPromise);
  }

  // LINEには、記録の結果を待たずに、すぐ正常応答を返す
  // （Webhook URLの「検証」ボタンは、events が空のリクエストを送ってくる。それもここで200になる）
  return res.status(200).json({ status: "ok" });
}
