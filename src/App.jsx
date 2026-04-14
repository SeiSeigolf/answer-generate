import { useState, useEffect, useCallback, useRef } from "react";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf";

// iOS Safari対応: import.meta.urlを使わず静的パスで指定
pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

// ── Sample Data ───────────────────────────────────────────────────────────────
const SAMPLE_DOCS = [
  {
    id: "bio3", title: "生化学 第3回 糖代謝", courseName: "生化学",
    lectureNumber: 3, year: 2024, color: "#0F6E56",
    pages: [
      { id: "b3p12", pageNumber: 12, heading: "解糖系の概要", content: "解糖系はグルコースをピルビン酸へ変換し、ATPとNADHを産生する。1分子のグルコースから正味2ATP、2NADHが生成される。細胞質で進行する。", tags: ["解糖系","グルコース","ATP","NADH","ピルビン酸"] },
      { id: "b3p13", pageNumber: 13, heading: "律速酵素", content: "ホスホフルクトキナーゼ-1（PFK-1）は解糖系の律速酵素である。ATPにより阻害され、AMPにより活性化される。フルクトース-2,6-ビスリン酸はPFK-1の最も強力なアロステリック活性化因子であり、インスリンにより産生が促進される。", tags: ["PFK-1","律速酵素","アロステリック"] },
      { id: "b3p14", pageNumber: 14, heading: "嫌気的条件下の代謝", content: "嫌気条件ではピルビン酸は乳酸脱水素酵素（LDH）によって乳酸へ還元される。この反応によりNADHが再酸化されNAD+が再生され、解糖系の継続が可能となる。", tags: ["嫌気","乳酸","LDH","NAD+"] },
    ]
  },
  {
    id: "phys5", title: "生理学 第5回 呼吸生理", courseName: "生理学",
    lectureNumber: 5, year: 2024, color: "#185FA5",
    pages: [
      { id: "p5p22", pageNumber: 22, heading: "肺胞換気量", content: "肺胞換気量（VA）は1回換気量（VT）から死腔量（VD）を差し引いて求める。VA＝（VT－VD）×呼吸数。正常値は約4L/分。", tags: ["肺胞換気量","1回換気量","死腔"] },
      { id: "p5p23", pageNumber: 23, heading: "PaCO2と換気の関係", content: "PaCO2は肺胞換気量と反比例する。換気が低下するとPaCO2は上昇し（高CO2血症・呼吸性アシドーシス）、換気が亢進すると低下する（低CO2血症・呼吸性アルカローシス）。基準値は35-45mmHg。", tags: ["PaCO2","換気","高CO2血症"] },
    ]
  },
];

const MED_HEAVY = [
  "律速酵素","解糖系","TCA","ATP","NADH","ピルビン酸","アセチルCoA","グリコーゲン","インスリン","グルカゴン","阻害","活性化","アロステリック","LDH","PDH","PFK","NADPH",
  "換気","PaCO2","PaO2","ヘモグロビン","酸素","呼吸","肺","心臓","心エコー","エコー","超音波","心電図","心音","脈拍","血圧","心拍","駆出率","左室","右室","弁","大動脈","僧帽弁","三尖弁","肺動脈","心筋","心膜","心内膜","心不全","狭心症","心筋梗塞","不整脈","頻脈","徐脈","心房細動","心室細動",
  "炎症","ヒスタミン","プロスタグランジン","COX","マクロファージ","肉芽腫","補体","白血球","リンパ球","IL-1","TNF",
  "CYP","半減期","代謝","排泄","吸収",
  "診断","鑑別","治療","禁忌","適応","検査","所見","症状","病態","機序","定義","分類","予後","手術","投薬",
];

// ── PDF Extraction ────────────────────────────────────────────────────────────
async function renderPdfPageToBase64(pdf, pageNum, scale) {
  const page = await pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext("2d");
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas.toDataURL("image/jpeg", scale >= 1.5 ? 0.85 : 0.75).split(",")[1];
}

async function loadPdfDocument(file) {
  const arrayBuffer = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = () => reject(new Error("ファイル読み込みに失敗しました"));
    reader.readAsArrayBuffer(file);
  });
  const typedArray = new Uint8Array(arrayBuffer);
  return pdfjsLib.getDocument({ data: typedArray, useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true }).promise;
}

