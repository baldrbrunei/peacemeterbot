require("dotenv").config();

const { Telegraf, Markup } = require("telegraf");
const { createClient } = require("@supabase/supabase-js");

const bot = new Telegraf(process.env.BOT_TOKEN);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// =========================
// STATE
// =========================
let state = {};
let deleteConfirm = {};
let newsDraft = {};
let lastNews = {
  chatId: null,
  messageId: null
};

// =========================
// MAIN MENU
// =========================
function mainMenu(ctx) {
  return ctx.reply(
    "Admin menu:",
    Markup.keyboard([
      ["📊 Change probability"],
      ["📰 Add news"],
      ["🗑 Delete last post"],
      ["⬅️ Back to menu"]
    ]).resize()
  );
}

// =========================
// /admin
// =========================
bot.command("admin", (ctx) => {
  const id = ctx.from.id.toString();

  state[id] = { step: "password" };
  ctx.reply("Enter password:");
});

// =========================
// TEXT HANDLER
// =========================
bot.on("text", async (ctx) => {
  const id = ctx.from.id.toString();
  const text = ctx.message.text;

  const s = state[id];
  if (!s) return;

  // =========================
  // GLOBAL COMMANDS
  // =========================
  if (text === "/cancel") {
    state[id] = { step: "menu" };
    newsDraft[id] = null;
    deleteConfirm[id] = false;
    return mainMenu(ctx);
  }

  if (text === "⬅️ Back to menu") {
    state[id] = { step: "menu" };
    return mainMenu(ctx);
  }

  // =========================
  // PASSWORD
  // =========================
  if (s.step === "password") {
    if (text !== process.env.ADMIN_PASSWORD) {
      return ctx.reply("Wrong password");
    }

    state[id] = { step: "menu" };
    return mainMenu(ctx);
  }

  // =========================
  // MENU
  // =========================
  if (s.step === "menu") {
    if (text === "📊 Change probability") {
      state[id] = { step: "period" };
      return ctx.reply(
        "Choose period:",
        Markup.keyboard([["month", "six", "year"], ["⬅️ Back to menu"]]).resize()
      );
    }

    if (text === "📰 Add news") {
      state[id] = { step: "news_text" };
      return ctx.reply("Send news text:");
    }

    if (text === "🗑 Delete last post") {
      deleteConfirm[id] = true;
      return ctx.reply(
        "Delete last post?",
        Markup.keyboard([["YES", "NO"], ["⬅️ Back to menu"]]).resize()
      );
    }
  }

  // =========================
  // DELETE CONFIRM
  // =========================
  if (deleteConfirm[id]) {
    if (text === "NO") {
      deleteConfirm[id] = false;
      state[id] = { step: "menu" };
      return mainMenu(ctx);
    }

    if (text === "YES") {
  // берём реально последний пост из Supabase
  const { data } = await supabase
    .from("news")
    .select("id, text, image")
    .order("id", { ascending: false })
    .limit(1)
    .single();

  if (!data) return ctx.reply("No posts found");

  // удаляем из базы
  const { error } = await supabase
    .from("news")
    .delete()
    .eq("id", data.id);

  if (error) return ctx.reply("DB delete error");

  // удаляем сообщение в Telegram (если есть)
  try {
    await ctx.telegram.deleteMessage(
      ctx.chat.id,
      lastNews.messageId
    );
  } catch (e) {
    console.log("Telegram delete failed (ok if already deleted)");
  }

  deleteConfirm[id] = false;
  state[id] = { step: "menu" };

  return ctx.reply("Deleted last post");
}
  }

  // =========================
  // PERIOD
  // =========================
  if (s.step === "period") {
    state[id] = { step: "value", period: text };
    return ctx.reply("Send new percentage:");
  }

  // =========================
  // VALUE UPDATE
  // =========================
  if (s.step === "value") {
    const value = parseInt(text);
    if (isNaN(value)) return ctx.reply("Send number");

    await supabase
      .from("probabilities")
      .update({ value })
      .eq("id", s.period);

    state[id] = { step: "menu" };
    return mainMenu(ctx);
  }

  // =========================
  // NEWS TEXT
  // =========================
  if (s.step === "news_text") {
    newsDraft[id] = { text };
    state[id] = { step: "news_photo" };

    return ctx.reply("Send photo or type /skip");
  }

  // =========================
  // SKIP PHOTO (TEXT ONLY NEWS)
  // =========================
  if (text === "/skip" && s.step === "news_photo") {
  const newsText = newsDraft[id]?.text;

  if (!newsText) return ctx.reply("No text provided");

  // 1. сначала Supabase
  const { data, error } = await supabase
    .from("news")
    .insert([
      {
        text: newsText,
        image: null
      }
    ])
    .select()
    .single();

  if (error) return ctx.reply("DB error");

  // 2. потом Telegram сообщение
  const msg = await ctx.reply(newsText);

  // 3. только после этого сохраняем lastNews
  lastNews = {
    id: data.id,
    chatId: ctx.chat.id,
    messageId: msg.message_id
  };

  state[id] = { step: "menu" };
  newsDraft[id] = null;

  return;
}

});
bot.on("photo", async (ctx) => {
  const id = ctx.from.id.toString();
  const s = state[id];

  if (!s || s.step !== "news_photo") return;

  const fileId = ctx.message.photo.pop().file_id;
  const file = await ctx.telegram.getFile(fileId);

  const photo = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;

  const text = newsDraft[id]?.text;
  if (!text) return ctx.reply("No text provided");

  // 1. save to Supabase FIRST (важно для delete)
  const { data, error } = await supabase
    .from("news")
    .insert([
      {
        text,
        image: photo
      }
    ])
    .select()
    .single();

  if (error) return ctx.reply("DB error");

  // 2. send to Telegram AFTER DB (чтобы всё синхронизировано)
  const msg = await ctx.replyWithPhoto(photo, {
    caption: text
  });

  // 3. save reference
  lastNews = {
    id: data.id,
    chatId: ctx.chat.id,
    messageId: msg.message_id
  };

  state[id] = { step: "menu" };
  newsDraft[id] = null;
});

// =========================
// START
// =========================
bot.start((ctx) => {
  return ctx.reply("PeaceMeter", {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "📊 Open PeaceMeter",
            web_app: {
              url: "https://YOUR-DOMAIN.vercel.app"
            }
          }
        ]
      ]
    }
  });
});

// =========================
// RUN BOT
// =========================
const PORT = process.env.PORT || 3000;

bot.telegram.setWebhook(
  "https://peacemeterbot.onrender.com/bot"
);

bot.startWebhook("/bot", null, PORT);

console.log("Webhook bot running");