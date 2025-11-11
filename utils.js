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

export function normalizeName(name) {
  return name
    .toLowerCase() // opcional, pra padronizar
    .replace(/[^a-z0-9_]/gi, "_"); // substitui tudo que não for letra/número/_ por "_"
}

export function pageSize() {
  return Number(pageSizeSel.value || 1000);
}