import { escapeHtml, pageSize, countPosts, rankByPayout } from "./utils.js";
import {
  openDB,
  getPage,
  deleteOldPosts,
  getTotalPostCount,
} from "./mDB.js";
import {
  syncFromServer,
  getReputation,
  authorFlairs,
  spammerList,
} from "./api.js";

let myUsername = null;
const LOGIN_STORAGE_KEY = "hive_sync_username";
const HIVE_KEYCHAIN_TIMEOUT = 30000; // 30 segundos

let currentPage = 1;

let totalPages = 1;

// === Referências DOM ===
const statusEl = document.getElementById("status");
const postsContainer = document.getElementById("postsContainer");
const syncBtn = document.getElementById("syncBtn");
const pageSizeSel = document.getElementById("pageSizeSel");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const gotoBtn = document.getElementById("gotoBtn");
const gotoInput = document.getElementById("gotoInput");
const pageInfo = document.getElementById("pageInfo");
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");

const mainContent = document.getElementById("mainContent");
// Adicione uma nova referência DOM
const rankingPage = document.getElementById("rankingPage");
const rankingList = document.getElementById("rankingList");
const backToPostsBtn = document.getElementById("backToPostsBtn");
// ... e o botão que irá para o ranking na sua UI de posts
const viewRankingBtn = document.getElementById("viewRankingBtn");

const rankingTitle = document.getElementById("rankingTitle");
const rankingTypeSelect = document.getElementById("rankingTypeSelect");


async function renderRankingPage() {
    setStatus("🔄 Calculando ranking...", "text-blue-600");
    rankingList.innerHTML = '<p class="text-gray-500">Calculando posts...</p>';

    // 1. OBTÉM OS DADOS DE RANKING USANDO A FUNÇÃO EXISTENTE
    const rankedData = await countPosts(); // [ [autor, contagem], [autor, contagem], ... ]

    rankingList.innerHTML = ''; // Limpa a mensagem de carregamento

    if (rankedData.length === 0) {
        rankingList.innerHTML = '<p class="py-8 text-center text-gray-500">Nenhum dado de postagem para ranquear.</p>';
        return;
    }

    // 2. CONSTRÓI A LISTA HTML
    rankedData.forEach(([author, count], index) => {
        const rank = index + 1;
        
        const listItem = document.createElement("div");
        listItem.className = "flex justify-between items-center p-3 bg-white shadow rounded-lg";
        
        // Adiciona um destaque para os top 3
        let rankColor = 'text-gray-600';
        let medal = '🏅'; 
        if (rank === 1) { medal = '🥇'; rankColor = 'text-yellow-600'; }
        else if (rank === 2) { medal = '🥈'; rankColor = 'text-gray-500'; }
        else if (rank === 3) { medal = '🥉'; rankColor = 'text-yellow-800'; }

        listItem.innerHTML = `
            <div class="flex items-center">
                <span class="text-xl font-bold w-10 text-center ${rankColor}">${rank}</span>
                <span class="text-2xl ml-2">${medal}</span>
                <b class="ml-4 text-gray-800">${escapeHtml(author)}</b>
            </div>
            <span class="text-lg font-semibold text-blue-600">${count} posts</span>
        `;
        rankingList.appendChild(listItem);
    });

    setStatus(`✅ Ranking de ${rankedData.length} autores carregado.`, "text-green-600");
}

function updateRankingDisplay(rankingType) {
    if (rankingType === 'payout') {
        rankingTitle.textContent = '💰 Ranking por Payout Pendente';
        renderPayoutRankingPage();
    } else { // 'posts'
        rankingTitle.textContent = '🏆 Ranking por Total de Posts';
        renderRankingPage(); // Chamada original do ranking de posts
    }
}

