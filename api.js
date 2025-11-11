import { getLastSyncedDate, getReputationFromCache, savePosts, saveReputationToCache, setLastSyncedDate} from "./mDB.js";

// Importe a função pageSize do utils
import { pageSize } from "./utils.js";

// Constantes
const REP_API_URL = "https://hafsql-api.mahdiyari.info/reputations/";
const API_URL = "http://localhost:4000/api/posts";


export async function syncFromServer() {
  const lastDate = await getLastSyncedDate();
  let url = `${API_URL}?limit=${pageSize()}`;
  if (lastDate) url += `&since=${encodeURIComponent(lastDate)}`;

  const resp = await fetch(url);
  if (!resp.ok) throw new Error("HTTP " + resp.status);
  const j = await resp.json();
  const items = j.items || j;

  if (items.length === 0) {
    //setStatus("✅ Nenhum novo post para sincronizar.", "text-green-600");
    return{ 
        status: { msg: "✅ Nenhum novo post para sincronizar.", cls: "text-green-600" },
        count: 0 
    };
  }

  await savePosts(items);
  const newestDate = items.reduce(
    (max, p) => (new Date(p.created) > new Date(max) ? p.created : max),
    lastDate || items[0].created
  );
  await setLastSyncedDate(newestDate);
    return {
        status: {
            msg: `✅ Sincronizados ${items.length} novos posts. Último: ${new Date(newestDate).toLocaleString()}`,
            cls: "text-green-600"
        },
        count: items.length,
        //statusStart: statusStart // Opcional: retorna o status inicial também
    };
}

export async function getReputation(account) {
  try {
    // 1️⃣ tenta pegar do cache
    const cached = await getReputationFromCache(account);
    if (cached !== null) {
      return { account, data: cached };
    }

    // 2️⃣ se não tiver no cache, busca na API
    const url = `${REP_API_URL}${account}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error("HTTP " + resp.status);

    const value = await resp.json(); // API retorna número cru

    // 3️⃣ converte para inteiro e salva
    const rep = Number(value).toFixed(0);
    await saveReputationToCache(account, rep);

    return { account, data: rep };
  } catch (err) {
    console.error("Erro ao buscar reputação:", err);
    return { account, data: 25 }; // fallback
  }
}

export const authorFlairs = {
  "hive-watchers": "Scam Hunter",
  spaminator: "Spam Fighter",
  arcange: "Hive Witness",
  curamax: "What? Possible AI?",
  "helios.voter": "Bot Voter",
  rainbowdash4l: "TIP SPAMMER",
  taskmaster4450le: "SPAMMER",
};

export const spammerList = new Set([
  "spammer-alpha",
  "scam-bot-123",
  "outro-spammer",
  "ai-summaries",
  "hivebuzz",
  "lolzbot",
  "graphene-faucet",
  "ladytoken",
  "redditposh",
  "lstr.alerts",
  "duo-tip",
  "pizzabot",
  // Adicione aqui os nomes exatos dos autores
]);