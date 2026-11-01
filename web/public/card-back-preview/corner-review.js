import { designs } from "./corner-review-data.js";
import { cornerChoice,decorateSvg } from "./corner-art.js";

const storageKey="handandfoot.card-back-corner-review.v1";
const gallery=document.getElementById("gallery");
const dialog=document.getElementById("detail");
const url=new URL(location.href);
let mode=["light","dark","both"].includes(url.searchParams.get("mode"))?url.searchParams.get("mode"):"both";
let filter="all",family="all",current=designs[0].id,opener;
let saved={};
try { const value=JSON.parse(localStorage.getItem(storageKey)||"{}"); if(value&&typeof value==="object"&&!Array.isArray(value)) saved=value; } catch { /* Review still works for this visit. */ }
const decisions=Object.fromEntries(designs.map(design=>{
  const value=saved[design.id];
  const valid=Number.isSafeInteger(value?.revision)&&value.revision>=0&&value.revision<1000000;
  return [design.id,{revision:valid?value.revision:0,approved:valid&&value.approved===true}];
}));
const cache=new Map();
const number=design=>String(design.number).padStart(2,"0");
const escape=value=>String(value).replaceAll("&","&amp;").replaceAll('"',"&quot;").replaceAll("<","&lt;").replaceAll(">","&gt;");
const designFor=id=>designs.find(design=>design.id===id);
const announce=text=>{document.getElementById("announcement").textContent=text;};
function svgFor(design,theme) {
  const revision=decisions[design.id].revision;
  const key=`${design.id}:${theme}:${revision}`;
  if(!cache.has(key)) cache.set(key,decorateSvg(design.bases[theme],design,design.palettes[theme],revision));
  return cache.get(key);
}
function image(design,theme,className="") {
  const src="data:image/svg+xml;charset=utf-8,"+encodeURIComponent(svgFor(design,theme));
  return `<img class="${className}" data-theme="${theme}" src="${src}" width="240" height="336" alt="${escape(design.name)}, ${theme} mode with corner accents" draggable="false"/>`;
}
function visibleDesigns() {
  return designs.filter(design=>(family==="all"||design.family===family)&&(filter==="all"||(filter==="approved")===decisions[design.id].approved));
}
function persist() {
  try {localStorage.setItem(storageKey,JSON.stringify(decisions));document.getElementById("save-status").textContent="Your approvals are saved in this browser.";}
  catch {document.getElementById("save-status").textContent="Browser saving is unavailable. Use Save approvals to keep your choices.";}
}
gallery.innerHTML=designs.map(design=>`<article class="concept" data-id="${design.id}" data-approved="false">
  <div class="concept-header"><span class="number">${number(design)}</span><h3>${escape(design.name)}</h3></div>
  <button type="button" class="preview-pair" data-action="open" data-id="${design.id}" aria-label="Enlarge ${number(design)} ${escape(design.name)}">${["light","dark"].map(theme=>`<span class="swatch ${theme}">${image(design,theme)}<span class="swatch-label">${theme}</span></span>`).join("")}</button>
  <p class="corner-caption"></p>
  <div class="review-actions"><button type="button" class="approve" data-action="approve" data-id="${design.id}" aria-pressed="false">Approve corners</button><button type="button" class="another" data-action="another" data-id="${design.id}" aria-label="Try another corner design for ${number(design)} ${escape(design.name)}">Try another</button></div>
  <div class="review-history"><button type="button" class="previous-option" data-action="previous" data-id="${design.id}" aria-label="Previous corner option for ${number(design)} ${escape(design.name)}" disabled>Previous option</button><span class="review-status"></span></div>
</article>`).join("");
document.getElementById("collection-count").textContent=`${designs.length} selected card backs.`;
document.getElementById("all-count").textContent=designs.length;
document.title=`${designs.length} corner designs · Hand & Foot`;
for(const option of document.querySelectorAll("#family-filter option")) {
  if(option.value!=="all") option.textContent=`${option.value==="Emblems"?"Celestial & compass":option.value} · ${designs.filter(design=>design.family===option.value).length}`;
}
function updateCard(design,artChanged=false) {
  const state=decisions[design.id];
  const card=gallery.querySelector(`[data-id="${design.id}"]`);
  const choice=cornerChoice(design,state.revision);
  card.dataset.approved=String(state.approved);
  card.dataset.revision=String(state.revision);
  card.dataset.corner=choice.kind;
  card.querySelector(".corner-caption").textContent=`${choice.title} · Option ${state.revision+1}`;
  const approve=card.querySelector('[data-action="approve"]');
  approve.textContent=state.approved?"✓ Approved":"Approve corners";
  approve.setAttribute("aria-pressed",String(state.approved));
  approve.setAttribute("aria-label",`${state.approved?"Undo approval":"Approve corners"} for ${number(design)} ${design.name}`);
  card.querySelector('[data-action="previous"]').disabled=state.revision===0;
  card.querySelector(".review-status").textContent=state.approved?"Corners approved":"Needs review";
  if(artChanged) for(const img of card.querySelectorAll("img[data-theme]")) img.src="data:image/svg+xml;charset=utf-8,"+encodeURIComponent(svgFor(design,img.dataset.theme));
}
function update() {
  const approved=designs.filter(design=>decisions[design.id].approved);
  const visible=new Set(visibleDesigns().map(design=>design.id));
  for(const card of gallery.children) card.hidden=!visible.has(card.dataset.id);
  document.getElementById("progress-label").textContent=`${approved.length} of ${designs.length} approved`;
  document.getElementById("approval-progress").max=designs.length;
  document.getElementById("approval-progress").value=approved.length;
  document.getElementById("approved-count").textContent=approved.length;
  document.getElementById("pending-count").textContent=designs.length-approved.length;
  document.getElementById("download-approvals").disabled=approved.length===0;
  document.querySelectorAll("[data-filter]").forEach(button=>button.setAttribute("aria-pressed",String(button.dataset.filter===filter)));
  document.getElementById("result-count").textContent=`Showing ${visible.size} ${filter==="all"?"designs":filter==="approved"?"approved designs":"designs needing review"}${family==="all"?"":` · ${family.toLowerCase()}`}.`;
  const empty=document.getElementById("empty");
  empty.hidden=visible.size>0;
  empty.textContent=filter==="approved"?"No approved corners in this view yet. Choose Needs review to get started.":"All corners in this view are approved. Choose All to see them again.";
  document.getElementById("decisions-summary").textContent=approved.length?`Approved: ${approved.map(design=>`${number(design)} ${design.name} (option ${decisions[design.id].revision+1})`).join(" · ")}`:"No corner designs approved yet.";
  if(dialog.open) updateDetail(false);
}
function act(id,action) {
  const design=designFor(id),state=decisions[id];
  let artChanged=false;
  if(action==="approve") state.approved=!state.approved;
  if(action==="another") {state.revision++;state.approved=false;artChanged=true;}
  if(action==="previous"&&state.revision>0) {state.revision--;state.approved=false;artChanged=true;}
  persist();updateCard(design,artChanged);update();
  if(dialog.open&&id===current&&artChanged) updateDetail(true);
  announce(`${design.name}: ${state.approved?"corners approved":action==="approve"?"approval removed":`new corner option ${state.revision+1}, ${cornerChoice(design,state.revision).title.toLowerCase()}`}.`);
}
function updateDetail(artChanged=true) {
  const design=designFor(current),state=decisions[current],choice=cornerChoice(design,state.revision);
  document.getElementById("detail-family").textContent=`${design.family} · Corner review`;
  document.getElementById("detail-title").textContent=`${number(design)} · ${design.name}`;
  document.getElementById("detail-description").textContent=`${choice.title} · Option ${state.revision+1}. ${state.approved?"Approved.":"Approve these corners or try another design."}`;
  if(artChanged) document.getElementById("detail-pair").innerHTML=["light","dark"].map(theme=>`<section class="detail-swatch ${theme}"><h3>${theme} mode</h3>${image(design,theme,"detail-large")}<div class="game-size"><div>${image(design,theme,"opponent-size")}<span>Opponents · 56 px</span></div><div>${image(design,theme,"hand-size")}<span>Your hand · 76 px</span></div></div></section>`).join("");
  const approve=document.getElementById("detail-approve");
  approve.textContent=state.approved?"✓ Approved":"Approve corners";
  approve.setAttribute("aria-pressed",String(state.approved));
  approve.setAttribute("aria-label",`${state.approved?"Undo approval":"Approve corners"} for ${number(design)} ${design.name}`);
  document.getElementById("detail-previous-option").disabled=state.revision===0;
}
function openDetail(id,button) {current=id;opener=button;updateDetail();if(!dialog.open)dialog.showModal();}
function navigate(direction) {
  const visible=visibleDesigns();
  if(!visible.length){dialog.close();return;}
  const index=visible.findIndex(design=>design.id===current);
  current=visible[index<0?(direction>0?0:visible.length-1):(index+direction+visible.length)%visible.length].id;
  updateDetail();
}
gallery.addEventListener("click",event=>{
  const button=event.target.closest("button[data-action]");
  if(!button)return;
  if(button.dataset.action==="open")openDetail(button.dataset.id,button);else act(button.dataset.id,button.dataset.action);
});
document.querySelectorAll("[data-filter]").forEach(button=>button.addEventListener("click",()=>{filter=button.dataset.filter;update();}));
document.getElementById("family-filter").addEventListener("change",event=>{family=event.target.value;update();});
function setMode(){gallery.dataset.mode=mode;document.documentElement.dataset.theme=mode==="dark"?"dark":"light";document.querySelector(`input[name="mode"][value="${mode}"]`).checked=true;}
document.querySelectorAll('input[name="mode"]').forEach(input=>input.addEventListener("change",()=>{mode=input.value;setMode();url.searchParams.set("mode",mode);history.replaceState(null,"",url);}));
document.getElementById("preview-size").addEventListener("change",event=>{gallery.dataset.size=event.target.value;});
document.getElementById("detail-approve").addEventListener("click",()=>act(current,"approve"));
document.getElementById("detail-another").addEventListener("click",()=>act(current,"another"));
document.getElementById("detail-previous-option").addEventListener("click",()=>act(current,"previous"));
document.getElementById("previous").addEventListener("click",()=>navigate(-1));
document.getElementById("next").addEventListener("click",()=>navigate(1));
document.getElementById("close-detail").addEventListener("click",()=>dialog.close());
dialog.addEventListener("click",event=>{if(event.target!==dialog)return;const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();});
dialog.addEventListener("keydown",event=>{if(event.key==="ArrowLeft"||event.key==="ArrowRight"){event.preventDefault();navigate(event.key==="ArrowLeft"?-1:1);}});
dialog.addEventListener("close",()=>{if(opener?.closest("article")?.hidden)document.querySelector(`[data-filter="${filter}"]`).focus();else opener?.focus();});
document.getElementById("download-approvals").addEventListener("click",()=>{
  const approved=designs.filter(design=>decisions[design.id].approved).map(design=>({id:design.id,number:design.number,name:design.name,option:decisions[design.id].revision+1,corner:cornerChoice(design,decisions[design.id].revision),lightSvg:svgFor(design,"light"),darkSvg:svgFor(design,"dark")}));
  const blob=new Blob([JSON.stringify({collection:"Hand & Foot corner approvals",approved},null,2)],{type:"application/json"});
  const downloadUrl=URL.createObjectURL(blob),link=document.createElement("a");
  link.href=downloadUrl;link.download="hand-and-foot-approved-corners.json";link.click();setTimeout(()=>URL.revokeObjectURL(downloadUrl),1000);
  announce(`${approved.length} approved corner designs saved, with light and dark artwork.`);
});
for(const design of designs)updateCard(design);
setMode();update();
