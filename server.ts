import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { Telegraf, Markup } from "telegraf";
import * as dotenv from "dotenv";
import fs from 'fs';
import * as admin from 'firebase-admin';

dotenv.config();

const app = express();
const PORT = 3000;

// Initialize Firebase Admin
const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
let firebaseAppletConfig: any = {};

if (fs.existsSync(configPath)) {
  firebaseAppletConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

// For Firebase Admin, we use the project ID and database ID from config
// In a real production environment, you would also use a Service Account key
// But in this environment, the Admin SDK can often use default credentials if available
      if (!admin.apps || admin.apps.length === 0) {
  admin.initializeApp({
    projectId: process.env.VITE_FIREBASE_PROJECT_ID || firebaseAppletConfig.projectId,
    databaseURL: `https://${process.env.VITE_FIREBASE_PROJECT_ID || firebaseAppletConfig.projectId}.firebaseio.com`
  });
}

const db = admin.firestore();
// Handle named database if provided
if (process.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID || firebaseAppletConfig.firestoreDatabaseId) {
  // Note: In some versions of firebase-admin, you might need to use a specific client for named databases
  // For simplicity here, we assume the default or correctly configured project
}

// Initialize Telegram Bot
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN || "PLACEHOLDER_TOKEN");

// Simple session store
const userSessions = new Map<number, { ftm?: string, gpon?: string, step: string }>();

bot.start(async (ctx) => {
  const userId = ctx.from?.id.toString() || "0";
  try {
    const whitelistSnapshot = await db.collection('whitelist')
      .where('telegram_id', '==', userId)
      .get();
    
    if (whitelistSnapshot.empty) {
      return ctx.reply("Maaf, ID Telegram Anda belum terdaftar di Whitelist. Silakan hubungi Admin.");
    }
    
    ctx.reply(`Halo ${ctx.from?.first_name || 'Technician'}! 🛠️\nSelamat datang di FiberTrace Bot.\n\nKetik 'validasi' untuk mulai input data teknis.`);
  } catch (err) {
    console.error(err);
    ctx.reply("Terjadi kesalahan saat mengecek whitelist.");
  }
});

bot.hears(/validasi/i, async (ctx) => {
  const userId = ctx.from?.id.toString() || "0";
  try {
    const whitelistSnapshot = await db.collection('whitelist')
      .where('telegram_id', '==', userId)
      .get();
    
    if (whitelistSnapshot.empty) {
      return ctx.reply("Maaf, ID Telegram Anda belum terdaftar.");
    }

    const ftmsSnapshot = await db.collection('ftms').get();
    if (ftmsSnapshot.empty) {
      return ctx.reply("Belum ada data FTM di database.");
    }

    const buttons = ftmsSnapshot.docs.map(doc => {
      const data = doc.data();
      return Markup.button.callback(data.name, `select_ftm:${data.name}`);
    });

    userSessions.set(ctx.from?.id || 0, { step: 'selecting_ftm' });
    ctx.reply("Pilih FTM:", Markup.inlineKeyboard(buttons, { columns: 2 }));
  } catch (err) {
    console.error(err);
    ctx.reply("Gagal mengambil data FTM.");
  }
});

bot.action(/select_ftm:(.+)/, async (ctx) => {
  const ftmName = ctx.match[1];
  const userId = ctx.from?.id || 0;
  
  try {
    const ftmsSnapshot = await db.collection('ftms')
      .where('name', '==', ftmName)
      .limit(1)
      .get();
    
    const ftmDoc = ftmsSnapshot.docs[0];
    
    if (!ftmDoc) return ctx.reply("FTM tidak ditemukan.");

    const gponsSnapshot = await db.collection('gpons')
      .where('ftm_id', '==', ftmDoc.id)
      .get();

    if (gponsSnapshot.empty) {
      return ctx.reply(`Belum ada data GPON untuk FTM ${ftmName}.`);
    }

    const buttons = gponsSnapshot.docs.map(doc => {
      const data = doc.data();
      return Markup.button.callback(data.name, `select_gpon:${data.name}`);
    });

    userSessions.set(userId, { ftm: ftmName, step: 'selecting_gpon' });
    ctx.editMessageText(`FTM: ${ftmName}\n\nPilih GPON:`, Markup.inlineKeyboard(buttons, { columns: 2 }));
  } catch (err) {
    console.error(err);
    ctx.reply("Gagal mengambil data GPON.");
  }
});

