
import { useState, useEffect, useCallback, useRef } from "react";

const SAMPLE_DOCS = [
  {
    id: "bio3", title: "生化学 第3回 糖代謝", courseName: "生化学",
    lectureNumber: 3, year: 2024, color: "#0F6E56",
    pages: [
      { id: "b3p12", pageNumber: 12, heading: "解糖系の概要", content: "解糖系はグルコースをピルビン酸へ変換し、ATPとNADHを産生する。1分子のグルコースから正味2ATP、2NADHが生成される。細胞質で進行する。", tags: ["解糖系", "グルコース", "ATP", "NADH", "ピルビン酸"] },
      { id: "b3p13", pageNumber: 13, heading: "律速酵素", content: "ホスホフルクトキナーゼ-1（PFK-1）は解糖系の律速酵素である。ATPにより阻害され、AMP・AMPにより活性化される。フルクトース-2,6-ビスリン酸はPFK-1の最も強力なアロステリック活性化因子であり、インスリンにより産生が促進される。", tags: ["PFK-1", "律速酵素", "アロステリック", "ATP阻害", "フルクトース"] },
      { id: "b3p14", pageNumber: 14, heading: "嫌気的条件下の代謝", content: "嫌気条件ではピルビン酸は乳酸脱水素酵素（LDH）によって乳酸へ還元される。この反応によりNADHが再酸化されNAD+が再生され、解糖系の継続が可能となる。乳酸アシドーシスの原因となる。", tags: ["嫌気", "乳酸", "LDH", "NAD+", "乳酸アシドーシス"] },
      { id: "b3p15", pageNumber: 15, heading: "ピルビン酸脱水素酵素複合体", content: "好気条件ではピルビン酸はピルビン酸脱水素酵素複合体（PDH）によりアセチルCoAへ変換されTCAサイクルへ入る。PDHはインスリンにより活性化、グルカゴン・脂肪酸酸化により阻害される。ビタミンB1（チアミン）が補酵素として必要。", tags: ["PDH", "アセチルCoA", "TCA", "インスリン", "ビタミンB1"] },
      { id: "b3p20", pageNumber: 20, heading: "グリコーゲン代謝", content: "グリコーゲン合成の律速酵素はグリコーゲンシンターゼで、インスリンにより活性化・グルカゴンにより阻害される。分解の律速酵素はグリコーゲンホスホリラーゼで、グルカゴン・アドレナリンにより活性化される。", tags: ["グリコーゲン", "グリコーゲンシンターゼ", "インスリン", "グルカゴン"] },
    ]
  },
  {
    id: "phys5", title: "生理学 第5回 呼吸生理", courseName: "生理学",
    lectureNumber: 5, year: 2024, color: "#185FA5",
    pages: [
      { id: "p5p22", pageNumber: 22, heading: "肺胞換気量", content: "肺胞換気量（VA）は1回換気量（VT）から死腔量（VD）を差し引いて求める。VA＝（VT－VD）×呼吸数。正常値は約4L/分。死腔量は約150mL。", tags: ["肺胞換気量", "1回換気量", "死腔"] },
      { id: "p5p23", pageNumber: 23, heading: "PaCO2と換気の関係", content: "PaCO2は肺胞換気量と反比例する。換気が低下するとPaCO2は上昇し（高CO2血症・呼吸性アシドーシス）、換気が亢進すると低下する（低CO2血症・呼吸性アルカローシス）。基準値は35-45mmHg。", tags: ["PaCO2", "換気", "高CO2血症", "呼吸性アシドーシス"] },
      { id: "p5p25", pageNumber: 25, heading: "酸素解離曲線", content: "ヘモグロビンの酸素解離曲線はS字状を示す。温度上昇・2,3-DPG増加・pH低下・PaCO2上昇により曲線は右方移動（ボーア効果）し、末梢への酸素供給が増加する。", tags: ["酸素解離曲線", "SaO2", "ボーア効果", "2,3-DPG"] },
      { id: "p5p28", pageNumber: 28, heading: "呼吸中枢と化学受容体", content: "呼吸中枢は延髄（背側群・腹側群）と橋（呼吸調節群）に存在する。中枢化学受容体は主にPaCO2に反応。末梢化学受容体（頸動脈体・大動脈体）はPaO2低下・PaCO2上昇・pH低下に反応する。", tags: ["呼吸中枢", "延髄", "化学受容体", "PaO2"] },
    ]
  },
  {
    id: "path2", title: "病理学 第2回 炎症", courseName: "病理学",
    lectureNumber: 2, year: 2024, color: "#854F0B",
    pages: [
      { id: "pa2p8", pageNumber: 8, heading: "急性炎症の5徴候", content: "急性炎症の5徴候は発赤（rubor）・腫脹（tumor）・熱感（calor）・疼痛（dolor）・機能障害（functio laesa）である。前4つはCelsus、機能障害はVirchowが追加した。", tags: ["急性炎症", "5徴候", "Celsus", "Virchow"] },
      { id: "pa2p10", pageNumber: 10, heading: "炎症メディエーター", content: "主な炎症メディエーター：ヒスタミン（マスト細胞・好塩基球から即時型放出）、プロスタグランジン（COX経路、発熱・疼痛に関与）、ロイコトリエン（LOX経路、気管支収縮）、サイトカイン（IL-1β・TNF-α・IL-6）、補体（C3a・C5a：アナフィラトキシン）。", tags: ["ヒスタミン", "プロスタグランジン", "COX", "IL-1", "TNF", "補体"] },
      { id: "pa2p14", pageNumber: 14, heading: "慢性炎症の細胞像", content: "慢性炎症では主にマクロファージ・リンパ球・形質細胞が浸潤する。肉芽腫性炎症では類上皮細胞（活性化マクロファージ）と多核巨細胞が特徴的。代表疾患：結核・サルコイドーシス・クローン病。", tags: ["慢性炎症", "マクロファージ", "肉芽腫", "類上皮細胞", "結核"] },
    ]
  },
  {
    id: "pharm1", title: "薬理学 第1回 薬物動態", courseName: "薬理学",
    lectureNumber: 1, year: 2024, color: "#993556",
    pages: [
      { id: "ph1p5", pageNumber: 5, heading: "薬物動態の基本4過程", content: "薬物動態はADME（吸収・分布・代謝・排泄）で表される。吸収は主に小腸で起こり、初回通過効果により生体利用率が低下する場合がある。", tags: ["ADME", "吸収", "分布", "代謝", "排泄"] },
      { id: "ph1p8", pageNumber: 8, heading: "薬物代謝", content: "薬物代謝は主に肝臓のCYP450酵素系（シトクロムP450）で行われる。フェノバルビタール・リファンピシンはCYP誘導薬、グレープフルーツジュース・シメチジンはCYP阻害薬として重要。", tags: ["CYP450", "肝臓", "代謝", "CYP誘導", "CYP阻害"] },
      { id: "ph1p12", pageNumber: 12, heading: "半減期と定常状態", content: "血中半減期（t1/2）は薬物血中濃度が半分になる時間。定常状態（Css）には約4〜5半減期で到達する。腎機能低下時は腎排泄型薬物の半減期が延長し蓄積しやすい。", tags: ["半減期", "定常状態", "腎機能", "蓄積"] },
    ]
  },
];

