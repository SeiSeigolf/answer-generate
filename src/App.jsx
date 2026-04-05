import { useState, useEffect, useCallback, useRef } from "react";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf";

// iOS Safari対応: legacyビルドのworkerを使用
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

const SAMPLE_DOCS = [
  {
    id: "bio3", title: "生化学 第3回 糖代謝", courseName: "生化学",
    lectureNumber: 3, year: 2024, color: "#0F6E56",
    pages: [
      { id: "b3p12", pageNumber: 12, heading: "解糖系の概要", content: "解糖系はグルコースをピルビン酸へ変換し、ATPとNADHを産生する。1分子のグルコースから正味2ATP、2NADHが生成される。細胞質で進行する。", tags: ["解糖系", "グルコース", "ATP", "NADH", "ピルビン酸"] },
      { id: "b3p13", pageNumber: 13, heading: "律速酵素", content: "ホスホフルクトキナーゼ-1（PFK-1）は解糖系の律速酵素である。ATPにより阻害され、AMPにより活性化される。フルクトース-2,6-ビスリン酸はPFK-1の最も強力なアロステリック活性化因子であり、インスリンにより産生が促進される。", tags: ["PFK-1", "律速酵素", "アロステリック"] },
      { id: "b3p14", pageNumber: 14, heading: "嫌気的条件下の代謝", content: "嫌気条件ではピルビン酸は乳酸脱水素酵素（LDH）によって乳酸へ還元される。この反応によりNADHが再酸化されNAD+が再生され、解糖系の継続が可能となる。", tags: ["嫌気", "乳酸", "LDH", "NAD+"] },
    ]
  },
  {
    id: "phys5", title: "生理学 第5回 呼吸生理", courseName: "生理学",
    lectureNumber: 5, year: 2024, color: "#185FA5",
    pages: [
      { id: "p5p22", pageNumber: 22, heading: "肺胞換気量", content: "肺胞換気量（VA）は1回換気量（VT）から死腔量（VD）を差し引いて求める。VA＝（VT－VD）×呼吸数。正常値は約4L/分。", tags: ["肺胞換気量", "1回換気量", "死腔"] },
      { id: "p5p23", pageNumber: 23, heading: "PaCO2と換気の関係", content: "PaCO2は肺胞換気量と反比例する。換気が低下するとPaCO2は上昇し（高CO2血症・呼吸性アシドーシス）、換気が亢進すると低下する（低CO2血症・呼吸性アルカローシス）。基準値は35-45mmHg。", tags: ["PaCO2", "換気", "高CO2血症"] },
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

async function extractPdfPages(file) {
  // iOS Safari対応: FileReaderでArrayBufferを取得
  const arrayBuffer = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => reject(new Error("ファイル読み込みに失敗しました"));
    reader.readAsArrayBuffer(file);
  });

  // Uint8Arrayに変換（iOS SafariはArrayBufferを直接渡すと失敗する場合がある）
  const typedArray = new Uint8Array(arrayBuffer);

  const loadingTask = pdfjsLib.getDocument({
    data: typedArray,
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
  });

  const pdf = await loadingTask.promise;
  const pages = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    try {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent({ includeMarkedContent: false });

      let textParts = [];
      for (let j = 0; j < textContent.items.length; j++) {
        const item = textContent.items[j];
        if (item && typeof item.str === "string") {
          textParts.push(item.str);
        }
      }
      const text = textParts.join(" ").replace(/\s+/g, " ").trim();

      if (text.length > 10) {
        pages.push({
          id: "pdf_" + Date.now() + "_p" + i,
          pageNumber: i,
          heading: "",
          content: text,
          tags: MED_HEAVY.filter(k => text.includes(k)).slice(0, 10),
        });
      }
    } catch (pageErr) {
      console.warn("ページ " + i + " の読み込みをスキップ:", pageErr);
    }
  }
  return pages;
}

