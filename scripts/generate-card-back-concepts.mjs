import { mkdirSync, writeFileSync } from "node:fs";
import { palettes, CENTER_ART_SCALE } from "./card-back-palettes.mjs";

// Review collection; run with `node scripts/generate-card-back-concepts.mjs`.
const destination = new URL("../web/public/card-back-preview/", import.meta.url);
mkdirSync(new URL("assets/", destination), { recursive: true });

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

const sparkle = (x, y, r, p) => g(`translate(${x} ${y})`,shape(`M0 ${-r}Q1-1 ${r} 0Q1 1 0 ${r}Q-1 1 ${-r} 0Q-1-1 0 ${-r}Z`,p.gold));
const leaf = (x,y,rotation,p,scale=1) => g(`translate(${x} ${y}) rotate(${rotation}) scale(${scale})`,path("M0 0Q-17-6-11-25Q9-18 0 0ZM0 0-8-19",p.gold,2,p.soft));
function spread(p) {
  return path("M0-27Q-23-42-49-32V28Q-23 18 0 36Q23 18 49 28V-32Q23-42 0-27Z",p.ink,3,p.base)
    + path("M0-27V36M-41-23Q-23-29-8-20M-41-10Q-23-16-8-7M-41 3Q-23-3-8 6M8-20Q23-29 41-23M8-7Q23-16 41-10M8 6Q23-3 41 3",p.gold,2.2)
    + path("M-55-25V35Q-24 27 0 43Q24 27 55 35V-25",p.ink,2.2);
}
function spine(x,y,w,h,p,lean=0) {
  return g(`translate(${x} ${y}) rotate(${lean} 0 ${h/2})`,rect(-w/2,-h/2,w,h,2,p.ink,p.base,2.5)
    + path(`M${-w/2} ${-h/2+9}H${w/2}M${-w/2} ${h/2-9}H${w/2}`,p.gold,2)
    + diamond(0,0,Math.min(w*.24,4),p.gold));
}
const libraryDesigns = [
  { id: "31-grand-folio", name: "Grand folio", palette: 1, description: "One generous open folio, with broad curved pages and simple gold lettering lines.", draw: p => spread(p) + smallRule(-62,p) + smallRule(68,p) },
  { id: "32-turning-leaf", name: "Turning leaf", palette: 0, description: "A single page caught mid-turn, sweeping upward from an open book.", draw: p => g("translate(0 14) scale(.93)",spread(p)) + path("M0-11Q-5-50 20-66Q44-48 40-9Q20-18 0-11Z",p.gold,2.8,p.soft) + path("M7-19Q10-43 20-57M14-28Q24-36 32-30M12-39Q24-47 32-40",p.ink,2.1) },
  { id: "33-concertina", name: "Concertina", palette: 2, description: "An accordion-fold book opens into a crisp, sculptural zigzag.", draw: p => path("M-60-34-36-44-12-30 12-44 36-30 60-40V33L36 43 12 29-12 43-36 29-60 39Z",p.ink,2.8,p.base) + path("M-36-44V29M-12-30V43M12-44V29M36-30V43",p.gold,2.5) + path("M-53-17-43-21M-53-6-43-10M-29-23-19-17M-29-12-19-6M-5-13 5-18M-5-2 5-7M19-23 29-17M19-12 29-6M43-13 53-17M43-2 53-6",p.ink,1.9) + twoWay(diamond(0,-69,5,p.gold)) },
  { id: "34-ribboned-chapters", name: "Ribboned chapters", palette: 4, description: "A closed volume tied with a generous ribbon bow, like a treasured gift.", draw: p => rect(-36,-55,72,110,6,p.ink,p.base,3) + path("M-25-55V55M-36 40H36M-31 47H31",p.ink,2.2) + path("M-2-55V55M8-55V55M-36-3H36M-36 7H36",p.gold,3) + path("M3 2Q-36-30-25-38Q-6-48 3 2Q27-41 39-28Q50-12 3 2M3 2-15 25M3 2 27 23",p.gold,2.8,p.soft) + circle(3,2,4,p.gold,p.gold) },
  { id: "35-library-window", name: "Library window", palette: 3, description: "Four gilded book spines stand inside a tall arched library window.", draw: p => path("M-48 55V-28A48 48 0 0 1 48-28V55Z",p.gold,3) + path("M-39-26Q0-62 39-26M-48 13H48M-48 55H48",p.gold,2.3) + spine(-28,34,13,39,p) + spine(-10,32,14,43,p) + spine(9,35,15,37,p) + spine(28,31,13,45,p) + diamond(0,-35,10,p.ink) + path("M0-16V5",p.ink,2.5) },
  { id: "36-between-bookends", name: "Between bookends", palette: 1, description: "A small shelf of distinct book spines, held between sculpted bookends.", draw: p => path("M-58 35V-19Q-58-33-45-33V35H-58M45 35V-19Q45-33 58-33V35H45M-61 41H61",p.gold,3) + spine(-31,3,15,61,p) + spine(-12,-3,17,73,p) + spine(8,4,16,59,p) + spine(27,2,14,63,p,-9) + smallRule(-65,p) + smallRule(66,p) },
  { id: "37-midnight-reader", name: "Midnight reader", palette: 2, description: "A crescent moon and three small stars over an open book.", draw: p => g("translate(0 20) scale(.9)",spread(p)) + path("M12-77A25 25 0 1 0 29-34A26 26 0 0 1 12-77Z",p.gold,2.4,p.soft) + sparkle(-40,-43,5,p) + sparkle(38,-59,4,p) + sparkle(-23,-77,3,p) },
  { id: "38-by-candlelight", name: "By candlelight", palette: 0, description: "A warm little candle rises behind an open book, with a gold pool of light.", draw: p => circle(0,-32,40,p.gold,"none",1.6) + rect(-11,-46,22,47,3,p.ink,p.soft,2.6) + path("M-11-39Q-4-31 0-39Q5-48 11-40M0-46V-55",p.gold,2.3) + path("M0-57Q-15-65 0-81Q15-65 0-57Z",p.gold,2.5,p.soft) + g("translate(0 25) scale(.88)",spread(p)) },
  { id: "39-secret-library", name: "Secret library", palette: 4, description: "An antique key crosses a small locked book, with a single bold gold key bow.", draw: p => g("rotate(-12)",rect(-31,-51,62,102,5,p.ink,p.base,3) + path("M-21-51V51M-31 36H31M-26 43H26",p.gold,2.2) + rect(-10,-31,28,44,3,p.gold,"none",2)) + g("translate(4 9) rotate(35)",circle(0,-38,14,p.gold,p.base,3) + circle(0,-38,5,p.ink) + path("M0-24V41H16V30H8V19H0M-5 41H5",p.gold,3.5)) },
  { id: "40-paper-heart", name: "Paper heart", palette: 3, description: "Two curled leaves of a book meet to form a heart, with a delicate spine below.", draw: p => path("M0 44C-18 22-53-1-49-28C-45-53-12-56 0-30C12-56 45-53 49-28C53-1 18 22 0 44Z",p.ink,3,p.base) + path("M0 44V-30M-9 25Q-40-6-36-27Q-32-41-16-29M9 25Q40-6 36-27Q32-41 16-29M-11 8Q-29-10-26-23M11 8Q29-10 26-23M0 44V62",p.gold,2.6) + diamond(0,68,5,p.gold) },
  { id: "41-literary-butterfly", name: "Literary butterfly", palette: 1, description: "Four folded pages become butterfly wings, with the spine as a slender gold body.", draw: p => [-1,1].map(side => g(`scale(${side} 1)`,path("M4-4Q13-49 53-57Q62-20 4-4ZM4 4Q26 0 49 26Q35 52 4 4Z",p.ink,2.7,p.base) + path("M9-9Q30-34 45-44M11-3Q34-18 49-31M10 9 37 28M15 17 32 33",p.gold,2.3))).join("") + path("M0-25V32M0-22Q-5-39-14-40M0-22Q5-39 14-40",p.gold,3) + diamond(0,0,7,p.gold) },
  { id: "42-story-tree", name: "Story tree", palette: 0, description: "A branching story tree grows from an open book, with broad page-shaped leaves.", draw: p => path("M0 19V-55M0-18-26-39M0-3 28-23M0-32 22-52",p.ink,2.8) + leaf(-24,-37,-45,p,.9) + leaf(25,-22,68,p,.9) + leaf(20,-50,58,p,.85) + leaf(0,-53,0,p,.85) + g("translate(0 34) scale(.83)",spread(p)) },
  { id: "43-pressed-pages", name: "Pressed pages", palette: 3, description: "A graceful pressed sprig rests across one open book.", draw: p => g("translate(0 13) scale(.96)",spread(p)) + path("M-17 39Q-7-17 23-67",p.gold,2.6) + leaf(-11,15,-54,p,.8) + leaf(0,-13,49,p,.85) + leaf(11,-39,-49,p,.82) + leaf(23,-64,20,p,.65) },
  { id: "44-first-draft", name: "First draft", palette: 4, description: "A fountain-pen nib bridges two folded manuscript pages, like a tiny publisher’s mark.", draw: p => twoWay(path("M-43-59H16L34-41V-13H-43ZM16-59V-41H34M-32-45H3M-32-34H-6M-32-23H3",p.ink,2.5,p.base)) + g("rotate(28)",path("M0-44-18-10 0 42 18-10Z",p.gold,3,p.soft) + path("M0 42V-7M-18-10 0-20 18-10",p.ink,2.4) + circle(0,-11,4,p.ink,p.base,2.3)) },
  { id: "45-library-cart", name: "Library cart", palette: 2, description: "A miniature library cart with two shelves of books and two little wheels.", draw: p => path("M-47 39V-59H-58M-47-41H43V39ZM-47-3H43M-47 44H43",p.gold,3) + spine(-31,-22,14,31,p) + spine(-12,-24,16,35,p) + spine(9,-21,13,29,p) + spine(27,-23,12,33,p,-10) + path("M-33 12H22Q29 12 29 19T22 26H-33M-33 31H33M-29 18H21",p.ink,2.5) + circle(-30,54,7,p.ink,p.base,2.8) + circle(29,54,7,p.ink,p.base,2.8) },
  { id: "46-reading-hour", name: "Reading hour", palette: 1, description: "A pair of round reading glasses rests on an open book, with generous curves and few details.", draw: p => g("translate(0 5)",spread(p)) + circle(-23,-9,19,p.ink,p.base,3) + circle(23,-9,19,p.ink,p.base,3) + path("M-4-9Q0-17 4-9M-42-11-50-28M42-11 50-28",p.gold,3) + smallRule(-61,p) + diamond(0,69,5,p.gold) },
  { id: "47-chapter-seal", name: "Chapter seal", palette: 0, description: "A tiny wax seal fastens a ribbon around a tilted book, with a heart impressed in the seal.", draw: p => g("rotate(-11)",rect(-35,-53,70,106,6,p.ink,p.base,3) + path("M-24-53V53M-35 37H35M-30 44H30",p.gold,2.2) + path("M-2-53V-8L8-15 18-8V-53M-2 53V11L8 19 18 11V53",p.gold,2.5,p.soft) + circle(8,0,17,p.gold,p.soft,3) + suit("heart",8,0,.62,p.ink)) },
  { id: "48-marbled-volume", name: "Marbled volume", palette: 4, description: "A handsome hardback with flowing marbled-paper curves confined to its cover.", draw: p => rect(-36,-59,72,118,6,p.ink,p.base,3) + path("M-24-59V59M-36 43H36M-31 50H31",p.gold,2.2) + rect(-15,-43,39,68,2,p.gold,"none",2) + path("M-12-30Q16-48 20-25Q24-8-3-4Q-20 0 1 17M-12-17Q6-33 13-19Q18-11-5-6M-8 10Q11-3 21 8M-8-40Q-5-29 6-29M6 23Q17 14 21 20",p.ink,2.2) + diamond(5,34,4,p.gold) },
  { id: "49-page-compass", name: "Page compass", palette: 2, description: "Four little open books radiate from one gold center, creating a compass of pages.", draw: p => repeat(4,i => g(`rotate(${i*90}) translate(0 -33) scale(.56)`,book(0,0,1,p))) + circle(0,0,12,p.gold,p.base,2.6) + centerGem(p) + twoWay(diamond(0,-81,4,p.gold)) },
  { id: "50-storybook-castle", name: "Storybook castle", palette: 3, description: "A small fairytale castle rises from an open book, its towers finished with gold flags.", draw: p => path("M-35 9V-39L-24-52-13-39V-11H13V-39L24-52 35-39V9M-13-11V-37L0-51 13-37V9M-35-39H-13M13-39H35M-13-37H13M-24-52V-67L-9-61-24-56M24-52V-67L39-61 24-56M0-51V-73L14-67 0-62",p.gold,2.6,p.base) + path("M-26-27V-18M26-27V-18M0-28V-18",p.ink,3) + g("translate(0 34) scale(.85)",spread(p)) },
].map(design => ({...design,family:"Books",collection:"library"}));
designs.push(...libraryDesigns);

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
  return `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="336" viewBox="0 0 240 336" role="img" aria-labelledby="title"><title id="title">${design.name.replaceAll("&","&amp;")} — ${theme} card back</title><rect width="240" height="336" rx="15" fill="#FAF6EE"/><rect x="7" y="7" width="226" height="322" rx="10" fill="${p.base}"/>${frame}<g data-artwork="center" transform="translate(120 168) scale(${CENTER_ART_SCALE})">${design.draw(p)}</g></svg>\n`;
}

for (const [index, design] of designs.entries()) {
  for (const theme of ["light", "dark"]) writeFileSync(new URL(`assets/${design.id}-${theme}.svg`,destination),svg(design,theme,index));
}
writeFileSync(new URL("designs.js",destination),`export const designs = ${JSON.stringify(designs.map(({draw,...design})=>({...design,palette:palettes[design.palette].name})),null,2)};\n`);
console.log(`Created ${designs.length} concepts and ${designs.length * 2} SVG previews.`);
