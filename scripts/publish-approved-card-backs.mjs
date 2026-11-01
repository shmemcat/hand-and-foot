import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { palettes } from "./card-back-palettes.mjs";

const root = new URL("../", import.meta.url);
const { approved } = JSON.parse(
  await readFile(
    new URL("web/public/card-back-preview/approved-corners.json", root),
    "utf8",
  ),
);
if (approved.length !== 35 || approved.some((back) => !back.approved))
  throw new Error("Expected all 35 approved designs.");
const names = {
  "trump-crest": "Royal crest",
  "literary-butterfly": "Butterfly",
};
const backs = approved.flatMap((back) => {
  const slug = back.id.replace(/^\d+-/, "").replace(/^golf-/, "");
  if (slug === "four-leaf") return [];
  const name = names[slug] ?? back.name;
  const updated = { ...back, slug, name };
  for (const theme of ["light", "dark"]) {
    let svg = back[`${theme}Svg`].replaceAll(back.name, name);
    if (slug === "fern-sprig") {
      // Story tree uses Rose clay / Petal; retain the approved fern and corners.
      const source = palettes[1][theme];
      const target = palettes[0][theme];
      const colors = Object.fromEntries(
        Object.keys(source).map((key) => [source[key], target[key]]),
      );
      svg = svg.replace(
        /#[0-9a-f]{6}/gi,
        (color) => colors[color.toUpperCase()] ?? color,
      );
    }
    updated[`${theme}Svg`] = svg;
  }
  return [updated];
});
await mkdir(new URL("web/public/cards/backs/", root), { recursive: true });
for (const back of backs) {
  for (const theme of ["light", "dark"]) {
    await writeFile(
      new URL(`web/public/cards/backs/${back.slug}-${theme}.svg`, root),
      back[`${theme}Svg`].replace(/[\t ]+$/gm, "") + "\n",
    );
  }
}
const choices = [
  { id: "single-leaves", name: "Single leaves" },
  ...backs.map((back) => ({ id: back.slug, name: back.name })),
];
await writeFile(
  new URL("web/src/lib/cardBacks.ts", root),
  `// Approved artwork is published by scripts/publish-approved-card-backs.mjs.\nimport { asset } from "./assets";\n\nexport const DEFAULT_CARD_BACK = "single-leaves";\nexport const CARD_BACKS = ${JSON.stringify(choices, null, 2)} as const;\nexport type CardBackId = (typeof CARD_BACKS)[number]["id"];\nexport const SELECTABLE_CARD_BACKS = CARD_BACKS;\nexport function normalizeCardBack(value: unknown): CardBackId {\n  return CARD_BACKS.some(back => back.id === value) ? value as CardBackId : DEFAULT_CARD_BACK;\n}\nexport function cardBackAsset(value: unknown, theme: "light" | "dark", small = false) {\n  const id = normalizeCardBack(value);\n  return asset(id === DEFAULT_CARD_BACK\n    ? \`cards/card-back-\${theme}\${small ? "-mini" : ""}.svg\`\n    : \`cards/backs/\${id}-\${theme}.svg\`);\n}\n`,
);
const ids = choices.map((back) => back.id);
const sharedCatalog = new URL(
  "../../cards/api/cards_accounts/card_backs.py",
  import.meta.url,
);
let shared = await readFile(sharedCatalog, "utf8");
shared = shared.replace(/\n# Hand & Foot approved designs[\s\S]*$/, "");
shared += `\n# Hand & Foot approved designs, published from the corner approval snapshot.\nCARD_BACK_DESIGNS["handandfoot"] = frozenset(${JSON.stringify(ids, null, 4)})\n`;
await writeFile(sharedCatalog, shared);
console.log(
  `Published ${backs.length} approved designs and retained the current default. ${fileURLToPath(root)}`,
);
