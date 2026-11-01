import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { palettes, CENTER_ART_SCALE } from "./card-back-palettes.mjs";

// Run after generate-card-back-concepts.mjs. Golf remains the source of the artwork.
const golfRoot = new URL("../../golf/",import.meta.url);
const destination = new URL("../web/public/card-back-preview/",import.meta.url);
mkdirSync(new URL("assets/",destination),{recursive:true});
const read = url => readFileSync(url,"utf8");
const readDesigns = url => {
  const source = read(url);
  return JSON.parse(source.slice(source.indexOf("["),source.lastIndexOf("]")+1));
};
const catalogSource = read(new URL("web/src/lib/cardBacks.ts",golfRoot));
const catalog = JSON.parse(catalogSource.match(/export const CARD_BACKS = (\[[\s\S]*?\]) as const;/)[1]);
const plants = catalog.filter(design => design.group === "Botanicals");
const emblems = [
  {id:"celestial-seal",name:"Celestial seal",group:"Emblems",number:52,collection:"refined",galleryId:"52-celestial-seal"},
  {id:"north-star",name:"North star",group:"Emblems",number:40,collection:"large",galleryId:"40-north-star"},
  {id:"compass",name:"Compass",group:"Emblems",number:18,collection:"original",galleryId:"18-compass"},
];
const collectionFiles = {original:"designs.js",large:"designs-large.js",refined:"designs-refined.js",patterns:"designs-patterns.js"};
const sourceCollections = Object.fromEntries(Object.entries(collectionFiles).map(([key,file]) => [key,readDesigns(new URL(`web/public/card-back-preview/${file}`,golfRoot))]));

function adaptArtwork(source,p,theme,name) {
  const replacements = {
    "#c6d5be":p.base,"#344c40":p.base,
    "#849d87":p.ink,"#7c9885":p.ink,"#cf9f9c":p.ink,
    "#a8bea4":p.soft,"#e4b4ad":p.soft,"#faf6ee":p.gold,
  };
  const recolored = source.replace(/#[\da-f]{6}\b/gi,color => {
    const replacement = replacements[color.toLowerCase()];
    if (!replacement) throw new Error(`Unmapped Golf color ${color} in ${name}`);
    return replacement;
  });
  const dom = new JSDOM(recolored,{contentType:"image/svg+xml"});
  const doc = dom.window.document;
  const root = doc.documentElement;
  const svgElement = (name,attributes) => {
    const element = doc.createElementNS("http://www.w3.org/2000/svg",name);
    for (const [key,value] of Object.entries(attributes)) element.setAttribute(key,String(value));
    return element;
  };
  // Some Golf art definitions contain another card-sized outline. Keep one frame.
  for (const frame of root.querySelectorAll('rect[fill="none"][stroke]')) {
    if (Number(frame.getAttribute("width")) >= 180 && Number(frame.getAttribute("height")) >= 270) frame.remove();
  }
  const children = [...root.children];
  // The first full-card rectangle is the paper edge. Pattern rectangles are art.
  const paper = children.find(element => element.localName === "rect" && element.getAttribute("width") === "240" && element.getAttribute("height") === "336");
  const background = children.find(element => element.localName === "rect" && element.getAttribute("x") === "7" && element.getAttribute("width") === "226");
  if (!paper || !background) throw new Error(`Missing card backgrounds in ${name}`);
  paper.setAttribute("fill","#FAF6EE");
  background.setAttribute("fill",p.base);
  const title = root.querySelector("title");
  title.textContent = `${name} — ${theme} Hand & Foot card back`;
  title.id = "title";
  root.setAttribute("role","img");
  root.setAttribute("aria-labelledby","title");
  const isPattern = Boolean(root.querySelector("pattern"));
  const art = svgElement("g",isPattern
    ? {"data-artwork":"pattern"}
    : {"data-artwork":"center",transform:`translate(120 168) scale(${Number((0.7*CENTER_ART_SCALE).toFixed(3))}) translate(-120 -168)`});
  for (const element of children) {
    if (element === paper || element === background || ["title","defs"].includes(element.localName)) continue;
    const edgeFrame = element.localName === "rect" && Number(element.getAttribute("width")) >= 180 && Number(element.getAttribute("height")) >= 280 && element.getAttribute("fill") === "none" && element.hasAttribute("stroke");
    if (edgeFrame) element.remove(); else art.append(element);
  }
  root.append(art);
  root.append(svgElement("rect",{x:14,y:14,width:212,height:308,rx:8,fill:"none",stroke:p.gold,"stroke-width":2.2}));
  const result = root.outerHTML+"\n";
  dom.window.close();
  return result;
}

const golfDesigns = [...plants,...emblems].map((design,index) => {
  const number = 51+index;
  const id = `${number}-golf-${design.id}`;
  const palette = palettes[index%palettes.length];
  const original = sourceCollections[design.collection].find(item => item.id === design.galleryId);
  if (!original) throw new Error(`Missing source metadata for ${design.name}`);
  for (const theme of ["light","dark"]) {
    const source = read(new URL(`web/public/card-back-preview/assets/${design.galleryId}-${theme}.svg`,golfRoot));
    writeFileSync(new URL(`assets/${id}-${theme}.svg`,destination),adaptArtwork(source,palette[theme],theme,design.name));
  }
  return {id,number,name:design.name,family:design.group==="Botanicals"?"Plants":"Emblems",collection:design.group==="Botanicals"?"golf-botanicals":"golf-emblems",source:"Golf",sourceId:design.galleryId,sourceNumber:design.number,palette:palette.name,description:original.description};
});
writeFileSync(new URL("golf-designs.js",destination),`export const designs = ${JSON.stringify(golfDesigns,null,2)};\n`);
const shortlist = JSON.parse(read(new URL("final-shortlist.json",destination))).picks;
const handDesigns = readDesigns(new URL("designs.js",destination));
const selectedIds = new Set(shortlist.map(design => design.id));
const selected = handDesigns.filter(design => selectedIds.has(design.id));
if (selected.length !== selectedIds.size) throw new Error("Some saved shortlist designs are missing from the collection.");
const excludedIds = new Set(JSON.parse(read(new URL("final-exclusions.json",destination))).ids);
const final = [...selected.map(design => ({...design,number:Number(design.id.slice(0,2)),source:"Your shortlist"})),...golfDesigns].filter(design => !excludedIds.has(design.id));
const finalPickCount = final.filter(design => design.source === "Your shortlist").length;
const finalPlantCount = final.filter(design => design.family === "Plants").length;
const finalEmblemCount = final.filter(design => design.family === "Emblems").length;
writeFileSync(new URL("final-designs.js",destination),`export const designs = ${JSON.stringify(final,null,2)};\n`);
writeFileSync(new URL("final-list.json",destination),JSON.stringify({shortlisted:finalPickCount,golfPlants:finalPlantCount,golfEmblems:finalEmblemCount,total:final.length,designs:final},null,2)+"\n");
console.log(`Final collection: ${finalPickCount} shortlisted + ${finalPlantCount} plants + ${finalEmblemCount} emblems = ${final.length}.`);