const MED_HEAVY = ["律速酵素","解糖系","TCA","ATP","NADH","ピルビン酸","アセチルCoA","グリコーゲン","換気","PaCO2","PaO2","炎症","メディエーター","ヒスタミン","プロスタグランジン","マクロファージ","肉芽腫","呼吸","ヘモグロビン","インスリン","グルカゴン","阻害","活性化","アロステリック","CYP","ADME","半減期","補体","白血球","G6PD","NADPH","LDH","PDH","PFK"];

function createRuleBasedEngine() {
  function tokenize(text) {
    return text.replace(/[はをがにでもとやのへ、。？?！!「」【】\s]/g," ").split(" ").filter(w=>w.length>1);
  }
  function scorePage(page, question) {
    const qTokens = tokenize(question);
    const content = page.content, heading = page.heading || "";
    let score = 0; const reasons = [];
    for (const tag of page.tags) { if (question.includes(tag)) { score+=20; reasons.push(`タグ「${tag}」`); } }
    for (const kw of MED_HEAVY) { if (question.includes(kw) && content.includes(kw)) { score+=15; reasons.push(`医学語「${kw}」`); } }
    for (const tok of qTokens) {
      if (heading.includes(tok)) { score+=12; reasons.push(`見出し「${tok}」`); }
      else if (content.includes(tok)) { score+=6; }
    }
    return { score: Math.min(score,100), reasons: [...new Set(reasons)] };
  }
  function search(docs, question, activeIds) {
    const results = [];
    for (const doc of docs.filter(d=>activeIds.has(d.id))) {
      for (const page of doc.pages) {
        const { score, reasons } = scorePage(page, question);
        if (score>0) results.push({ doc, page, score, reasons });
      }
    }
    return results.sort((a,b)=>b.score-a.score).slice(0,10);
  }
  function classifyEvidence(page, question) {
    const hits = tokenize(question).filter(t=>page.content.includes(t)||(page.heading||"").includes(t)).length;
    if (hits>=3) return "direct";
    return page.tags.some(t=>question.includes(t)) ? "direct" : "indirect";
  }
  function extractClaims(searchResults, question) {
    const seen = new Set(), claims = [];
    for (const { doc, page, score, reasons } of searchResults) {
      if (score<8) continue;
      const key = page.content.slice(0,30);
      if (seen.has(key)) continue; seen.add(key);
      claims.push({ id:`claim_${page.id}`, text:page.content, evidenceDoc:doc.title, evidenceDocId:doc.id, evidencePage:page.pageNumber, evidenceHeading:page.heading||"", confidence:score>=50?"high":score>=25?"mid":"low", claimType:classifyEvidence(page,question), rationale:reasons.slice(0,2).join("、"), score });
    }
    return claims;
  }
  function buildAnswer(claims, mode) {
    const direct = claims.filter(c=>c.claimType==="direct");
    const indirect = claims.filter(c=>c.claimType==="indirect");
    const usedD = direct.slice(0, mode==="short"?1:mode==="standard"?3:5);
    const usedI = mode==="detailed" ? indirect.slice(0,3) : indirect.slice(0,1);
    const all = [...usedD,...usedI];
    if (!all.length) return { short:"資料内に関連する記述が見つかりませんでした。", standard:"授業資料に関連するページが見つかりませんでした。", detailed:"授業資料に関連するページが見つかりませんでした。", evidenceMap:[] };
    const fmt = c=>`${c.text}（${c.evidenceDoc.split(" ")[0]} p.${c.evidencePage}）`;
    const short = usedD[0] ? `${usedD[0].text.slice(0,90)}… [${usedD[0].evidenceDoc.split(" ")[0]} p.${usedD[0].evidencePage}]` : "直接根拠が不足しています。";
    const standard = all.map(fmt).join(" ");
    const detailed = all.map(c=>`【${c.evidenceHeading||`p.${c.evidencePage}`}（${c.evidenceDoc.split(" ")[0]}）】\n${c.text}`).join("\n\n");
    const evidenceMap = all.map(c=>({ claimSnippet:c.text.slice(0,55)+(c.text.length>55?"…":""), source:`${c.evidenceDoc.split(" ")[0]} p.${c.evidencePage}`, claimType:c.claimType, confidence:c.confidence }));
    return { short, standard, detailed, evidenceMap };
  }
  function audit(claims, searchResults) {
    const direct = claims.filter(c=>c.claimType==="direct");
    const low = claims.filter(c=>c.confidence==="low");
    const unsupportedClaims = direct.length===0 ? ["問題に直接対応する記述が資料内に見つかりませんでした。"] : [];
    const missingPoints = searchResults.length===0 ? ["関連ページが検索されませんでした。"] : [];
    const excluded = low.map(c=>`${c.text.slice(0,50)}…（${c.evidenceDoc.split(" ")[0]} p.${c.evidencePage}）`);
    const revisedAnswer = direct.length>0 ? `資料根拠あり: ${direct.slice(0,2).map(c=>c.text.slice(0,60)+"…").join("　")}` : "資料に十分な根拠が見つかりませんでした。";
    const ok = unsupportedClaims.length===0;
    return { unsupportedClaims, overstatements:[], missingPoints, conflicts:[], excluded, revisedAnswer, ok };
  }
  return { search, extractClaims, buildAnswer, audit };
}

