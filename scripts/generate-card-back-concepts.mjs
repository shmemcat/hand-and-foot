import { mkdirSync, writeFileSync } from "node:fs";

// Review collection; run with `node scripts/generate-card-back-concepts.mjs`.
const destination = new URL("../web/public/card-back-preview/", import.meta.url);
mkdirSync(new URL("assets/", destination), { recursive: true });

const palettes = [
  { name: "Rose clay / Petal", light: { base: "#C1948A", ink: "#51303A", gold: "#ECD2A0", soft: "#E9BDB4" }, dark: { base: "#4B303B", ink: "#E5B1B6", gold: "#C7AA6A", soft: "#76515F" } },
  { name: "Parchment / Burgundy", light: { base: "#E9DCCB", ink: "#613A43", gold: "#A6874C", soft: "#D0AAA2" }, dark: { base: "#572D3B", ink: "#F1DAD0", gold: "#D2B477", soft: "#865162" } },
  { name: "Blush / Plum", light: { base: "#DCAAA2", ink: "#613A43", gold: "#FAE2B5", soft: "#EFC9BC" }, dark: { base: "#402A33", ink: "#DCAAA2", gold: "#C7AA6A", soft: "#704653" } },
  { name: "Oat / Wine", light: { base: "#D5BEA5", ink: "#613A43", gold: "#FAE4BD", soft: "#E9D6BB" }, dark: { base: "#633B47", ink: "#F4E8DD", gold: "#D2B477", soft: "#95616C" } },
  { name: "Dusty rose / Cocoa", light: { base: "#CFA8A4", ink: "#51303A", gold: "#F6DBAB", soft: "#E8C4B9" }, dark: { base: "#392A2F", ink: "#E4B5AE", gold: "#C7AA6A", soft: "#70515A" } },
];
const g = (transform, art) => `<g transform="${transform}">${art}</g>`;
const path = (d, color, w = 2.6, fill = "none") => `<path d="${d}" stroke="${color}" stroke-width="${w}" fill="${fill}" stroke-linecap="round" stroke-linejoin="round"/>`;
const shape = (d, color) => `<path d="${d}" fill="${color}"/>`;
const rect = (x, y, w, h, r, color, fill = "none", sw = 2.6) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${color}" stroke-width="${sw}"/>`;
const circle = (x, y, r, color, fill = "none", sw = 2.6) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="${color}" stroke-width="${sw}"/>`;
const ellipse = (rx, ry, color, sw = 2.2) => `<ellipse rx="${rx}" ry="${ry}" fill="none" stroke="${color}" stroke-width="${sw}"/>`;
const repeat = (n, draw) => Array.from({ length: n }, (_, i) => draw(i)).join("");
const twoWay = art => art + g("rotate(180)", art);
const diamond = (x, y, r, color) => g(`translate(${x} ${y})`, shape(`M0 ${-r} ${r * .65} 0 0 ${r} ${-r * .65} 0Z`, color));
const heart = "M0 13C-6 7-19-1-15-10C-12-17-4-16 0-10C4-16 12-17 15-10C19-1 6 7 0 13Z";
const spade = "M0-18C-5-11-18-4-16 5C-14 14-5 13-1 8L-5 19H5L1 8C5 13 14 14 16 5C18-4 5-11 0-18Z";
const club = "M-3 18H3L1 7C5 15 17 11 17 3C17-5 9-9 5-5C14-19-14-19-5-5C-9-9-17-5-17 3C-17 11-5 15-1 7Z";
function suit(kind, x, y, scale, color, rotation = 0) {
  const d = { heart, spade, club, diamond: "M0-19 13 0 0 19-13 0Z" }[kind];
  return g(`translate(${x} ${y}) rotate(${rotation}) scale(${scale})`, shape(d, color));
}
function card(x, y, rotation, kind, p, scale = 1) {
  return g(`translate(${x} ${y}) rotate(${rotation}) scale(${scale})`, rect(-22, -32, 44, 64, 5, p.ink, p.base) + suit(kind, 0, 0, .62, p.ink) + diamond(-15, -23, 2.4, p.gold) + diamond(15, 23, 2.4, p.gold));
}
function chip(x, y, r, p, pip = "diamond") {
  return g(`translate(${x} ${y})`, circle(0, 0, r, p.gold, p.base, 3) + circle(0, 0, r * .72, p.ink, "none", 2) + repeat(8, i => g(`rotate(${i * 45})`, path(`M0 ${-r + 2}V${-r + 9}`, p.ink, 5))) + suit(pip, 0, 0, r / 48, p.ink));
}
function book(x, y, scale, p) {
  return g(`translate(${x} ${y}) scale(${scale})`, path("M0-16Q-15-28-35-22V22Q-15 16 0 29Q15 16 35 22V-22Q15-28 0-16Z", p.ink, 2.8, p.base) + path("M0-16V29M-28-14Q-14-17-6-10M-28-5Q-15-8-6-1M6-10Q14-17 28-14M6-1Q15-8 28-5", p.gold, 2.2) + path("M-40-18V28Q-16 24 0 35Q16 24 40 28V-18", p.ink, 2.2));
}
function closedBook(x, y, p, scale = 1) {
  return g(`translate(${x} ${y}) scale(${scale})`, rect(-25, -34, 50, 68, 5, p.ink, p.base) + path("M-15-34V34M-25 23H25M-20 29H21", p.gold, 2) + rect(-7, -23, 24, 34, 2, p.gold, "none", 1.8) + diamond(5, -6, 7, p.ink));
}
const centerGem = p => diamond(0, 0, 6, p.gold);
const smallRule = (y, p) => path(`M-25 ${y}H-7M7 ${y}H25`, p.gold, 2) + diamond(0, y, 4, p.gold);

const designs = [
  { id: "01-royal-fan", name: "Royal fan", family: "Cards", palette: 0, description: "Two generous fans of three cards, joined by a gold diamond.", draw: p => twoWay(card(-21, -40, -22, "heart", p, .9) + card(0, -44, 0, "spade", p, .9) + card(21, -40, 22, "club", p, .9)) + centerGem(p) },
  { id: "02-four-suit-seal", name: "Four-suit seal", family: "Cards", palette: 1, description: "A compact oval seal with all four suit silhouettes and a clean open field.", draw: p => ellipse(56, 71, p.gold) + twoWay(suit("spade", -34, -25, .68, p.ink) + suit("heart", -12, -49, .68, p.ink) + suit("club", 15, -48, .68, p.ink) + suit("diamond", 35, -23, .68, p.ink)) + centerGem(p) + smallRule(-84, p) + smallRule(84, p) },
  { id: "03-double-ace", name: "Double ace", family: "Cards", palette: 2, description: "A pair of oversized spade cards, turned in opposite directions.", draw: p => twoWay(card(-11, -23, -14, "spade", p, 1.25)) + diamond(38, -63, 5, p.gold) + diamond(-38, 63, 5, p.gold) },
  { id: "04-heart-locket", name: "Heart locket", family: "Cards", palette: 3, description: "Two hearts in a delicate elongated locket, with tiny gold clasps.", draw: p => ellipse(43, 70, p.gold, 3) + ellipse(36, 61, p.ink, 1.7) + twoWay(suit("heart", 0, -29, 1.25, p.ink) + diamond(0, -70, 5, p.gold)) + centerGem(p) },
  { id: "05-diamond-cut", name: "Diamond cut", family: "Cards", palette: 4, description: "An interlocking trio of cut diamonds, graphic and particularly clear at small sizes.", draw: p => path("M0-76 47 0 0 76-47 0ZM0-58 35 0 0 58-35 0Z", p.gold, 2.8) + path("M-28-38 2 0-28 38-58 0ZM28-38 58 0 28 38-2 0Z", p.ink, 3, p.base) + diamond(0, 0, 22, p.ink) },
  { id: "06-crowned-spade", name: "Crowned spade", family: "Cards", palette: 0, description: "A royal spade with a small three-point crown, mirrored around the center.", draw: p => twoWay(suit("spade", 0, -31, 1.1, p.ink) + path("M-25-66-20-49H20L25-66 10-58 0-72-10-58Z", p.gold, 2.6) + circle(-25, -67, 2, p.gold, p.gold) + circle(25, -67, 2, p.gold, p.gold)) + centerGem(p) },
  { id: "07-suit-ribbon", name: "Suit ribbon", family: "Cards", palette: 1, description: "An airy vertical ribbon holding a heart and a club, with symmetrical curled tails.", draw: p => twoWay(path("M-36-72Q-63-39-30-12Q-13 0 8-3Q32-8 35-34", p.gold, 3) + suit("heart", -5, -47, 1, p.ink) + suit("club", 34, -12, .55, p.ink)) + centerGem(p) },
  { id: "08-the-cut", name: "The cut", family: "Cards", palette: 2, description: "A neat three-card deck with paired pips and a restrained gold edge.", draw: p => g("rotate(-10)", rect(-39, -62, 78, 124, 6, p.gold, p.base) + rect(-34, -57, 68, 114, 6, p.ink, p.base) + rect(-29, -52, 58, 104, 6, p.gold, p.base) + twoWay(suit("spade", 0, -25, .9, p.ink)) + centerGem(p)) },
  { id: "09-trump-crest", name: "Trump crest", family: "Cards", palette: 3, description: "A pair of small heraldic shields, each holding a bold club.", draw: p => twoWay(path("M-35-66H35V-38Q32-13 0-4Q-32-13-35-38Z", p.gold, 3) + suit("club", 0, -40, 1, p.ink) + path("M-47-47Q-60-21-25-6M47-47Q60-21 25-6", p.ink, 2.4)) + centerGem(p) },
  { id: "10-jokers-bells", name: "Joker’s bells", family: "Cards", palette: 4, description: "A playful three-point jester cap, with bell tips and a central diamond.", draw: p => twoWay(path("M-30-20Q-34-43-43-51Q-20-56-13-33Q-15-64 0-75Q15-64 13-33Q20-56 43-51Q34-43 30-20Z", p.ink, 2.8, p.soft) + path("M-30-20Q0-31 30-20M-27-13H27", p.gold, 3) + circle(-43, -54, 4, p.gold, p.gold) + circle(43, -54, 4, p.gold, p.gold) + circle(0, -78, 4, p.gold, p.gold)) + centerGem(p) },
  { id: "11-house-chip", name: "House chip", family: "Casino", palette: 1, description: "One substantial casino chip in the middle of a quiet solid-color back.", draw: p => chip(0, 0, 57, p) + smallRule(-80, p) + smallRule(80, p) },
  { id: "12-lucky-dice", name: "Lucky dice", family: "Casino", palette: 0, description: "Two tilted dice with large, easy-to-read pips and a small gold spark.", draw: p => twoWay(g("translate(-16 -25) rotate(-15)", rect(-25, -25, 50, 50, 9, p.gold, p.base, 3) + [[-13,-13],[13,-13],[0,0],[-13,13],[13,13]].map(([x,y]) => circle(x,y,3.3,p.ink,p.ink,0)).join(""))) + diamond(40, -58, 7, p.gold) + diamond(-40, 58, 7, p.gold) },
  { id: "13-roulette-rose", name: "Roulette rose", family: "Casino", palette: 2, description: "A simplified roulette wheel with broad alternating wedges and a gold spindle.", draw: p => circle(0,0,58,p.gold,"none",3) + repeat(16, i => g(`rotate(${i*22.5})`, shape("M0 0 0-51A51 51 0 0 1 19.52-47.12Z", i % 2 ? p.soft : p.ink))) + circle(0,0,36,p.gold,p.base,2.6) + circle(0,0,14,p.gold,p.base) + path("M0-27V27M-27 0H27",p.ink,3) + diamond(0,0,7,p.gold) },
  { id: "14-deco-palace", name: "Deco palace", family: "Casino", palette: 3, description: "A compact Art Deco sunburst with stepped architecture and a jewel at its center.", draw: p => twoWay(path("M-55-11V-37H-36V-53H-18V-69H18V-53H36V-37H55V-11",p.gold,3) + path("M-43-11V-29H-25V-45H-9V-60M43-11V-29H25V-45H9V-60",p.ink,2.6) + path("M-55-11H-18M18-11H55",p.gold,2.5)) + path("M0-22 17 0 0 22-17 0Z",p.ink,3,p.soft) },
  { id: "15-lucky-sevens", name: "Lucky sevens", family: "Casino", palette: 4, description: "Two opposing engraved sevens, enclosed by a narrow oval.", draw: p => ellipse(49,77,p.gold) + twoWay(path("M-24-59H24V-49L-4-12H-22L6-46H-24Z",p.ink,2.5,p.ink) + path("M-13-34H15",p.gold,2.8)) + centerGem(p) },
  { id: "16-good-fortune", name: "Good fortune", family: "Casino", palette: 0, description: "Paired gold horseshoes with a small diamond linking their open ends.", draw: p => twoWay(path("M-30-63V-37A30 30 0 0 0 30-37V-63H18V-37A18 18 0 0 1-18-37V-63Z",p.gold,2.6,p.soft) + [-25,25].map(x => path(`M${x}-54V-49M${x}-40V-35`,p.ink,2.4)).join("") + diamond(0,-52,8,p.ink)) + centerGem(p) },
  { id: "17-club-lounge", name: "Club lounge", family: "Casino", palette: 1, description: "A club-house badge with a pair of club silhouettes and a broad oval frame.", draw: p => ellipse(52,74,p.ink,3) + ellipse(45,66,p.gold,2) + twoWay(suit("club",0,-29,1.15,p.ink) + path("M-14-58H14",p.gold,2.8)) + smallRule(0,p) },
  { id: "18-jackpot", name: "Jackpot", family: "Casino", palette: 2, description: "A small cascade of three casino chips, centered and arranged like a medal.", draw: p => twoWay(chip(-26,0,31,p,"heart")) + chip(0,0,37,p) + twoWay(path("M-16-43-10-61 0-52 10-61 16-43",p.gold,2.8)) },
  { id: "19-table-stakes", name: "Table stakes", family: "Casino", palette: 3, description: "Two tidy stacks of chips surrounding one small gold diamond.", draw: p => twoWay(g("translate(0 -34)", rect(-38,-21,76,39,11,p.gold,p.base) + path("M-38-9Q0 5 38-9M-38 3Q0 17 38 3M-20-18V-10M0-16V-7M20-18V-10M-20 6V14M0 10V18M20 6V14",p.ink,2.4) + path("M-29-24Q0-38 29-24",p.gold,2.4))) + centerGem(p) },
  { id: "20-velvet-room", name: "Velvet room", family: "Casino", palette: 4, description: "A flowing casino-lounge crest, with curved gold ribbons around a faceted diamond.", draw: p => twoWay(path("M-4-73C-57-71-65-23-31-13C-7-6 4-32-13-39C-28-45-37-24-17-12",p.gold,3) + path("M8-65C35-51 49-36 45-11",p.ink,3) + circle(8,-65,3,p.gold,p.gold)) + path("M0-28 23 0 0 28-23 0ZM-23 0H23M0-28-8 0 0 28 8 0Z",p.ink,2.6) },
  { id: "21-open-book", name: "Open book", family: "Books", palette: 0, description: "Two open books, echoed top-to-bottom in a pared-back version of the current book motif.", draw: p => twoWay(book(0,-40,.96,p)) + centerGem(p) },
  { id: "22-gilded-volume", name: "Gilded volume", family: "Books", palette: 1, description: "A pair of small leatherbound volumes with gold-tooled covers.", draw: p => twoWay(g("translate(-10 -29) rotate(-13)",closedBook(0,0,p,.98))) + diamond(37,-64,5,p.gold) + diamond(-37,64,5,p.gold) },
  { id: "23-library-stack", name: "Library stack", family: "Books", palette: 2, description: "Stacked hardbacks form a compact emblem, with clear spines and rounded page edges.", draw: p => twoWay(g("translate(0 -36)", path("M30-26H-29Q-39-26-39-16T-29-6H30M29-20H-27M29-13H-27",p.ink,2.8) + path("M-30-4H32Q42-4 42 6T32 16H-30M-27 2H29M-27 9H29",p.gold,2.8) + path("M-30-26V-6M32-4V16",p.ink,2.2))) + centerGem(p) },
  { id: "24-quill-and-page", name: "Quill & page", family: "Books", palette: 3, description: "A handwritten page and a sweeping quill, mirrored into a literary crest.", draw: p => twoWay(path("M-29-64H11L26-49V-12H-29ZM11-64V-49H26",p.ink,2.5,p.base) + path("M-19-46H0M-19-36H5M-19-26H-5",p.gold,2) + path("M-3-9Q7-39 40-69Q52-41 11-24M-3-9 33-59M17-35 16-49M23-42 36-43",p.gold,2.6)) + centerGem(p) },
  { id: "25-private-library", name: "Private library", family: "Books", palette: 4, description: "An ornate but uncluttered bookplate around two tiny open books.", draw: p => path("M-42-65Q-21-65-18-76H18Q21-65 42-65V-35Q42-9 56 0Q42 9 42 35V65Q21 65 18 76H-18Q-21 65-42 65V35Q-42 9-56 0Q-42-9-42-35Z",p.gold,2.8) + twoWay(book(0,-34,.72,p)) + centerGem(p) },
  { id: "26-silk-bookmark", name: "Silk bookmark", family: "Books", palette: 0, description: "A single decorative book cover with a two-ended silk bookmark and a centered clasp.", draw: p => rect(-39,-67,78,134,7,p.ink,p.base,3) + rect(-30,-57,60,114,3,p.gold,"none",1.8) + twoWay(path("M-11-67V-23L0-31 11-23V-67",p.gold,2.4,p.soft) + path("M-39-48H-31M-39-38H-31",p.ink,2.4)) + circle(0,0,13,p.gold) + centerGem(p) },
  { id: "27-story-door", name: "Story door", family: "Books", palette: 1, description: "Books become a little doorway, with arched gold frames leading into the center.", draw: p => twoWay(path("M-43-9V-43A43 43 0 0 1 43-43V-9M-34-9V-43A34 34 0 0 1 34-43V-9",p.gold,2.7) + book(0,-24,.72,p)) + centerGem(p) },
  { id: "28-page-rosette", name: "Page rosette", family: "Books", palette: 2, description: "Eight broad folded pages create one sculptural rosette, surrounded by open color.", draw: p => repeat(8,i => g(`rotate(${i*45})`,path("M0-9Q-25-31-11-61Q8-51 14-28Z",i%2?p.gold:p.ink,2.6,p.base) + path("M0-15Q-10-36-10-53",p.gold,1.8))) + circle(0,0,13,p.gold,p.base) + centerGem(p) },
  { id: "29-seven-card-book", name: "Seven-card book", family: "Books", palette: 3, description: "A Hand & Foot book: seven cards fan out above a small gold binding.", draw: p => twoWay(repeat(7,i => g(`translate(0 -15) rotate(${-42+i*14} 0 0)`,rect(-10,-58,20,52,3,p.ink,p.base,2.2) + diamond(0,-46,3.5,p.gold))) + path("M-28-16Q0-5 28-16L24-7Q0 2-24-7Z",p.gold,2.5,p.base)) + centerGem(p) },
  { id: "30-bound-together", name: "Bound together", family: "Books", palette: 4, description: "Two interlocked books tied with a continuous gold ribbon, joining the card and library themes.", draw: p => twoWay(g("translate(-12 -27) rotate(-18)",closedBook(0,0,p,.94)) + path("M-42-8Q-8-40 16-6Q38 14 8 20Q-20 24-7-5",p.gold,3)) + centerGem(p) },
];

function border(p, index) {
  const outer = rect(14,14,212,308,8,p.gold,"none",2.2);
  const corners = index % 3 === 1
    ? g("translate(120 168)",twoWay(path("M-89-123V-137H-75M89-123V-137H75",p.ink,2)))
    : "";
  return outer + corners;
}
function svg(design, theme, index) {
  const p = palettes[design.palette][theme];
  // Mirrored and radial compositions balance the designs in either orientation.
  const frame = border(p,index);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="336" viewBox="0 0 240 336" role="img" aria-labelledby="title"><title id="title">${design.name.replaceAll("&","&amp;")} — ${theme} card back</title><rect width="240" height="336" rx="15" fill="#FAF6EE"/><rect x="7" y="7" width="226" height="322" rx="10" fill="${p.base}"/>${frame}<g transform="translate(120 168)">${design.draw(p)}</g></svg>\n`;
}

for (const [index, design] of designs.entries()) {
  for (const theme of ["light", "dark"]) writeFileSync(new URL(`assets/${design.id}-${theme}.svg`,destination),svg(design,theme,index));
}
writeFileSync(new URL("designs.js",destination),`export const designs = ${JSON.stringify(designs.map(({draw,...design})=>({...design,palette:palettes[design.palette].name})),null,2)};\n`);
console.log(`Created ${designs.length} concepts and ${designs.length * 2} SVG previews.`);
