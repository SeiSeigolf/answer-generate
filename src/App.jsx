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
  aiMode: "emab_aimode_v7", history: "emab_history_v7",
  studySession: "emab_study_session_v1"
};
function ls(key, fallback) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } }
function lsSet(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }
function uid() { return "id_" + Math.random().toString(36).slice(2); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const GREEN = "#0F6E56", PURPLE = "#534AB7";

// ── IndexedDB helpers for past exam MVP ──────────────────────────────────────
const DB_NAME = "med_answer_builder_v1";
const DB_VERSION = 1;
const DB_STORES = ["examSources", "ocrPages", "questions", "choices", "flashcardStates", "knowledgeNotes", "syncLog"];

function openAppDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const store of DB_STORES) {
        if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGetAll(storeName) {
  const db = await openAppDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

async function idbPutMany(storeName, items) {
  const db = await openAppDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    for (const item of items) store.put(item);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDelete(storeName, id) {
  const db = await openAppDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).delete(id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDeleteMany(storeName, ids) {
  const db = await openAppDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    for (const id of ids) store.delete(id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => reject(tx.error);
  });
}

async function idbClearAll() {
  const db = await openAppDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORES, "readwrite");
    for (const store of DB_STORES) tx.objectStore(store).clear();
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => reject(tx.error);
  });
}

const EXAM_FIELD_RULES = [
  { field: "骨・関節", keywords: ["骨", "椎", "肋骨", "上腕骨", "手根骨", "寛骨", "骨盤", "関節", "頭骨", "下顎骨", "仙骨", "尾骨"] },
  { field: "組織・細胞", keywords: ["細胞", "上皮", "基底膜", "線毛", "結合組織", "マトリックス", "脂肪", "マクロファージ", "間葉"] },
  { field: "筋", keywords: ["骨格筋", "心筋", "筋収縮", "筋繊維", "アクチン", "ミオシン", "トロポニン", "筋小胞体"] },
  { field: "神経", keywords: ["ニューロン", "軸索", "グリア", "神経", "髄鞘", "シュワン", "アストロサイト", "ランビエ"] },
  { field: "循環器", keywords: ["心", "冠状動脈", "右心房", "房室", "洞房", "プルキンエ", "大動脈"] },
  { field: "呼吸器", keywords: ["気管", "細気管支", "肺", "肺門", "肺尖", "肺底", "気管支"] },
  { field: "発生", keywords: ["受精卵", "胚", "胎児", "卵割", "胚盤胞"] },
];

function inferField(text, fallback) {
  const rule = EXAM_FIELD_RULES.find(r => r.keywords.some(k => text.includes(k)));
  if (rule) return rule.field;
  const hits = MED_HEAVY.filter(k => text.includes(k));
  return hits[0] || fallback || "未分類";
}

function normalizeChoiceLabel(label) {
  const map = {
    "①": "A", "②": "B", "③": "C", "④": "D", "⑤": "E", "⑥": "F", "⑦": "G", "⑧": "H", "⑨": "I", "⑩": "J",
    "１": "A", "２": "B", "３": "C", "４": "D", "５": "E", "６": "F", "７": "G", "８": "H", "９": "I", "１０": "J",
    "1": "A", "2": "B", "3": "C", "4": "D", "5": "E", "6": "F", "7": "G", "8": "H", "9": "I", "10": "J",
    "ア": "A", "イ": "B", "ウ": "C", "エ": "D", "オ": "E", "カ": "F", "キ": "G", "ク": "H",
  };
  return map[label] || label.toUpperCase();
}

const CHOICE_LABEL_RE = "A-Ha-hア-ク①-⑩1-9１-９";
const CHOICE_MARKER_RE = /([①-⑩])\s*|([ア-ク])\s*[\).．、:：]\s*|([A-Ha-h])\s*[\).．、:：]\s*|[\(（]?([1-9１-９])[\)）.．、:：]\s*/g;

function getChoiceMarkers(text) {
  return [...text.matchAll(CHOICE_MARKER_RE)].map(m => ({
    index: m.index,
    raw: m[0],
    label: m[1] || m[2] || m[3] || m[4],
  }));
}

function normalizeAnswerText(text) {
  return String(text || "")
    .replace(/正解|解答|答え|回答|答|[:：は]/g, " ")
    .split(/[,、\s]+/)
    .map(s => s.trim())
    .filter(Boolean)
    .map(normalizeChoiceLabel)
    .filter(Boolean)
    .join(",");
}

function splitAnswerExplanation(text) {
  const sourceText = String(text || "").trim();
  const match = sourceText.match(/(?:^|\s)(?:正解|解答|回答|答え|答)\s*[:：は]?\s*([A-Ha-hア-ク①-⑩1-9１-９,、\s]+)(?:\s*(?:解説|理由|ポイント|補足)\s*[:：]?\s*([\s\S]*))?$/);
  if (!match) return { body: sourceText, answer: "", explanation: "" };
  const before = sourceText.slice(0, match.index).trim();
  const answer = normalizeAnswerText(match[1]);
  const explanation = (match[2] || "").trim();
  return { body: before || sourceText, answer, explanation };
}

function buildParsedQuestion(source, rawText, stem, choiceParts, pageNumber, confidence, index, questionNumberOverride, extra = {}) {
  const qid = uid();
  const cleanedStem = stem.replace(/^\[p\.(\d+)\]\s*/, "").replace(/^(?:問|問題|Q)?\s*\d+[\s.．、:：]*/, "").trim();
  const correctAnswer = extra.answer || choiceParts.find(c => c.isCorrect)?.label || "";
  const choices = choiceParts
    .map(c => ({
      id: uid(),
      questionId: qid,
      label: normalizeChoiceLabel(c.label),
      text: c.text.replace(/\s+/g, " ").trim(),
      isCorrect: Boolean(c.isCorrect),
    }))
    .filter(c => c.text.length > 0);
  if (choices.length < 2) return null;
  return {
    question: {
      id: qid,
      examSourceId: source.id,
      year: source.year,
      subject: source.subject,
      pageNumber,
      questionNumber: questionNumberOverride || index,
      type: "multiple_choice",
      field: inferField(rawText, source.subject),
      stem: cleanedStem || rawText.slice(0, 180),
      rawText,
      answer: correctAnswer ? normalizeAnswerText(correctAnswer) : "",
      explanation: extra.explanation || "",
      aiConfidence: confidence,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    choices,
  };
}

function parseQuestionBlocksFromLines(pages, source) {
  const blocks = [];
  let current = null;
  for (const page of pages) {
    const lines = page.content.replace(/\r/g, "\n").split("\n").map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
      const qMatch = line.match(/^(?:問|問題|Q)?\s*[\[【(（]?(\d{1,3})[\]】)）]?\s*[.．、:：)]?\s*(.+)$/);
      if (qMatch) {
        if (current) blocks.push(current);
        current = {
          number: parseInt(qMatch[1]),
          pageNumber: page.pageNumber,
          lines: [qMatch[2].trim()],
        };
      } else if (current) {
        current.lines.push(line);
      }
    }
  }
  if (current) blocks.push(current);

  const parsed = [];
  for (const block of blocks) {
    const text = block.lines.join("\n").trim();
    const answerInfo = splitAnswerExplanation(block.lines.join(" ").replace(/\s+/g, " ").trim());
    const oneLine = answerInfo.body;
    const markers = getChoiceMarkers(oneLine).filter(m => m.index > 0);
    if (markers.length < 2) continue;
    const stem = oneLine.slice(0, markers[0].index).trim();
    const choiceParts = markers.map((m, i) => {
      const start = m.index + m.raw.length;
      const end = i + 1 < markers.length ? markers[i + 1].index : oneLine.length;
      return { label: m.label, text: oneLine.slice(start, end) };
    });
    const item = buildParsedQuestion(source, text, stem, choiceParts, block.pageNumber, 0.78, parsed.length + 1, block.number, {
      answer: answerInfo.answer,
      explanation: answerInfo.explanation,
    });
    if (item) parsed.push(item);
  }
  return parsed;
}

