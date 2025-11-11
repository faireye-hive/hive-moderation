
import { pageSize } from "./utils.js";

export const DB_NAME = "HiveSyncDB";
export const DB_VERSION = 8; 

let db = null;

export async function getDB() {
  if (db) return db;
  db = await openDB();
  return db;
}

export function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      let postsStore;

      if (!db.objectStoreNames.contains("posts")) {
        postsStore = db.createObjectStore("posts", {
          keyPath: "permlink",
        });
      } else {
        postsStore = event.target.transaction.objectStore("posts");
      }
      // Adiciona o índice 'by_created' no campo 'created'
      if (!postsStore.indexNames.contains("by_created")) {
        postsStore.createIndex("by_created", "created");
      }

      if (!db.objectStoreNames.contains("reputations")) {
        db.createObjectStore("reputations", { keyPath: "account" });
      }

      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" });
      }
      console.log("📦 Stores criadas/confirmadas:", db.objectStoreNames);
    };

    request.onsuccess = (event) => {
      db = event.target.result;
      console.log("✅ Banco aberto com sucesso:", db);
      resolve(db);
    };

    request.onerror = (event) => {
      console.error("❌ Erro ao abrir DB:", event.target.error);
      reject(event.target.error);
    };
  });
}

export async function savePosts(posts) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("posts", "readwrite");
    const store = tx.objectStore("posts");
    posts.forEach((p) => store.put(p));
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

export async function getAllPosts() {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("posts", "readonly");
    const store = tx.objectStore("posts");
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

export async function getLastSyncedDate() {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("meta", "readonly");
    const store = tx.objectStore("meta");
    const req = store.get("lastSynced");
    req.onsuccess = () => resolve(req.result ? req.result.value : null);
    req.onerror = () => reject(req.error);
  });
}

export async function setLastSyncedDate(date) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("meta", "readwrite");
    const store = tx.objectStore("meta");
    store.put({ key: "lastSynced", value: date });
    tx.oncomplete = resolve;
    tx.onerror = (e) => reject(e.target.error);
  });
}


export async function getPage(page) {
  const db = await getDB();
  const items = [];
  const limit = pageSize();
  const offset = (page - 1) * limit;

  return new Promise((resolve, reject) => {
    const tx = db.transaction("posts", "readonly");
    const store = tx.objectStore("posts");
    const index = store.index("by_created"); // Usa o índice
    const req = index.openCursor(null, "prev"); // 'prev' = ordem descendente (mais novo primeiro)
    let advanced = false;

    req.onsuccess = (event) => {
      const cursor = event.target.result;
      if (!cursor) {
        resolve(items); // Acabaram os itens
        return;
      }

      // Pula os itens das páginas anteriores (offset)
      if (!advanced && offset > 0) {
        advanced = true;
        cursor.advance(offset); // Pula 'offset' itens
        return; // onsuccess será chamado novamente na posição correta
      }

      // Adiciona itens até o limite da página
      if (items.length < limit) {
        items.push(cursor.value);
        cursor.continue(); // Vai para o próximo item
      } else {
        resolve(items); // Página está cheia
      }
    };
    req.onerror = (e) => reject(e.target.error);
  });
}

export async function deleteOldPosts() {
  const db = await getDB();

  // 1. Calcular a data de corte
  // O campo 'created' é uma string ISO (ex: "2024-01-01T10:00:00").
  // Podemos usar um objeto Date para criar o range.
  const cutoffTime = new Date().getTime() - 24 * 60 * 60 * 1000;
  const cutoffDate = new Date(cutoffTime);

  console.log(
    `🧹 Deletando posts mais antigos que ${cutoffDate.toLocaleString()}`
  );

  return new Promise((resolve, reject) => {
    // 2. Abrir transação em modo "readwrite"
    const tx = db.transaction("posts", "readwrite");
    const store = tx.objectStore("posts");
    const index = store.index("by_created");

    // 3. Criar um range: tudo que for *menor que ou igual a* data de corte
    const range = IDBKeyRange.upperBound(cutoffDate.toISOString());

    const req = index.openCursor(range); // Abre cursor no índice
    let deleteCount = 0;

    req.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        // 4. Encontrou um post antigo: delete!
        cursor.delete();
        deleteCount++;
        cursor.continue(); // Vai para o próximo item no range
      } else {
        // 5. Cursor terminou (não há mais posts antigos)
        console.log(`✅ ${deleteCount} posts antigos deletados.`);
        resolve(deleteCount);
      }
    };

    req.onerror = (e) => {
      console.error("❌ Erro ao deletar posts antigos:", e.target.error);
      reject(e.target.error);
    };
  });
}

export async function getTotalPostCount() {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("posts", "readonly");
    const store = tx.objectStore("posts");
    const req = store.count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e.target.error);
  });
}


// === Reputação ===
export async function getReputationFromCache(account) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("reputations", "readonly");
    const store = tx.objectStore("reputations");
    const req = store.get(account);

    req.onsuccess = () => {
      resolve(req.result ? req.result.reputation : null);
    };
    req.onerror = (e) => reject(e.target.error);
  });
}

export async function saveReputationToCache(account, reputation) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("reputations", "readwrite");
    const store = tx.objectStore("reputations");

    store.put({ account, reputation });
    tx.oncomplete = resolve;
    tx.onerror = (e) => reject(e.target.error);
  });
}
// === Reputação ===