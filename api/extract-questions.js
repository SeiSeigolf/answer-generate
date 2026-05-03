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

  const { source, pages } = await req.json();
  const contextText = (pages || []).map(p => `【p.${p.pageNumber}】\n${p.text}`).join('\n\n').slice(0, 90000);

  const prompt = `以下は医学系の過去問PDFからOCR/テキスト抽出した内容です。
選択問題・多肢選択問題・正誤選択問題を抽出してJSONで返してください。

ルール:
- 選択肢が2個以上ある問題だけ抽出する
- OCRで改行が消えて、問題文と選択肢が1行につながっていることがある
- 選択肢記号は A/B/C/D/E、a/b/c、ア/イ/ウ、①/②/③、1/2/3、(1)/(2)/(3) などがある
- 「選べ」「誤っているもの」「正しいもの」「組合せ」「以下のうち」などの文脈があれば選択問題として扱う
- 選択肢が途中で崩れていても、推定できる範囲で抽出する
- 問題文と選択肢を分ける
- 正解が本文中に明記されていない場合、correctAnswerは空文字にする
- ページ番号が推定できる場合はpageNumberに入れる
- 分野が推定できる場合はfieldに短く入れる
- 少しでも選択問題として復元できるものがあれば questions を空にしない
- 説明文やMarkdownは不要。JSONのみ返す

JSON形式:
{
  "questions": [
    {
      "pageNumber": 1,
      "questionText": "問題文",
      "choices": [
        { "label": "A", "text": "選択肢本文" }
      ],
      "correctAnswer": "",
      "field": "分野",
      "confidence": 0.8
    }
  ]
}

資料情報:
${source?.year || ''} ${source?.subject || ''} ${source?.title || ''}

OCRテキスト:
${contextText}`;

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
    const questions = Array.isArray(parsed.questions) ? parsed.questions : [];

    return new Response(JSON.stringify({ questions }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}