function parseMultipleChoiceQuestions(pages, source) {
  const lineParsed = parseQuestionBlocksFromLines(pages, source);
  if (lineParsed.length > 0) return lineParsed;

  const joined = pages.map(p => "\n[p." + p.pageNumber + "]\n" + p.content).join("\n");
  const normalized = joined
    .replace(/\r/g, "\n")
    .replace(/([①-⑩])\s*/g, "\n$1")
    .replace(/([ア-クA-Ha-h])\s*[).．、:：]\s*/g, "\n$1. ")
    .replace(/[\(（]([1-9１-９])[\)）]\s*/g, "\n$1. ")
    .replace(/[\(（]([A-Ha-hア-ク①-⑩1-9１-９])[\)）]\s*/g, "\n$1. ")
    .replace(/((?:問|問題|Q)\s*\d+[\s.．、:：])/g, "\n$1")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n");
  const chunks = normalized
    .split(/\n(?=(?:問|問題|Q)\s*\d+[\s.．、:：]|[0-9]{1,3}[\s.．、:：])/)
    .map(s => s.trim())
    .filter(Boolean);
  const parsed = [];

  for (const chunk of chunks) {
    const chunkWithoutPage = chunk.replace(/\[p\.\d+\]\s*/g, "").trim();
    const answerInfo = splitAnswerExplanation(chunkWithoutPage);
    const body = answerInfo.body.replace(/^(?:問|問題|Q)?\s*\d+[\s.．、:：]*/, "").trim();
    const markers = getChoiceMarkers(body).filter(m => m.index > 0);
    if (markers.length < 2) continue;
    const stem = body.slice(0, markers[0].index).trim();
    const pageMatch = chunk.match(/\[p\.(\d+)\]/);
    const rawText = chunkWithoutPage;
    const choiceParts = markers.map((m, i) => {
      const start = m.index + m.raw.length;
      const end = i + 1 < markers.length ? markers[i + 1].index : body.length;
      return { label: m.label.trim(), text: body.slice(start, end) };
    });
    const item = buildParsedQuestion(source, rawText, stem, choiceParts, pageMatch ? parseInt(pageMatch[1]) : 1, 0.62, parsed.length + 1, null, {
      answer: answerInfo.answer,
      explanation: answerInfo.explanation,
    });
    if (item) parsed.push(item);
  }

  if (parsed.length > 0) return parsed;

  const inlineParsed = [];
  for (const page of pages) {
    const text = page.content.replace(/\s+/g, " ").trim();
    const qBlocks = text
      .replace(/((?:問|問題|Q)\s*\d+[\s.．、:：])/g, "\n$1")
      .split(/\n(?=(?:問|問題|Q)\s*\d+[\s.．、:：])/)
      .map(s => s.trim())
      .filter(Boolean);
    for (const block of qBlocks.length ? qBlocks : [text]) {
      const normalizedBlock = block.replace(/[\(（]([A-Ha-hア-ク①-⑩1-9１-９])[\)）]/g, "$1.");
      const answerInfo = splitAnswerExplanation(normalizedBlock);
      const markers = getChoiceMarkers(answerInfo.body).filter(m => m.index > 0);
      if (markers.length < 2) continue;
      const choiceParts = [];
      for (let i = 0; i < markers.length; i++) {
        const start = markers[i].index + markers[i].raw.length;
        const end = i + 1 < markers.length ? markers[i + 1].index : answerInfo.body.length;
        choiceParts.push({ label: markers[i].label, text: answerInfo.body.slice(start, end) });
      }
      const stem = answerInfo.body.slice(0, markers[0].index).trim();
      const item = buildParsedQuestion(source, normalizedBlock, stem, choiceParts, page.pageNumber, 0.5, inlineParsed.length + 1, null, {
        answer: answerInfo.answer,
        explanation: answerInfo.explanation,
      });
      if (item) inlineParsed.push(item);
    }
  }
  return inlineParsed;
}

async function extractQuestionsByAI(pages, source) {
  const res = await fetch("/api/extract-questions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source,
      pages: pages.map(p => ({ pageNumber: p.pageNumber, text: p.content })).slice(0, 80),
    }),
  });
  const raw = await res.text();
  let data = {};
  try { data = JSON.parse(raw); } catch {
    throw new Error("AI抽出APIがJSONを返しませんでした。ローカルでは `vercel dev`、本番ではVercelデプロイ上で試してください。");
  }
  if (!res.ok) throw new Error(data.error || "question extraction failed");
  return (data.questions || []).map((q, i) => {
    const choiceParts = (q.choices || []).map((c, j) => ({
      label: c.label || String.fromCharCode(65 + j),
      text: c.text || String(c),
      isCorrect: q.correctAnswer && normalizeChoiceLabel(c.label || String.fromCharCode(65 + j)) === normalizeChoiceLabel(q.correctAnswer),
    }));
    const rawText = [q.stem || q.questionText || "", ...choiceParts.map(c => c.label + ". " + c.text)].join("\n");
    return buildParsedQuestion(
      source,
      rawText,
      q.stem || q.questionText || "",
      choiceParts,
      q.pageNumber || 1,
      q.confidence || 0.78,
      i + 1,
      q.questionNumber || null,
      { answer: q.correctAnswer || "", explanation: q.explanation || "" }
    );
  }).filter(Boolean);
}