// 高精度モード: 1.5倍スケール・逐次処理
async function extractPdfPagesByVision(file, onProgress) {
  const pdf = await loadPdfDocument(file);
  const totalPages = pdf.numPages;
  const pages = [];
  for (let i = 1; i <= totalPages; i++) {
    if (onProgress) onProgress(i, totalPages);
    try {
      const imageBase64 = await renderPdfPageToBase64(pdf, i, 1.5);
      const res = await fetch("/api/extract-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64, pageNumber: i, totalPages }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "API error");
      const text = (data.text || "").trim();
      if (text.length > 10) {
        pages.push({ id: "pdf_" + Date.now() + "_p" + i, pageNumber: i, heading: "", content: text, tags: MED_HEAVY.filter(k => text.includes(k)).slice(0, 10) });
      }
    } catch (e) { console.warn("skip page", i, e); }
  }
  return pages;
}

// 高速モード: 1.0倍スケール・並列処理（最大4並列）
async function extractPdfPagesByVisionFast(file, onProgress) {
  const pdf = await loadPdfDocument(file);
  const totalPages = pdf.numPages;
  const pages = [];
  let completed = 0;
  const CONCURRENCY = 4;

  async function processPage(i) {
    try {
      const imageBase64 = await renderPdfPageToBase64(pdf, i, 1.0);
      const res = await fetch("/api/extract-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64, pageNumber: i, totalPages }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "API error");
      const text = (data.text || "").trim();
      completed++;
      if (onProgress) onProgress(completed, totalPages);
      if (text.length > 10) {
        return { id: "pdf_" + Date.now() + "_p" + i, pageNumber: i, heading: "", content: text, tags: MED_HEAVY.filter(k => text.includes(k)).slice(0, 10) };
      }
    } catch (e) {
      completed++;
      if (onProgress) onProgress(completed, totalPages);
      console.warn("skip page", i, e);
    }
    return null;
  }

  // ページを CONCURRENCY 件ずつ並列処理
  for (let i = 1; i <= totalPages; i += CONCURRENCY) {
    const batch = [];
    for (let j = i; j < i + CONCURRENCY && j <= totalPages; j++) {
      batch.push(processPage(j));
    }
    const results = await Promise.all(batch);
    for (const r of results) { if (r) pages.push(r); }
  }

  // ページ番号順に並べ直す
  pages.sort((a, b) => a.pageNumber - b.pageNumber);
  return pages;
}

async function extractPdfPagesText(file) {
  const arrayBuffer = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = () => reject(new Error("読み込み失敗"));
    reader.readAsArrayBuffer(file);
  });
  const typedArray = new Uint8Array(arrayBuffer);
  const pdf = await pdfjsLib.getDocument({ data: typedArray, useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    try {
      const page = await pdf.getPage(i);
      const tc = await page.getTextContent({ includeMarkedContent: false });
      let parts = [];
      for (let j = 0; j < tc.items.length; j++) { if (tc.items[j] && typeof tc.items[j].str === "string") parts.push(tc.items[j].str); }
      const text = parts.join(" ").replace(/\s+/g, " ").trim();
      if (text.length > 10) pages.push({ id: "pdf_" + Date.now() + "_p" + i, pageNumber: i, heading: "", content: text, tags: MED_HEAVY.filter(k => text.includes(k)).slice(0, 10) });
    } catch (e) { console.warn("skip", i, e); }
  }
  return pages;
}

// ── Search Engine ─────────────────────────────────────────────────────────────
function createEngine() {
  function tokenize(t) { return t.replace(/[はをがにでもとやのへからまでより、。？?！!「」【】（）\s]/g, " ").split(" ").filter(w => w.length >= 2); }
  function scorePage(page, question) {
    const qTokens = tokenize(question);
    const content = page.content, heading = page.heading || "";
    let score = 0; const reasons = [];
    for (const tag of page.tags) { if (question.includes(tag)) { score += 25; reasons.push("タグ「" + tag + "」"); } }
    for (const kw of MED_HEAVY) { if (kw.length >= 2 && question.includes(kw) && content.includes(kw)) { score += 18; reasons.push("医学語「" + kw + "」"); } }
    for (const tok of qTokens) {
      if (tok.length < 2) continue;
      if (heading.includes(tok)) { score += 15; reasons.push("見出し「" + tok + "」"); }
      else if (content.includes(tok)) { score += 8; reasons.push("本文「" + tok + "」"); }
    }
    return { score: Math.min(score, 100), reasons: [...new Set(reasons)].slice(0, 4) };
  }
  function search(docs, question, activeIds) {
    const results = [];
    for (const doc of docs.filter(d => activeIds.has(d.id))) {
      for (const page of doc.pages) {
        const { score, reasons } = scorePage(page, question);
        if (score > 0) results.push({ doc, page, score, reasons });
      }
    }
    return results.sort((a, b) => b.score - a.score).slice(0, 12);
  }
  return { search };
}
const engine = createEngine();

// ── Claude API ────────────────────────────────────────────────────────────────
async function callClaudeAPI(question, searchResults, mode) {
  const pages = searchResults.slice(0, 8).map(({ doc, page }) => ({
    docTitle: doc.title, pageNumber: page.pageNumber, content: page.content,
  }));
  const res = await fetch("/api/answer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, pages, mode }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "API error");
  // APIがanswer/refsを分離して返す
  return { answer: data.answer || "", refs: data.refs || [] };
}

// ── PDF Export ────────────────────────────────────────────────────────────────
function exportToPdf(items) {
  const html = `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8">
  <style>
    body { font-family: 'Hiragino Sans', sans-serif; font-size: 13px; line-height: 1.8; color: #111; max-width: 800px; margin: 40px auto; padding: 0 40px; }
    h1 { font-size: 18px; font-weight: 700; color: #0F6E56; border-bottom: 2px solid #0F6E56; padding-bottom: 8px; margin-bottom: 24px; }
    .item { margin-bottom: 40px; page-break-inside: avoid; }
    .question { font-size: 14px; font-weight: 700; color: #111; margin-bottom: 12px; padding: 10px 14px; background: #f0f9f5; border-left: 3px solid #0F6E56; border-radius: 4px; }
    .answer { font-size: 13px; line-height: 1.9; color: #1a1a1a; margin-bottom: 12px; white-space: pre-wrap; }
    .refs { font-size: 11px; color: #555; background: #f7f7f5; padding: 10px 14px; border-radius: 6px; border: 0.5px solid #e5e7eb; }
    .refs-title { font-weight: 700; margin-bottom: 6px; color: #888; text-transform: uppercase; font-size: 10px; letter-spacing: 0.5px; }
    .ref-item { padding: 2px 0; }
    .divider { border: none; border-top: 0.5px solid #e5e7eb; margin: 32px 0; }
    .meta { font-size: 10px; color: #bbb; margin-bottom: 4px; }
  </style></head><body>
  <h1>Med Answer Builder — 答案集</h1>
  ${items.map((item, i) => `
    <div class="item">
      <div class="meta">${new Date(item.createdAt).toLocaleDateString("ja-JP")} · ${item.docNames || ""}</div>
      <div class="question">Q${i + 1}. ${item.question}</div>
      <div class="answer">${item.answer}</div>
      ${item.refs && item.refs.length ? `<div class="refs"><div class="refs-title">参考ページ</div>${item.refs.map(r => `<div class="ref-item">・${r}</div>`).join("")}</div>` : ""}
    </div>
    ${i < items.length - 1 ? '<hr class="divider">' : ""}
  `).join("")}
  </body></html>`;
  const win = window.open("", "_blank");
  win.document.write(html);
  win.document.close();
  setTimeout(() => { win.print(); }, 500);
}

// ── localStorage helpers ──────────────────────────────────────────────────────
const LS = {
  docs: "emab_docs_v7", active: "emab_active_v7", q: "emab_q_v7",
  aiMode: "emab_aimode_v7", history: "emab_history_v7"
};
function ls(key, fallback) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } }
function lsSet(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }
function uid() { return "id_" + Math.random().toString(36).slice(2); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const GREEN = "#0F6E56", PURPLE = "#534AB7";

// ── Sub Components ────────────────────────────────────────────────────────────
function ScoreBar({ score }) {
  const c = score >= 60 ? GREEN : score >= 30 ? "#BA7517" : "#A32D2D";
  return (
    <div style={{ width: 38, flexShrink: 0 }}>
      <div style={{ height: 3, background: "#e5e7eb", borderRadius: 2 }}><div style={{ height: 3, width: score + "%", background: c, borderRadius: 2 }} /></div>
      <div style={{ fontSize: 9, color: "#aaa", textAlign: "center", marginTop: 1 }}>{score}</div>
    </div>
  );
}

function PdfUploadButton({ onDone }) {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [startTime, setStartTime] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const [mode, setMode] = useState("accurate");
  const timerRef = useRef(null);

  const MODES = [
    { id: "accurate", label: "🎯 高精度", desc: "高解像度・逐次処理", color: "#0F6E56", warning: null },
    { id: "fast",     label: "⚡ 高速",   desc: "標準解像度・4並列処理", color: "#BA7517", warning: "精度がやや低下する場合あり" },
    { id: "text",     label: "📝 テキスト", desc: "PDF内テキスト直接取得", color: "#185FA5", warning: "スライドPDFは失敗する場合あり" },
  ];
  const currentMode = MODES.find(m => m.id === mode);

  function startTimer() {
    const t0 = Date.now();
    setStartTime(t0);
    setElapsed(0);
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - t0) / 1000));
    }, 1000);
  }
  function stopTimer() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }

  function formatTime(sec) {
    if (sec < 60) return sec + "秒";
    return Math.floor(sec / 60) + "分" + (sec % 60) + "秒";
  }

  function calcRemaining(current, total, elapsedSec) {
    if (current === 0 || elapsedSec === 0) return null;
    const perPage = elapsedSec / current;
    const remaining = Math.ceil(perPage * (total - current));
    return remaining;
  }

  async function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.type !== "application/pdf") { setError("PDFを選択してください"); return; }
    setLoading(true); setError(""); setProgress({ current: 0, total: 0 });
    startTimer();
    try {
      let pages = [];
      const onProg = (cur, total) => setProgress({ current: cur, total });
      if (mode === "accurate") {
        pages = await extractPdfPagesByVision(file, onProg);
      } else if (mode === "fast") {
        pages = await extractPdfPagesByVisionFast(file, onProg);
      } else {
        pages = await extractPdfPagesText(file);
      }
      stopTimer();
      if (!pages.length) {
        setError("テキストを抽出できませんでした。別のモードを試してください。");
        setLoading(false); return;
      }
      onDone({
        id: "id_" + Math.random().toString(36).slice(2),
        title: file.name.replace(/\.pdf$/i, ""),
        courseName: file.name.replace(/\.pdf$/i, ""),
        lectureNumber: 1, year: new Date().getFullYear(), color: "#534AB7", pages,
      });
    } catch (err) {
      stopTimer();
      setError("読み込み失敗: " + err.message);
    }
    setLoading(false);
    e.target.value = "";
  }

  const pct = progress.total > 0 ? Math.round(progress.current / progress.total * 100) : 0;
  const remaining = calcRemaining(progress.current, progress.total, elapsed);

  return (
    <div style={{ marginBottom: 4 }}>

      {/* モード切り替え — 大きめのボタン */}
      <div style={{ fontSize: 10, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>
        アップロードモード
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
        {MODES.map(m => (
          <button key={m.id} onClick={() => !loading && setMode(m.id)} disabled={loading}
            style={{
              display: "flex", alignItems: "center", gap: 10, width: "100%",
              padding: "9px 12px", border: "0.5px solid " + (mode === m.id ? m.color : "#e5e7eb"),
              borderRadius: 9, cursor: loading ? "not-allowed" : "pointer",
              background: mode === m.id ? m.color + "12" : "#fff",
              fontFamily: "inherit", textAlign: "left", transition: "all 0.12s",
            }}>
            {/* 選択インジケーター */}
            <div style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid " + (mode === m.id ? m.color : "#ddd"), background: mode === m.id ? m.color : "transparent", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {mode === m.id && <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#fff" }} />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: mode === m.id ? m.color : "#555" }}>{m.label}</div>
              <div style={{ fontSize: 10, color: "#aaa", marginTop: 1 }}>{m.desc}{m.warning && <span style={{ color: "#f59e0b", marginLeft: 4 }}>⚠ {m.warning}</span>}</div>
            </div>
          </button>
        ))}
      </div>

      {/* アップロードボタン */}
      <label style={{
        display: "block", width: "100%", padding: "11px 0",
        border: "0.5px dashed " + (loading ? "#ccc" : currentMode.color),
        borderRadius: 8, fontSize: 12, color: loading ? "#aaa" : currentMode.color,
        background: loading ? "#fafafa" : currentMode.color + "08",
        cursor: loading ? "not-allowed" : "pointer", textAlign: "center",
        fontWeight: 600, boxSizing: "border-box",
      }}>
        {loading ? "読み取り中…" : "📄 PDFをアップロード"}
        <input type="file" accept="application/pdf" onChange={handleFile} disabled={loading} style={{ display: "none" }} />
      </label>

      {/* 進捗表示 */}
      {loading && (
        <div style={{ marginTop: 10, background: "#fff", border: "0.5px solid #e5e7eb", borderRadius: 9, padding: "12px 14px" }}>
          {/* ページカウントと残り時間 */}
          <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
            <div style={{ flex: 1 }}>
              {progress.total > 0 ? (
                <div style={{ fontSize: 13, fontWeight: 700, color: currentMode.color }}>
                  {progress.current} / {progress.total} ページ完了
                </div>
              ) : (
                <div style={{ fontSize: 13, fontWeight: 700, color: "#888" }}>準備中…</div>
              )}
              <div style={{ fontSize: 11, color: "#aaa", marginTop: 2 }}>
                経過: {formatTime(elapsed)}
                {remaining !== null && remaining > 0 && (
                  <span style={{ marginLeft: 8, color: currentMode.color, fontWeight: 500 }}>
                    残り約 {formatTime(remaining)}
                  </span>
                )}
                {remaining === 0 && <span style={{ marginLeft: 8, color: GREEN }}>もうすぐ完了</span>}
              </div>
            </div>
            {progress.total > 0 && (
              <div style={{ fontSize: 22, fontWeight: 700, color: currentMode.color, flexShrink: 0 }}>
                {pct}%
              </div>
            )}
          </div>

          {/* プログレスバー */}
          {progress.total > 0 && (
            <div>
              <div style={{ height: 6, background: "#f3f4f6", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ height: 6, width: pct + "%", background: currentMode.color, borderRadius: 3, transition: "width 0.4s ease" }} />
              </div>
              {/* ページドット（20ページ以下のときだけ表示） */}
              {progress.total <= 20 && (
                <div style={{ display: "flex", gap: 3, marginTop: 8, flexWrap: "wrap" }}>
                  {Array.from({ length: progress.total }).map((_, i) => (
                    <div key={i} style={{
                      width: 18, height: 18, borderRadius: 4, fontSize: 9, fontWeight: 600,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: i < progress.current ? currentMode.color : "#f3f4f6",
                      color: i < progress.current ? "#fff" : "#bbb",
                      transition: "all 0.3s",
                    }}>
                      {i + 1}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {error && <div style={{ fontSize: 11, color: "#e24b4a", marginTop: 6, padding: "6px 8px", background: "#fff5f5", borderRadius: 6 }}>{error}</div>}
    </div>
  );
}


function DocModal({ doc, onClose, onSave }) {
  const [form, setForm] = useState(doc || { id: uid(), title: "", courseName: "", lectureNumber: 1, year: 2024, color: GREEN, pages: [] });
  const [raw, setRaw] = useState(doc ? doc.pages.map(p => "p" + p.pageNumber + ": " + p.content).join("\n") : "");
  function parsePgs(text) {
    return text.split("\n").filter(l => l.trim()).map((line, i) => {
      const m = line.match(/^p(\d+)[:\s：]+(.+)/);
      if (m) { const c = m[2].trim(); return { id: uid(), pageNumber: parseInt(m[1]), heading: "", content: c, tags: MED_HEAVY.filter(k => c.includes(k)).slice(0, 8) }; }
      return { id: uid(), pageNumber: i + 1, heading: "", content: line.trim(), tags: [] };
    }).filter(p => p.content);
  }
  const colors = [GREEN, "#185FA5", "#854F0B", "#993556", PURPLE, "#3B6D11"];
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300, padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 12, padding: 20, width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>{doc ? "資料を編集" : "テキストで資料を追加"}</div>
        {[["title", "資料タイトル", "例：生化学 第3回"], ["courseName", "科目名", "例：生化学"]].map(([k, lbl, ph]) => (
          <div key={k} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: "#666", marginBottom: 3 }}>{lbl}</div>
            <input value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} placeholder={ph}
              style={{ width: "100%", padding: "8px 10px", border: "0.5px solid #ddd", borderRadius: 7, fontSize: 13, fontFamily: "inherit", outline: "none", color: "#111", boxSizing: "border-box" }} />
          </div>
        ))}
        <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
          {[["lectureNumber", "講義番号"], ["year", "年度"]].map(([k, lbl]) => (
            <div key={k} style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 500, color: "#666", marginBottom: 3 }}>{lbl}</div>
              <input type="number" value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: parseInt(e.target.value) || 1 }))}
                style={{ width: "100%", padding: "8px 10px", border: "0.5px solid #ddd", borderRadius: 7, fontSize: 13, fontFamily: "inherit", outline: "none", color: "#111", boxSizing: "border-box" }} />
            </div>
          ))}
        </div>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: "#666", marginBottom: 6 }}>カラー</div>
          <div style={{ display: "flex", gap: 8 }}>{colors.map(c => <div key={c} onClick={() => setForm(f => ({ ...f, color: c }))} style={{ width: 24, height: 24, borderRadius: "50%", background: c, cursor: "pointer", border: form.color === c ? "3px solid #111" : "3px solid transparent" }} />)}</div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: "#666", marginBottom: 3 }}>資料テキスト（p番号:内容 形式）</div>
          <textarea value={raw} onChange={e => setRaw(e.target.value)} rows={8}
            placeholder={"p12: 解糖系はグルコースをピルビン酸へ…\np13: 律速酵素はPFK-1…"}
            style={{ width: "100%", padding: "8px 10px", border: "0.5px solid #ddd", borderRadius: 7, fontSize: 12, fontFamily: "monospace", outline: "none", resize: "vertical", color: "#111", lineHeight: 1.6, boxSizing: "border-box" }} />
          <div style={{ fontSize: 11, color: "#aaa", marginTop: 3 }}>{raw.split("\n").filter(l => l.match(/^p\d+/)).length}ページ認識済み</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 10, border: "0.5px solid #ddd", borderRadius: 8, fontSize: 13, background: "transparent", cursor: "pointer", fontFamily: "inherit", color: "#666" }}>キャンセル</button>
          <button onClick={() => { if (!form.title.trim()) { alert("タイトルを入力してください"); return; } onSave({ ...form, pages: parsePgs(raw) }); }}
            style={{ flex: 2, padding: 10, background: GREEN, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>保存する</button>
        </div>
      </div>
    </div>
  );
}

