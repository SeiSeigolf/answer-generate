export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const { question, pages, mode } = await req.json();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'API key not configured' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }

  const modeInstruction = {
    short: '1〜2文の簡潔な答案を作成してください。',
    standard: '200〜400字程度の標準的な答案を作成してください。',
    detailed: '400〜800字程度の詳細な答案を作成してください。各ポイントを丁寧に説明してください。',
  }[mode] || '標準的な答案を作成してください。';

  const contextText = pages.map(p =>
    `【${p.docTitle} p.${p.pageNumber}】\n${p.content}`
  ).join('\n\n');

  const systemPrompt = `あなたは医学生の試験対策を支援するAIです。
以下のルールを厳守してください：

1. 回答は必ず「授業資料」に書かれている内容のみを根拠にする
2. 資料に記載がない内容は「資料に記載なし」として本文に混ぜない
3. 各主張の末尾に根拠ページを【資料名 p.XX】形式で明記する
4. 医学的に正確で採点されやすい表現を使う
5. 読みやすくまとまった文章で答案を構成する
6. 資料の断片的なテキストをそのまま貼り付けず、必ず自分の言葉で整理して答案にする`;

  const userPrompt = `以下の授業資料を根拠として、問いに答えてください。

【問い】
${question}

【授業資料（根拠テキスト）】
${contextText}

【指示】
${modeInstruction}
答案の最後に「根拠ページ：」として参照したページ番号を列挙してください。`;

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
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return new Response(JSON.stringify({ error: data.error?.message || 'API error' }), {
        status: response.status, headers: { 'Content-Type': 'application/json' }
      });
    }

    const answer = data.content?.[0]?.text || '';
    return new Response(JSON.stringify({ answer }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}