async function generateChoiceAnswers(parsedItems) {
  const unresolved = parsedItems.filter(item => !item.question.answer);
  if (unresolved.length === 0) return parsedItems;
  const res = await fetch("/api/answer-choices", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      questions: unresolved.map(item => ({
        id: item.question.id,
        stem: item.question.stem,
        field: item.question.field,
        choices: item.choices.map(c => ({ label: c.label, text: c.text })),
      })),
    }),
  });
  const raw = await res.text();
  let data = {};
  try { data = JSON.parse(raw); } catch {
    throw new Error("AI解答APIがJSONを返しませんでした。`vercel dev` またはVercel本番で試してください。");
  }
  if (!res.ok) throw new Error(data.error || "answer generation failed");
  const byId = new Map((data.answers || []).map(a => [a.id, a]));
  return parsedItems.map(item => {
    const ai = byId.get(item.question.id);
    if (!ai) return item;
    const answer = String(ai.answer || "").trim();
    const answerLabels = answer.split(/[,、\s]+/).filter(Boolean).map(normalizeChoiceLabel);
    return {
      ...item,
      question: {
        ...item.question,
        answer: answerLabels.join(","),
        explanation: ai.explanation || "",
        answerSource: "ai",
        answerConfidence: ai.confidence ?? null,
      },
      choices: item.choices.map(c => ({ ...c, isCorrect: answerLabels.includes(c.label) })),
    };
  });
}

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
  { id: "past", icon: "🧪", label: "過去問" },
  { id: "study", icon: "🎴", label: "学習" },
  { id: "wrong", icon: "✕", label: "間違い" },
  { id: "weak", icon: "🧠", label: "弱点" },
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
  const [examSources, setExamSources] = useState([]);
  const [ocrPages, setOcrPages] = useState([]);
  const [examQuestions, setExamQuestions] = useState([]);
  const [examChoices, setExamChoices] = useState([]);
  const [cardStates, setCardStates] = useState([]);
  const [knowledgeNotes, setKnowledgeNotes] = useState([]);
  const [examBusy, setExamBusy] = useState(false);
  const [examProgress, setExamProgress] = useState("");
  const [examOcrMode, setExamOcrMode] = useState("vision");
  const [examFilter, setExamFilter] = useState("all");
  const [studyFilter, setStudyFilter] = useState("all");
  const [studySubjectFilter, setStudySubjectFilter] = useState("all");
  const [studyYearFilter, setStudyYearFilter] = useState("all");
  const [studyFieldFilter, setStudyFieldFilter] = useState("all");
  const [studyIndex, setStudyIndex] = useState(0);
  const [showStudyAnswer, setShowStudyAnswer] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [ocrPreviewSourceId, setOcrPreviewSourceId] = useState("");
  const [revealedAnswerIds, setRevealedAnswerIds] = useState([]);
  const [savedStudySessions, setSavedStudySessions] = useState(() => {
    const saved = ls(LS.studySession, {});
    return saved?.sessions || (saved?.filters ? { legacy: saved } : saved || {});
  });
  const [studySessionActive, setStudySessionActive] = useState(false);
  const [editingAnswerId, setEditingAnswerId] = useState("");
  const [answerDraft, setAnswerDraft] = useState("");
  const [explanationDraft, setExplanationDraft] = useState("");
  const [expandedWeakQuestionId, setExpandedWeakQuestionId] = useState("");
  const [weakAnswerIds, setWeakAnswerIds] = useState([]);
  const [sessionStats, setSessionStats] = useState({ startedAt: null, seen: [], known: 0, unknown: 0 });
  const [lastSessionSummary, setLastSessionSummary] = useState(null);
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

  async function refreshExamDb() {
    const [sources, pages, questions, choices, states, notes] = await Promise.all([
      idbGetAll("examSources"),
      idbGetAll("ocrPages"),
      idbGetAll("questions"),
      idbGetAll("choices"),
      idbGetAll("flashcardStates"),
      idbGetAll("knowledgeNotes"),
    ]);
    setExamSources(sources.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
    setOcrPages(pages);
    setExamQuestions(questions.sort((a, b) => (b.year || 0) - (a.year || 0) || (a.questionNumber || 0) - (b.questionNumber || 0)));
    setExamChoices(choices);
    setCardStates(states);
    setKnowledgeNotes(notes.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)));
  }

  useEffect(() => { refreshExamDb().catch(console.warn); }, []);

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

  async function importPastExamPdf(file) {
    if (!file) return;
    if (file.type !== "application/pdf") { alert("PDFを選択してください"); return; }
    const title = file.name.replace(/\.pdf$/i, "");
    const yearText = prompt("年度を入力してください", String(new Date().getFullYear()));
    if (yearText === null) return;
    const subject = prompt("科目名を入力してください", "未分類");
    if (subject === null) return;
    const source = {
      id: uid(),
      title,
      year: parseInt(yearText) || new Date().getFullYear(),
      subject: subject || "未分類",
      sourceType: "pdf",
      driveFileId: "",
      localFileName: file.name,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ocrStatus: "pending",
    };
    setExamBusy(true);
    setExamProgress("PDFを読み取り中…");
    try {
      let pages = [];
      const onProg = (cur, total) => setExamProgress("OCR " + cur + "/" + total + "ページ");
      if (examOcrMode === "vision") pages = await extractPdfPagesByVision(file, onProg);
      else if (examOcrMode === "fast") pages = await extractPdfPagesByVisionFast(file, onProg);
      else {
        setExamProgress("PDF内テキストを抽出中…");
        pages = await extractPdfPagesText(file);
        if (pages.length === 0) {
          setExamProgress("テキスト抽出0ページ。OCR高速へ切り替え中…");
          pages = await extractPdfPagesByVisionFast(file, onProg);
        }
      }
      if (pages.length === 0) {
        throw new Error("OCRテキストを抽出できませんでした。OCR高精度モードで再度取り込んでください。");
      }
      const savedPages = pages.map(p => ({
        id: uid(),
        examSourceId: source.id,
        pageNumber: p.pageNumber,
        text: p.content,
        confidence: examOcrMode === "text" ? 0.7 : 0.9,
        driveOcrFileId: "",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }));
      setExamProgress("選択問題を抽出中…");
      let parsed = parseMultipleChoiceQuestions(pages, source);
      let aiExtractError = "";
      if (parsed.length === 0) {
        setExamProgress("ローカル抽出0件。AIで構造化抽出中…");
        try {
          parsed = await extractQuestionsByAI(pages, source);
        } catch (aiErr) {
          aiExtractError = aiErr.message;
          console.warn("AI question extraction failed", aiErr);
        }
      }
      if (parsed.length > 0 && parsed.some(x => !x.question.answer)) {
        setExamProgress("AIで解答を推定中…");
        try {
          parsed = await generateChoiceAnswers(parsed);
        } catch (answerErr) {
          console.warn("AI answer generation failed", answerErr);
          aiExtractError = aiExtractError || answerErr.message;
        }
      }
      const qs = parsed.map(x => x.question);
      const ch = parsed.flatMap(x => x.choices);
      const states = qs.map(q => ({
        id: uid(),
        questionId: q.id,
        status: "new",
        knownCount: 0,
        unknownCount: 0,
        lastReviewedAt: null,
        nextReviewAt: null,
        memo: "",
        updatedAt: Date.now(),
      }));
      await idbPutMany("examSources", [{ ...source, ocrStatus: "done", questionCount: qs.length }]);
      await idbPutMany("ocrPages", savedPages);
      await idbPutMany("questions", qs);
      await idbPutMany("choices", ch);
      await idbPutMany("flashcardStates", states);
      await refreshExamDb();
      setExamProgress(qs.length + "問をカード化しました");
      if (qs.length === 0) alert("選択問題を自動検出できませんでした。OCRテキストは保存済みです。" + (aiExtractError ? "\n\nAI処理エラー: " + aiExtractError : ""));
    } catch (err) {
      await idbPutMany("examSources", [{ ...source, ocrStatus: "failed", error: err.message }]);
      alert("取り込みに失敗しました: " + err.message);
    } finally {
      setExamBusy(false);
      setTimeout(() => setExamProgress(""), 1800);
    }
  }

  async function saveParsedQuestionsForSource(source, parsed) {
    const existingQuestions = examQuestions.filter(q => q.examSourceId === source.id);
    const existingQuestionIds = existingQuestions.map(q => q.id);
    if (existingQuestionIds.length) {
      await idbDeleteMany("choices", examChoices.filter(c => existingQuestionIds.includes(c.questionId)).map(c => c.id));
      await idbDeleteMany("flashcardStates", cardStates.filter(s => existingQuestionIds.includes(s.questionId)).map(s => s.id));
      await idbDeleteMany("questions", existingQuestionIds);
    }
    const qs = parsed.map(x => x.question);
    const ch = parsed.flatMap(x => x.choices);
    const states = qs.map(q => ({
      id: uid(),
      questionId: q.id,
      status: "new",
      knownCount: 0,
      unknownCount: 0,
      lastReviewedAt: null,
      nextReviewAt: null,
      memo: "",
      updatedAt: Date.now(),
    }));
    if (qs.length) await idbPutMany("questions", qs);
    if (ch.length) await idbPutMany("choices", ch);
    if (states.length) await idbPutMany("flashcardStates", states);
    await idbPutMany("examSources", [{ ...source, questionCount: qs.length, updatedAt: Date.now(), ocrStatus: "done" }]);
    await refreshExamDb();
    return qs.length;
  }

  async function reextractSource(source, forceAI = false) {
    const pages = ocrPages
      .filter(p => p.examSourceId === source.id)
      .sort((a, b) => a.pageNumber - b.pageNumber)
      .map(p => ({ id: p.id, pageNumber: p.pageNumber, content: p.text, tags: MED_HEAVY.filter(k => p.text.includes(k)).slice(0, 10) }));
    if (!pages.length) { alert("このPDFのOCRテキストが見つかりません。テキスト抽出で0ページだった可能性があります。PDFをもう一度、OCR高速またはOCR高精度モードで取り込んでください。"); return; }
    setExamBusy(true);
    setExamProgress(forceAI ? "保存済みOCRからAI抽出中…" : "保存済みOCRから再抽出中…");
    try {
      let parsed = forceAI ? [] : parseMultipleChoiceQuestions(pages, source);
      if (parsed.length === 0) parsed = await extractQuestionsByAI(pages, source);
      if (parsed.length > 0 && parsed.some(x => !x.question.answer)) {
        setExamProgress("AIで解答を推定中…");
        parsed = await generateChoiceAnswers(parsed);
      }
      const count = await saveParsedQuestionsForSource(source, parsed);
      setExamProgress(count + "問をカード化しました");
      if (count === 0) {
        setOcrPreviewSourceId(source.id);
        alert("再抽出でも0件でした。OCRプレビューで、選択肢がどんな文字列になっているか確認してください。");
      }
    } catch (err) {
      alert("再抽出に失敗しました: " + err.message);
    } finally {
      setExamBusy(false);
      setTimeout(() => setExamProgress(""), 1800);
    }
  }

  async function updateCard(questionId, nextStatus) {
    const current = cardStates.find(s => s.questionId === questionId);
    const state = current || { id: uid(), questionId, status: "new", knownCount: 0, unknownCount: 0, memo: "" };
    const updated = {
      ...state,
      status: nextStatus,
      knownCount: nextStatus === "known" ? (state.knownCount || 0) + 1 : (state.knownCount || 0),
      unknownCount: nextStatus === "unknown" ? (state.unknownCount || 0) + 1 : (state.unknownCount || 0),
      lastReviewedAt: Date.now(),
      nextReviewAt: nextStatus === "known" ? Date.now() + 3 * 24 * 60 * 60 * 1000 : Date.now() + 24 * 60 * 60 * 1000,
      updatedAt: Date.now(),
    };
    await idbPutMany("flashcardStates", [updated]);
    const nextStats = {
      startedAt: sessionStats.startedAt || Date.now(),
      seen: sessionStats.seen.includes(questionId) ? sessionStats.seen : [...sessionStats.seen, questionId],
      known: sessionStats.known + (nextStatus === "known" ? 1 : 0),
      unknown: sessionStats.unknown + (nextStatus === "unknown" ? 1 : 0),
    };
    setSessionStats(nextStats);
    await refreshExamDb();
    setShowStudyAnswer(false);
    if (studyCards.length > 0 && nextStats.seen.length >= studyCards.length) {
      finishStudySession(nextStats, studyCards.length);
    } else {
      setStudyIndex(i => i + 1);
    }
  }

  async function updateCardMemo(questionId, memo) {
    const current = cardStates.find(s => s.questionId === questionId);
    const state = current || { id: uid(), questionId, status: "new", knownCount: 0, unknownCount: 0 };
    await idbPutMany("flashcardStates", [{ ...state, memo, updatedAt: Date.now() }]);
    await refreshExamDb();
  }

  function beginAnswerEdit(question) {
    setEditingAnswerId(question.id);
    setAnswerDraft(question.answer || "");
    setExplanationDraft(question.explanation || "");
  }

  async function saveAnswerEdit(question) {
    const nextLabels = answerDraft
      .split(/[,、\s]+/)
      .filter(Boolean)
      .map(normalizeChoiceLabel);
    const updatedQuestion = {
      ...question,
      answer: nextLabels.join(","),
      explanation: explanationDraft,
      answerSource: "manual",
      answerConfidence: 1,
      updatedAt: Date.now(),
    };
    const updatedChoices = (choicesByQuestion.get(question.id) || []).map(c => ({
      ...c,
      isCorrect: nextLabels.includes(c.label),
    }));
    await idbPutMany("questions", [updatedQuestion]);
    if (updatedChoices.length) await idbPutMany("choices", updatedChoices);
    setEditingAnswerId("");
    setAnswerDraft("");
    setExplanationDraft("");
    await refreshExamDb();
  }

  function endStudySession() {
    finishStudySession(sessionStats, studyCards.length);
  }

  function finishStudySession(stats, deckSize) {
    const key = studySessionKey;
    const answered = stats.known + stats.unknown;
    const summary = {
      endedAt: Date.now(),
      startedAt: stats.startedAt || Date.now(),
      totalInDeck: deckSize,
      answered,
      uniqueSeen: stats.seen.length,
      known: stats.known,
      unknown: stats.unknown,
      accuracy: answered ? Math.round((stats.known / answered) * 100) : 0,
      filters: {
        studySubjectFilter,
        studyYearFilter,
        studyFieldFilter,
        studyFilter,
      },
    };
    const session = {
      savedAt: Date.now(),
      index: studyIndex,
      summary,
      filters: {
        studySubjectFilter,
        studyYearFilter,
        studyFieldFilter,
      },
    };
    const next = { ...savedStudySessions, [key]: session };
    lsSet(LS.studySession, next);
    setSavedStudySessions(next);
    setLastSessionSummary(summary);
    setStudySessionActive(false);
    setShowStudyAnswer(false);
    setSessionStats({ startedAt: null, seen: [], known: 0, unknown: 0 });
  }

  function startStudySession(kind) {
    const session = savedStudySessions[studySessionKey];
    if (kind === "resume" && session) {
      setStudyFilter("all");
      setStudyIndex(session.index || 0);
    } else if (kind === "wrong") {
      setStudyFilter("unknown");
      setStudyIndex(0);
    } else {
      setStudyFilter("all");
      setStudyIndex(0);
    }
    setLastSessionSummary(null);
    setSessionStats({ startedAt: Date.now(), seen: [], known: 0, unknown: 0 });
    setStudySessionActive(true);
    setShowStudyAnswer(false);
  }

  async function createKnowledgeNote(question) {
    const body = noteDraft.trim() || question.rawText;
    const note = {
      id: uid(),
      title: question.field + " / " + question.subject + " 問" + question.questionNumber,
      body,
      summary: body.slice(0, 120),
      field: question.field,
      sourceQuestionIds: [question.id],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      exportedPdfDriveFileId: "",
    };
    await idbPutMany("knowledgeNotes", [note]);
    setNoteDraft("");
    await refreshExamDb();
  }

  async function exportExamBackup() {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      stores: Object.fromEntries(await Promise.all(DB_STORES.map(async s => [s, await idbGetAll(s)]))),
    };
    const b = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const u = URL.createObjectURL(b);
    const a = document.createElement("a");
    a.href = u;
    a.download = "med-answer-drive-backup-" + new Date().toISOString().slice(0, 10) + ".json";
    a.click();
    URL.revokeObjectURL(u);
  }

  async function importExamBackup(e) {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    const payload = JSON.parse(text);
    if (!payload.stores) { alert("バックアップ形式が違います"); return; }
    if (!confirm("過去問MVPのIndexedDBをバックアップ内容で置き換えますか？")) return;
    await idbClearAll();
    for (const store of DB_STORES) {
      if (payload.stores[store]?.length) await idbPutMany(store, payload.stores[store]);
    }
    await refreshExamDb();
    e.target.value = "";
  }

  function exportKnowledgePdf() {
    const html = `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><style>
      body{font-family:'Hiragino Sans',sans-serif;font-size:13px;line-height:1.9;color:#111;max-width:800px;margin:40px auto;padding:0 40px}
      h1{font-size:18px;color:${GREEN};border-bottom:2px solid ${GREEN};padding-bottom:8px}
      h2{font-size:15px;margin-top:24px}.meta{font-size:11px;color:#888}.note{page-break-inside:avoid;margin-bottom:24px;white-space:pre-wrap}
    </style></head><body><h1>弱点知識ノート</h1>${knowledgeNotes.map(n => `<div class="note"><h2>${n.title}</h2><div class="meta">${n.field} · ${new Date(n.updatedAt).toLocaleDateString("ja-JP")}</div><div>${n.body}</div></div>`).join("")}</body></html>`;
    const win = window.open("", "_blank");
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 500);
  }

  const fields = ["all", ...Array.from(new Set(examQuestions.map(q => q.field || "未分類")))];
  const subjects = ["all", ...Array.from(new Set(examQuestions.map(q => q.subject || "未分類")))];
  const years = ["all", ...Array.from(new Set(examQuestions.map(q => q.year).filter(Boolean))).sort((a, b) => b - a)];
  const studySessionKey = [studySubjectFilter, studyYearFilter, studyFieldFilter].join("|");
  const savedStudySession = savedStudySessions[studySessionKey];
  const questionsForField = examQuestions
    .filter(q => examFilter === "all" || q.field === examFilter)
    .sort((a, b) => (b.year || 0) - (a.year || 0) || (a.questionNumber || 0) - (b.questionNumber || 0));
  const stateByQuestion = new Map(cardStates.map(s => [s.questionId, s]));
  const choicesByQuestion = examChoices.reduce((m, c) => {
    if (!m.has(c.questionId)) m.set(c.questionId, []);
    m.get(c.questionId).push(c);
    return m;
  }, new Map());
  const studyCards = examQuestions.filter(q => {
    const s = stateByQuestion.get(q.id);
    if (studySubjectFilter !== "all" && q.subject !== studySubjectFilter) return false;
    if (studyYearFilter !== "all" && String(q.year) !== String(studyYearFilter)) return false;
    if (studyFieldFilter !== "all" && q.field !== studyFieldFilter) return false;
    if (studyFilter === "unknown") return s?.status === "unknown";
    if (studyFilter === "new") return !s || s.status === "new";
    if (studyFilter === "review") return s?.status === "review" || (s?.nextReviewAt && s.nextReviewAt <= Date.now());
    return true;
  });
  const currentStudy = studyCards.length ? studyCards[studyIndex % studyCards.length] : null;
  const wrongQuestions = examQuestions.filter(q => stateByQuestion.get(q.id)?.status === "unknown");

  const WrongPanel = (
    <div style={{ overflowY: "auto", padding: isMobile ? "12px" : "16px", flex: 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700, flex: 1 }}>間違えた問題</div>
        <span style={{ fontSize: 11, color: "#dc2626", fontWeight: 800 }}>{wrongQuestions.length}問</span>
        <button onClick={() => { startStudySession("wrong"); setDesktopTab("study"); if (isMobile) setMobileTab("study"); }} disabled={wrongQuestions.length === 0}
          style={{ fontSize: 11, padding: "7px 12px", border: "0.5px solid #dc2626", borderRadius: 7, background: "#fff", color: wrongQuestions.length ? "#dc2626" : "#aaa", cursor: wrongQuestions.length ? "pointer" : "not-allowed", fontWeight: 700, fontFamily: "inherit" }}>
          この問題だけ学習
        </button>
      </div>
      {wrongQuestions.length === 0 && <div style={{ textAlign: "center", color: "#bbb", padding: 48 }}>まだ間違えた問題はありません</div>}
      {wrongQuestions.map(q => {
        const expanded = expandedWeakQuestionId === q.id;
        const answerOpen = weakAnswerIds.includes(q.id);
        const state = stateByQuestion.get(q.id);
        return (
          <div key={q.id} style={{ background: "#fff", border: "0.5px solid #e5e7eb", borderRadius: 10, padding: "12px 14px", marginBottom: 8 }}>
            <div onClick={() => setExpandedWeakQuestionId(expanded ? "" : q.id)} style={{ cursor: "pointer" }}>
              <div style={{ fontSize: 11, color: "#999", marginBottom: 4 }}>{q.year} · {q.subject} · {q.field} · 問{q.questionNumber}</div>
              <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.7 }}>{q.stem}</div>
            </div>
            {expanded && (
              <div style={{ marginTop: 10 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
                  {(choicesByQuestion.get(q.id) || []).map(c => (
                    <div key={c.id} style={{ display: "grid", gridTemplateColumns: "30px 1fr", gap: 8, fontSize: 12, color: "#555", padding: "6px 8px", background: "#f7f7f5", borderRadius: 7 }}>
                      <span style={{ fontWeight: 800, color: PURPLE }}>{c.label}</span>
                      <span>{c.text}</span>
                    </div>
                  ))}
                </div>
                <button onClick={() => setWeakAnswerIds(ids => ids.includes(q.id) ? ids.filter(id => id !== q.id) : [...ids, q.id])}
                  style={{ fontSize: 11, padding: "6px 10px", border: "0.5px solid " + GREEN, borderRadius: 7, background: "#fff", color: GREEN, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                  {answerOpen ? "答えを隠す" : "答えを見る"}
                </button>
                {answerOpen && (
                  <div style={{ marginTop: 8, padding: 9, borderRadius: 8, background: "#f9fffe", borderLeft: "3px solid " + GREEN }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: GREEN }}>{q.answer || "未登録"}</div>
                    {q.explanation && <div style={{ fontSize: 12, color: "#555", lineHeight: 1.7, marginTop: 4 }}>{q.explanation}</div>}
                  </div>
                )}
                <div style={{ fontSize: 10, fontWeight: 700, color: "#aaa", textTransform: "uppercase", marginTop: 10, marginBottom: 5 }}>弱点メモ</div>
                <textarea defaultValue={state?.memo || ""} onBlur={e => updateCardMemo(q.id, e.target.value)} rows={3}
                  placeholder="なぜ間違えたか、覚えることなど"
                  style={{ width: "100%", boxSizing: "border-box", border: "0.5px solid #ddd", borderRadius: 7, padding: 8, fontSize: 12, resize: "vertical", fontFamily: "inherit" }} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  const PastExamPanel = (
    <div style={{ overflowY: "auto", padding: isMobile ? "12px" : "16px", flex: 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700, flex: 1 }}>過去問DB</div>
        <button onClick={exportExamBackup} style={{ fontSize: 11, padding: "6px 10px", border: "0.5px solid #ddd", borderRadius: 7, background: "#fff", cursor: "pointer", color: "#555", fontFamily: "inherit" }}>Drive用バックアップ</button>
        <label style={{ fontSize: 11, padding: "6px 10px", border: "0.5px solid #ddd", borderRadius: 7, background: "#fff", cursor: "pointer", color: "#555" }}>
          復元<input type="file" accept=".json" onChange={importExamBackup} style={{ display: "none" }} />
        </label>
      </div>
      <div style={{ background: "#fff", border: "0.5px solid #e5e7eb", borderRadius: 10, padding: 12, marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select value={examOcrMode} onChange={e => setExamOcrMode(e.target.value)} disabled={examBusy}
            style={{ padding: "8px 10px", border: "0.5px solid #ddd", borderRadius: 7, fontSize: 12, color: "#333", background: "#fff" }}>
            <option value="vision">OCR 高精度</option>
            <option value="fast">OCR 高速</option>
            <option value="text">テキスト抽出</option>
          </select>
          <label style={{ flex: 1, minWidth: 180, textAlign: "center", padding: "9px 12px", border: "0.5px dashed " + PURPLE, borderRadius: 8, color: PURPLE, background: "#f5f3ff", fontWeight: 700, cursor: examBusy ? "not-allowed" : "pointer" }}>
            {examBusy ? "取り込み中…" : "過去問PDFを取り込む"}
            <input type="file" accept="application/pdf" disabled={examBusy} onChange={e => { importPastExamPdf(e.target.files[0]); e.target.value = ""; }} style={{ display: "none" }} />
          </label>
        </div>
        <div style={{ fontSize: 11, color: examBusy ? PURPLE : "#999", marginTop: 8 }}>
          {examProgress || "元PDFはDrive保管、OCR結果・問題・学習状態はIndexedDB保存するMVPです。"}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "220px 1fr", gap: 12 }}>
        <div style={{ background: "#fff", border: "0.5px solid #e5e7eb", borderRadius: 10, padding: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#aaa", textTransform: "uppercase", marginBottom: 8 }}>分野</div>
          {fields.map(f => (
            <button key={f} onClick={() => setExamFilter(f)}
              style={{ width: "100%", textAlign: "left", padding: "8px 9px", border: "none", borderRadius: 7, background: examFilter === f ? PURPLE + "14" : "transparent", color: examFilter === f ? PURPLE : "#555", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: examFilter === f ? 700 : 500 }}>
              {f === "all" ? "すべて" : f}
            </button>
          ))}
          <div style={{ fontSize: 11, color: "#aaa", marginTop: 10 }}>{examSources.length} PDF / {examQuestions.length} 問 / OCR {ocrPages.length}ページ</div>
          {examSources.length > 0 && (
            <div style={{ marginTop: 14, borderTop: "0.5px solid #eee", paddingTop: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#aaa", textTransform: "uppercase", marginBottom: 6 }}>取り込み済みPDF</div>
              {examSources.map(src => (
                <div key={src.id} style={{ border: "0.5px solid #eee", borderRadius: 8, padding: 8, marginBottom: 6, background: ocrPreviewSourceId === src.id ? "#f5f3ff" : "#fafafa" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#333", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{src.title}</div>
                  <div style={{ fontSize: 10, color: "#999", marginTop: 2 }}>
                    {src.year} · {src.subject} · {src.questionCount || 0}問 · OCR {ocrPages.filter(p => p.examSourceId === src.id).length}p
                  </div>
                  <div style={{ display: "flex", gap: 4, marginTop: 7 }}>
                    <button onClick={() => setOcrPreviewSourceId(ocrPreviewSourceId === src.id ? "" : src.id)}
                      style={{ flex: 1, fontSize: 10, padding: "5px 0", border: "0.5px solid #ddd", borderRadius: 6, background: "#fff", cursor: "pointer", color: "#555", fontFamily: "inherit" }}>
                      OCR
                    </button>
                    <button onClick={() => reextractSource(src, false)} disabled={examBusy}
                      style={{ flex: 1, fontSize: 10, padding: "5px 0", border: "0.5px solid " + PURPLE, borderRadius: 6, background: "#fff", cursor: examBusy ? "not-allowed" : "pointer", color: PURPLE, fontFamily: "inherit" }}>
                      再抽出
                    </button>
                    <button onClick={() => reextractSource(src, true)} disabled={examBusy}
                      style={{ flex: 1, fontSize: 10, padding: "5px 0", border: "0.5px solid " + GREEN, borderRadius: 6, background: "#fff", cursor: examBusy ? "not-allowed" : "pointer", color: GREEN, fontFamily: "inherit" }}>
                      AI
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div>
          {ocrPreviewSourceId && (
            <div style={{ background: "#fff", border: "0.5px solid " + PURPLE + "55", borderRadius: 10, padding: 12, marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: PURPLE, flex: 1 }}>OCRプレビュー</div>
                <button onClick={() => setOcrPreviewSourceId("")} style={{ fontSize: 11, border: "none", background: "transparent", color: "#888", cursor: "pointer" }}>閉じる</button>
              </div>
              <pre style={{ margin: 0, maxHeight: 260, overflow: "auto", whiteSpace: "pre-wrap", fontFamily: "monospace", fontSize: 11, lineHeight: 1.6, color: "#333", background: "#f7f7f5", borderRadius: 8, padding: 10 }}>
                {ocrPages.filter(p => p.examSourceId === ocrPreviewSourceId).sort((a, b) => a.pageNumber - b.pageNumber).slice(0, 5).map(p => "p." + p.pageNumber + "\n" + p.text).join("\n\n---\n\n") || "OCRテキストがありません"}
              </pre>
            </div>
          )}
          {questionsForField.length === 0 && <div style={{ textAlign: "center", color: "#bbb", padding: 40 }}>過去問PDFを取り込むと、選択問題カードがここに並びます</div>}
          {questionsForField.map(q => {
            const s = stateByQuestion.get(q.id);
            const isAnswerOpen = revealedAnswerIds.includes(q.id);
            const isEditingAnswer = editingAnswerId === q.id;
            return (
              <div key={q.id} style={{ background: "#fff", border: "0.5px solid #e5e7eb", borderRadius: 10, padding: "12px 14px", marginBottom: 8 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontSize: 11, color: PURPLE, fontWeight: 700 }}>{q.year} · {q.subject}</span>
                  <span style={{ fontSize: 11, color: "#888" }}>p.{q.pageNumber} / 問{q.questionNumber}</span>
                  <span style={{ marginLeft: "auto", fontSize: 10, color: "#888", background: "#f7f7f5", padding: "2px 7px", borderRadius: 10 }}>{q.field}</span>
                  <span style={{ fontSize: 10, color: s?.status === "unknown" ? "#dc2626" : s?.status === "known" ? GREEN : "#aaa" }}>{s?.status || "new"}</span>
                </div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#aaa", textTransform: "uppercase", marginBottom: 4 }}>問題文</div>
                <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.7, marginBottom: 10, whiteSpace: "pre-wrap" }}>{q.stem}</div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#aaa", textTransform: "uppercase", marginBottom: 5 }}>選択肢</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {(choicesByQuestion.get(q.id) || []).map(c => (
                    <div key={c.id} style={{ display: "grid", gridTemplateColumns: isAnswerOpen || isEditingAnswer ? "34px 1fr auto" : "34px 1fr", gap: 8, alignItems: "center", fontSize: 12, color: "#555", padding: "6px 8px", background: isAnswerOpen && c.isCorrect ? "#ecfdf5" : "#f7f7f5", border: "0.5px solid " + (isAnswerOpen && c.isCorrect ? "#a7f3d0" : "transparent"), borderRadius: 7 }}>
                      <span style={{ borderRadius: 6, padding: "4px 0", textAlign: "center", fontWeight: 800, color: "#fff", background: PURPLE }}>{c.label}</span>
                      <span>{c.text}</span>
                      {isAnswerOpen && c.isCorrect && <span style={{ fontSize: 10, color: GREEN, fontWeight: 700 }}>正解</span>}
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10 }}>
                  <button onClick={() => setRevealedAnswerIds(ids => ids.includes(q.id) ? ids.filter(id => id !== q.id) : [...ids, q.id])}
                    style={{ fontSize: 11, padding: "7px 12px", border: "0.5px solid " + GREEN, borderRadius: 7, background: "#fff", color: GREEN, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                    {isAnswerOpen ? "答えを隠す" : "答えを見る"}
                  </button>
                  <button onClick={() => isEditingAnswer ? setEditingAnswerId("") : beginAnswerEdit(q)}
                    style={{ fontSize: 11, padding: "7px 12px", border: "0.5px solid #ddd", borderRadius: 7, background: "#fff", color: "#555", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                    {isEditingAnswer ? "編集を閉じる" : "答えを編集"}
                  </button>
                </div>
                {isEditingAnswer && (
                  <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: "#fff", border: "0.5px solid #e5e7eb" }}>
                    <div style={{ fontSize: 11, color: "#888", fontWeight: 700, marginBottom: 6 }}>正答ラベル（例: A または A,C）</div>
                    <input value={answerDraft} onChange={e => setAnswerDraft(e.target.value)} placeholder="A"
                      style={{ width: "100%", boxSizing: "border-box", border: "0.5px solid #ddd", borderRadius: 7, padding: "8px 10px", fontSize: 13, marginBottom: 8 }} />
                    <div style={{ fontSize: 11, color: "#888", fontWeight: 700, marginBottom: 6 }}>短い解説</div>
                    <textarea value={explanationDraft} onChange={e => setExplanationDraft(e.target.value)} rows={3}
                      style={{ width: "100%", boxSizing: "border-box", border: "0.5px solid #ddd", borderRadius: 7, padding: "8px 10px", fontSize: 13, resize: "vertical" }} />
                    <button onClick={() => saveAnswerEdit(q)}
                      style={{ marginTop: 8, width: "100%", padding: 9, border: "none", borderRadius: 8, background: GREEN, color: "#fff", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                      保存
                    </button>
                  </div>
                )}
                {isAnswerOpen && (
                  <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: "#f9fffe", borderLeft: "3px solid " + GREEN }}>
                    <div style={{ fontSize: 11, color: "#888", fontWeight: 700, marginBottom: 4 }}>
                      答え {q.answerSource === "ai" ? "AI推定" : q.answerSource === "manual" ? "手動編集" : ""}
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: GREEN, marginBottom: 6 }}>{q.answer || "未登録"}</div>
                    {q.explanation && <div style={{ fontSize: 12, color: "#555", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{q.explanation}</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  const StudyPanel = (
    <div style={{ overflowY: "auto", padding: isMobile ? "12px" : "16px", flex: 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 700, flex: 1 }}>フラッシュカード</div>
        {studySessionActive && (
          <button onClick={endStudySession}
            style={{ fontSize: 12, padding: "8px 14px", border: "0.5px solid #fecaca", borderRadius: 8, background: "#fff5f5", color: "#dc2626", cursor: "pointer", fontWeight: 800, fontFamily: "inherit" }}>
            保存して終了
          </button>
        )}
        <select value={studyFilter} onChange={e => { setStudyFilter(e.target.value); setStudyIndex(0); setShowStudyAnswer(false); }}
          style={{ padding: "7px 10px", border: "0.5px solid #ddd", borderRadius: 7, fontSize: 12, color: "#333", background: "#fff" }}>
          <option value="all">すべて</option><option value="new">未学習</option><option value="unknown">わからない</option><option value="review">復習</option>
        </select>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))", gap: 8, marginBottom: 12 }}>
        <select value={studySubjectFilter} onChange={e => { setStudySubjectFilter(e.target.value); setStudyIndex(0); setShowStudyAnswer(false); }}
          style={{ padding: "8px 10px", border: "0.5px solid #ddd", borderRadius: 7, fontSize: 12, color: "#333", background: "#fff" }}>
          {subjects.map(s => <option key={s} value={s}>{s === "all" ? "全科目" : s}</option>)}
        </select>
        <select value={studyYearFilter} onChange={e => { setStudyYearFilter(e.target.value); setStudyIndex(0); setShowStudyAnswer(false); }}
          style={{ padding: "8px 10px", border: "0.5px solid #ddd", borderRadius: 7, fontSize: 12, color: "#333", background: "#fff" }}>
          {years.map(y => <option key={y} value={y}>{y === "all" ? "全年度" : y + "年"}</option>)}
        </select>
        <select value={studyFieldFilter} onChange={e => { setStudyFieldFilter(e.target.value); setStudyIndex(0); setShowStudyAnswer(false); }}
          style={{ padding: "8px 10px", border: "0.5px solid #ddd", borderRadius: 7, fontSize: 12, color: "#333", background: "#fff" }}>
          {fields.map(f => <option key={f} value={f}>{f === "all" ? "全分類" : f}</option>)}
        </select>
      </div>
      {!studySessionActive && (
        <div style={{ background: "#fff", border: "0.5px solid #e5e7eb", borderRadius: 12, padding: 18, maxWidth: 680, margin: "24px auto" }}>
          {lastSessionSummary && (
            <div style={{ border: "0.5px solid " + GREEN + "55", background: "#f9fffe", borderRadius: 10, padding: 14, marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: GREEN, marginBottom: 10 }}>前回セッション結果</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                {[
                  ["解答", lastSessionSummary.answered + "問"],
                  ["正解", lastSessionSummary.known + "問"],
                  ["不正解", lastSessionSummary.unknown + "問"],
                  ["正解率", lastSessionSummary.accuracy + "%"],
                ].map(([label, value]) => (
                  <div key={label} style={{ background: "#fff", borderRadius: 8, padding: "9px 8px", textAlign: "center", border: "0.5px solid #e5e7eb" }}>
                    <div style={{ fontSize: 10, color: "#aaa", fontWeight: 700 }}>{label}</div>
                    <div style={{ fontSize: 17, fontWeight: 800, color: label === "不正解" ? "#dc2626" : "#111", marginTop: 2 }}>{value}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11, color: "#888", marginTop: 8 }}>デッキ内 {lastSessionSummary.totalInDeck}問 / ユニーク {lastSessionSummary.uniqueSeen}問</div>
            </div>
          )}
          <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>学習セッション</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 12 }}>
            {[
              ["この条件", studyCards.length + "問"],
              ["間違い", wrongQuestions.length + "問"],
              ["保存", savedStudySession ? "あり" : "なし"],
            ].map(([label, value]) => (
              <div key={label} style={{ background: "#fafafa", border: "0.5px solid #eee", borderRadius: 8, padding: "9px 8px", textAlign: "center" }}>
                <div style={{ fontSize: 10, color: "#aaa", fontWeight: 700 }}>{label}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#111" }}>{value}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 12, color: "#888", lineHeight: 1.7, marginBottom: 14 }}>
            上の科目・年度・分類でセッションを作ります。同じ条件の保存があれば途中から再開できます。
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: 8 }}>
            <button onClick={() => startStudySession("resume")} disabled={!savedStudySession}
              style={{ padding: 12, border: "0.5px solid " + PURPLE, borderRadius: 9, background: "#fff", color: savedStudySession ? PURPLE : "#aaa", cursor: savedStudySession ? "pointer" : "not-allowed", fontWeight: 700, fontFamily: "inherit" }}>
              途中から再開
            </button>
            <button onClick={() => startStudySession("wrong")} disabled={wrongQuestions.length === 0}
              style={{ padding: 12, border: "0.5px solid #dc2626", borderRadius: 9, background: "#fff", color: wrongQuestions.length ? "#dc2626" : "#aaa", cursor: wrongQuestions.length ? "pointer" : "not-allowed", fontWeight: 700, fontFamily: "inherit" }}>
              間違えた問題だけ
            </button>
            <button onClick={() => startStudySession("new")}
              style={{ padding: 12, border: "none", borderRadius: 9, background: GREEN, color: "#fff", cursor: "pointer", fontWeight: 700, fontFamily: "inherit" }}>
              最初から始める
            </button>
          </div>
          {savedStudySession && <div style={{ fontSize: 11, color: "#aaa", marginTop: 10 }}>保存: {new Date(savedStudySession.savedAt).toLocaleString("ja-JP")}</div>}
        </div>
      )}
      {studySessionActive && (
        <>
      {!currentStudy && <div style={{ textAlign: "center", padding: 48, color: "#bbb" }}>対象カードがありません</div>}
      {currentStudy && (
        <div style={{ background: "#fff", border: "0.5px solid " + PURPLE + "55", borderRadius: 12, padding: 18, maxWidth: 760, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "#888", marginBottom: 12 }}>
            <span>{studyIndex % studyCards.length + 1} / {studyCards.length}</span>
            <span>{currentStudy.year} {currentStudy.subject}</span>
            <span>今回 {sessionStats.known + sessionStats.unknown}問 / 正解率 {(sessionStats.known + sessionStats.unknown) ? Math.round(sessionStats.known / (sessionStats.known + sessionStats.unknown) * 100) : 0}%</span>
            <span style={{ marginLeft: "auto", color: PURPLE, fontWeight: 700, background: "#f5f3ff", padding: "3px 9px", borderRadius: 10 }}>{showStudyAnswer ? "裏" : "表"}</span>
          </div>
          <div style={{ border: "0.5px solid #e5e7eb", borderRadius: 12, padding: 18, minHeight: 260, background: showStudyAnswer ? "#f9fffe" : "#fff" }}>
            {!showStudyAnswer ? (
              <>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#aaa", textTransform: "uppercase", marginBottom: 8 }}>問題文</div>
                <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.75, marginBottom: 18, whiteSpace: "pre-wrap" }}>{currentStudy.stem}</div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#aaa", textTransform: "uppercase", marginBottom: 8 }}>選択肢</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {(choicesByQuestion.get(currentStudy.id) || []).map(c => (
                    <div key={c.id} style={{ display: "grid", gridTemplateColumns: "34px 1fr", gap: 10, alignItems: "start", fontSize: 14, padding: "10px 12px", background: "#f7f7f5", borderRadius: 8 }}>
                      <span style={{ color: PURPLE, fontWeight: 800 }}>{c.label}</span>
                      <span style={{ color: "#333", lineHeight: 1.6 }}>{c.text}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#aaa", textTransform: "uppercase", marginBottom: 8 }}>答え</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: GREEN, marginBottom: 10 }}>{currentStudy.answer || "未登録"}</div>
                {currentStudy.answerSource === "ai" && (
                  <div style={{ display: "inline-block", fontSize: 11, color: "#854F0B", background: "#fff7ed", border: "0.5px solid #fed7aa", borderRadius: 10, padding: "3px 8px", marginBottom: 12 }}>
                    AI推定{currentStudy.answerConfidence ? " · 信頼度 " + Math.round(currentStudy.answerConfidence * 100) + "%" : ""}
                  </div>
                )}
                <div style={{ fontSize: 13, color: "#555", lineHeight: 1.8, whiteSpace: "pre-wrap" }}>
                  {currentStudy.explanation || "正解が未登録の場合は、手元の解答を確認して弱点ノートにメモしてください。"}
                </div>
                <button onClick={() => editingAnswerId === currentStudy.id ? setEditingAnswerId("") : beginAnswerEdit(currentStudy)}
                  style={{ marginTop: 14, fontSize: 12, padding: "8px 12px", border: "0.5px solid #ddd", borderRadius: 7, background: "#fff", color: "#555", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                  {editingAnswerId === currentStudy.id ? "編集を閉じる" : "答えを編集"}
                </button>
                {editingAnswerId === currentStudy.id && (
                  <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: "#fff", border: "0.5px solid #e5e7eb" }}>
                    <div style={{ fontSize: 11, color: "#888", fontWeight: 700, marginBottom: 6 }}>正答ラベル（例: A または A,C）</div>
                    <input value={answerDraft} onChange={e => setAnswerDraft(e.target.value)} placeholder="A"
                      style={{ width: "100%", boxSizing: "border-box", border: "0.5px solid #ddd", borderRadius: 7, padding: "8px 10px", fontSize: 13, marginBottom: 8 }} />
                    <div style={{ fontSize: 11, color: "#888", fontWeight: 700, marginBottom: 6 }}>短い解説</div>
                    <textarea value={explanationDraft} onChange={e => setExplanationDraft(e.target.value)} rows={3}
                      style={{ width: "100%", boxSizing: "border-box", border: "0.5px solid #ddd", borderRadius: 7, padding: "8px 10px", fontSize: 13, resize: "vertical" }} />
                    <button onClick={() => saveAnswerEdit(currentStudy)}
                      style={{ marginTop: 8, width: "100%", padding: 9, border: "none", borderRadius: 8, background: GREEN, color: "#fff", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                      保存
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button onClick={() => setShowStudyAnswer(v => !v)} style={{ flex: 1, padding: 10, border: "0.5px solid #ddd", borderRadius: 8, background: "#fff", cursor: "pointer", fontFamily: "inherit" }}>{showStudyAnswer ? "問題に戻る" : "答えを見る"}</button>
            <button onClick={() => updateCard(currentStudy.id, "unknown")} style={{ flex: 1, padding: 10, border: "none", borderRadius: 8, background: "#dc2626", color: "#fff", cursor: "pointer", fontWeight: 700, fontFamily: "inherit" }}>わからない</button>
            <button onClick={() => updateCard(currentStudy.id, "known")} style={{ flex: 1, padding: 10, border: "none", borderRadius: 8, background: GREEN, color: "#fff", cursor: "pointer", fontWeight: 700, fontFamily: "inherit" }}>わかる</button>
          </div>
          <textarea value={noteDraft} onChange={e => setNoteDraft(e.target.value)} rows={4} placeholder="この問題から得た知識をメモ"
            style={{ marginTop: 14, width: "100%", boxSizing: "border-box", border: "0.5px solid #ddd", borderRadius: 8, padding: 10, fontSize: 13, fontFamily: "inherit", resize: "vertical" }} />
          <button onClick={() => createKnowledgeNote(currentStudy)} style={{ marginTop: 8, width: "100%", padding: 9, border: "0.5px solid " + PURPLE, borderRadius: 8, background: "#fff", color: PURPLE, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>弱点ノートに追加</button>
        </div>
      )}
        </>
      )}
    </div>
  );

  const WeakPanel = (
    <div style={{ overflowY: "auto", padding: isMobile ? "12px" : "16px", flex: 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700, flex: 1 }}>弱点ノート</div>
        <button onClick={exportKnowledgePdf} disabled={knowledgeNotes.length === 0}
          style={{ fontSize: 11, padding: "6px 12px", border: "0.5px solid " + GREEN, borderRadius: 7, background: "#fff", color: GREEN, cursor: knowledgeNotes.length ? "pointer" : "not-allowed", fontWeight: 700, fontFamily: "inherit" }}>PDF出力</button>
      </div>
      {knowledgeNotes.length === 0 && <div style={{ textAlign: "center", color: "#bbb", padding: 48 }}>学習画面から弱点ノートを追加できます</div>}
      {knowledgeNotes.map(n => {
        const q = examQuestions.find(x => n.sourceQuestionIds?.includes(x.id));
        const expanded = expandedWeakQuestionId === n.id;
        const answerOpen = weakAnswerIds.includes(n.id);
        return (
          <div key={n.id} style={{ background: "#fff", border: "0.5px solid #e5e7eb", borderRadius: 10, padding: "14px 16px", marginBottom: 8 }}>
            <div onClick={() => setExpandedWeakQuestionId(expanded ? "" : n.id)} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: expanded ? 10 : 0, cursor: "pointer" }}>
              <div style={{ fontSize: 13, fontWeight: 700, flex: 1 }}>{n.title}</div>
              <span style={{ fontSize: 10, color: "#888", background: "#f7f7f5", padding: "2px 7px", borderRadius: 10 }}>{n.field}</span>
              <button onClick={async e => { e.stopPropagation(); await idbDelete("knowledgeNotes", n.id); await refreshExamDb(); }} style={{ border: "none", background: "transparent", color: "#dc2626", cursor: "pointer", fontSize: 11 }}>削除</button>
            </div>
            {expanded && (
              <div style={{ paddingTop: 8, borderTop: "0.5px solid #f3f4f6" }}>
                {q && (
                  <>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#aaa", textTransform: "uppercase", marginBottom: 5 }}>問題文</div>
                    <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.7, marginBottom: 8 }}>{q.stem}</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
                      {(choicesByQuestion.get(q.id) || []).map(c => (
                        <div key={c.id} style={{ display: "grid", gridTemplateColumns: "30px 1fr", gap: 8, fontSize: 12, color: "#555", padding: "6px 8px", background: "#f7f7f5", borderRadius: 7 }}>
                          <span style={{ fontWeight: 800, color: PURPLE }}>{c.label}</span>
                          <span>{c.text}</span>
                        </div>
                      ))}
                    </div>
                    <button onClick={() => setWeakAnswerIds(ids => ids.includes(n.id) ? ids.filter(id => id !== n.id) : [...ids, n.id])}
                      style={{ fontSize: 11, padding: "6px 10px", border: "0.5px solid " + GREEN, borderRadius: 7, background: "#fff", color: GREEN, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", marginBottom: 10 }}>
                      {answerOpen ? "答えを隠す" : "答えを見る"}
                    </button>
                    {answerOpen && (
                      <div style={{ marginBottom: 10, padding: 9, borderRadius: 8, background: "#f9fffe", borderLeft: "3px solid " + GREEN }}>
                        <div style={{ fontSize: 16, fontWeight: 800, color: GREEN }}>{q.answer || "未登録"}</div>
                        {q.explanation && <div style={{ fontSize: 12, color: "#555", lineHeight: 1.7, marginTop: 4 }}>{q.explanation}</div>}
                      </div>
                    )}
                  </>
                )}
                <div style={{ fontSize: 10, fontWeight: 700, color: "#aaa", textTransform: "uppercase", marginBottom: 5 }}>弱点メモ</div>
                <div style={{ fontSize: 13, lineHeight: 1.9, whiteSpace: "pre-wrap" }}>{n.body}</div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

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
          {mobileTab === "past" && PastExamPanel}
          {mobileTab === "study" && StudyPanel}
          {mobileTab === "wrong" && WrongPanel}
          {mobileTab === "weak" && WeakPanel}
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
          {[["result", "📄 答案"], ["past", "🧪 過去問"], ["study", "🎴 学習"], ["wrong", "✕ 間違い"], ["weak", "🧠 弱点"], ["history", "🕐 履歴"]].map(([k, v]) => (
            <button key={k} onClick={() => setDesktopTab(k)}
              style={{ padding: "12px 20px", fontSize: 12, fontWeight: 500, cursor: "pointer", background: "transparent", border: "none", borderBottom: desktopTab === k ? "2px solid " + accentColor : "2px solid transparent", color: desktopTab === k ? accentColor : "#aaa", fontFamily: "inherit" }}>
              {v}
            </button>
          ))}
        </div>
        {desktopTab === "result" && ResultPanel}
        {desktopTab === "past" && PastExamPanel}
        {desktopTab === "study" && StudyPanel}
        {desktopTab === "wrong" && WrongPanel}
        {desktopTab === "weak" && WeakPanel}
        {desktopTab === "history" && HistoryPanel}
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