// ── History Item Component ────────────────────────────────────────────────────
function HistoryItem({ item, onDelete, onReuse }) {
  const [expanded, setExpanded] = useState(false);
  const dateStr = new Date(item.createdAt).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <div style={{ background: "#fff", border: "0.5px solid #e5e7eb", borderRadius: 10, marginBottom: 6, overflow: "hidden" }}>
      {/* ヘッダー行 — タップで展開 */}
      <div onClick={() => setExpanded(v => !v)}
        style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 14px", cursor: "pointer", userSelect: "none" }}>
        {/* 展開アイコン */}
        <div style={{ fontSize: 10, color: "#bbb", flexShrink: 0, transition: "transform 0.2s", transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }}>▶</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: "#bbb", marginBottom: 2 }}>{dateStr} · {item.docNames}</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#111", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {item.questions.length === 1
              ? item.questions[0]
              : item.questions.length + "問 — " + item.questions[0].slice(0, 25) + "…"}
          </div>
        </div>
        <div style={{ fontSize: 10, color: "#aaa", flexShrink: 0 }}>{item.questions.length}問</div>
      </div>

      {/* 展開コンテンツ */}
      {expanded && (
        <div style={{ borderTop: "0.5px solid #f3f4f6", padding: "12px 14px" }}>
          {item.results.map((r, i) => (
            <div key={i} style={{ marginBottom: i < item.results.length - 1 ? 16 : 0 }}>
              {/* 問い */}
              <div style={{ fontSize: 11, fontWeight: 700, color: "#777", marginBottom: 6, padding: "5px 10px", background: "#f7f7f5", borderRadius: 6 }}>
                Q{i + 1}. {r.question}
              </div>
              {/* 答案本文 */}
              <div style={{ fontSize: 12, color: "#1a1a1a", lineHeight: 1.9, background: "#f9fffe", borderRadius: 8, padding: "10px 12px", borderLeft: "2px solid " + GREEN, whiteSpace: "pre-wrap", marginBottom: 6 }}>
                {r.answer}
              </div>
              {/* 参考ページ */}
              {r.refs && r.refs.length > 0 && (
                <div style={{ fontSize: 11, color: "#888", background: "#f7f7f5", borderRadius: 6, padding: "7px 10px" }}>
                  <span style={{ fontWeight: 700, color: "#aaa", marginRight: 6 }}>参考</span>
                  {r.refs.join(" · ")}
                </div>
              )}
            </div>
          ))}

          {/* アクションボタン */}
          <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
            <button onClick={() => onReuse(item)}
              style={{ flex: 1, fontSize: 11, padding: "7px 0", border: "0.5px solid " + GREEN, borderRadius: 7, background: "transparent", cursor: "pointer", color: GREEN, fontWeight: 600, fontFamily: "inherit" }}>
              問いを再利用
            </button>
            <button onClick={() => exportToPdf(item.results.map(r => ({ ...r, createdAt: item.createdAt, docNames: item.docNames })))}
              style={{ flex: 1, fontSize: 11, padding: "7px 0", border: "0.5px solid #e5e7eb", borderRadius: 7, background: "transparent", cursor: "pointer", color: "#555", fontFamily: "inherit" }}>
              📄 PDF出力
            </button>
            <button onClick={() => onDelete(item.id)}
              style={{ fontSize: 11, padding: "7px 10px", border: "0.5px solid #fecaca", borderRadius: 7, background: "transparent", cursor: "pointer", color: "#e24b4a", fontFamily: "inherit" }}>
              削除
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


const NAV_ITEMS = [
  { id: "docs", icon: "📚", label: "資料" },
  { id: "input", icon: "✏️", label: "問題" },
  { id: "result", icon: "📄", label: "答案" },
  { id: "history", icon: "🕐", label: "履歴" },
];

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [docs, setDocs]           = useState(() => ls(LS.docs, SAMPLE_DOCS));
  const [activeIds, setActiveIds] = useState(() => new Set(ls(LS.active, SAMPLE_DOCS.map(d => d.id))));
  const [questionsText, setQuestionsText] = useState(() => ls(LS.q, ""));
  const [mode, setMode]           = useState("standard");
  const [aiMode, setAiMode]       = useState(() => ls(LS.aiMode, true));
  const [running, setRunning]     = useState(false);
  const [stepLabel, setStepLabel] = useState("");
  const [results, setResults]     = useState([]); // [{question, answer, refs, searchResults}]
  const [errors, setErrors]       = useState([]);
  const [history, setHistory]     = useState(() => ls(LS.history, []));
  const [modal, setModal]         = useState(null);
  const [mobileTab, setMobileTab] = useState("input");
  const [isMobile, setIsMobile]   = useState(false);
  const [desktopTab, setDesktopTab] = useState("result");
  const centerRef = useRef(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check(); window.addEventListener("resize", check); return () => window.removeEventListener("resize", check);
  }, []);
  useEffect(() => { lsSet(LS.docs, docs); }, [docs]);
  useEffect(() => { lsSet(LS.active, [...activeIds]); }, [activeIds]);
  useEffect(() => { lsSet(LS.q, questionsText); }, [questionsText]);
  useEffect(() => { lsSet(LS.aiMode, aiMode); }, [aiMode]);
  useEffect(() => { lsSet(LS.history, history); }, [history]);

  const toggleActive = useCallback(id => {
    setActiveIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);

  // 問いをパース（空行区切り or 番号付き）
  function parseQuestions(text) {
    const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);
    const questions = [];
    let current = "";
    for (const line of lines) {
      // 番号付き問い（1. や Q1. など）は新しい問いとして扱う
      if (/^[QqＱ]?\d+[.．、\s]/.test(line) && current.trim()) {
        questions.push(current.trim());
        current = line.replace(/^[QqＱ]?\d+[.．、\s]+/, "");
      } else {
        current += (current ? " " : "") + line;
      }
    }
    if (current.trim()) questions.push(current.trim());
    return questions.length > 0 ? questions : [text.trim()];
  }

  async function runPipeline() {
    const questions = parseQuestions(questionsText);
    if (!questions[0]) { alert("問題文を入力してください"); return; }
    if (activeIds.size === 0) { alert("資料を1つ以上選択してください"); return; }
    setRunning(true); setResults([]); setErrors([]);
    if (isMobile) setMobileTab("result");

    const newResults = [];
    const newErrors = [];

    for (let qi = 0; qi < questions.length; qi++) {
      const question = questions[qi];
      setStepLabel("Q" + (qi + 1) + "/" + questions.length + " 検索中…");
      await sleep(100);

      const sr = engine.search(docs, question, activeIds);
      if (sr.length === 0) {
        newErrors.push({ question, message: "関連するページが見つかりませんでした" });
        continue;
      }

      if (aiMode) {
        setStepLabel("Q" + (qi + 1) + "/" + questions.length + " Claude APIで生成中…");
        try {
          const { answer: aiAnswer, refs: aiRefs } = await callClaudeAPI(question, sr, mode);
          newResults.push({ question, answer: aiAnswer, refs: aiRefs, searchResults: sr });
        } catch (err) {
          newErrors.push({ question, message: "API エラー: " + err.message });
        }
      } else {
        // ルールベース
        const topPages = sr.slice(0, 4);
        const answer = topPages.map(({ doc, page }) => page.content).join("\n\n");
        const refs = topPages.map(({ doc, page }) => doc.title.split(" ")[0] + " p." + page.pageNumber + " — " + page.content.slice(0, 50) + "…");
        newResults.push({ question, answer, refs, searchResults: sr });
      }
    }

    setResults(newResults);
    setErrors(newErrors);

    // 履歴に保存
    if (newResults.length > 0) {
      const historyItem = {
        id: uid(),
        createdAt: Date.now(),
        questions: newResults.map(r => r.question),
        results: newResults.map(r => ({ question: r.question, answer: r.answer, refs: r.refs })),
        docNames: docs.filter(d => activeIds.has(d.id)).map(d => d.courseName).join("、"),
        mode,
      };
      setHistory(prev => [historyItem, ...prev].slice(0, 100)); // 最大100件
    }

    setStepLabel("完了");
    setRunning(false);
  }


  function deleteDoc(id) {
    if (!confirm("この資料を削除しますか？")) return;
    setDocs(d => d.filter(x => x.id !== id));
    setActiveIds(s => { const n = new Set(s); n.delete(id); return n; });
  }
  function saveDoc(doc) {
    setDocs(prev => { const i = prev.findIndex(d => d.id === doc.id); if (i >= 0) { const n = [...prev]; n[i] = doc; return n; } return [...prev, doc]; });
    setActiveIds(s => new Set([...s, doc.id]));
    setModal(null);
  }
  function exportDocs() {
    const b = new Blob([JSON.stringify(docs, null, 2)], { type: "application/json" });
    const u = URL.createObjectURL(b); const a = document.createElement("a"); a.href = u; a.download = "emab_docs.json"; a.click(); URL.revokeObjectURL(u);
  }
  function importDocs(e) {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader(); r.onload = ev => { try { const d = JSON.parse(ev.target.result); setDocs(d); setActiveIds(new Set(d.map(x => x.id))); } catch { alert("読み込みエラー"); } }; r.readAsText(f); e.target.value = "";
  }
  function deleteHistory(id) { setHistory(prev => prev.filter(h => h.id !== id)); }
  function reuseHistory(item) { setQuestionsText(item.questions.join("\n")); if (isMobile) setMobileTab("input"); }
  function exportCurrentToPdf() {
    const items = results.map(r => ({ ...r, createdAt: Date.now(), docNames: docs.filter(d => activeIds.has(d.id)).map(d => d.courseName).join("、") }));
    exportToPdf(items);
  }

  const allOn = docs.every(d => activeIds.has(d.id));
  const accentColor = aiMode ? PURPLE : GREEN;

  // ── DocPanel ──────────────────────────────────────────────────────────────────
  const DocPanel = (
    <div style={{ padding: isMobile ? "12px" : "14px", overflowY: "auto", flex: 1 }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: 0.8, flex: 1 }}>授業資料</span>
        <button onClick={() => setActiveIds(allOn ? new Set() : new Set(docs.map(d => d.id)))} style={{ fontSize: 11, color: GREEN, background: "transparent", border: "none", cursor: "pointer", fontWeight: 600, fontFamily: "inherit" }}>{allOn ? "全解除" : "全選択"}</button>
      </div>
      <PdfUploadButton onDone={doc => saveDoc(doc)} />
      <div style={{ textAlign: "center", fontSize: 11, color: "#ccc", margin: "6px 0" }}>または</div>
      <button onClick={() => setModal("add")} style={{ width: "100%", padding: 9, border: "0.5px dashed #ccc", borderRadius: 8, fontSize: 12, color: "#888", background: "transparent", cursor: "pointer", fontFamily: "inherit", marginBottom: 12, boxSizing: "border-box" }}>
        ＋ テキストで追加
      </button>
      {docs.map(doc => (
        <div key={doc.id} onClick={() => toggleActive(doc.id)}
          style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "9px 8px", borderRadius: 9, cursor: "pointer", background: activeIds.has(doc.id) ? "#fff" : "transparent", border: "0.5px solid " + (activeIds.has(doc.id) ? "#e5e7eb" : "transparent"), marginBottom: 4 }}>
          <div style={{ width: 30, height: 30, borderRadius: 7, background: doc.color + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: doc.color, flexShrink: 0 }}>{doc.courseName[0]}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{doc.title}</div>
            <div style={{ fontSize: 11, color: "#999" }}>{doc.courseName} · {doc.year}</div>
            <div style={{ fontSize: 10, color: "#ccc" }}>{doc.pages.length}ページ</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, flexShrink: 0 }}>
            <div style={{ width: 14, height: 14, borderRadius: "50%", background: activeIds.has(doc.id) ? doc.color : "#e5e7eb" }} />
            <button onClick={e => { e.stopPropagation(); setModal(doc); }} style={{ fontSize: 9, color: "#aaa", background: "transparent", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" }}>編集</button>
            <button onClick={e => { e.stopPropagation(); deleteDoc(doc.id); }} style={{ fontSize: 9, color: "#e24b4a", background: "transparent", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" }}>削除</button>
          </div>
        </div>
      ))}
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <button onClick={exportDocs} style={{ flex: 1, fontSize: 11, padding: "6px 0", border: "0.5px solid #e5e7eb", borderRadius: 7, background: "transparent", cursor: "pointer", color: "#666", fontFamily: "inherit" }}>エクスポート</button>
        <label style={{ flex: 1, fontSize: 11, padding: "6px 0", border: "0.5px solid #e5e7eb", borderRadius: 7, background: "transparent", cursor: "pointer", color: "#666", textAlign: "center" }}>
          インポート<input type="file" accept=".json" onChange={importDocs} style={{ display: "none" }} />
        </label>
      </div>
    </div>
  );

  // ── InputPanel ────────────────────────────────────────────────────────────────
  const InputPanel = (
    <div style={{ padding: isMobile ? "12px" : "14px", display: "flex", flexDirection: "column", gap: 12, overflowY: "auto", flex: 1 }}>
      {/* AI Mode Toggle */}
      <div style={{ background: aiMode ? "#f5f3ff" : "#f0faf6", borderRadius: 10, padding: "10px 12px", border: "0.5px solid " + (aiMode ? "#c4b5fd" : "#6ee7b7") }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: aiMode ? PURPLE : GREEN }}>{aiMode ? "✨ AIモード（Claude API）" : "📋 ルールベースモード"}</div>
            <div style={{ fontSize: 10, color: "#888", marginTop: 1 }}>{aiMode ? "資料を根拠にClaudeが答案を生成" : "キーワードマッチで関連ページを表示"}</div>
          </div>
          <button onClick={() => setAiMode(v => !v)}
            style={{ width: 44, height: 24, borderRadius: 12, background: aiMode ? PURPLE : "#ccc", border: "none", cursor: "pointer", position: "relative", flexShrink: 0 }}>
            <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: aiMode ? 23 : 3, transition: "left 0.2s" }} />
          </button>
        </div>
      </div>

      {/* 複数問い入力 */}
      <div>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: 0.8, flex: 1 }}>問題入力</div>
          <div style={{ fontSize: 10, color: "#aaa" }}>複数可 / 番号付き or 空行区切り</div>
        </div>
        <textarea value={questionsText} onChange={e => setQuestionsText(e.target.value)} rows={isMobile ? 7 : 9}
          placeholder={"1問でも複数問でも入力できます\n\n例（複数）：\n1. 解糖系の律速酵素を述べよ\n2. 嫌気条件下のピルビン酸の代謝を説明せよ\n3. TCAサイクルの入口となる物質は何か"}
          style={{ width: "100%", border: "0.5px solid #e5e7eb", borderRadius: 8, padding: "10px", fontSize: 13, fontFamily: "inherit", resize: "none", outline: "none", lineHeight: 1.6, color: "#111", background: "#fff", boxSizing: "border-box" }} />
        <div style={{ fontSize: 10, color: "#aaa", marginTop: 3 }}>
          {parseQuestions(questionsText).filter(q => q.length > 0).length}問 認識済み
        </div>
      </div>

      {/* 答案形式 */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>答案形式</div>
        <div style={{ display: "flex", gap: 6 }}>
          {[["short", "1行"], ["standard", "標準"], ["detailed", "詳細"]].map(([k, v]) => (
            <button key={k} onClick={() => setMode(k)}
              style={{ flex: 1, padding: "8px 4px", border: "0.5px solid " + (mode === k ? accentColor : "#e5e7eb"), borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: "pointer", background: mode === k ? accentColor : "#fff", color: mode === k ? "#fff" : "#888", fontFamily: "inherit" }}>
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* 使用中資料 */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>使用中の資料</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {docs.filter(d => activeIds.has(d.id)).map(d => (
            <span key={d.id} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 10, background: d.color + "18", color: d.color, fontWeight: 500 }}>{d.courseName}</span>
          ))}
          {activeIds.size === 0 && <span style={{ fontSize: 11, color: "#aaa" }}>資料が選択されていません</span>}
        </div>
      </div>

      <button onClick={runPipeline} disabled={running}
        style={{ width: "100%", padding: 12, background: running ? "#ccc" : accentColor, color: "#fff", border: "none", borderRadius: 9, fontSize: 14, fontWeight: 700, cursor: running ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
        {running ? stepLabel || "処理中…" : "答案を作成する"}
      </button>

      {running && (
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <div style={{ display: "flex", gap: 3 }}>{[0,1,2].map(i => <div key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: accentColor, opacity: [1,0.5,0.2][i], animation: "pulse 1s infinite", animationDelay: i * 0.2 + "s" }} />)}</div>
          <span style={{ fontSize: 11, color: accentColor, fontWeight: 500 }}>{stepLabel}</span>
        </div>
      )}
    </div>
  );

  // ── ResultPanel ───────────────────────────────────────────────────────────────
  const ResultPanel = (
    <div ref={centerRef} style={{ overflowY: "auto", padding: isMobile ? "12px" : "16px", flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
      {results.length === 0 && errors.length === 0 && !running && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", textAlign: "center", gap: 10, padding: 24 }}>
          <div style={{ fontSize: 36 }}>📋</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#444" }}>授業資料から答案を作成します</div>
          <div style={{ fontSize: 12, color: "#aaa", lineHeight: 1.8 }}>PDFをアップロードして問題を入力してください<br />複数問を一括処理することもできます</div>
        </div>
      )}

      {/* エラー */}
      {errors.map((err, i) => (
        <div key={i} style={{ background: "#fff5f5", border: "0.5px solid #fecaca", borderRadius: 10, padding: "12px 14px" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#dc2626", marginBottom: 4 }}>⚠ {err.question.slice(0, 40)}{err.question.length > 40 ? "…" : ""}</div>
          <div style={{ fontSize: 12, color: "#7f1d1d" }}>{err.message}</div>
        </div>
      ))}

      {/* 答案一覧 */}
      {results.length > 0 && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#333" }}>{results.length}問の答案</div>
            <button onClick={exportCurrentToPdf}
              style={{ marginLeft: "auto", fontSize: 11, padding: "5px 12px", border: "0.5px solid " + accentColor, borderRadius: 7, background: "transparent", cursor: "pointer", color: accentColor, fontWeight: 600, fontFamily: "inherit" }}>
              📄 PDFで出力
            </button>
          </div>

          {results.map((r, i) => (
            <div key={i} style={{ background: "#fff", border: "0.5px solid " + accentColor + "44", borderRadius: 10, padding: "14px 16px" }}>
              {/* 問い */}
              <div style={{ fontSize: 12, fontWeight: 700, color: "#555", marginBottom: 10, padding: "8px 12px", background: "#f7f7f5", borderRadius: 7, borderLeft: "2px solid #ccc" }}>
                Q{i + 1}. {r.question}
              </div>

              {/* 答案本文（参考ページなし） */}
              <div style={{ fontSize: 13, lineHeight: 1.95, color: "#1a1a1a", background: "#f9fffe", borderRadius: 8, padding: "12px 14px", borderLeft: "3px solid " + accentColor, whiteSpace: "pre-wrap", marginBottom: 10 }}>
                {r.answer}
              </div>

              {/* 参考ページ 別ボックス */}
              {r.refs && r.refs.length > 0 && (
                <div style={{ background: "#f7f7f5", borderRadius: 8, padding: "10px 12px", border: "0.5px solid #e5e7eb" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#aaa", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>参考ページ</div>
                  {r.refs.map((ref, j) => (
                    <div key={j} style={{ fontSize: 11, color: "#555", padding: "3px 0", borderBottom: j < r.refs.length - 1 ? "0.5px solid #eee" : "none", lineHeight: 1.5 }}>
                      <span style={{ color: accentColor, fontWeight: 600, marginRight: 4 }}>{j + 1}.</span>{ref}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );

  // ── HistoryPanel ──────────────────────────────────────────────────────────────
  const HistoryPanel = (
    <div style={{ overflowY: "auto", padding: isMobile ? "12px" : "16px", flex: 1 }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>答案履歴</div>
        <div style={{ fontSize: 11, color: "#aaa" }}>{history.length}件</div>
        {history.length > 0 && (
          <button onClick={() => { if (confirm("履歴を全件削除しますか？")) setHistory([]); }}
            style={{ fontSize: 10, color: "#e24b4a", background: "transparent", border: "none", cursor: "pointer", marginLeft: 8, fontFamily: "inherit" }}>
            全削除
          </button>
        )}
      </div>
      {history.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 16px", color: "#ccc" }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🕐</div>
          <div style={{ fontSize: 12 }}>まだ履歴がありません</div>
        </div>
      )}
      {history.map(item => (
        <HistoryItem key={item.id} item={item} onDelete={deleteHistory} onReuse={reuseHistory} />
      ))}
    </div>
  );

  // ── Mobile ────────────────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100vh", fontFamily: "'Hiragino Sans','Yu Gothic UI',sans-serif", fontSize: 13, color: "#111", background: "#f7f7f5" }}>
        <div style={{ background: "#fff", borderBottom: "0.5px solid #e5e7eb", padding: "10px 14px", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}><span style={{ color: accentColor }}>Med</span> Answer</div>
          <span style={{ fontSize: 10, fontWeight: 500, background: aiMode ? "#ede9fe" : "#E1F5EE", color: aiMode ? PURPLE : GREEN, padding: "2px 7px", borderRadius: 10 }}>
            {aiMode ? "✨ AI" : "📋 ルール"}
          </span>
          {running && <div style={{ fontSize: 10, color: accentColor, fontWeight: 500, marginLeft: "auto" }}>{stepLabel}</div>}
          {!running && results.length > 0 && <div style={{ fontSize: 10, color: GREEN, fontWeight: 600, marginLeft: "auto" }}>✓ {results.length}問完了</div>}
        </div>
        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {mobileTab === "docs" && DocPanel}
          {mobileTab === "input" && InputPanel}
          {mobileTab === "result" && ResultPanel}
          {mobileTab === "history" && HistoryPanel}
        </div>
        <div style={{ display: "flex", background: "#fff", borderTop: "0.5px solid #e5e7eb", flexShrink: 0 }}>
          {NAV_ITEMS.map(item => (
            <button key={item.id} onClick={() => setMobileTab(item.id)}
              style={{ flex: 1, padding: "10px 4px 12px", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", borderTop: "2px solid " + (mobileTab === item.id ? accentColor : "transparent") }}>
              <span style={{ fontSize: 18 }}>{item.icon}</span>
              <span style={{ fontSize: 10, fontWeight: 500, color: mobileTab === item.id ? accentColor : "#aaa" }}>{item.label}</span>
            </button>
          ))}
        </div>
        {modal && <DocModal doc={modal === "add" ? null : modal} onClose={() => setModal(null)} onSave={saveDoc} />}
        <style>{`@keyframes pulse{0%,100%{opacity:0.25}50%{opacity:1}}`}</style>
      </div>
    );
  }

  // ── Desktop ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "grid", gridTemplateColumns: "264px 1fr 272px", gridTemplateRows: "50px 1fr", height: "100vh", overflow: "hidden", fontFamily: "'Hiragino Sans','Yu Gothic UI',sans-serif", fontSize: 13, color: "#111", background: "#f7f7f5" }}>
      <div style={{ gridColumn: "1/-1", background: "#fff", borderBottom: "0.5px solid #e5e7eb", display: "flex", alignItems: "center", padding: "0 20px", gap: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: -0.3 }}><span style={{ color: accentColor }}>Evidence</span>-first Med Answer Builder</div>
        <div style={{ fontSize: 11, color: "#aaa", paddingLeft: 12, borderLeft: "0.5px solid #e5e7eb" }}>授業資料に根拠づける答案作成</div>
        {running && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 12 }}>
            <div style={{ display: "flex", gap: 3 }}>{[0,1,2].map(i => <div key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: accentColor, opacity: [1,0.5,0.2][i], animation: "pulse 1s infinite", animationDelay: i * 0.2 + "s" }} />)}</div>
            <span style={{ fontSize: 11, color: accentColor, fontWeight: 500 }}>{stepLabel}</span>
          </div>
        )}
        {!running && results.length > 0 && <div style={{ fontSize: 11, color: GREEN, fontWeight: 600, marginLeft: 12 }}>✓ {results.length}問完了</div>}
        <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 500, background: aiMode ? "#ede9fe" : "#E1F5EE", color: aiMode ? PURPLE : GREEN, padding: "2px 9px", borderRadius: 10 }}>
          {aiMode ? "✨ AIモード" : "📋 ルールベース"}
        </span>
      </div>

      {/* 左: 資料 + 問題入力 */}
      <div style={{ background: "#fafaf8", borderRight: "0.5px solid #e5e7eb", overflowY: "auto", display: "flex", flexDirection: "column" }}>
        {DocPanel}
        <div style={{ height: "0.5px", background: "#e5e7eb" }} />
        {InputPanel}
      </div>

      {/* 中央: 答案 or 履歴タブ */}
      <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ display: "flex", background: "#fff", borderBottom: "0.5px solid #e5e7eb", flexShrink: 0 }}>
          {[["result", "📄 答案"], ["history", "🕐 履歴"]].map(([k, v]) => (
            <button key={k} onClick={() => setDesktopTab(k)}
              style={{ padding: "12px 20px", fontSize: 12, fontWeight: 500, cursor: "pointer", background: "transparent", border: "none", borderBottom: desktopTab === k ? "2px solid " + accentColor : "2px solid transparent", color: desktopTab === k ? accentColor : "#aaa", fontFamily: "inherit" }}>
              {v}
            </button>
          ))}
        </div>
        {desktopTab === "result" ? ResultPanel : HistoryPanel}
      </div>

      {/* 右: 参考ページ */}
      <div style={{ background: "#fafaf8", borderLeft: "0.5px solid #e5e7eb", overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ background: "#fff", borderRadius: 10, border: "0.5px solid #e5e7eb", padding: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#aaa", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>参照ページ</div>
          {results.length === 0 && <div style={{ fontSize: 12, color: "#ccc" }}>答案生成後に表示されます</div>}
          {results.flatMap((r, ri) =>
            (r.searchResults || []).slice(0, 3).map(({ doc, page, score }) => (
              <div key={ri + "_" + page.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "7px 0", borderBottom: "0.5px solid #f3f4f6" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: doc.color || GREEN, minWidth: 28, flexShrink: 0 }}>p.{page.pageNumber}</div>
                <div>
                  <div style={{ fontSize: 11, color: "#888", marginBottom: 2 }}>Q{ri + 1} · {doc.courseName}</div>
                  <div style={{ fontSize: 12, color: "#333", lineHeight: 1.5 }}>{page.content.slice(0, 60)}{page.content.length > 60 ? "…" : ""}</div>
                </div>
              </div>
            ))
          )}
        </div>
        <div style={{ background: "#fff", borderRadius: 10, border: "0.5px solid #e5e7eb", padding: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#aaa", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>使い方</div>
          <div style={{ fontSize: 12, color: "#555", lineHeight: 2 }}>
            ・複数問は番号付きで入力<br />
            ・空行で区切っても可<br />
            ・答案は参考ページと分離<br />
            ・履歴タブで過去の答案を確認<br />
            ・PDFボタンで印刷用に出力
          </div>
        </div>
      </div>

      {modal && <DocModal doc={modal === "add" ? null : modal} onClose={() => setModal(null)} onSave={saveDoc} />}
      <style>{`@keyframes pulse{0%,100%{opacity:0.25}50%{opacity:1}}`}</style>
    </div>
  );
}