const engine = createRuleBasedEngine();

const LS = { docs:"emab_docs_v3", active:"emab_active_v3", q:"emab_q_v3" };
function ls(key, fallback) { try { const v=localStorage.getItem(key); return v?JSON.parse(v):fallback; } catch { return fallback; } }
function lsSet(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }
function uid() { return "id_"+Math.random().toString(36).slice(2); }
function sleep(ms) { return new Promise(r=>setTimeout(r,ms)); }

const CT = { direct:"直接根拠", indirect:"間接根拠", conflict:"矛盾", unsupported:"根拠なし" };
const CTbg = { direct:"#E1F5EE", indirect:"#E6F1FB", conflict:"#FAEEDA", unsupported:"#FCEBEB" };
const CTc  = { direct:"#085041", indirect:"#0C447C", conflict:"#633806", unsupported:"#791F1F" };
const CFbg = { high:"#E1F5EE", mid:"#FAEEDA", low:"#FCEBEB" };
const CFc  = { high:"#085041", mid:"#633806", low:"#791F1F" };
const CFlabel = { high:"確信度高", mid:"確信度中", low:"確信度低" };

const GREEN = "#0F6E56";

function Badge({ type, small }) {
  const s = small ? { fontSize:9, padding:"1px 5px" } : { fontSize:10, padding:"2px 7px" };
  return <span style={{ ...s, background:CTbg[type], color:CTc[type], borderRadius:10, fontWeight:600, display:"inline-block", flexShrink:0 }}>{CT[type]}</span>;
}
function ConfBadge({ level }) {
  return <span style={{ fontSize:10, padding:"2px 6px", background:CFbg[level], color:CFc[level], borderRadius:10, fontWeight:500, display:"inline-block" }}>{CFlabel[level]}</span>;
}
function ScoreBar({ score }) {
  const c = score>=60?"#0F6E56":score>=30?"#BA7517":"#A32D2D";
  return (
    <div style={{ width:38, flexShrink:0 }}>
      <div style={{ height:3, background:"#e5e7eb", borderRadius:2 }}><div style={{ height:3, width:`${score}%`, background:c, borderRadius:2 }}/></div>
      <div style={{ fontSize:9, color:"#aaa", textAlign:"center", marginTop:1 }}>{score}</div>
    </div>
  );
}

function DocModal({ doc, onClose, onSave }) {
  const [form, setForm] = useState(doc || { id:uid(), title:"", courseName:"", lectureNumber:1, year:2024, color:GREEN, pages:[] });
  const [raw, setRaw] = useState(doc ? doc.pages.map(p=>`p${p.pageNumber}: ${p.content}`).join("\n") : "");
  function parsePgs(text) {
    return text.split("\n").filter(l=>l.trim()).map((line,i)=>{
      const m = line.match(/^p(\d+)[:\s：]+(.+)/);
      if(m){ const content=m[2].trim(); return { id:uid(), pageNumber:parseInt(m[1]), heading:"", content, tags:MED_HEAVY.filter(k=>content.includes(k)).slice(0,6) }; }
      return { id:uid(), pageNumber:i+1, heading:"", content:line.trim(), tags:[] };
    }).filter(p=>p.content);
  }
  function handleSave() {
    if (!form.title.trim()) { alert("タイトルを入力してください"); return; }
    onSave({ ...form, pages:parsePgs(raw) });
  }
  const colors = [GREEN,"#185FA5","#854F0B","#993556","#534AB7","#3B6D11"];
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:300, padding:16 }}>
      <div style={{ background:"#fff", borderRadius:12, padding:20, width:"100%", maxWidth:480, maxHeight:"90vh", overflowY:"auto" }}>
        <div style={{ fontWeight:700, fontSize:15, marginBottom:14 }}>{doc?"資料を編集":"資料を追加"}</div>
        {[["title","資料タイトル","例：生化学 第3回 糖代謝"],["courseName","科目名","例：生化学"]].map(([k,lbl,ph])=>(
          <div key={k} style={{ marginBottom:10 }}>
            <div style={{ fontSize:11, fontWeight:500, color:"#666", marginBottom:3 }}>{lbl}</div>
            <input value={form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} placeholder={ph}
              style={{ width:"100%", padding:"8px 10px", border:"0.5px solid #ddd", borderRadius:7, fontSize:13, fontFamily:"inherit", outline:"none", color:"#111", boxSizing:"border-box" }}/>
          </div>
        ))}
        <div style={{ display:"flex", gap:10, marginBottom:10 }}>
          {[["lectureNumber","講義番号","number"],["year","年度","number"]].map(([k,lbl,t])=>(
            <div key={k} style={{ flex:1 }}>
              <div style={{ fontSize:11, fontWeight:500, color:"#666", marginBottom:3 }}>{lbl}</div>
              <input type={t} value={form[k]} onChange={e=>setForm(f=>({...f,[k]:parseInt(e.target.value)||1}))}
                style={{ width:"100%", padding:"8px 10px", border:"0.5px solid #ddd", borderRadius:7, fontSize:13, fontFamily:"inherit", outline:"none", color:"#111", boxSizing:"border-box" }}/>
            </div>
          ))}
        </div>
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:11, fontWeight:500, color:"#666", marginBottom:6 }}>カラー</div>
          <div style={{ display:"flex", gap:8 }}>
            {colors.map(c=><div key={c} onClick={()=>setForm(f=>({...f,color:c}))} style={{ width:24, height:24, borderRadius:"50%", background:c, cursor:"pointer", border:form.color===c?"3px solid #111":"3px solid transparent" }}/>)}
          </div>
        </div>
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:11, fontWeight:500, color:"#666", marginBottom:3 }}>資料テキスト（p番号:内容 形式）</div>
          <textarea value={raw} onChange={e=>setRaw(e.target.value)} rows={8}
            placeholder={"p12: 解糖系はグルコースをピルビン酸へ変換し…\np13: ホスホフルクトキナーゼ-1 は律速酵素…"}
            style={{ width:"100%", padding:"8px 10px", border:"0.5px solid #ddd", borderRadius:7, fontSize:12, fontFamily:"monospace", outline:"none", resize:"vertical", color:"#111", lineHeight:1.6, boxSizing:"border-box" }}/>
          <div style={{ fontSize:11, color:"#aaa", marginTop:3 }}>{raw.split("\n").filter(l=>l.match(/^p\d+/)).length}ページ認識済み</div>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={onClose} style={{ flex:1, padding:10, border:"0.5px solid #ddd", borderRadius:8, fontSize:13, background:"transparent", cursor:"pointer", fontFamily:"inherit", color:"#666" }}>キャンセル</button>
          <button onClick={handleSave} style={{ flex:2, padding:10, background:GREEN, color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}>保存する</button>
        </div>
      </div>
    </div>
  );
}

