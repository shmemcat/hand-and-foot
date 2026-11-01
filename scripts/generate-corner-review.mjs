import { mkdirSync,readFileSync,writeFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { palettes } from "./card-back-palettes.mjs";
import { designs as selected } from "../web/public/card-back-preview/final-designs.js";
import { decorateSvg,cornerChoice } from "../web/public/card-back-preview/corner-art.js";

const destination=new URL("../web/public/card-back-preview/",import.meta.url);
mkdirSync(new URL("assets/corners/",destination),{recursive:true});
const designs=selected.map(design=>{
  const palette=palettes.find(item=>item.name===design.palette);
  if (!palette) throw new Error(`Unknown palette ${design.palette}`);
  const bases={};
  for (const theme of ["light","dark"]) {
    const source=readFileSync(new URL(`assets/${design.id}-${theme}.svg`,destination),"utf8");
    const dom=new JSDOM(source,{contentType:"image/svg+xml"});
    const root=dom.window.document.documentElement;
    if (root.querySelector("pattern")) throw new Error(`Patterned back still selected: ${design.name}`);
    // Replace the old occasional corner brackets; retain the single gold frame.
    for (const child of [...root.children]) {
      if (child.localName==="g" && child.firstElementChild?.localName==="path" && child.firstElementChild.getAttribute("d")?.startsWith("M-89-123")) child.remove();
    }
    bases[theme]=root.outerHTML;
    dom.window.close();
    writeFileSync(new URL(`assets/corners/${design.id}-${theme}.svg`,destination),decorateSvg(bases[theme],design,palette[theme],0)+"\n");
  }
  return {...design,palettes:palette,bases,initialCorner:cornerChoice(design,0).title};
});
writeFileSync(new URL("corner-review-data.js",destination),`export const designs = ${JSON.stringify(designs,null,2)};\n`);
console.log(`Prepared ${designs.length} selected backs and ${designs.length*2} initial corner previews.`);
