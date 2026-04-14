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
以下のルールを必ず守ってください：

1. 答案本文には「p.XX」「【資料名 p.XX】」などのページ参照を一切書かない
2. 答案本文は読みやすい文章のみにする
3. 資料に書かれている内容だけを根拠にする
4. 資料にない内容は本文に書かない
5. 医学的に正確で採点されやすい表現を使う
6. 資料の断片テキストをそのまま貼り付けず、整理した文章にする

出力フォーマット：
---答案---
（ここに答案本文のみ。ページ番号・出典は一切書かない）

---参考ページ---
・資料名 p.XX
・資料名 p.XX
（参照したページのみ列挙）`;

  const userPrompt = `以下の授業資料を根拠として、問いに答えてください。

【問い】
${question}

【授業資料】
${contextText}

【指示】
${modeInstruction}
上記のフォーマット通りに出力してください。答案本文にページ番号を書かないでください。`;

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
        max_tokens: 1200,
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

    const raw = data.content?.[0]?.text || '';

    // ---答案--- と ---参考ページ--- で分割
    const answerMatch = raw.match(/---答案---\s*([\s\S]*?)(?=---参考ページ---|$)/);
    const refsMatch = raw.match(/---参考ページ---\s*([\s\S]*?)$/);

    const answer = answerMatch ? answerMatch[1].trim() : raw.trim();
    const refsText = refsMatch ? refsMatch[1].trim() : '';
    const refs = refsText
      ? refsText.split('\n').map(l => l.replace(/^[・\-\*]\s*/, '').trim()).filter(l => l.length > 0)
      : pages.slice(0, 6).map(p => p.docTitle.split(' ')[0] + ' p.' + p.pageNumber);

    return new Response(JSON.stringify({ answer, refs }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}