bot.action(/select_gpon:(.+)/, async (ctx) => {
  const gponName = ctx.match[1];
  const userId = ctx.from?.id || 0;
  const session = userSessions.get(userId);

  if (!session || !session.ftm) return ctx.reply("Sesi kadaluarsa. Ketik 'validasi' lagi.");

  userSessions.set(userId, { ...session, gpon: gponName, step: 'waiting_data' });
  
  ctx.editMessageText(`FTM: ${session.ftm}\nGPON: ${gponName}\n\nSilakan masukkan data teknis dengan format berikut:\n\nOA RAK 2 PANEL 3 PORT 4\nEA RAK 7 PANEL 5 PORT 2\nODC-PBL-FA FEEDER PANEL 1 PORT 6\nODC-PBL-FA DISTRIBUSI PANEL 4 PORT 2\nODP-PBL-FA/01\n\nKetik 'selesai' jika sudah tidak ada data lagi di FTM/GPON ini.`);
});

bot.hears(/selesai/i, (ctx) => {
  const userId = ctx.from?.id || 0;
  if (userSessions.has(userId)) {
    userSessions.delete(userId);
    ctx.reply("Sesi validasi ditutup. Terima kasih! Ketik 'validasi' untuk mulai baru.");
  } else {
    ctx.reply("Anda tidak sedang dalam sesi validasi.");
  }
});

bot.on("text", async (ctx) => {
  const userId = ctx.from?.id || 0;
  const session = userSessions.get(userId);

  if (!session || session.step !== 'waiting_data' || !session.ftm || !session.gpon) {
    if (ctx.message.text.toLowerCase().includes("validasi") || ctx.message.text.toLowerCase().includes("selesai")) return;
    return ctx.reply("Ketik 'validasi' untuk memulai.");
  }

  const text = ctx.message.text.toUpperCase();
  const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);

  if (lines.length < 5) {
    return ctx.reply("⚠️ Format salah. Pastikan menginput 5 baris data (OA, EA, ODC Feeder, ODC Distribusi, ODP).");
  }

  try {
    const oaLine = lines[0];
    const eaLine = lines[1];
    const odcFeederLine = lines[2];
    const odcDistLine = lines[3];
    const odpName = lines[4];

    const parseInfo = (line: string) => {
      const rak = line.match(/RAK\s+(\d+)/i)?.[1] || "-";
      const panel = line.match(/PANEL\s+(\d+)/i)?.[1] || "-";
      const port = line.match(/PORT\s+(\d+)/i)?.[1] || "-";
      return { rak, panel, port };
    };

    const oa = parseInfo(oaLine);
    const ea = parseInfo(eaLine);
    const odcFeeder = parseInfo(odcFeederLine);
    const odcDist = parseInfo(odcDistLine);
    
    const odcName = odcFeederLine.split(" ")[0];

    await db.collection('validations').add({
      ftm_name: session.ftm,
      gpon_name: session.gpon,
      oa_rak: oa.rak,
      oa_panel: oa.panel,
      oa_port: oa.port,
      ea_rak: ea.rak,
      ea_panel: ea.panel,
      ea_port: ea.port,
      odc_name: odcName,
      odc_feeder_panel: odcFeeder.panel,
      odc_feeder_port: odcFeeder.port,
      odc_dist_panel: odcDist.panel,
      odc_dist_port: odcDist.port,
      odp_name: odpName,
      technician_name: (ctx.from?.first_name || 'TECHNICIAN').toUpperCase(),
      technician_id: ctx.from?.id.toString() || "0",
      status: 'VALID',
      created_at: admin.firestore.FieldValue.serverTimestamp()
    });

    ctx.reply(`✅ DATA DISIMPAN!\n\nFTM: ${session.ftm}\nGPON: ${session.gpon}\nODP: ${odpName}\n\nSilakan lanjut input data berikutnya untuk GPON ini, atau ketik 'selesai'.`);
  } catch (err) {
    console.error(err);
    ctx.reply("❌ GAGAL MENYIMPAN DATA. Silakan coba lagi.");
  }
});

// Start bot polling
if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_TOKEN !== "PLACEHOLDER_TOKEN") {
  bot.launch().then(() => console.log("Telegram Bot is running..."));
} else {
  console.log("Telegram Bot Token not found. Bot is disabled.");
}

async function startServer() {
  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware setup
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

// Enable graceful stop
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
