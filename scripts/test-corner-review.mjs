import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import { JSDOM } from "jsdom";
import { designs } from "../web/public/card-back-preview/corner-review-data.js";
import { decorateSvg,cornerChoice } from "../web/public/card-back-preview/corner-art.js";

const root=new URL("../web/public/card-back-preview/",import.meta.url);
const html=readFileSync(new URL("corners.html",root),"utf8");
const bundle=buildSync({entryPoints:[fileURLToPath(new URL("corner-review.js",root))],bundle:true,format:"iife",write:false}).outputFiles[0].text;
const storageKey="handandfoot.card-back-corner-review.v1";
function page(saved) {
  const dom=new JSDOM(html,{url:"https://preview.test/corners.html?mode=both",runScripts:"outside-only"});
  const {window}=dom;
  if(saved!==undefined)window.localStorage.setItem(storageKey,saved);
  window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  window.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new window.Event("close"));};
  const downloads=[];
  window.URL.createObjectURL=blob=>{downloads.push(blob);return "blob:corner-review-test";};
  window.URL.revokeObjectURL=()=>{};
  window.HTMLAnchorElement.prototype.click=function(){};
  window.eval(bundle);
  return {dom,window,doc:window.document,downloads};
}
const a="01-royal-fan",b="04-heart-locket";
const card=(p,id)=>p.doc.querySelector(`article[data-id="${id}"]`);
const click=(p,id,action)=>card(p,id).querySelector(`[data-action="${action}"]`).click();
const count=p=>Number(p.doc.querySelector("#approved-count").textContent);
function withoutCorners(svg) {
  const dom=new JSDOM(svg,{contentType:"image/svg+xml"});
  dom.window.document.querySelector("[data-corner-design]")?.remove();
  const result=dom.window.document.documentElement.outerHTML;
  dom.window.close();
  return result;
}
const sourceSvg=img=>decodeURIComponent(img.src.slice(img.src.indexOf(",")+1));

assert.equal(designs.length,35);
assert.ok(designs.every(design=>![59,60,61,62,63].includes(design.number)),"Removed patterns must stay out of the review.");
for(const name of ["Celestial seal","North star","Compass"])assert.ok(designs.some(design=>design.name===name));
for(const design of designs) {
  for(const theme of ["light","dark"]) {
    const variants=new Set();
    for(let revision=0;revision<8;revision++) {
      const svg=decorateSvg(design.bases[theme],design,design.palettes[theme],revision);
      variants.add(svg);
      const dom=new JSDOM(svg,{contentType:"image/svg+xml"});
      const doc=dom.window.document;
      const accents=doc.querySelector("[data-corner-design]");
      assert.equal(accents.children.length,4,"A new option must have four matching corners.");
      const frames=[...doc.documentElement.children].filter(node=>node.localName==="rect"&&node.getAttribute("fill")==="none");
      assert.equal(frames.length,1,"Corner variants must preserve one card border.");
      const allFrames=[...doc.querySelectorAll('rect[fill="none"][stroke]')].filter(node=>Number(node.getAttribute("width"))>=180&&Number(node.getAttribute("height"))>=270);
      assert.equal(allFrames.length,1,"Imported art must not contain a second card frame.");
      assert.equal(withoutCorners(svg),design.bases[theme],"Generating corners must preserve all central artwork and colors.");
      assert.ok(!doc.querySelector("pattern"));
      dom.window.close();
    }
    assert.equal(variants.size,8,"Successive generated options must differ.");
  }
}

let p=page();
assert.equal(p.doc.querySelectorAll("article").length,35);
assert.equal(count(p),0);
assert.ok(p.doc.querySelector("#download-approvals").disabled);
const original=card(p,a).querySelector("img").src;
click(p,a,"approve");click(p,b,"approve");
assert.equal(count(p),2);
click(p,a,"another");
assert.equal(count(p),1,"Regenerating one card resets only its own approval.");
assert.equal(card(p,b).dataset.approved,"true");
assert.equal(card(p,a).dataset.revision,"1");
assert.notEqual(card(p,a).querySelector("img").src,original);
assert.equal(withoutCorners(sourceSvg(card(p,a).querySelector("img"))),designs.find(d=>d.id===a).bases.light);
p.doc.querySelector('[data-filter="approved"]').click();
assert.equal(p.doc.querySelectorAll("article:not([hidden])").length,1);
const saved=p.window.localStorage.getItem(storageKey);
p.dom.window.close();
p=page(saved);
assert.equal(count(p),1,"Approvals must survive reloads.");
assert.equal(card(p,a).dataset.revision,"1","Generated options must survive reloads.");
click(p,a,"previous");
assert.equal(card(p,a).querySelector("img").src,original,"Previous option restores the exact earlier artwork.");
click(p,a,"approve");click(p,a,"approve");
assert.equal(count(p),1,"Undo approval returns a card to review.");
const select=p.doc.querySelector("#family-filter");
select.value="Plants";select.dispatchEvent(new p.window.Event("change"));
assert.equal(p.doc.querySelectorAll("article:not([hidden])").length,8);
select.value="Emblems";select.dispatchEvent(new p.window.Event("change"));
assert.equal(p.doc.querySelectorAll("article:not([hidden])").length,3);
select.value="all";select.dispatchEvent(new p.window.Event("change"));
click(p,"37-midnight-reader","open");
p.doc.querySelector("#detail-another").click();
assert.equal(card(p,"37-midnight-reader").dataset.revision,"1");
assert.match(p.doc.querySelector("#detail-description").textContent,/Option 2/);
p.doc.querySelector("#detail-previous-option").click();
assert.equal(card(p,"37-midnight-reader").dataset.revision,"0");
p.doc.querySelector("#detail-approve").click();
assert.equal(count(p),2);
p.doc.querySelector("#close-detail").click();
click(p,"66-golf-compass","open");
p.doc.querySelector("#next").click();
assert.match(p.doc.querySelector("#detail-title").textContent,/01 · Royal fan/);
p.doc.querySelector("#close-detail").click();
p.doc.querySelector("#download-approvals").click();
assert.equal(p.downloads.length,1);
const exported=JSON.parse(await new Promise((resolve,reject)=>{
  const reader=new p.window.FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsText(p.downloads[0]);
}));
assert.equal(exported.approved.length,2,"Exports contain only approved designs.");
for(const design of exported.approved) {
  assert.match(design.lightSvg,/data-corner-design=/);
  assert.match(design.darkSvg,/data-corner-design=/);
  assert.equal(design.option,design.corner.revision+1);
}
p.dom.window.close();
const corrupt=page('{"01-royal-fan":{"revision":-3,"approved":true}}');
assert.equal(card(corrupt,a).dataset.revision,"0");assert.equal(count(corrupt),0);corrupt.dom.window.close();
console.log(`Passed: ${designs.length} card backs, 560 SVG variants, isolated approvals, regeneration, persistence, undo, filtering, detail navigation, and approved artwork export.`);
