import { designs as concepts } from "./designs.js";
import { designs as golfPlants } from "./golf-designs.js";
import { designs as finalDesigns } from "./final-designs.js";

const isFinalCollection = document.documentElement.dataset.collection === "final";
const allDesigns = [...concepts,...golfPlants];
const designs = isFinalCollection ? finalDesigns : allDesigns;
const initialShortlistIds = new Set(finalDesigns.filter(design => design.source === "Your shortlist").map(design => design.id));

const gallery = document.getElementById("gallery");
const filter = document.getElementById("shortlist-filter");
const dialog = document.getElementById("detail");
const detailPick = document.getElementById("detail-pick");
const copyButton = document.getElementById("copy-picks");
const storageKey = "handandfoot.card-back-concepts.shortlist.v1";
const url = new URL(location.href);
let saved = [];
try {
  const value = JSON.parse(localStorage.getItem(storageKey) || "[]");
  if (Array.isArray(value)) saved = value.filter(id => allDesigns.some(design => design.id === id));
} catch { /* Shortlisting still works for the current visit. */ }
const picks = new Set(saved);
let family = ["Cards", "Casino", "Books", "NewBooks", "Plants", "Emblems", "Picks"].includes(url.searchParams.get("family")) ? url.searchParams.get("family") : "all";
let mode = ["light", "dark", "both"].includes(url.searchParams.get("mode")) ? url.searchParams.get("mode") : "light";
let onlyPicks = false;
let current = 0;
let opener;
const number = index => String(designs[index].number ?? Number(designs[index].id.split("-")[0])).padStart(2, "0");
const image = (design, theme, className = "") => `<img class="${className}" src="assets/${design.id}-${theme}.svg" width="240" height="336" alt="${design.name}, ${theme} mode" draggable="false" />`;
const matchesCategory = (design,category) => category === "all" || (category === "NewBooks" ? design.collection === "library" : category === "Picks" ? initialShortlistIds.has(design.id) : design.family === category);
const matchesFamily = design => matchesCategory(design,family);
const copyLabel = isFinalCollection ? "Copy final list" : "Copy picks";
document.title = `${designs.length} ${isFinalCollection ? "final card backs" : "card back ideas"} · Hand & Foot`;
document.getElementById("collection-intro").innerHTML = isFinalCollection
  ? `${initialShortlistIds.size} of your favorites + ${finalDesigns.filter(design => design.family === "Plants").length} botanicals + ${finalDesigns.filter(design => design.family === "Emblems").length} celestial designs from Golf.<br class="desktop-break" /> Light backs in rose clay, petal pink, blush, antique rose, and dusty rose. <a href="corners.html?mode=${mode}">Review the corner designs.</a>`
  : `${designs.length} card backs. Rich color, a central emblem, and room to breathe.<br class="desktop-break" /> Your original pinks, plus petal pink and antique rose. <a href="final.html?mode=${mode}">View your final collection.</a>`;
gallery.setAttribute("aria-label", `${designs.length} card back concepts`);
document.querySelectorAll("[data-family]").forEach(button => {
  const category = button.dataset.family;
  button.querySelector("span").textContent = designs.filter(design => matchesCategory(design,category)).length;
});

gallery.innerHTML = designs.map((design, index) => `<article class="concept" data-id="${design.id}">
  <div class="concept-header"><span class="number">${number(index)}</span><h3>${design.name}</h3></div>
  <button type="button" class="preview-pair" data-open="${index}" aria-label="Enlarge ${number(index)} ${design.name}">
    ${["light", "dark"].map(theme => `<span class="swatch ${theme}">${image(design, theme)}<span class="swatch-label">${theme}</span></span>`).join("")}
  </button>
  <div class="concept-footer"><span class="family">${design.family}${design.source === "Golf" ? " · Golf" : isFinalCollection ? " · Your pick" : design.collection === "library" ? " · New" : ""}</span><button type="button" class="pick" data-pick="${design.id}" aria-pressed="false" aria-label="Shortlist ${number(index)} ${design.name}">+ Shortlist</button></div>
</article>`).join("");

