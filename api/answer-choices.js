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

  const { questions } = await req.json();
  const items = (questions || []).slice(0, 60);

  const prompt = `医学系の選択問題について、最も妥当な解答を推定してください。
返答はJSONのみ。説明文やMarkdownは不要です。

重要:
- PDFに正答表がないため、これはAI推定解答です
- 複数選択問題の場合は "A,C" のようにカンマ区切りで返す
- 確信が低い場合も最も妥当なものを選び、confidenceを下げる
- explanationはフラッシュカード裏面に載せる短い根拠にする

JSON形式:
{
  "answers": [
    { "id": "question id", "answer": "A", "explanation": "短い根拠", "confidence": 0.8 }
  ]
}

問題:
${JSON.stringify(items, null, 2)}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 5000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return new Response(JSON.stringify({ error: data.error?.message || 'API error' }), {
        status: response.status, headers: { 'Content-Type': 'application/json' }
      });
    }

    const raw = data.content?.[0]?.text || '{}';
    const match = raw.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match ? match[0] : raw);
    const answers = Array.isArray(parsed.answers) ? parsed.answers : [];

    return new Response(JSON.stringify({ answers }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}