async function renderPayoutRankingPage() {
    setStatus("🔄 Calculando Ranking por Payout...", "text-blue-600");
    rankingList.innerHTML = '<p class="text-gray-500 text-center">Calculando valores...</p>';

    // 1. OBTÉM OS DADOS DE RANKING DE PAYOUT
    const rankedData = await rankByPayout(); // [ [autor, somaTotal], [autor, somaTotal], ... ]

    rankingList.innerHTML = ''; // Limpa a mensagem de carregamento

    if (rankedData.length === 0) {
        rankingList.innerHTML = '<p class="py-8 text-center text-gray-500">Nenhum valor de payout pendente para ranquear.</p>';
        setStatus(`✅ Ranking de Payout carregado. Nenhum valor pendente.`, "text-gray-600");
        return;
    }

    // 2. CONSTRÓI A LISTA HTML
    rankedData.forEach(([author, totalValue], index) => {
        const rank = index + 1;
        
        const listItem = document.createElement("div");
        listItem.className = "flex justify-between items-center p-4 bg-gray-50 hover:bg-white shadow-sm rounded-lg border-l-4 border-green-400 transition transform hover:scale-[1.01]";
        
        let rankColor = 'text-gray-600';
        let medal = ''; 
        if (rank === 1) { medal = '🥇'; rankColor = 'text-yellow-600'; }
        else if (rank === 2) { medal = '🥈'; rankColor = 'text-gray-500'; }
        else if (rank === 3) { medal = '🥉'; rankColor = 'text-yellow-800'; }
        else { medal = `Nº${rank}`; rankColor = 'text-gray-500'; }

        // Formata o valor para exibição (ex: $150.550 HIVE)
        const displayValue = `${totalValue.toFixed(3)} HIVE`; 

        listItem.innerHTML = `
            <div class="flex items-center">
                <span class="text-xl font-extrabold w-12 text-center ${rankColor}">${medal}</span>
                <b class="ml-4 text-gray-800 text-lg">${escapeHtml(author)}</b>
            </div>
            <span class="text-xl font-bold text-green-600 bg-green-100 px-3 py-1 rounded-full">${displayValue}</span>
        `;
        rankingList.appendChild(listItem);
    });

    setStatus(`✅ Ranking de Payout de ${rankedData.length} autores carregado.`, "text-green-600");
}


function saveLogin(username) {
  myUsername = username;
  localStorage.setItem(LOGIN_STORAGE_KEY, username);
  updateAuthUI();
}

/**
 * Limpa o login do LocalStorage e da memória.
 */
function logout() {
  myUsername = null;
  localStorage.removeItem(LOGIN_STORAGE_KEY);
  updateAuthUI();
}

/**
 * Envia uma transação Custom JSON via Hive Keychain.
 * @param {string} username - O nome de usuário logado.
 * @param {string} customId - O ID do Custom JSON (ex: 'hive-sync.list.dapp').
 * @param {string} json - O objeto JSON stringificado.
 * @returns {Promise<Object>} Resultado do Keychain.
 */
function sendCustomJson(username, customId, json) {
  if (!window.hive_keychain) {
    setStatus(
      "❌ Hive Keychain não encontrado. Instale a extensão!",
      "text-red-600"
    );
    return Promise.reject(new Error("Keychain not found"));
  }

  return new Promise((resolve, reject) => {
    window.hive_keychain.requestCustomJson(
      username,
      customId,
      "Posting", // Usamos a chave de Posting
      json,
      "Hive Sync Custom JSON", // Mensagem para o usuário
      (response) => {
        if (response.success) {
          setStatus(
            `✅ Transação '${customId}' enviada com sucesso!`,
            "text-green-600"
          );
          resolve(response);
        } else {
          setStatus(
            `❌ Erro ao enviar transação: ${
              response.message || response.error
            }`,
            "text-red-600"
          );
          reject(new Error(response.message || response.error));
        }
      },
      HIVE_KEYCHAIN_TIMEOUT // Timeout (opcional)
    );
  });
}
function setStatus(msg, cls = "text-gray-600") {
  statusEl.className = cls;
  statusEl.textContent = msg;
}

// === IndexedDB ===

// === Sincronização ===