function announce(message) { document.getElementById("announcement").textContent = message; }
function visibleIndices() {
  return designs.flatMap((design, index) => matchesFamily(design) && (!onlyPicks || picks.has(design.id)) ? [index] : []);
}
function update() {
  const visible = new Set(visibleIndices());
  for (const [index, article] of [...gallery.children].entries()) {
    const selected = picks.has(article.dataset.id);
    article.hidden = !visible.has(index);
    article.dataset.picked = String(selected);
    const button = article.querySelector(".pick");
    button.setAttribute("aria-pressed", String(selected));
    button.textContent = selected ? "✓ Shortlisted" : "+ Shortlist";
  }
  document.querySelectorAll("[data-family]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.family === family)));
  filter.setAttribute("aria-pressed", String(onlyPicks));
  document.getElementById("pick-count").textContent = picks.size;
  document.getElementById("empty").hidden = visible.size > 0;
  const categoryLabel = { all: "designs", Cards: "card designs", Casino: "casino designs", Books: "book designs", NewBooks: "new book designs · 31–50", Plants: "Golf botanicals", Emblems:"celestial and compass designs", Picks: "of your shortlisted designs" }[family];
  document.getElementById("result-count").textContent = `Showing ${visible.size}${family === "all" && !onlyPicks ? ` of ${designs.length}` : ""} ${onlyPicks ? "shortlisted " : ""}${categoryLabel}.`;
  copyButton.disabled = !isFinalCollection && picks.size === 0;
  copyButton.textContent = copyLabel;
  const selected = designs.flatMap((design, index) => picks.has(design.id) ? [`${number(index)} ${design.name}`] : []);
  document.getElementById("picks-summary").textContent = selected.length ? `Your picks: ${selected.join(" · ")}` : "No favorites yet.";
  const active = picks.has(designs[current].id);
  detailPick.setAttribute("aria-pressed", String(active));
  detailPick.textContent = active ? "✓ Shortlisted" : "+ Shortlist";
}
function saveView() {
  url.searchParams.set("mode", mode);
  if (family === "all") url.searchParams.delete("family"); else url.searchParams.set("family", family);
  history.replaceState(null, "", url);
}
function setMode() {
  gallery.dataset.mode = mode;
  document.documentElement.dataset.theme = mode === "dark" ? "dark" : "light";
  document.querySelector(`input[name="mode"][value="${mode}"]`).checked = true;
}
function togglePick(id) {
  if (picks.has(id)) picks.delete(id); else picks.add(id);
  let persisted = true;
  try { localStorage.setItem(storageKey, JSON.stringify([...picks])); } catch { persisted = false; }
  update();
  announce(`${designs.find(design => design.id === id).name} ${picks.has(id) ? "added to" : "removed from"} shortlist. ${picks.size} selected.${persisted ? "" : " Browser storage is unavailable; copy your picks before leaving."}`);
}
function showDetail(index) {
  current = (index + designs.length) % designs.length;
  const design = designs[current];
  document.getElementById("detail-title").textContent = `${number(current)} · ${design.name}`;
  document.getElementById("detail-family").textContent = design.family;
  document.getElementById("detail-description").textContent = design.description;
  document.getElementById("detail-palette").textContent = `Palette: ${design.palette}.`;
  document.getElementById("detail-pair").innerHTML = ["light", "dark"].map(theme => `<section class="detail-swatch ${theme}" aria-label="${theme} mode"><h3>${theme} mode</h3>${image(design, theme, "detail-large")}<div class="game-size"><div>${image(design, theme, "opponent-size")}<span>Opponents · 56 px</span></div><div>${image(design, theme, "hand-size")}<span>Your hand · 76 px</span></div></div></section>`).join("");
  update();
  if (!dialog.open) dialog.showModal();
}
function navigate(direction) {
  const indices = visibleIndices();
  if (!indices.length) { dialog.close(); return; }
  const position = indices.indexOf(current);
  showDetail(indices[(position + direction + indices.length) % indices.length]);
}
gallery.addEventListener("click", event => {
  const pick = event.target.closest("[data-pick]");
  if (pick) togglePick(pick.dataset.pick);
  const open = event.target.closest("[data-open]");
  if (open) { opener = open; showDetail(Number(open.dataset.open)); }
});
document.querySelectorAll("[data-family]").forEach(button => button.addEventListener("click", () => {
  family = button.dataset.family;
  update(); saveView();
  announce(document.getElementById("result-count").textContent);
}));
filter.addEventListener("click", () => { onlyPicks = !onlyPicks; update(); announce(document.getElementById("result-count").textContent); });
document.querySelectorAll('input[name="mode"]').forEach(input => input.addEventListener("change", () => {
  mode = input.value; setMode(); saveView();
  announce(mode === "both" ? "Showing light and dark cards together." : `Showing ${mode} mode.`);
}));
document.getElementById("preview-size").addEventListener("change", event => {
  gallery.dataset.size = event.target.value;
  announce(`Card previews are ${event.target.value} pixels wide.`);
});
detailPick.addEventListener("click", () => togglePick(designs[current].id));
document.getElementById("close-detail").addEventListener("click", () => dialog.close());
dialog.addEventListener("click", event => {
  if (event.target !== dialog) return;
  const bounds = dialog.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
});
dialog.addEventListener("close", () => { if (opener?.closest("article")?.hidden) filter.focus(); else opener?.focus(); });
document.getElementById("previous").addEventListener("click", () => navigate(-1));
document.getElementById("next").addEventListener("click", () => navigate(1));
dialog.addEventListener("keydown", event => {
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); navigate(event.key === "ArrowLeft" ? -1 : 1); }
});
copyButton.addEventListener("click", async () => {
  const text = `My Hand & Foot ${isFinalCollection ? "final card back list" : "card back picks"}: ${designs.flatMap((design, index) => isFinalCollection || picks.has(design.id) ? [`${number(index)} ${design.name}`] : []).join(", ")}.`;
  try { await navigator.clipboard.writeText(text); copyButton.textContent = "Copied"; announce("Your picks were copied."); }
  catch { announce("Copy is unavailable. Your picks are listed at the bottom of the gallery."); document.getElementById("picks-summary").scrollIntoView({ block: "center" }); }
});
setMode();
update();
