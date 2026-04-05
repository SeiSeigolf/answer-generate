export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'API key not configured' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }

  const { imageBase64, pageNumber, totalPages } = await req.json();

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/jpeg',
              data: imageBase64,
            },
          },
          {
            type: 'text',
            text: `これは医学の授業スライドのページ${pageNumber}（全${totalPages}ページ中）です。
このスライドに書かれているテキストをすべて正確に抽出してください。

ルール：
- スライドに書かれている文字をすべて書き出す
- 図や表の中のテキストも含める
- 箇条書きや番号は保持する
- 画像の説明は不要
- 抽出したテキストだけを出力する（説明文は不要）
- 文字が読めない部分は[不明]と記載`,
          },
        ],
      }],
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    return new Response(JSON.stringify({ error: data.error?.message || 'API error' }), {
      status: response.status, headers: { 'Content-Type': 'application/json' }
    });
  }

  const text = data.content?.[0]?.text || '';
  return new Response(JSON.stringify({ text }), {
    status: 200, headers: { 'Content-Type': 'application/json' }
  });
}