async function refreshPage() {
  setStatus(`🔄 Carregando página ${currentPage}...`, "text-blue-600");

  // Busca os itens da página E o total de posts em paralelo
  const [items, total] = await Promise.all([
    getPage(currentPage),
    getTotalPostCount(),
  ]);

  const rankedCountsArray = await countPosts();
  const authorPostCountsMap = new Map(rankedCountsArray);

  await renderPosts(items, authorPostCountsMap);
  updateControls(total); // Passa o total para atualizar os controles

  if (items.length > 0) {
    setStatus(`Página ${currentPage} carregada.`, "text-gray-600");
  } else if (total > 0) {
    setStatus(`Página ${currentPage} está vazia.`, "text-gray-500");
  } else {
    setStatus(
      "Nenhum post encontrado. Sincronize para começar.",
      "text-gray-500"
    );
  }
}

async function renderPosts(items, authorPostCountsMap) {
  //countPosts();
  postsContainer.innerHTML = "";
  if (!items.length) {
    postsContainer.innerHTML =
      '<div class="py-8 text-center text-gray-500">Nenhum post nesta página.</div>';
    return;
  }
  let reputations = {};

  for (const p of items) {
    reputations[p.author] = await getReputation(p.author);
  }
  //reputations = Object.values(reputations);
  const savedUsername = localStorage.getItem(LOGIN_STORAGE_KEY);
  items.forEach((p, index) => {
    if (spammerList.has(p.author)) return;

    const currentReputation = reputations[p.author]?.data ?? 25;
    if (currentReputation >= 50) return;

    const repDisplay = currentReputation
      ? `<span class="text-xs ml-1 text-gray-400">(${currentReputation})</span>`
      : "";

// 💡 Usa o Map global para obter a contagem TOTAL do autor
    const totalPostCount = authorPostCountsMap.get(p.author) || 0;
    
    const countDisplay = totalPostCount > 0 
        ? `<span class="ml-2 px-1.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-800 rounded">Total Posts: ${totalPostCount}</span>`
        : '';


    const card = document.createElement("article");
    // --- 💡 ALTERAÇÃO AQUI ---
    let cardClasses = "shadow p-4 rounded-lg";

    if (p.parent_author) {
      // Background diferente e uma borda para destacar que é uma Reply
      cardClasses += " bg-yellow-50 border-l-4 border-yellow-500";
    } else {
      // Background padrão para posts raiz
      cardClasses += " bg-white";
    }

    card.className = cardClasses; // Aplica as classes
    // -------------------------

    const flairText = authorFlairs[p.author];
    const flairHtml = flairText
      ? `<span class="ml-2 px-1.5 py-0.5 text-xs font-semibold bg-red-100 text-red-800 rounded-full">${escapeHtml(
          flairText
        )}</span>`
      : ""; // Se não, retorna uma string vazia

    //console.log(p);
    const title = escapeHtml(p.title || "");
    const payout = escapeHtml(p.pending_payout_value || "0 HIVE");
    const bodyPreview = escapeHtml((p.body || "").slice(0, 400));
    const created = p.created ? new Date(p.created).toLocaleString() : "-";
    const escapedCreated = escapeHtml(created);

    console.log("myUsername", savedUsername);

    const actionBtn = myUsername
      ? `
                <button 
                    class="action-btn px-2 py-0.5 text-xs bg-gray-200 hover:bg-gray-300 text-gray-800 rounded" 
                    data-author="${escapeHtml(p.author)}"
                    data-permlink="${escapeHtml(p.permlink)}"
                >
                    Adicionar a...
                </button>`
      : "";

    const rootTag = p.parent_author
      ? `<span class="px-2 py-0.5 text-xs bg-red-100 text-red-800 rounded">Reply</span>`
      : `<span class="px-2 py-0.5 text-xs bg-green-100 text-green-800 rounded">Post raiz</span>`;
    card.innerHTML = `
        <div class="flex justify-between">
          <div>
            <h3 class="text-lg font-semibold">${title}</h3>
            <div class="text-xs text-gray-500">Por <b>${escapeHtml(
              p.author
            )}</b> Rep: ${repDisplay} QT: ${countDisplay} Flair: ${flairHtml} <span class="mx-2">•</span> ${escapedCreated}</div>
          </div>
          ${rootTag}
        </div>

        <div class="mt-3 text-gray-700">${bodyPreview}${
      p.body && p.body.length > 400 ? "…" : ""
    }
            </div>  <div class="mt-3 text-red-700">• $${payout}</div><div>${actionBtn}</div>
      
      `;
    postsContainer.appendChild(card);
  });
  addActionBtnListeners();
}