// ── Mobile bottom nav ─────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { id:"docs",   icon:"📚", label:"資料" },
  { id:"input",  icon:"✏️", label:"問題" },
  { id:"result", icon:"📄", label:"答案" },
  { id:"refs",   icon:"🔍", label:"根拠" },
];

export default function App() {
  const [docs,     setDocs]     = useState(()=>ls(LS.docs, SAMPLE_DOCS));
  const [activeIds,setActiveIds]= useState(()=>new Set(ls(LS.active, SAMPLE_DOCS.map(d=>d.id))));
  const [question, setQuestion] = useState(()=>ls(LS.q,""));
  const [mode,     setMode]     = useState("standard");
  const [running,  setRunning]  = useState(false);
  const [step,     setStep]     = useState(0);
  const [searchResults, setSR]  = useState([]);
  const [claims,   setClaims]   = useState([]);
  const [answer,   setAnswer]   = useState(null);
  const [audit,    setAudit]    = useState(null);
  const [answerTab,setAnswerTab]= useState("standard");
  const [modal,    setModal]    = useState(null);
  const [mobileTab,setMobileTab]= useState("input");
  const [isMobile, setIsMobile] = useState(false);
  const centerRef = useRef(null);

  useEffect(()=>{
    const check = ()=>setIsMobile(window.innerWidth<768);
    check();
    window.addEventListener("resize",check);
    return ()=>window.removeEventListener("resize",check);
  },[]);

  useEffect(()=>{ lsSet(LS.docs,docs); },[docs]);
  useEffect(()=>{ lsSet(LS.active,[...activeIds]); },[activeIds]);
  useEffect(()=>{ lsSet(LS.q,question); },[question]);

  const toggleActive = useCallback(id=>{
    setActiveIds(prev=>{ const n=new Set(prev); n.has(id)?n.delete(id):n.add(id); return n; });
  },[]);

  async function runPipeline() {
    if (!question.trim()) { alert("問題文を入力してください"); return; }
    if (activeIds.size===0) { alert("資料を1つ以上選択してください"); return; }
    setRunning(true); setAnswer(null); setAudit(null); setClaims([]); setSR([]);
    if (isMobile) setMobileTab("result");
    setStep(1); await sleep(300);
    const sr = engine.search(docs, question, activeIds); setSR(sr);
    setStep(2); await sleep(300);
    const cl = engine.extractClaims(sr, question); setClaims(cl);
    setStep(3); await sleep(350);
    const ans = engine.buildAnswer(cl, mode); setAnswer(ans); setAnswerTab(mode);
    setStep(4); await sleep(300);
    const au = engine.audit(cl, sr); setAudit(au);
    setStep(5); setRunning(false);
  }

  function deleteDoc(id) {
    if (!confirm("この資料を削除しますか？")) return;
    setDocs(d=>d.filter(x=>x.id!==id));
    setActiveIds(s=>{ const n=new Set(s); n.delete(id); return n; });
  }
  function saveDoc(doc) {
    setDocs(prev=>{ const i=prev.findIndex(d=>d.id===doc.id); if(i>=0){ const n=[...prev]; n[i]=doc; return n; } return [...prev,doc]; });
    setActiveIds(s=>new Set([...s,doc.id]));
    setModal(null);
  }
  function exportDocs() {
    const b=new Blob([JSON.stringify(docs,null,2)],{type:"application/json"});
    const u=URL.createObjectURL(b); const a=document.createElement("a"); a.href=u; a.download="emab_docs.json"; a.click(); URL.revokeObjectURL(u);
  }
  function importDocs(e) {
    const f=e.target.files[0]; if(!f) return;
    const r=new FileReader(); r.onload=ev=>{ try{ const d=JSON.parse(ev.target.result); setDocs(d); setActiveIds(new Set(d.map(x=>x.id))); }catch{ alert("読み込みエラー"); } }; r.readAsText(f); e.target.value="";
  }

  const allOn = docs.every(d=>activeIds.has(d.id));

  // ─── Panels ────────────────────────────────────────────────────────────────

  const DocPanel = (
    <div style={{ padding:isMobile?"12px":"14px", overflowY:"auto", flex:1 }}>
      <div style={{ display:"flex", alignItems:"center", marginBottom:10 }}>
        <span style={{ fontSize:10, fontWeight:700, color:"#888", textTransform:"uppercase", letterSpacing:0.8, flex:1 }}>授業資料</span>
        <button onClick={()=>setActiveIds(allOn?new Set():new Set(docs.map(d=>d.id)))} style={{ fontSize:11, color:GREEN, background:"transparent", border:"none", cursor:"pointer", fontWeight:600, fontFamily:"inherit" }}>{allOn?"全解除":"全選択"}</button>
      </div>
      {docs.map(doc=>(
        <div key={doc.id} onClick={()=>toggleActive(doc.id)}
          style={{ display:"flex", alignItems:"flex-start", gap:8, padding:"9px 8px", borderRadius:9, cursor:"pointer", background:activeIds.has(doc.id)?"#fff":"transparent", border:`0.5px solid ${activeIds.has(doc.id)?"#e5e7eb":"transparent"}`, marginBottom:4, transition:"all 0.12s" }}>
          <div style={{ width:30, height:30, borderRadius:7, background:doc.color+"22", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:700, color:doc.color, flexShrink:0 }}>{doc.courseName[0]}</div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:12, fontWeight:600, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{doc.title}</div>
            <div style={{ fontSize:11, color:"#999" }}>{doc.courseName} 第{doc.lectureNumber}回 · {doc.year}</div>
            <div style={{ fontSize:10, color:"#ccc" }}>{doc.pages.length}ページ</div>
          </div>
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:3, flexShrink:0 }}>
            <div style={{ width:14, height:14, borderRadius:"50%", background:activeIds.has(doc.id)?doc.color:"#e5e7eb", transition:"background 0.15s" }}/>
            <button onClick={e=>{e.stopPropagation();setModal(doc);}} style={{ fontSize:9, color:"#aaa", background:"transparent", border:"none", cursor:"pointer", padding:0, fontFamily:"inherit" }}>編集</button>
            <button onClick={e=>{e.stopPropagation();deleteDoc(doc.id);}} style={{ fontSize:9, color:"#e24b4a", background:"transparent", border:"none", cursor:"pointer", padding:0, fontFamily:"inherit" }}>削除</button>
          </div>
        </div>
      ))}
      <button onClick={()=>setModal("add")}
        style={{ width:"100%", padding:9, border:"0.5px dashed #ccc", borderRadius:8, fontSize:12, color:"#888", background:"transparent", cursor:"pointer", marginTop:6, fontFamily:"inherit" }}>
        ＋ 資料を追加
      </button>
      <div style={{ display:"flex", gap:6, marginTop:10 }}>
        <button onClick={exportDocs} style={{ flex:1, fontSize:11, padding:"6px 0", border:"0.5px solid #e5e7eb", borderRadius:7, background:"transparent", cursor:"pointer", color:"#666", fontFamily:"inherit" }}>エクスポート</button>
        <label style={{ flex:1, fontSize:11, padding:"6px 0", border:"0.5px solid #e5e7eb", borderRadius:7, background:"transparent", cursor:"pointer", color:"#666", textAlign:"center" }}>
          インポート<input type="file" accept=".json" onChange={importDocs} style={{ display:"none" }}/>
        </label>
      </div>
    </div>
  );

  const InputPanel = (
    <div style={{ padding:isMobile?"12px":"14px", display:"flex", flexDirection:"column", gap:12, overflowY:"auto", flex:1 }}>
      <div>
        <div style={{ fontSize:10, fontWeight:700, color:"#888", textTransform:"uppercase", letterSpacing:0.8, marginBottom:6 }}>問題入力</div>
        <textarea value={question} onChange={e=>setQuestion(e.target.value)} rows={isMobile?5:7}
          placeholder={"問題文を入力してください\n\n例：解糖系の律速酵素を述べ、その制御機構を説明せよ。"}
          style={{ width:"100%", border:"0.5px solid #e5e7eb", borderRadius:8, padding:"10px", fontSize:13, fontFamily:"inherit", resize:"none", outline:"none", lineHeight:1.6, color:"#111", background:"#fff", boxSizing:"border-box" }}/>
      </div>
      <div>
        <div style={{ fontSize:10, fontWeight:700, color:"#888", textTransform:"uppercase", letterSpacing:0.8, marginBottom:6 }}>答案形式</div>
        <div style={{ display:"flex", gap:6 }}>
          {[["short","1行"],["standard","標準"],["detailed","詳細"]].map(([k,v])=>(
            <button key={k} onClick={()=>setMode(k)}
              style={{ flex:1, padding:"8px 4px", border:`0.5px solid ${mode===k?GREEN:"#e5e7eb"}`, borderRadius:8, fontSize:12, fontWeight:500, cursor:"pointer", background:mode===k?GREEN:"#fff", color:mode===k?"#fff":"#888", transition:"all 0.12s", fontFamily:"inherit" }}>
              {v}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div style={{ fontSize:10, fontWeight:700, color:"#888", textTransform:"uppercase", letterSpacing:0.8, marginBottom:6 }}>使用中の資料</div>
        <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
          {docs.filter(d=>activeIds.has(d.id)).map(d=>(
            <span key={d.id} style={{ fontSize:11, padding:"3px 8px", borderRadius:10, background:d.color+"18", color:d.color, fontWeight:500 }}>{d.courseName}</span>
          ))}
          {activeIds.size===0 && <span style={{ fontSize:11, color:"#aaa" }}>資料が選択されていません</span>}
        </div>
      </div>
      <button onClick={runPipeline} disabled={running}
        style={{ width:"100%", padding:12, background:running?"#ccc":GREEN, color:"#fff", border:"none", borderRadius:9, fontSize:14, fontWeight:700, cursor:running?"not-allowed":"pointer", fontFamily:"inherit", letterSpacing:0.3 }}>
        {running?"処理中…":"答案を作成する"}
      </button>
      {step>0 && step<5 && (
        <div style={{ display:"flex", gap:6, alignItems:"center" }}>
          <div style={{ display:"flex", gap:3 }}>{[0,1,2].map(i=><div key={i} style={{ width:5,height:5,borderRadius:"50%",background:GREEN,opacity:[1,0.5,0.2][i],animation:"pulse 1s infinite",animationDelay:`${i*0.2}s` }}/>)}</div>
          <span style={{ fontSize:11, color:GREEN, fontWeight:500 }}>{["","ページ検索中…","根拠抽出中…","答案生成中…","監査中…"][step]}</span>
        </div>
      )}
      {step===5 && <div style={{ fontSize:12, color:GREEN, fontWeight:600 }}>✓ 完了 — 「答案」タブで結果を確認</div>}
    </div>
  );

  const ResultPanel = (
    <div ref={centerRef} style={{ overflowY:"auto", padding:isMobile?"12px":"16px", flex:1, display:"flex", flexDirection:"column", gap:12 }}>
      {step===0 && (
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100%", textAlign:"center", gap:10, padding:24 }}>
          <div style={{ fontSize:36 }}>📋</div>
          <div style={{ fontSize:14, fontWeight:600, color:"#444" }}>授業資料から根拠づけた答案を作成します</div>
          <div style={{ fontSize:12, color:"#aaa", lineHeight:1.8 }}>資料を選び、問題を入力して<br/>「答案を作成する」を押してください</div>
          <div style={{ padding:"10px 14px", background:"#fff", borderRadius:9, border:"0.5px solid #e5e7eb", fontSize:12, color:"#555", textAlign:"left", lineHeight:1.8 }}>
            <b style={{ color:GREEN }}>サンプル問題：</b><br/>解糖系の律速酵素を述べ、その制御機構を説明せよ。
          </div>
        </div>
      )}

      {/* Step 1 */}
      {step>=1 && (
        <div style={{ background:"#fff", border:"0.5px solid #e5e7eb", borderRadius:10, padding:"13px 14px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
            <div style={{ width:20,height:20,borderRadius:"50%",background:step>=2?GREEN:"#BA7517",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:"#fff",flexShrink:0 }}>1</div>
            <div style={{ fontSize:13, fontWeight:600 }}>関連ページ検索</div>
            <div style={{ fontSize:11, color:"#aaa", marginLeft:"auto" }}>{searchResults.length}件</div>
          </div>
          {step===1 && <div style={{ color:"#aaa", fontSize:12 }}>検索中…</div>}
          {searchResults.slice(0,5).map(({doc,page,score,reasons})=>(
            <div key={page.id} style={{ display:"flex", alignItems:"flex-start", gap:8, padding:"8px 0", borderBottom:"0.5px solid #f3f4f6" }}>
              <ScoreBar score={score}/>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:"flex", flexWrap:"wrap", alignItems:"center", gap:5, marginBottom:2 }}>
                  <span style={{ fontSize:11, fontWeight:600, color:doc.color||GREEN }}>{doc.courseName}</span>
                  <span style={{ fontSize:11, color:"#aaa" }}>p.{page.pageNumber}</span>
                  {page.heading&&<span style={{ fontSize:10, color:"#bbb" }}>{page.heading}</span>}
                </div>
                <div style={{ fontSize:12, color:"#333", lineHeight:1.5 }}>{page.content.slice(0,90)}{page.content.length>90?"…":""}</div>
                {reasons.length>0 && (
                  <div style={{ marginTop:3, display:"flex", flexWrap:"wrap", gap:3 }}>
                    {reasons.map((r,i)=><span key={i} style={{ fontSize:9, background:"#f0f9f5", color:GREEN, padding:"1px 5px", borderRadius:8 }}>{r}</span>)}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Step 2 */}
      {step>=2 && (
        <div style={{ background:"#fff", border:"0.5px solid #e5e7eb", borderRadius:10, padding:"13px 14px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
            <div style={{ width:20,height:20,borderRadius:"50%",background:step>=3?GREEN:"#BA7517",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:"#fff",flexShrink:0 }}>2</div>
            <div style={{ fontSize:13, fontWeight:600 }}>根拠抽出・分類</div>
            <div style={{ fontSize:11, color:"#aaa", marginLeft:"auto" }}>直接根拠 {claims.filter(c=>c.claimType==="direct").length}件</div>
          </div>
          {step===2&&<div style={{ color:"#aaa",fontSize:12 }}>抽出中…</div>}
          {claims.slice(0,6).map(c=>(
            <div key={c.id} style={{ display:"flex", alignItems:"flex-start", gap:8, padding:"8px 0", borderBottom:"0.5px solid #f3f4f6" }}>
              <Badge type={c.claimType}/>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:"flex", flexWrap:"wrap", alignItems:"center", gap:5, marginBottom:3 }}>
                  <span style={{ fontSize:11, fontWeight:500, color:"#555" }}>{c.evidenceDoc.split(" ")[0]}</span>
                  <span style={{ fontSize:11, color:"#aaa" }}>p.{c.evidencePage}</span>
                  <ConfBadge level={c.confidence}/>
                </div>
                <div style={{ fontSize:12, color:"#333", lineHeight:1.5 }}>{c.text.slice(0,90)}{c.text.length>90?"…":""}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Step 3: Answer */}
      {step>=3&&answer&&(
        <div style={{ background:"#fff", border:"0.5px solid #e5e7eb", borderRadius:10, padding:"13px 14px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
            <div style={{ width:20,height:20,borderRadius:"50%",background:step>=4?GREEN:"#BA7517",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:"#fff",flexShrink:0 }}>3</div>
            <div style={{ fontSize:13, fontWeight:600 }}>答案（ドラフト）</div>
          </div>
          <div style={{ display:"flex", borderBottom:"0.5px solid #e5e7eb", marginBottom:12 }}>
            {[["short","1行"],["standard","標準"],["detailed","詳細"]].map(([k,v])=>(
              <button key={k} onClick={()=>setAnswerTab(k)}
                style={{ flex:1, padding:"6px 4px", fontSize:12, fontWeight:500, cursor:"pointer", background:"transparent", border:"none", borderBottom:answerTab===k?`2px solid ${GREEN}`:"2px solid transparent", color:answerTab===k?GREEN:"#aaa", fontFamily:"inherit" }}>
                {v}
              </button>
            ))}
          </div>
          <div style={{ background:"#f9fffe", borderRadius:8, padding:"12px", borderLeft:`2px solid ${GREEN}`, fontSize:13, lineHeight:1.9, whiteSpace:"pre-wrap", color:"#1a1a1a" }}>
            {answer[answerTab]||answer.short}
          </div>
          {answer.evidenceMap?.length>0&&(
            <div style={{ marginTop:12 }}>
              <div style={{ fontSize:10, fontWeight:700, color:"#aaa", textTransform:"uppercase", letterSpacing:0.6, marginBottom:6 }}>主張と根拠の対応</div>
              {answer.evidenceMap.map((em,i)=>(
                <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:6, padding:"5px 0", borderBottom:"0.5px solid #f3f4f6" }}>
                  <Badge type={em.claimType} small/>
                  <div style={{ fontSize:11, color:"#444", flex:1 }}>{em.claimSnippet}</div>
                  <div style={{ fontSize:10, color:"#aaa", flexShrink:0, whiteSpace:"nowrap" }}>{em.source}</div>
                </div>
              ))}
            </div>
          )}
          {audit?.excluded?.length>0&&(
            <div style={{ marginTop:10, background:"#f7f7f5", borderRadius:8, padding:"10px 12px" }}>
              <div style={{ fontSize:11, fontWeight:600, color:"#aaa", marginBottom:4 }}>本文から除外した内容（確信度低）</div>
              {audit.excluded.map((e,i)=><div key={i} style={{ fontSize:11, color:"#bbb", padding:"2px 0" }}>✕ {e}</div>)}
            </div>
          )}
        </div>
      )}

      {/* Step 4: Audit */}
      {step>=5&&audit&&(
        <div style={{ background:"#fff", border:"0.5px solid #e5e7eb", borderRadius:10, padding:"13px 14px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
            <div style={{ width:20,height:20,borderRadius:"50%",background:GREEN,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:"#fff",flexShrink:0 }}>4</div>
            <div style={{ fontSize:13, fontWeight:600 }}>監査結果</div>
            <div style={{ marginLeft:"auto", fontSize:11, fontWeight:600, color:audit.ok?GREEN:"#BA7517" }}>{audit.ok?"✓ 問題なし":"⚠ 要確認"}</div>
          </div>
          {audit.ok&&<div style={{ display:"flex", gap:8, alignItems:"flex-start", padding:"7px 0" }}><span style={{ fontSize:9,fontWeight:700,background:"#E1F5EE",color:"#085041",padding:"2px 6px",borderRadius:4 }}>OK</span><span style={{ fontSize:12,color:"#333" }}>資料に支持された答案です。</span></div>}
          {audit.unsupportedClaims.map((u,i)=><div key={i} style={{ display:"flex",gap:8,alignItems:"flex-start",padding:"7px 0",borderBottom:"0.5px solid #f3f4f6" }}><span style={{ fontSize:9,fontWeight:700,background:"#FAEEDA",color:"#633806",padding:"2px 6px",borderRadius:4,flexShrink:0 }}>警告</span><div><div style={{ fontSize:12,color:"#333" }}>{u}</div><div style={{ fontSize:10,color:"#aaa",marginTop:1 }}>根拠不足</div></div></div>)}
          {audit.missingPoints.map((m,i)=><div key={i} style={{ display:"flex",gap:8,alignItems:"flex-start",padding:"7px 0",borderBottom:"0.5px solid #f3f4f6" }}><span style={{ fontSize:9,fontWeight:700,background:"#E6F1FB",color:"#0C447C",padding:"2px 6px",borderRadius:4,flexShrink:0 }}>不足</span><div style={{ fontSize:12,color:"#333" }}>{m}</div></div>)}
          {audit.revisedAnswer&&<div style={{ marginTop:10,background:"#f0f9f5",borderRadius:8,padding:"10px 12px",borderLeft:`2px solid ${GREEN}` }}><div style={{ fontSize:11,fontWeight:600,color:GREEN,marginBottom:3 }}>修正版要旨</div><div style={{ fontSize:12,color:"#1a4a35",lineHeight:1.6 }}>{audit.revisedAnswer}</div></div>}
        </div>
      )}
    </div>
  );

  const RefsPanel = (
    <div style={{ padding:isMobile?"12px":"14px", overflowY:"auto", flex:1, display:"flex", flexDirection:"column", gap:12 }}>
      {/* Page refs */}
      <div style={{ background:"#fff", borderRadius:10, border:"0.5px solid #e5e7eb", padding:12 }}>
        <div style={{ fontSize:10,fontWeight:700,color:"#aaa",textTransform:"uppercase",letterSpacing:0.6,marginBottom:8 }}>参照ページ一覧</div>
        {!searchResults.length&&<div style={{ fontSize:12,color:"#ccc" }}>検索結果がありません</div>}
        {searchResults.slice(0,8).map(({doc,page,score})=>(
          <div key={page.id} style={{ display:"flex",alignItems:"flex-start",gap:8,padding:"7px 0",borderBottom:"0.5px solid #f3f4f6" }}>
            <div style={{ fontSize:11,fontWeight:700,color:doc.color||GREEN,minWidth:28,flexShrink:0 }}>p.{page.pageNumber}</div>
            <div>
              <div style={{ fontSize:12,color:"#333",lineHeight:1.5 }}>{page.content.slice(0,65)}{page.content.length>65?"…":""}</div>
              <div style={{ fontSize:10,color:"#bbb",marginTop:1 }}>{doc.courseName} · スコア {score}</div>
            </div>
          </div>
        ))}
      </div>
      {/* Claim map */}
      {claims.length>0&&(
        <div style={{ background:"#fff", borderRadius:10, border:"0.5px solid #e5e7eb", padding:12 }}>
          <div style={{ fontSize:10,fontWeight:700,color:"#aaa",textTransform:"uppercase",letterSpacing:0.6,marginBottom:8 }}>主張と根拠の対応</div>
          {claims.slice(0,8).map(c=>(
            <div key={c.id} style={{ padding:"7px 0",borderBottom:"0.5px solid #f3f4f6" }}>
              <div style={{ fontSize:12,color:"#333",lineHeight:1.5,marginBottom:4 }}>{c.text.slice(0,70)}{c.text.length>70?"…":""}</div>
              <div style={{ display:"flex",flexWrap:"wrap",alignItems:"center",gap:5 }}>
                <Badge type={c.claimType} small/>
                <span style={{ fontSize:10,color:"#aaa" }}>{c.evidenceDoc.split(" ")[0]} p.{c.evidencePage}</span>
                <ConfBadge level={c.confidence}/>
              </div>
            </div>
          ))}
        </div>
      )}
      {/* Stats */}
      {step>=5&&(
        <div style={{ background:"#fff", borderRadius:10, border:"0.5px solid #e5e7eb", padding:12 }}>
          <div style={{ fontSize:10,fontWeight:700,color:"#aaa",textTransform:"uppercase",letterSpacing:0.6,marginBottom:8 }}>統計</div>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:6 }}>
            {[["ヒット",`${searchResults.length}ページ`],["直接根拠",`${claims.filter(c=>c.claimType==="direct").length}件`],["間接根拠",`${claims.filter(c=>c.claimType==="indirect").length}件`],["除外",`${audit?.excluded?.length||0}件`]].map(([k,v])=>(
              <div key={k} style={{ background:"#f7f7f5",borderRadius:7,padding:"7px 9px" }}>
                <div style={{ fontSize:10,color:"#bbb" }}>{k}</div>
                <div style={{ fontSize:15,fontWeight:700,color:"#333" }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Guide */}
      <div style={{ background:"#fff", borderRadius:10, border:"0.5px solid #e5e7eb", padding:12 }}>
        <div style={{ fontSize:10,fontWeight:700,color:"#aaa",textTransform:"uppercase",letterSpacing:0.6,marginBottom:8 }}>根拠の見方</div>
        {[["direct","資料に明記あり"],["indirect","資料から推論"],["conflict","資料間で不一致"],["unsupported","資料外の知識"]].map(([k,v])=>(
          <div key={k} style={{ display:"flex",alignItems:"center",gap:6,marginBottom:5 }}>
            <Badge type={k} small/><span style={{ fontSize:11,color:"#666" }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (isMobile) {
    return (
      <div style={{ display:"flex", flexDirection:"column", height:"100vh", fontFamily:"'Hiragino Sans','Yu Gothic UI',sans-serif", fontSize:13, color:"#111", background:"#f7f7f5" }}>
        {/* Mobile header */}
        <div style={{ background:"#fff", borderBottom:"0.5px solid #e5e7eb", padding:"10px 14px", display:"flex", alignItems:"center", gap:8, flexShrink:0 }}>
          <div style={{ fontWeight:700, fontSize:14, letterSpacing:-0.3 }}><span style={{ color:GREEN }}>Med</span> Answer Builder</div>
          {step>0&&step<5&&<div style={{ fontSize:10,color:GREEN,fontWeight:500,marginLeft:"auto" }}>{["","検索中","抽出中","生成中","監査中"][step]}…</div>}
          {step===5&&<div style={{ fontSize:10,color:GREEN,fontWeight:600,marginLeft:"auto" }}>✓ 完了</div>}
        </div>

        {/* Tab content */}
        <div style={{ flex:1, overflow:"hidden", display:"flex", flexDirection:"column" }}>
          {mobileTab==="docs"   && DocPanel}
          {mobileTab==="input"  && InputPanel}
          {mobileTab==="result" && ResultPanel}
          {mobileTab==="refs"   && RefsPanel}
        </div>

        {/* Bottom nav */}
        <div style={{ display:"flex", background:"#fff", borderTop:"0.5px solid #e5e7eb", flexShrink:0 }}>
          {NAV_ITEMS.map(item=>(
            <button key={item.id} onClick={()=>setMobileTab(item.id)}
              style={{ flex:1, padding:"10px 4px 12px", display:"flex", flexDirection:"column", alignItems:"center", gap:2, background:"transparent", border:"none", cursor:"pointer", fontFamily:"inherit",
                borderTop:`2px solid ${mobileTab===item.id?GREEN:"transparent"}` }}>
              <span style={{ fontSize:18 }}>{item.icon}</span>
              <span style={{ fontSize:10, fontWeight:500, color:mobileTab===item.id?GREEN:"#aaa" }}>{item.label}</span>
              {item.id==="result"&&step===5&&<div style={{ width:6,height:6,borderRadius:"50%",background:GREEN,position:"absolute",marginTop:-2 }}/>}
            </button>
          ))}
        </div>

        {modal&&<DocModal doc={modal==="add"?null:modal} onClose={()=>setModal(null)} onSave={saveDoc}/>}
        <style>{`@keyframes pulse{0%,100%{opacity:0.25}50%{opacity:1}}`}</style>
      </div>
    );
  }

  // ─── Desktop layout ──────────────────────────────────────────────────────────
  return (
    <div style={{ display:"grid", gridTemplateColumns:"264px 1fr 272px", gridTemplateRows:"50px 1fr", height:"100vh", overflow:"hidden", fontFamily:"'Hiragino Sans','Yu Gothic UI',sans-serif", fontSize:13, color:"#111", background:"#f7f7f5" }}>
      {/* Header */}
      <div style={{ gridColumn:"1/-1", background:"#fff", borderBottom:"0.5px solid #e5e7eb", display:"flex", alignItems:"center", padding:"0 20px", gap:12 }}>
        <div style={{ fontWeight:700, fontSize:15, letterSpacing:-0.3 }}><span style={{ color:GREEN }}>Evidence</span>-first Med Answer Builder</div>
        <div style={{ fontSize:11,color:"#aaa",paddingLeft:12,borderLeft:"0.5px solid #e5e7eb" }}>授業資料に根拠づける答案作成</div>
        {step>0&&step<5&&(
          <div style={{ display:"flex",alignItems:"center",gap:6,marginLeft:12 }}>
            <div style={{ display:"flex",gap:3 }}>{[0,1,2].map(i=><div key={i} style={{ width:5,height:5,borderRadius:"50%",background:GREEN,opacity:[1,0.5,0.2][i],animation:"pulse 1s infinite",animationDelay:`${i*0.2}s` }}/>)}</div>
            <span style={{ fontSize:11,color:GREEN,fontWeight:500 }}>{["","ページ検索中…","根拠抽出中…","答案生成中…","監査中…"][step]}</span>
          </div>
        )}
        {step===5&&<div style={{ fontSize:11,color:GREEN,fontWeight:600,marginLeft:12 }}>✓ 完了</div>}
        <span style={{ marginLeft:"auto",fontSize:10,fontWeight:500,background:"#E1F5EE",color:"#085041",padding:"2px 9px",borderRadius:10 }}>ルールベース</span>
      </div>

      {/* Left */}
      <div style={{ background:"#fafaf8", borderRight:"0.5px solid #e5e7eb", overflowY:"auto", display:"flex", flexDirection:"column" }}>
        {DocPanel}
        <div style={{ height:"0.5px",background:"#e5e7eb" }}/>
        {InputPanel}
      </div>

      {/* Center */}
      {ResultPanel}

      {/* Right */}
      <div style={{ background:"#fafaf8", borderLeft:"0.5px solid #e5e7eb", overflowY:"auto" }}>
        {RefsPanel}
      </div>

      {modal&&<DocModal doc={modal==="add"?null:modal} onClose={()=>setModal(null)} onSave={saveDoc}/>}
      <style>{`@keyframes pulse{0%,100%{opacity:0.25}50%{opacity:1}}`}</style>
    </div>
  );
}
