import { getAllPosts } from "./mDB.js"; // Garanta que isso exista

export function escapeHtml(s, allowHtml = false) {
  s = String(s || "");

  // Se DOMPurify estiver disponível, usa ele
  if (typeof DOMPurify !== "undefined") {
    // Se allowHtml for false, remove TODAS as tags (modo texto puro)
    return DOMPurify.sanitize(s, allowHtml ? {} : { ALLOWED_TAGS: [] });
  }

  // Fallback manual (caso DOMPurify não esteja carregado)
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export async function countPosts() {
  const allpost = await getAllPosts();
  console.log("allpost");
  console.log(allpost);

  const counts = {};
  allpost.forEach((p) => {
    counts[p.author] = (counts[p.author] || 0) + 1;
  });

  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  console.log(ranked);

  return ranked;
}

export async function rankByPayout() {
  const allPosts = await getAllPosts();
  console.log("allPosts para Payout");

  const totals = {};

  allPosts.forEach((p) => {
    const author = p.author;
    let payoutValue = 0;

    // 1. Extrair o valor numérico da string (ex: "5.123 HIVE" -> 5.123)
    if (p.pending_payout_value) {
      // Usa regex para encontrar o primeiro número decimal na string
      const match = p.pending_payout_value.match(/(\d+\.?\d*)/);
      if (match) {
        payoutValue = parseFloat(match[1]) / 2;
        payoutValue = payoutValue / 0.107;
      }
    }

    // 2. Acumular o valor
    totals[author] = (totals[author] || 0) + payoutValue;
  });

  // 3. Ranqueamento: Classificar do maior valor para o menor
  const ranked = Object.entries(totals).sort((a, b) => b[1] - a[1]);

  console.log("Ranking por Payout:");
  console.log(ranked);

  return ranked;
}

export function normalizeName(name) {
  return name
    .toLowerCase() // opcional, pra padronizar
    .replace(/[^a-z0-9_]/gi, "_"); // substitui tudo que não for letra/número/_ por "_"
}

export function pageSize() {
  return Number(pageSizeSel.value || 1000);
}