// ... (após renderPosts)

function addActionBtnListeners() {
  document.querySelectorAll(".action-btn").forEach((btn) => {
    btn.onclick = (e) => {
      if (!myUsername) {
        alert("Você precisa estar logado para realizar esta ação.");
        return;
      }
      const author = e.target.getAttribute("data-author");
      // 💡 Neste ponto, você abriria o modal
      // Por exemplo: openActionModal(author);

      // DEMONSTRAÇÃO: Apenas chama a função de blacklist
      if (confirm(`Deseja adicionar @${author} à sua lista negra?`)) {
        performBlacklistAction(author);
      }
    };
  });
}

async function performBlacklistAction(userToBlacklist) {
  const customId = `${myUsername}.list.blacklist`; // Embora usemos "follow", mantemos o ID para referência

  // JSON EXTRA para o protocolo 'follow'
  const followJson = JSON.stringify([
    "follow",
    {
      follower: myUsername,
      following: userToBlacklist, // Deve ser uma string, não um array para um follow/blacklist
      what: ["blacklist"],
    },
  ]);

  try {
    await sendCustomJson(myUsername, "follow", followJson); // O ID da transação é "follow"
    // 💡 O ideal é que o dapp/ferramenta de lista negra
    // também leia o ID 'myusername.list.blacklist'

    // Exemplo: Enviando o ID para registro próprio (opcional)
    const recordJson = JSON.stringify({
      action: "add",
      type: "blacklist",
      target: userToBlacklist,
      reason: "Motivo padrao", // Capturar motivo do modal
      timestamp: new Date().toISOString(),
    });
    await sendCustomJson(
      myUsername,
      `${myUsername}.list.blacklist`,
      recordJson
    );
  } catch (e) {
    console.error("Falha na ação de Blacklist.", e);
  }
}

function updateControls(total) {
  totalPages = Math.ceil(total / pageSize());
  pageInfo.textContent = `Página ${currentPage} de ${totalPages}`;
  prevBtn.disabled = currentPage <= 1;
  nextBtn.disabled = currentPage >= totalPages;
  gotoInput.value = currentPage; // Sincroniza o input com a página atual
}
function updateAuthUI() {
  if (myUsername) {
    loginBtn.style.display = "none";
    logoutBtn.style.display = "inline-flex"; // Mostra o logout
    logoutBtn.textContent = `🚪 Logout (${myUsername})`;
  } else {
    loginBtn.style.display = "inline-flex"; // Mostra o login
    logoutBtn.style.display = "none";
  }
  // Você pode querer chamar refreshPage() aqui para re-renderizar posts
  // com base no usuário logado, mas vamos pular isso por enquanto.
}
async function performLogin() {
  if (!window.hive_keychain) {
    setStatus(
      "❌ Hive Keychain não encontrado. Instale a extensão!",
      "text-red-600"
    );
    return;
  }

  // Pede o username usando a função "requestHandshake" do Keychain
  // Isso é a maneira mais limpa de iniciar uma sessão.
  window.hive_keychain.requestHandshake(() => {
    // A API não retorna o username diretamente do handshake, então
    // pedimos ao usuário que digite, ou usamos a primeira conta.
    const user = prompt(
      "🔑 Login: Por favor, digite seu nome de usuário Hive:"
    );
    if (user && user.length > 2) {
      saveLogin(user.toLowerCase());
      setStatus(`✅ Logado como @${user}.`, "text-green-600");
    } else {
      setStatus(
        "🚫 Login cancelado ou nome de usuário inválido.",
        "text-gray-600"
      );
    }
  });
}

