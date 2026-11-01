const group = (transform,art) => `<g transform="${transform}">${art}</g>`;
const line = (d,color,width=2) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
const fill = (d,color) => `<path d="${d}" fill="${color}"/>`;
const dot = (x,y,r,color) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}"/>`;
const oval = (x,y,rx,ry,color,rotation=0) => group(`rotate(${rotation} ${x} ${y})`,`<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${color}"/>`);
const diamond = (x,y,r,color) => fill(`M${x} ${y-r} ${x+r*.65} ${y} ${x} ${y+r} ${x-r*.65} ${y}Z`,color);
const heart = color => fill("M0 5C-3 2-6-1-4-4C-2-6 0-4 0-3C1-6 5-6 5-2C5 1 2 3 0 5Z",color);
const spade = color => fill("M0-6C-2-3-6-1-5 2C-4 5-1 4 0 2L-2 7H2L0 2C1 4 4 5 5 2C6-1 2-3 0-6Z",color);
const club = color => fill("M-1 6H1L0 2C2 5 6 3 5 0C5-3 2-4 1-2C5-7-5-7-1-2C-2-4-5-3-5 0C-6 3-2 5 0 2Z",color);
const leaf = color => fill("M0 0Q-2-9 8-13Q12-4 0 0Z",color);
const names = {
  spades:"Tiny spades",hearts:"Little hearts",diamonds:"Diamond points",clubs:"Small clubs",dots:"Three gold dots",
  bracket:"Bookbinder brackets",curl:"Fine curled corners",crown:"Little crowns",bell:"Jester bells",beads:"Chip beads",
  fan:"Folded page fans",page:"Turned page corners",petals:"Tiny petal flowers",pleat:"Concertina folds",stack:"Gilded page edges",
  moon:"Crescents & stars",flame:"Candle glints",butterfly:"Small folded wings",sprig:"Delicate sprigs",seal:"Tiny seal marks",
  star:"Four-point stars",leaves:"Paired leaves",fern:"Little fern tips",ginkgo:"Ginkgo fans",clover:"Four-leaf corners",
  laurel:"Laurel tips",acorn:"Little acorns",jasmine:"Jasmine blossoms",lotus:"Lotus petals",compass:"Compass points",
};
// Each sequence belongs to its central design; revisions vary shape, spacing and weight.
const plans = {
  "01-royal-fan":["spades","fan","diamonds","dots"],
  "04-heart-locket":["hearts","curl","beads","diamonds"],
  "05-diamond-cut":["diamonds","bracket","dots","star"],
  "07-suit-ribbon":["curl","hearts","clubs","dots"],
  "08-the-cut":["bracket","diamonds","page","dots"],
  "09-trump-crest":["clubs","crown","diamonds","curl"],
  "10-jokers-bells":["bell","crown","star","dots"],
  "11-house-chip":["beads","dots","diamonds","bracket"],
  "13-roulette-rose":["dots","star","beads","curl"],
  "17-club-lounge":["clubs","curl","beads","diamonds"],
  "21-open-book":["page","bracket","fan","dots"],
  "28-page-rosette":["petals","fan","leaves","dots"],
  "29-seven-card-book":["fan","page","diamonds","bracket"],
  "31-grand-folio":["bracket","page","seal","dots"],
  "33-concertina":["pleat","fan","bracket","diamonds"],
  "36-between-bookends":["stack","bracket","dots","page"],
  "37-midnight-reader":["moon","star","dots","page"],
  "38-by-candlelight":["flame","star","dots","curl"],
  "40-paper-heart":["hearts","page","curl","dots"],
  "41-literary-butterfly":["butterfly","leaves","petals","dots"],
  "42-story-tree":["sprig","leaves","laurel","dots"],
  "43-pressed-pages":["leaves","sprig","page","laurel"],
  "47-chapter-seal":["seal","hearts","bracket","dots"],
  "49-page-compass":["star","page","diamonds","dots"],
  "51-golf-leaf-pair":["leaves","sprig","dots","curl"],
  "52-golf-fern-sprig":["fern","sprig","leaves","dots"],
  "53-golf-ginkgo":["ginkgo","fan","dots","leaves"],
  "54-golf-four-leaf":["clover","petals","dots","curl"],
  "55-golf-laurel-seal":["laurel","sprig","leaves","dots"],
  "56-golf-acorn":["acorn","leaves","dots","sprig"],
  "57-golf-jasmine":["jasmine","petals","leaves","dots"],
  "58-golf-lotus":["lotus","petals","dots","curl"],
  "64-golf-celestial-seal":["moon","star","dots","curl"],
  "65-golf-north-star":["star","diamonds","dots","bracket"],
  "66-golf-compass":["compass","star","diamonds","dots"],
};
function randomFor(seed) {
  let state=2166136261;
  for (const char of seed) state=Math.imul(state^char.charCodeAt(0),16777619);
  return () => { state=(state+0x6d2b79f5)|0; let t=Math.imul(state^(state>>>15),1|state); t^=t+Math.imul(t^(t>>>7),61|t); return ((t^(t>>>14))>>>0)/4294967296; };
}
export function cornerChoice(design,revision=0) {
  const plan=plans[design.id];
  if (!plan) throw new Error(`No corner plan for ${design.id}`);
  const random=randomFor(`${design.id}:${revision}`);
  const kind=plan[revision%plan.length];
  return {kind,title:names[kind],revision,inset:+(32+random()*3).toFixed(2),size:+((.86+random()*.2)*1.35).toFixed(3),weight:+(1.8+random()*.35).toFixed(2),bend:+(3.5+random()*2.5).toFixed(2),dotRadius:+(1.35+random()*.5).toFixed(2),rotation:+(-9+random()*18).toFixed(2)};
}
function motif(choice,p) {
  const {kind,weight:w,bend:b,dotRadius:r}=choice;
  const a=p.gold,ink=p.ink;
  const spark=(x,y,size=4) => group(`translate(${x} ${y})`,fill(`M0-${size}Q1-1 ${size} 0Q1 1 0 ${size}Q-1 1-${size} 0Q-1-1 0-${size}Z`,a));
  const littleLeaf=(x,y,rotation=0,scale=.65) => group(`translate(${x} ${y}) rotate(${rotation}) scale(${scale})`,leaf(ink));
  switch(kind) {
    case "spades": return group("translate(5 5) scale(.72)",spade(ink))+dot(14,2,r,a);
    case "hearts": return group("translate(5 5) scale(.85)",heart(ink))+dot(14,2,r,a);
    case "clubs": return group("translate(5 5) scale(.8)",club(ink))+line("M0 14H9",a,w);
    case "diamonds": return diamond(5,5,4.7,ink)+line(`M1 15H${9+b}`,a,w)+dot(14,1,r,a);
    case "dots": return dot(2,2,r+0.6,a)+dot(10,2,r,a)+dot(2,10,r,a);
    case "bracket": return line(`M0 ${11+b}V0H${11+b}`,a,w)+diamond(5,5,2.7,ink);
    case "curl": return line(`M0 15V${b}Q0-3 ${b+5} 1Q14 4 9 7Q6 9 5 6M0 0H15`,a,w)+dot(15,13,r,ink);
    case "crown": return line("M0 4 4 8 8 0 12 8 16 4 14 13H2Z",a,w)+dot(8,0,r,ink);
    case "bell": return line("M3 12Q2 5 8 3Q14 5 13 12ZM1 13H15",a,w)+dot(8,15,r,ink)+dot(8,1,r,a);
    case "beads": return line(`M0 ${10+b}V0H${10+b}`,a,w)+dot(6,6,r+0.5,ink)+dot(12,6,r,a)+dot(6,12,r,a);
    case "fan": return line("M1 15 2 2 8 0 14 2 15 15M8 0V15M2 2 8 15 14 2",a,w);
    case "page": return line(`M0 ${12+b}V0H${12+b}M4 12V4H12`,a,w)+line("M10 4 4 10",ink,w*.8);
    case "petals": return [0,90,180,270].map(angle=>group(`translate(7 7) rotate(${angle})`,oval(0,-4,2.4,4.3,ink))).join("")+dot(7,7,r,a);
    case "pleat": return line(`M0 ${12+b}V0L5 5 10 0 15 5V15M5 5V12M10 0V10`,a,w);
    case "stack": return line(`M0 2H${10+b}M0 7H${7+b}M0 12H${4+b}`,a,w)+dot(14,14,r,ink);
    case "moon": return fill("M9 0A7 7 0 1 0 14 12A8 8 0 0 1 9 0Z",a)+spark(16,1,2.8);
    case "flame": return line("M7 15V11M2 16H12",a,w)+fill("M7 10Q0 6 7-2Q14 6 7 10Z",ink)+spark(16,3,2.6);
    case "butterfly": return line("M7 3V15M7 3 4 0M7 3 10 0",a,w)+oval(3,6,2.6,4.3,ink,-30)+oval(11,6,2.6,4.3,ink,30);
    case "sprig": return line(`M0 16Q${b} 6 12 0`,a,w)+littleLeaf(3,12,-60,.55)+littleLeaf(6,7,40,.55)+littleLeaf(11,2,5,.5);
    case "seal": return `<circle cx="7" cy="7" r="5.5" fill="none" stroke="${a}" stroke-width="${w}"/>`+group("translate(7 7) scale(.5)",heart(ink))+line("M2 11 0 17M11 11 15 16",a,w*.8);
    case "star": return spark(7,7,6)+dot(16,0,r,ink)+dot(0,16,r,ink);
    case "leaves": return line("M0 16 12 0",a,w)+littleLeaf(2,12,-46,.72)+littleLeaf(7,7,38,.72);
    case "fern": return line(`M2 16Q${b} 6 10-1`,a,w)+[4,9,14].map(y=>line(`M${12-y*.55} ${y}l-4-3M${12-y*.55} ${y}l5-1`,ink,w*.9)).join("");
    case "ginkgo": return fill("M7 10Q-2 6 0-1Q4-3 7 1Q10-3 14-1Q16 6 7 10Z",ink)+line("M7 10V17M7 9 3 2M7 9 11 2",a,w*.8);
    case "clover": return [0,90,180,270].map(angle=>group(`translate(7 7) rotate(${angle})`,fill("M0 0Q-8-3-5-7Q0-10 2-5Q6-1 0 0Z",ink))).join("")+dot(7,7,r,a);
    case "laurel": return line("M0 16Q-1 4 13 0",a,w)+littleLeaf(1,12,-75,.62)+littleLeaf(5,5,-10,.58)+littleLeaf(12,1,45,.53);
    case "acorn": return fill("M2 6H12V10Q7 17 2 10Z",ink)+line("M0 6Q7-2 14 6ZM7 1V-2",a,w)+dot(17,14,r,a);
    case "jasmine": return [0,72,144,216,288].map(angle=>group(`translate(7 7) rotate(${angle})`,oval(0,-3.5,1.9,3.5,ink))).join("")+dot(7,7,r,a);
    case "lotus": return fill("M7 13Q-1 10-1 4Q4 4 7 13ZM7 13Q15 10 15 4Q10 4 7 13ZM7 12Q1 5 7-2Q13 5 7 12Z",ink)+line("M0 16H14",a,w);
    case "compass": return fill("M7-2 10 5 17 7 10 9 7 16 4 9-3 7 4 5Z",ink)+line("M7-2V16M-3 7H17",a,w*.7)+dot(7,7,r,a);
    default: throw new Error(`Unknown corner motif ${kind}`);
  }
}
export function cornerMarkup(design,palette,revision=0) {
  const choice=cornerChoice(design,revision);
  const inset=choice.inset;
  const art=group(`rotate(${choice.rotation} 7 7) scale(${choice.size})`,motif(choice,palette));
  return `<g data-corner-design="${choice.kind}" data-corner-option="${revision}" aria-hidden="true">${[
    `translate(${inset} ${inset})`,
    `translate(${240-inset} ${inset}) scale(-1 1)`,
    `translate(${inset} ${336-inset}) scale(1 -1)`,
    `translate(${240-inset} ${336-inset}) rotate(180)`,
  ].map(transform=>group(transform,art)).join("")}</g>`;
}
export function decorateSvg(base,design,palette,revision=0) {
  return base.replace(/<\/svg>\s*$/,cornerMarkup(design,palette,revision)+"</svg>");
}
