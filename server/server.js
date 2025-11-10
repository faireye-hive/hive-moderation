import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const { Pool } = pg;
const pool = new Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  max: 10
});

const app = express();
app.use(cors());
app.use(express.json());

/**
 * Busca todos os posts em blocos (100 por vez) com fetch paralelo.
 * @param {string} since - data mínima (ex: '2025-11-08')
 * @param {number} totalLimit - número total máximo de posts a buscar
 * @param {number} concurrency - número de conexões paralelas (default: 5)
 */
async function getAllPostsParallel({ since, totalLimit = 100, concurrency = 5 }) {
  const pageSize = 100;
  const countRes = await pool.query(
    `SELECT COUNT(*) AS cnt FROM hafsql."comments" WHERE created >= $1`,
    [since]
  );
  const totalAvailable = Number(countRes.rows[0]?.cnt || 0);

  const totalNeeded = totalLimit;
  const totalPages = Math.ceil(totalNeeded / pageSize);

  console.log(`📊 Total available: ${totalAvailable} | Fetching up to ${totalNeeded} in ${totalPages} pages`);

  const sql = `
    SELECT id, title, body, author, "permlink", parent_author, parent_permlink, created,
           last_edited, cashout_time, remaining_till_cashout, last_payout, tags, category,
           json_metadata, root_author, root_permlink, pending_payout_value, author_rewards,
           author_rewards_in_hive, total_payout_value, curator_payout_value, beneficiary_payout_value,
           total_rshares, net_rshares, total_vote_weight, beneficiaries, max_accepted_payout,
           percent_hbd, allow_votes, allow_curation_rewards, deleted
    FROM hafsql."comments"
    WHERE created >= $1
    ORDER BY created ASC
    LIMIT $2 OFFSET $3
  `;

  let allRows = [];
  let currentPage = 1;

  // Função auxiliar para buscar uma página específica
  const fetchPage = async (page) => {
    const offset = (page - 1) * pageSize;
    const result = await pool.query(sql, [since, pageSize, offset]);
    console.log(`📦 Page ${page} (${result.rows.length} rows)`);
    return result.rows;
  };

  while (currentPage <= totalPages) {
    // Define o grupo de páginas para buscar em paralelo
    const pages = Array.from(
      { length: Math.min(concurrency, totalPages - currentPage + 1) },
      (_, i) => currentPage + i
    );

    // Busca essas páginas simultaneamente
    const batchResults = await Promise.all(pages.map(fetchPage));
    batchResults.forEach((rows) => allRows.push(...rows));

    currentPage += concurrency;
    console.log(`✅ Progress: ${allRows.length}/${totalNeeded} rows`);
    if (allRows.length >= totalNeeded) break;
  }

  return allRows.slice(0, totalNeeded);
}

// Endpoint principal
app.get("/api/posts", async (req, res) => {
  try {
    const cutoffTime = new Date().getTime() - 24 * 60 * 60 * 1000;
    let cutoffDate = new Date(cutoffTime);
    cutoffDate = cutoffDate.toISOString(); // <-- ou .toUTCString()

    console.log(cutoffDate);

    const since = req.query.since || cutoffDate;
    console.log("Using since:", since);
    const totalLimit = parseInt(req.query.limit || "100", 10);
    const concurrency = parseInt(req.query.concurrency || "1", 10);

    const allPosts = await getAllPostsParallel({ since, totalLimit, concurrency });

    res.json({
      total: allPosts.length,
      items: allPosts
    });
  } catch (err) {
    console.error("DB error:", err);
    res.status(500).json({ error: "db query failed", detail: String(err) });
  }
});

const PORT = Number(process.env.PORT || 4000);
app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));