// === Eventos ===
prevBtn.onclick = () => {
  if (currentPage > 1) {
    currentPage--;
    refreshPage();
  }
};
nextBtn.onclick = () => {
  if (currentPage < totalPages) {
    // Usa a variável global 'totalPages'
    currentPage++;
    refreshPage();
  }
};
gotoBtn.onclick = async () => {
  // Busca o total para saber o limite máximo da página
  const total = await getTotalPostCount();
  totalPages = Math.ceil(total / pageSize());
  currentPage = Math.max(1, Math.min(Number(gotoInput.value), totalPages || 1));
  refreshPage();
};
pageSizeSel.onchange = () => {
  currentPage = 1; // Volta para a página 1
  refreshPage();
};
syncBtn.onclick = async () => {
  // Adiciona feedback de loading
  syncBtn.disabled = true;
  syncBtn.textContent = "Sincronizando...";
  setStatus(`🔄 Sincronizando com servidor...`, "text-blue-600");

  const syncResult = await syncFromServer();

  await deleteOldPosts();
  // ATUALIZA O STATUS DA UI BASEADO NO RESULTADO DO SERVIÇO
  if (syncResult && syncResult.status) {
    setStatus(syncResult.status.msg, syncResult.status.cls);
  } else {
    // Caso de erro genérico se syncResult for nulo ou inesperado
    setStatus(
      "❌ Sincronização falhou ou retornou inesperadamente.",
      "text-red-600"
    );
  }

  // Reseta para a página 1 se a página atual não existir mais (ex: mudou page size)
  const total = await getTotalPostCount();
  totalPages = Math.ceil(total / pageSize());
  if (currentPage > totalPages) currentPage = 1;

  await refreshPage(); // Atualiza a visualização

  syncBtn.disabled = false;
  syncBtn.textContent = "🔄 Sincronizar";
};


function showView(viewId) {
    // Esconde todos os contêineres principais e mostra apenas o desejado
    const views = [mainContent, rankingPage];
    
    // Adiciona 'hidden' a todos
    views.filter(v => v).forEach(view => view.classList.add('hidden'));

    if (viewId === 'ranking') {
        if (rankingPage) rankingPage.classList.remove('hidden');
        
        // 💡 A CHAVE: Obter o tipo de ranking selecionado e renderizá-lo.
        const selectedType = rankingTypeSelect.value || 'posts'; 
        rankingTypeSelect.value = selectedType; // Garante que o dropdown reflita o estado
        updateRankingDisplay(selectedType); 
        
    } else { // 'posts' (mainContent)
        if (mainContent) mainContent.classList.remove('hidden');
        refreshPage(); // Recarrega os posts da página principal
    }
}

if (rankingTypeSelect) {
    rankingTypeSelect.onchange = (e) => {
        updateRankingDisplay(e.target.value);
    };
}
// === Eventos de Navegação ===

// Adicione um botão para "Ver Ranking" na UI principal (você precisará adicioná-lo ao HTML)
if (viewRankingBtn) {
    viewRankingBtn.onclick = () => showView('ranking');
}

// Botão "Voltar" na página de ranking
backToPostsBtn.onclick = () => showView('posts');





// === Inicialização ===
(async function init() {
  const savedUsername = localStorage.getItem(LOGIN_STORAGE_KEY);

  if (savedUsername) {
    saveLogin(savedUsername); // Isso define 'myUsername' e atualiza a UI
  } else {
    updateAuthUI();
  }
  await openDB();
  setStatus("📂 Banco de dados carregado (IndexedDB).");
  await deleteOldPosts();
  // INICIALIZAÇÃO DA SINCRONIZAÇÃO
  setStatus(`🔄 Sincronizando dados iniciais...`, "text-blue-600");
  const initSyncResult = await syncFromServer();
  if (initSyncResult && initSyncResult.status) {
    setStatus(initSyncResult.status.msg, initSyncResult.status.cls);
  }

  currentPage = 1;
  showView('posts');
  //await refreshPage(); // Depois carrega a página 1

  console.log("savedUsername aghain", savedUsername);

  // 2. Eventos de Login/Logout
  loginBtn.onclick = performLogin;
  logoutBtn.onclick = logout;

  
})();