// ── Search Engine（ルールベース） ─────────────────────────────────────────────
function createEngine() {
  function tokenize(text) {
    return text.replace(/[はをがにでもとやのへからまでより、。？?！!「」【】（）\s]/g, " ").split(" ").filter(w => w.length >= 2);
  }
  function scorePage(page, question) {
    const qTokens = tokenize(question);
    const content = page.content, heading = page.heading || "";
    let score = 0; const reasons = [];
    for (const tag of page.tags) { if (question.includes(tag)) { score += 25; reasons.push(`タグ「${tag}」`); } }
    for (const kw of MED_HEAVY) { if (kw.length >= 2 && question.includes(kw) && content.includes(kw)) { score += 18; reasons.push(`医学語「${kw}」`); } }
    for (const tok of qTokens) {
      if (tok.length < 2) continue;
      if (heading.includes(tok)) { score += 15; reasons.push(`見出し「${tok}」`); }
      else if (content.includes(tok)) { score += 8; reasons.push(`本文「${tok}」`); }
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

// ── Claude API呼び出し ────────────────────────────────────────────────────────
async function callClaudeAPI(question, searchResults, mode) {
  const pages = searchResults.slice(0, 8).map(({ doc, page }) => ({
    docTitle: doc.title,
    pageNumber: page.pageNumber,
    content: page.content,
  }));

  const res = await fetch('/api/answer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, pages, mode }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'API error');
  return data.answer;
}

// ── LocalStorage ──────────────────────────────────────────────────────────────
const LS = { docs: "emab_docs_v6", active: "emab_active_v6", q: "emab_q_v6", aiMode: "emab_aimode_v6" };
function ls(key, fallback) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } }
function lsSet(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }
function uid() { return "id_" + Math.random().toString(36).slice(2); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const GREEN = "#0F6E56";
const PURPLE = "#534AB7";
const CT = { direct: "直接根拠", indirect: "間接根拠", conflict: "矛盾", unsupported: "根拠なし" };
const CTbg = { direct: "#E1F5EE", indirect: "#E6F1FB", conflict: "#FAEEDA", unsupported: "#FCEBEB" };
const CTc  = { direct: "#085041", indirect: "#0C447C", conflict: "#633806", unsupported: "#791F1F" };

function Badge({ type, small }) {
  const s = small ? { fontSize: 9, padding: "1px 5px" } : { fontSize: 10, padding: "2px 7px" };
  return <span style={{ ...s, background: CTbg[type], color: CTc[type], borderRadius: 10, fontWeight: 600, display: "inline-block", flexShrink: 0 }}>{CT[type]}</span>;
}
function ScoreBar({ score }) {
  const c = score >= 60 ? "#0F6E56" : score >= 30 ? "#BA7517" : "#A32D2D";
  return (
    <div style={{ width: 38, flexShrink: 0 }}>
      <div style={{ height: 3, background: "#e5e7eb", borderRadius: 2 }}><div style={{ height: 3, width: `${score}%`, background: c, borderRadius: 2 }} /></div>
      <div style={{ fontSize: 9, color: "#aaa", textAlign: "center", marginTop: 1 }}>{score}</div>
    </div>
  );
}

function PdfUploadButton({ onDone }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function handleFile(e) {
    const file = e.target.files[0]; if (!file) return;
    if (file.type !== "application/pdf") { setError("PDFを選択してください"); return; }
    setLoading(true); setError("");
    try {
      const pages = await extractPdfPages(file);
      if (!pages.length) { setError("テキストを抽出できませんでした（画像PDFの可能性があります）"); setLoading(false); return; }
      onDone({ id: uid(), title: file.name.replace(/\.pdf$/i, ""), courseName: file.name.replace(/\.pdf$/i, ""), lectureNumber: 1, year: new Date().getFullYear(), color: PURPLE, pages });
    } catch (err) { setError("読み込み失敗: " + err.message); }
    setLoading(false); e.target.value = "";
  }
  return (
    <div>
      <label style={{ display: "block", width: "100%", padding: "10px 0", border: "0.5px dashed #a78bfa", borderRadius: 8, fontSize: 12, color: PURPLE, background: "#f5f3ff", cursor: loading ? "not-allowed" : "pointer", textAlign: "center", fontWeight: 600, opacity: loading ? 0.6 : 1, boxSizing: "border-box" }}>
        {loading ? "📄 読み込み中…" : "📄 PDFをアップロード"}
        <input type="file" accept="application/pdf" onChange={handleFile} disabled={loading} style={{ display: "none" }} />
      </label>
      {error && <div style={{ fontSize: 11, color: "#e24b4a", marginTop: 4 }}>{error}</div>}
    </div>
  );
}

function DocModal({ doc, onClose, onSave }) {
  const [form, setForm] = useState(doc || { id: uid(), title: "", courseName: "", lectureNumber: 1, year: 2024, color: GREEN, pages: [] });
  const [raw, setRaw] = useState(doc ? doc.pages.map(p => `p${p.pageNumber}: ${p.content}`).join("\n") : "");
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
        {[["title", "資料タイトル", "例：生化学 第3回 糖代謝"], ["courseName", "科目名", "例：生化学"]].map(([k, lbl, ph]) => (
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
            placeholder={"p12: 解糖系はグルコースをピルビン酸へ変換し…\np13: 律速酵素はPFK-1…"}
            style={{ width: "100%", padding: "8px 10px", border: "0.5px solid #ddd", borderRadius: 7, fontSize: 12, fontFamily: "monospace", outline: "none", resize: "vertical", color: "#111", lineHeight: 1.6, boxSizing: "border-box" }} />
          <div style={{ fontSize: 11, color: "#aaa", marginTop: 3 }}>{raw.split("\n").filter(l => l.match(/^p\d+/)).length}ページ認識済み</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 10, border: "0.5px solid #ddd", borderRadius: 8, fontSize: 13, background: "transparent", cursor: "pointer", fontFamily: "inherit", color: "#666" }}>キャンセル</button>
          <button onClick={() => { if (!form.title.trim()) { alert("タイトルを入力してください"); return; } onSave({ ...form, pages: parsePgs(raw) }); }} style={{ flex: 2, padding: 10, background: GREEN, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>保存する</button>
        </div>
      </div>
    </div>
  );
}

const NAV_ITEMS = [
  { id: "docs", icon: "📚", label: "資料" },
  { id: "input", icon: "✏️", label: "問題" },
  { id: "result", icon: "📄", label: "答案" },
  { id: "refs", icon: "🔍", label: "根拠" },
];

export default function App() {
  const [docs, setDocs]           = useState(() => ls(LS.docs, SAMPLE_DOCS));
  const [activeIds, setActiveIds] = useState(() => new Set(ls(LS.active, SAMPLE_DOCS.map(d => d.id))));
  const [question, setQuestion]   = useState(() => ls(LS.q, ""));
  const [mode, setMode]           = useState("standard");
  const [aiMode, setAiMode]       = useState(() => ls(LS.aiMode, true));
  const [running, setRunning]     = useState(false);
  const [step, setStep]           = useState(0);
  const [stepLabel, setStepLabel] = useState("");
  const [searchResults, setSR]    = useState([]);
  const [aiAnswer, setAiAnswer]   = useState("");
  const [aiError, setAiError]     = useState("");
  const [modal, setModal]         = useState(null);
  const [mobileTab, setMobileTab] = useState("input");
  const [isMobile, setIsMobile]   = useState(false);
  const centerRef = useRef(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check(); window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => { lsSet(LS.docs, docs); }, [docs]);
  useEffect(() => { lsSet(LS.active, [...activeIds]); }, [activeIds]);
  useEffect(() => { lsSet(LS.q, question); }, [question]);
  useEffect(() => { lsSet(LS.aiMode, aiMode); }, [aiMode]);

  const toggleActive = useCallback(id => {
    setActiveIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);

  async function runPipeline() {
    if (!question.trim()) { alert("問題文を入力してください"); return; }
    if (activeIds.size === 0) { alert("資料を1つ以上選択してください"); return; }
    setRunning(true); setAiAnswer(""); setAiError(""); setSR([]);
    if (isMobile) setMobileTab("result");

    setStep(1); setStepLabel("関連ページを検索中…");
    await sleep(200);
    const sr = engine.search(docs, question, activeIds);
    setSR(sr);

    if (sr.length === 0) {
      setAiError("関連するページが見つかりませんでした。問題文のキーワードを確認するか、別の資料を選択してください。");
      setStep(0); setRunning(false); return;
    }

    if (aiMode) {
      setStep(2); setStepLabel("Claude APIで答案を生成中…");
      try {
        const answer = await callClaudeAPI(question, sr, mode);
        setAiAnswer(answer);
        setStep(3);
      } catch (err) {
        setAiError("API エラー: " + err.message + "\n\nVercelの環境変数 ANTHROPIC_API_KEY が設定されているか確認してください。");
        setStep(0);
      }
    } else {
      setStep(3);
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

  const allOn = docs.every(d => activeIds.has(d.id));
  const accentColor = aiMode ? PURPLE : GREEN;

  // ── DocPanel ─────────────────────────────────────────────────────────────────
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
          style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "9px 8px", borderRadius: 9, cursor: "pointer", background: activeIds.has(doc.id) ? "#fff" : "transparent", border: `0.5px solid ${activeIds.has(doc.id) ? "#e5e7eb" : "transparent"}`, marginBottom: 4 }}>
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
      <div style={{ background: aiMode ? "#f5f3ff" : "#f0faf6", borderRadius: 10, padding: "12px 14px", border: `0.5px solid ${aiMode ? "#c4b5fd" : "#6ee7b7"}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: aiMode ? PURPLE : GREEN }}>
              {aiMode ? "✨ AIモード（Claude API）" : "📋 ルールベースモード"}
            </div>
            <div style={{ fontSize: 10, color: "#888", marginTop: 2 }}>
              {aiMode ? "資料を根拠にClaude APIがまとまった答案を生成" : "キーワードマッチで関連ページを抽出して表示"}
            </div>
          </div>
          <button onClick={() => setAiMode(v => !v)}
            style={{ width: 44, height: 24, borderRadius: 12, background: aiMode ? PURPLE : "#ccc", border: "none", cursor: "pointer", position: "relative", flexShrink: 0, transition: "background 0.2s" }}>
            <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: aiMode ? 23 : 3, transition: "left 0.2s" }} />
          </button>
        </div>
        {aiMode && (
          <div style={{ fontSize: 10, color: "#7c3aed", background: "#ede9fe", borderRadius: 6, padding: "4px 8px" }}>
            Vercel環境変数 <code style={{ fontFamily: "monospace" }}>ANTHROPIC_API_KEY</code> が必要です
          </div>
        )}
      </div>

      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>問題入力</div>
        <textarea value={question} onChange={e => setQuestion(e.target.value)} rows={isMobile ? 5 : 6}
          placeholder={"問題文を入力してください\n\n例：心エコーとは何か説明せよ。"}
          style={{ width: "100%", border: "0.5px solid #e5e7eb", borderRadius: 8, padding: "10px", fontSize: 13, fontFamily: "inherit", resize: "none", outline: "none", lineHeight: 1.6, color: "#111", background: "#fff", boxSizing: "border-box" }} />
      </div>

      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>答案形式</div>
        <div style={{ display: "flex", gap: 6 }}>
          {[["short", "1行"], ["standard", "標準"], ["detailed", "詳細"]].map(([k, v]) => (
            <button key={k} onClick={() => setMode(k)}
              style={{ flex: 1, padding: "8px 4px", border: `0.5px solid ${mode === k ? accentColor : "#e5e7eb"}`, borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: "pointer", background: mode === k ? accentColor : "#fff", color: mode === k ? "#fff" : "#888", fontFamily: "inherit" }}>
              {v}
            </button>
          ))}
        </div>
      </div>

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
          <div style={{ display: "flex", gap: 3 }}>{[0, 1, 2].map(i => <div key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: accentColor, opacity: [1, 0.5, 0.2][i], animation: "pulse 1s infinite", animationDelay: `${i * 0.2}s` }} />)}</div>
          <span style={{ fontSize: 11, color: accentColor, fontWeight: 500 }}>{stepLabel}</span>
        </div>
      )}
    </div>
  );

  // ── ResultPanel ───────────────────────────────────────────────────────────────
  const ResultPanel = (
    <div ref={centerRef} style={{ overflowY: "auto", padding: isMobile ? "12px" : "16px", flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
      {step === 0 && !aiError && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", textAlign: "center", gap: 10, padding: 24 }}>
          <div style={{ fontSize: 36 }}>📋</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#444" }}>授業資料から答案を作成します</div>
          <div style={{ fontSize: 12, color: "#aaa", lineHeight: 1.8 }}>PDFをアップロードするか資料を選んで<br />問題を入力してください</div>
        </div>
      )}

      {/* エラー表示 */}
      {aiError && (
        <div style={{ background: "#fff5f5", border: "0.5px solid #fecaca", borderRadius: 10, padding: "14px 16px" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#dc2626", marginBottom: 6 }}>⚠ エラー</div>
          <div style={{ fontSize: 12, color: "#7f1d1d", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{aiError}</div>
        </div>
      )}

      {/* Step1: 検索結果 */}
      {step >= 1 && searchResults.length > 0 && (
        <div style={{ background: "#fff", border: "0.5px solid #e5e7eb", borderRadius: 10, padding: "13px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <div style={{ width: 20, height: 20, borderRadius: "50%", background: step >= 2 ? GREEN : "#BA7517", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#fff", flexShrink: 0 }}>1</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>関連ページ検索</div>
            <div style={{ fontSize: 11, color: "#aaa", marginLeft: "auto" }}>{searchResults.length}件ヒット → Claude APIへ送信</div>
          </div>
          {searchResults.slice(0, 5).map(({ doc, page, score, reasons }) => (
            <div key={page.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 0", borderBottom: "0.5px solid #f3f4f6" }}>
              <ScoreBar score={score} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 5, marginBottom: 2 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: doc.color || GREEN }}>{doc.courseName}</span>
                  <span style={{ fontSize: 11, color: "#aaa" }}>p.{page.pageNumber}</span>
                </div>
                <div style={{ fontSize: 12, color: "#555", lineHeight: 1.5 }}>{page.content.slice(0, 100)}{page.content.length > 100 ? "…" : ""}</div>
                {reasons?.length > 0 && <div style={{ marginTop: 3, display: "flex", flexWrap: "wrap", gap: 3 }}>{reasons.map((r, i) => <span key={i} style={{ fontSize: 9, background: "#f0f9f5", color: GREEN, padding: "1px 5px", borderRadius: 8 }}>{r}</span>)}</div>}
              </div>
            </div>
          ))}
          {searchResults.length > 5 && <div style={{ fontSize: 11, color: "#aaa", paddingTop: 6 }}>他 {searchResults.length - 5} ページも送信済み</div>}
        </div>
      )}

      {/* Step2: AI生成中 */}
      {step === 2 && (
        <div style={{ background: "#f5f3ff", border: "0.5px solid #c4b5fd", borderRadius: 10, padding: "16px 18px", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex", gap: 4 }}>{[0, 1, 2].map(i => <div key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: PURPLE, opacity: [1, 0.5, 0.2][i], animation: "pulse 1s infinite", animationDelay: `${i * 0.2}s` }} />)}</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: PURPLE }}>Claude APIで答案生成中…</div>
            <div style={{ fontSize: 11, color: "#7c3aed", marginTop: 2 }}>資料テキストをもとに整理された答案を作成しています</div>
          </div>
        </div>
      )}

      {/* Step3: AI答案 */}
      {step >= 3 && aiAnswer && (
        <div style={{ background: "#fff", border: `0.5px solid ${PURPLE}44`, borderRadius: 10, padding: "14px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <div style={{ width: 20, height: 20, borderRadius: "50%", background: PURPLE, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#fff", flexShrink: 0 }}>✨</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>AI生成答案</div>
            <span style={{ fontSize: 10, fontWeight: 500, background: "#ede9fe", color: PURPLE, padding: "2px 8px", borderRadius: 10, marginLeft: "auto" }}>Claude APIによる生成</span>
          </div>
          <div style={{ background: "#fafafa", borderRadius: 8, padding: "14px 16px", borderLeft: `3px solid ${PURPLE}`, fontSize: 13, lineHeight: 2, color: "#1a1a1a", whiteSpace: "pre-wrap" }}>
            {aiAnswer}
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: "#aaa" }}>
            ※ 上記答案は授業資料（{searchResults.slice(0, 8).map(r => `${r.doc.courseName} p.${r.page.pageNumber}`).join("、")}）を根拠に生成されました
          </div>
        </div>
      )}

      {/* ルールベースモードの場合 */}
      {step >= 3 && !aiMode && !aiAnswer && searchResults.length > 0 && (
        <div style={{ background: "#fff", border: "0.5px solid #e5e7eb", borderRadius: 10, padding: "14px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <div style={{ width: 20, height: 20, borderRadius: "50%", background: GREEN, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#fff", flexShrink: 0 }}>2</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>関連テキスト（ルールベース）</div>
          </div>
          {searchResults.slice(0, 4).map(({ doc, page }) => (
            <div key={page.id} style={{ marginBottom: 10, padding: "10px 12px", background: "#f9fffe", borderRadius: 8, borderLeft: "2px solid #0F6E56" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: GREEN, marginBottom: 4 }}>{doc.courseName} p.{page.pageNumber}</div>
              <div style={{ fontSize: 13, color: "#1a1a1a", lineHeight: 1.8 }}>{page.content}</div>
            </div>
          ))}
          <div style={{ marginTop: 8, padding: "8px 12px", background: "#fafafa", borderRadius: 8, fontSize: 11, color: "#888" }}>
            💡 AIモードをONにするとClaude APIがこれらを整理した答案を生成します
          </div>
        </div>
      )}
    </div>
  );

  // ── RefsPanel ────────────────────────────────────────────────────────────────
  const RefsPanel = (
    <div style={{ padding: isMobile ? "12px" : "14px", overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ background: "#fff", borderRadius: 10, border: "0.5px solid #e5e7eb", padding: 12 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#aaa", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>参照ページ一覧</div>
        {!searchResults.length && <div style={{ fontSize: 12, color: "#ccc" }}>検索結果がありません</div>}
        {searchResults.slice(0, 10).map(({ doc, page, score }) => (
          <div key={page.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "7px 0", borderBottom: "0.5px solid #f3f4f6" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: doc.color || GREEN, minWidth: 28, flexShrink: 0 }}>p.{page.pageNumber}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, color: "#333", lineHeight: 1.5 }}>{page.content.slice(0, 70)}{page.content.length > 70 ? "…" : ""}</div>
              <div style={{ fontSize: 10, color: "#bbb", marginTop: 1 }}>{doc.courseName} · スコア {score}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ background: "#fff", borderRadius: 10, border: "0.5px solid #e5e7eb", padding: 12 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#aaa", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>使い方</div>
        <div style={{ fontSize: 12, color: "#555", lineHeight: 2 }}>
          1. PDFをアップロード<br />
          2. AIモードをONにする<br />
          3. 問題を入力して実行<br />
          4. Claudeが資料を根拠に答案を生成
        </div>
        <div style={{ marginTop: 10, padding: "8px 10px", background: "#f5f3ff", borderRadius: 8, fontSize: 11, color: PURPLE, lineHeight: 1.7 }}>
          <b>AIモードの設定</b><br />
          Vercel → Settings → Environment Variables<br />
          <code style={{ fontFamily: "monospace", fontSize: 10 }}>ANTHROPIC_API_KEY</code> を追加してください
        </div>
      </div>
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100vh", fontFamily: "'Hiragino Sans','Yu Gothic UI',sans-serif", fontSize: 13, color: "#111", background: "#f7f7f5" }}>
        <div style={{ background: "#fff", borderBottom: "0.5px solid #e5e7eb", padding: "10px 14px", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}><span style={{ color: accentColor }}>Med</span> Answer Builder</div>
          <span style={{ fontSize: 10, fontWeight: 500, background: aiMode ? "#ede9fe" : "#E1F5EE", color: aiMode ? PURPLE : GREEN, padding: "2px 7px", borderRadius: 10, marginLeft: "auto" }}>
            {aiMode ? "✨ AI" : "📋 ルール"}
          </span>
          {running && <div style={{ fontSize: 10, color: accentColor, fontWeight: 500 }}>{stepLabel}</div>}
          {step >= 3 && !running && <div style={{ fontSize: 10, color: GREEN, fontWeight: 600 }}>✓ 完了</div>}
        </div>
        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {mobileTab === "docs" && DocPanel}
          {mobileTab === "input" && InputPanel}
          {mobileTab === "result" && ResultPanel}
          {mobileTab === "refs" && RefsPanel}
        </div>
        <div style={{ display: "flex", background: "#fff", borderTop: "0.5px solid #e5e7eb", flexShrink: 0 }}>
          {NAV_ITEMS.map(item => (
            <button key={item.id} onClick={() => setMobileTab(item.id)}
              style={{ flex: 1, padding: "10px 4px 12px", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", borderTop: `2px solid ${mobileTab === item.id ? accentColor : "transparent"}` }}>
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

  return (
    <div style={{ display: "grid", gridTemplateColumns: "264px 1fr 272px", gridTemplateRows: "50px 1fr", height: "100vh", overflow: "hidden", fontFamily: "'Hiragino Sans','Yu Gothic UI',sans-serif", fontSize: 13, color: "#111", background: "#f7f7f5" }}>
      <div style={{ gridColumn: "1/-1", background: "#fff", borderBottom: "0.5px solid #e5e7eb", display: "flex", alignItems: "center", padding: "0 20px", gap: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: -0.3 }}><span style={{ color: accentColor }}>Evidence</span>-first Med Answer Builder</div>
        <div style={{ fontSize: 11, color: "#aaa", paddingLeft: 12, borderLeft: "0.5px solid #e5e7eb" }}>授業資料に根拠づける答案作成</div>
        {running && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 12 }}>
            <div style={{ display: "flex", gap: 3 }}>{[0, 1, 2].map(i => <div key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: accentColor, opacity: [1, 0.5, 0.2][i], animation: "pulse 1s infinite", animationDelay: `${i * 0.2}s` }} />)}</div>
            <span style={{ fontSize: 11, color: accentColor, fontWeight: 500 }}>{stepLabel}</span>
          </div>
        )}
        {step >= 3 && !running && <div style={{ fontSize: 11, color: GREEN, fontWeight: 600, marginLeft: 12 }}>✓ 完了</div>}
        <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 500, background: aiMode ? "#ede9fe" : "#E1F5EE", color: aiMode ? PURPLE : GREEN, padding: "2px 9px", borderRadius: 10 }}>
          {aiMode ? "✨ AIモード（Claude API）" : "📋 ルールベース"}
        </span>
      </div>
      <div style={{ background: "#fafaf8", borderRight: "0.5px solid #e5e7eb", overflowY: "auto", display: "flex", flexDirection: "column" }}>
        {DocPanel}
        <div style={{ height: "0.5px", background: "#e5e7eb" }} />
        {InputPanel}
      </div>
      {ResultPanel}
      <div style={{ background: "#fafaf8", borderLeft: "0.5px solid #e5e7eb", overflowY: "auto" }}>{RefsPanel}</div>
      {modal && <DocModal doc={modal === "add" ? null : modal} onClose={() => setModal(null)} onSave={saveDoc} />}
      <style>{`@keyframes pulse{0%,100%{opacity:0.25}50%{opacity:1}}`}</style>
    </div>
  );
}
