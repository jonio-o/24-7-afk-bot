"use strict";

// ============================================================
// CORE IMPORTS
// ============================================================

const mineflayer = require("mineflayer");
const { pathfinder, Movements, goals } = require("mineflayer-pathfinder");
const { GoalBlock } = goals;

const express = require("express");
const http = require("http");
const https = require("https");

const config = require("./settings.json");
const { addLog, getLogs } = require("./logger");

// ============================================================
// APP + SERVER STATE
// ============================================================

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 5000;

// ============================================================
// GLOBAL BOT STATE
// ============================================================

let bot = null;
let botRunning = false;

let botState = {
  connected: false,
  startTime: Date.now(),
  lastActivity: Date.now(),
  reconnectAttempts: 0,
  wasThrottled: false,
  errors: [],
};

// interval tracking (IMPORTANT for cleanup)
let intervals = [];
let timeouts = [];

function addInterval(fn, time) {
  const id = setInterval(fn, time);
  intervals.push(id);
  return id;
}

function clearAllIntervals() {
  for (const i of intervals) clearInterval(i);
  intervals = [];

  for (const t of timeouts) clearTimeout(t);
  timeouts = [];
}

// ============================================================
// BOT ENGINE + DATING SIM SYSTEM 1.0
// ============================================================

let bot = null;
let activeIntervals = [];
let reconnectTimeoutId = null;
let connectionTimeoutId = null;
let isReconnecting = false;

// ============================================================
// 💘 DATING SIM STATE SYSTEM
// ============================================================

const datingSim = {
  players: new Map(), // username -> data
  leaderboard: [],
  quizActive: false,
};

// Player structure:
// {
//   points: number,
//   level: number,
//   streak: number,
//   lastSeen: timestamp
// }

function getPlayer(name) {
  if (!datingSim.players.has(name)) {
    datingSim.players.set(name, {
      points: 0,
      level: 1,
      streak: 0,
      lastSeen: Date.now(),
    });
  }
  return datingSim.players.get(name);
}

function getLevel(points) {
  return Math.floor(points / 100) + 1;
}

// ============================================================
// 🧠 SMART QUIZ ENGINE
// ============================================================

const quizPool = [
  {
    q: "If a Minecraft villager trades 1 emerald for 3 wheat, how many wheat for 7 emeralds?",
    a: "21",
    difficulty: 1,
  },
  {
    q: "What is the time complexity of binary search?",
    a: "O(log n)",
    difficulty: 2,
  },
  {
    q: "If x = 2 and y = 3, what is (x^y + y^x)?",
    a: "17",
    difficulty: 2,
  },
  {
    q: "What is the derivative of x^2?",
    a: "2x",
    difficulty: 3,
  },
  {
    q: "A server has 20 TPS. How many ticks in 5 minutes?",
    a: "6000",
    difficulty: 3,
  },
];

function pickQuestion() {
  return quizPool[Math.floor(Math.random() * quizPool.length)];
}

// ============================================================
// 📊 POINT SYSTEM
// ============================================================

function calculatePoints(difficulty, correct) {
  const base = difficulty * 10;
  return correct ? base : -Math.floor(base * 0.75);
}

// ============================================================
// 🎯 ASK RANDOM PLAYER EVERY 5 MINUTES
// ============================================================

function startQuizSystem(bot) {
  addInterval(() => {
    if (!bot || !botState.connected) return;
    if (datingSim.quizActive) return;

    const players = Object.values(bot.entities)
      .filter(e => e.type === "player" && e.username !== bot.username)
      .map(e => e.username);

    if (!players.length) return;

    const target = players[Math.floor(Math.random() * players.length)];
    const question = pickQuestion();

    datingSim.quizActive = true;
    datingSim.current = {
      player: target,
      question,
      difficulty: question.difficulty,
    };

    bot.chat(
      `💘 [Dating Sim Quiz] ${target}, answer this: ${question.q}`
    );

    addLog(`[DatingSim] Asked ${target}: ${question.q}`);

    // timeout fail = penalty
    setTimeout(() => {
      if (datingSim.quizActive && datingSim.current?.player === target) {
        const p = getPlayer(target);
        const penalty = calculatePoints(question.difficulty, false);

        p.points += penalty;
        p.streak = 0;

        bot.chat(`❌ ${target} didn't answer. -${Math.abs(penalty)} points.`);
        addLog(`[DatingSim] ${target} failed to answer`);
        datingSim.quizActive = false;
      }
    }, 20000);
  }, 5 * 60 * 1000);
}

// ============================================================
// 💬 ANSWER LISTENER (CHAT HOOK)
// ============================================================

function handleDatingSimChat(bot) {
  bot.on("chat", (username, message) => {
    if (!datingSim.quizActive) return;
    if (!datingSim.current) return;
    if (username !== datingSim.current.player) return;

    const p = getPlayer(username);
    const q = datingSim.current.question;

    const correct =
      message.trim().toLowerCase() === q.a.toLowerCase();

    const change = calculatePoints(q.difficulty, correct);

    p.points += change;
    p.level = getLevel(p.points);
    p.streak = correct ? p.streak + 1 : 0;
    p.lastSeen = Date.now();

    if (correct) {
      bot.chat(`💖 Correct ${username}! +${change} points`);
    } else {
      bot.chat(`💔 Wrong ${username}! ${change} points`);
    }

    addLog(
      `[DatingSim] ${username} answered ${
        correct ? "correctly" : "wrong"
      } (${change})`
    );

    datingSim.quizActive = false;
    datingSim.current = null;
  });
}

// ============================================================
// 🏆 LEADERBOARD SYSTEM
// ============================================================

function getLeaderboard() {
  return Array.from(datingSim.players.entries())
    .map(([name, data]) => ({
      name,
      points: data.points,
      level: data.level,
    }))
    .sort((a, b) => b.points - a.points)
    .slice(0, 10);
}

// ============================================================
// BOT CREATION (UNCHANGED CORE + HOOKS ADDED)
// ============================================================

function createBot() {
  if (isReconnecting) return;

  if (bot) {
    clearAllIntervals();
    try {
      bot.removeAllListeners();
      bot.end();
    } catch {}
    bot = null;
  }

  addLog(`[Bot] Creating bot...`);

  try {
    bot = mineflayer.createBot({
      username: config["bot-account"].username,
      password: config["bot-account"].password || undefined,
      auth: config["bot-account"].type,
      host: config.server.ip,
      port: config.server.port,
      version: config.server.version || false,
    });

    bot.once("spawn", () => {
      botState.connected = true;
      botState.reconnectAttempts = 0;
      isReconnecting = false;

      addLog(`[Bot] Spawned`);

      // ✅ START DATING SIM SYSTEM HERE
      startQuizSystem(bot);
      handleDatingSimChat(bot);
    });

    bot.on("end", () => scheduleReconnect());
    bot.on("error", (e) => addLog(`[Bot] Error ${e.message}`));
  } catch (e) {
    scheduleReconnect();
  }
}

// ============================================================
// RECONNECT SYSTEM (UNCHANGED)
// ============================================================

function scheduleReconnect() {
  if (isReconnecting) return;
  isReconnecting = true;

  const delay = 5000;
  addLog(`[Bot] Reconnecting in ${delay / 1000}s`);

  reconnectTimeoutId = setTimeout(() => {
    isReconnecting = false;
    createBot();
  }, delay);
}

// ============================================================
// MODULE INITIALIZATION
// PART 3A
// ============================================================

function initializeModules(bot, mcData, defaultMove) {
  addLog("[Modules] Loading modules...");

  // ============================================================
  // 💘 DATING SIM STARTUP
  // ============================================================

  try {
    if (typeof startQuizSystem === "function") {
      startQuizSystem(bot);
      addLog("[DatingSim] Quiz system loaded");
    }

    if (typeof handleDatingSimChat === "function") {
      handleDatingSimChat(bot);
      addLog("[DatingSim] Chat listener loaded");
    }
  } catch (err) {
    addLog(`[DatingSim] Startup Error: ${err.message}`);
  }

  // ============================================================
  // AUTO AUTH
  // ============================================================

  if (
    config.utils &&
    config.utils["auto-auth"] &&
    config.utils["auto-auth"].enabled
  ) {
    const password = config.utils["auto-auth"].password;
    let authCompleted = false;

    function sendAuth(type) {
      if (
        authCompleted ||
        !bot ||
        !botState.connected
      )
        return;

      authCompleted = true;

      if (type === "register") {
        bot.chat(`/register ${password} ${password}`);
        addLog("[Auth] Register command sent");
      } else {
        bot.chat(`/login ${password}`);
        addLog("[Auth] Login command sent");
      }
    }

    bot.on("messagestr", (message) => {
      if (authCompleted) return;

      const msg = String(message).toLowerCase();

      if (
        msg.includes("/register") ||
        msg.includes("register") ||
        msg.includes("please register") ||
        msg.includes("create password")
      ) {
        sendAuth("register");
      }

      if (
        msg.includes("/login") ||
        msg.includes("login") ||
        msg.includes("please login")
      ) {
        sendAuth("login");
      }
    });

    setTimeout(() => {
      if (
        !authCompleted &&
        bot &&
        botState.connected
      ) {
        try {
          bot.chat(`/login ${password}`);
          authCompleted = true;
          addLog("[Auth] Failsafe login sent");
        } catch (e) {
          addLog(`[Auth] Error: ${e.message}`);
        }
      }
    }, 10000);
  }

  // ============================================================
  // CHAT MESSAGE ROTATION
  // ============================================================

  if (
    config.utils &&
    config.utils["chat-messages"] &&
    config.utils["chat-messages"].enabled
  ) {
    const messages =
      config.utils["chat-messages"].messages || [];

    if (messages.length > 0) {
      if (config.utils["chat-messages"].repeat) {
        let index = 0;

        addInterval(() => {
          try {
            if (
              !bot ||
              !botState.connected
            )
              return;

            bot.chat(messages[index]);

            addLog(
              `[ChatRotation] ${messages[index]}`
            );

            botState.lastActivity = Date.now();

            index++;

            if (index >= messages.length)
              index = 0;
          } catch (err) {
            addLog(
              `[ChatRotation] Error: ${err.message}`
            );
          }
        },
        config.utils["chat-messages"]["repeat-delay"] *
          1000);
      } else {
        messages.forEach((msg, i) => {
          setTimeout(() => {
            try {
              if (
                bot &&
                botState.connected
              ) {
                bot.chat(msg);
              }
            } catch {}
          }, i * 1000);
        });
      }
    }
  }

  // ============================================================
  // DATING SIM CHAT COMMANDS
  // ============================================================

  bot.on("chat", (username, message) => {
    if (!datingSim) return;
    if (username === bot.username) return;

    const msg = message.toLowerCase();

    try {
      // ----------------------------------
      // /points
      // ----------------------------------

      if (
        msg === "!points" ||
        msg === "!love" ||
        msg === "!level"
      ) {
        const player = getPlayer(username);

        bot.chat(
          `${username} | 💘 Points: ${player.points} | Level: ${player.level}`
        );

        return;
      }

      // ----------------------------------
      // /leaderboard
      // ----------------------------------

      if (
        msg === "!leaderboard" ||
        msg === "!top" ||
        msg === "!lb"
      ) {
        const top = getLeaderboard();

        if (!top.length) {
          bot.chat(
            "No dating sim data yet."
          );
          return;
        }

        let board =
          "🏆 Dating Sim Top: ";

        board += top
          .slice(0, 5)
          .map(
            (p, i) =>
              `#${i + 1} ${p.name}(${p.points})`
          )
          .join(" | ");

        bot.chat(board);

        return;
      }

      // ----------------------------------
      // !rank
      // ----------------------------------

      if (msg === "!rank") {
        const sorted =
          getLeaderboard();

        const rank =
          sorted.findIndex(
            (p) => p.name === username
          ) + 1;

        if (rank > 0) {
          bot.chat(
            `${username} is rank #${rank}`
          );
        } else {
          bot.chat(
            `${username} is currently unranked.`
          );
        }

        return;
      }

      // ----------------------------------
      // !date
      // ----------------------------------

      if (msg === "!date") {
        const player =
          getPlayer(username);

        const level =
          player.level;

        let title =
          "💔 Stranger";

        if (level >= 5)
          title = "🌹 Crush";

        if (level >= 10)
          title = "❤️ Partner";

        if (level >= 20)
          title = "💍 Soulmate";

        if (level >= 30)
          title = "👑 True Love";

        bot.chat(
          `${username}'s relationship status: ${title}`
        );

        return;
      }
    } catch (err) {
      addLog(
        `[DatingSim] Command Error: ${err.message}`
      );
    }
  });

  addLog(
    "[Modules] PART 3A loaded successfully"
  );

    // ============================================================
  // ANTI-AFK 2.0
  // ============================================================

  if (
    config.utils &&
    config.utils["anti-afk"] &&
    config.utils["anti-afk"].enabled
  ) {
    addLog("[AntiAFK] Enabled");

    // --------------------------------
    // Arm Swing
    // --------------------------------

    addInterval(() => {
      if (!bot || !botState.connected) return;

      try {
        bot.swingArm();
        botState.lastActivity = Date.now();
      } catch {}
    }, 15000 + Math.floor(Math.random() * 30000));

    // --------------------------------
    // Hotbar Shuffle
    // --------------------------------

    addInterval(() => {
      if (!bot || !botState.connected) return;

      try {
        const slot = Math.floor(Math.random() * 9);
        bot.setQuickBarSlot(slot);
      } catch {}
    }, 45000 + Math.floor(Math.random() * 60000));

    // --------------------------------
    // Random Sneak
    // --------------------------------

    addInterval(() => {
      if (!bot || !botState.connected) return;

      try {
        if (Math.random() > 0.75) {
          bot.setControlState("sneak", true);

          setTimeout(() => {
            try {
              bot.setControlState("sneak", false);
            } catch {}
          }, 1000);
        }
      } catch {}
    }, 60000);

    // --------------------------------
    // Random Look
    // --------------------------------

    addInterval(() => {
      if (!bot || !botState.connected) return;

      try {
        const yaw =
          Math.random() * Math.PI * 2 - Math.PI;

        const pitch =
          Math.random() * 0.6 - 0.3;

        bot.look(yaw, pitch, true);

        botState.lastActivity = Date.now();
      } catch {}
    }, 30000);

    // --------------------------------
    // Micro Movement
    // Disabled if Circle Walk is enabled
    // --------------------------------

    const circleEnabled =
      config.movement &&
      config.movement["circle-walk"] &&
      config.movement["circle-walk"].enabled;

    if (!circleEnabled) {
      addInterval(() => {
        if (!bot || !botState.connected) return;

        try {
          const directions = [
            "forward",
            "back",
            "left",
            "right",
          ];

          const move =
            directions[
              Math.floor(
                Math.random() * directions.length
              )
            ];

          bot.setControlState(move, true);

          setTimeout(() => {
            try {
              bot.setControlState(move, false);
            } catch {}
          }, 500 + Math.random() * 1500);

          botState.lastActivity = Date.now();
        } catch {}
      }, 120000);
    }
  }

  // ============================================================
  // MOVEMENT MODULES
  // ============================================================

  if (
    config.movement &&
    config.movement.enabled !== false
  ) {
    addLog("[Movement] Enabled");

    // --------------------------------
    // Circle Walk
    // --------------------------------

    if (
      config.movement["circle-walk"] &&
      config.movement["circle-walk"].enabled
    ) {
      startCircleWalkV2(
        bot,
        defaultMove
      );
    }

    // --------------------------------
    // Random Jump
    // --------------------------------

    if (
      config.movement["random-jump"] &&
      config.movement["random-jump"].enabled
    ) {
      startRandomJumpV2(bot);
    }

    // --------------------------------
    // Look Around
    // --------------------------------

    if (
      config.movement["look-around"] &&
      config.movement["look-around"].enabled
    ) {
      startLookAroundV2(bot);
    }

    // --------------------------------
    // Dating Sim Wander Mode
    // --------------------------------

    if (
      datingSim &&
      config.movement["dating-wander"]
    ) {
      startDatingWander(bot);
    }
  }

  addLog("[Movement] PART 3B loaded");

function combatModuleV2(bot, mcData) {
  let lastAttack = 0;

  bot.on("physicsTick", () => {
    if (!bot || !botState.connected)
      return;

    if (
      !config.combat ||
      !config.combat["attack-mobs"]
    )
      return;

    const now = Date.now();

    if (now - lastAttack < 650)
      return;

    try {
      const target =
        Object.values(bot.entities)
          .filter(
            (e) =>
              e.type === "mob" &&
              e.position &&
              bot.entity.position.distanceTo(
                e.position
              ) < 4
          )[0];

      if (!target) return;

      bot.attack(target);

      lastAttack = now;
    } catch (err) {
      addLog(
        `[Combat] ${err.message}`
      );
    }
  });
}

function bedModuleV2(bot) {
  let sleeping = false;

  addInterval(async () => {
    if (!bot || !botState.connected)
      return;

    try {
      const isNight =
        bot.time.timeOfDay >= 12500 &&
        bot.time.timeOfDay <= 23500;

      if (!isNight)
        return;

      if (sleeping)
        return;

      const bed =
        bot.findBlock({
          matching: (block) =>
            block.name.includes("bed"),
          maxDistance: 8,
        });

      if (!bed)
        return;

      sleeping = true;

      try {
        await bot.sleep(bed);

        addLog(
          "[Bed] Sleeping"
        );
      } catch {}

      sleeping = false;
    } catch (err) {
      sleeping = false;

      addLog(
        `[Bed] ${err.message}`
      );
    }
  }, 10000);
}

function chatModuleV2(bot) {
  bot.on(
    "chat",
    (username, message) => {
      if (
        username === bot.username
      )
        return;

      const msg =
        message.toLowerCase();

      try {
        if (
          msg.includes("hello") ||
          msg.includes("hi")
        ) {
          bot.chat(
            `Hello ${username}!`
          );
        }

        if (
          msg.includes("how are you")
        ) {
          bot.chat(
            "I'm doing great!"
          );
        }

        if (
          msg === "!uptime"
        ) {
          const uptime =
            Math.floor(
              (Date.now() -
                botState.startTime) /
                1000
            );

          bot.chat(
            `Uptime: ${uptime}s`
          );
        }
      } catch (err) {
        addLog(
          `[Chat] ${err.message}`
        );
      }
    }
  );
}

      // ==========================
      // DATING SIM COMMANDS
      // ==========================

      if (msg === "!kiss") {
        const p =
          getPlayer(username);

        p.points += 5;
        p.level =
          getLevel(p.points);

        bot.chat(
          `💋 ${username} gained 5 love points!`
        );

        return;
      }

      if (msg === "!hug") {
        const p =
          getPlayer(username);

        p.points += 3;
        p.level =
          getLevel(p.points);

        bot.chat(
          `🤗 ${username} gained 3 love points!`
        );

        return;
      }

      if (msg === "!date") {
        const p =
          getPlayer(username);

        p.points += 10;
        p.level =
          getLevel(p.points);

        bot.chat(
          `🌹 Romantic date complete. +10 points`
        );

        return;
      }

      if (msg === "!marry") {
        const p =
          getPlayer(username);

        if (p.points < 500) {
          bot.chat(
            `${username} needs 500 points to marry!`
          );

          return;
        }

        bot.chat(
          `💍 ${username} is now married to the Dating Sim!`
        );

        p.points += 50;
        p.level =
          getLevel(p.points);

        return;
      } 

// ============================================================
// DATING SIM PERSISTENT SYSTEM (SAVE / LOAD)
// ============================================================

const fs = require("fs");

const DATA_FILE = "./datingSimData.json";

// ------------------------------
// LOAD DATA ON START
// ------------------------------
function loadDatingData() {
  try {
    if (!fs.existsSync(DATA_FILE)) return;

    const data = JSON.parse(fs.readFileSync(DATA_FILE));

    if (data.players) {
      datingSim.players = new Map(data.players);
      addLog("[DatingSim] Data loaded");
    }
  } catch (err) {
    addLog("[DatingSim] Load error: " + err.message);
  }
}

// ------------------------------
// SAVE DATA
// ------------------------------
function saveDatingData() {
  try {
    const data = {
      players: Array.from(datingSim.players.entries()),
    };

    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    addLog("[DatingSim] Save error: " + err.message);
  }
}

// Auto-save every 60 seconds
setInterval(saveDatingData, 60000);

// Load on boot
loadDatingData();

// ============================================================
// STREAK + DAILY REWARD SYSTEM
// ============================================================

const DAILY_REWARD = 20;

function claimDaily(username) {
  const p = getPlayer(username);
  const now = Date.now();

  const DAY = 24 * 60 * 60 * 1000;

  if (!p.lastClaim) p.lastClaim = 0;

  if (now - p.lastClaim < DAY) {
    return { ok: false, msg: "Already claimed daily reward." };
  }

  p.lastClaim = now;
  p.points += DAILY_REWARD;

  return {
    ok: true,
    msg: `Daily claimed! +${DAILY_REWARD} points`,
  };
}

      // ==========================
      // DAILY REWARD COMMAND
      // ==========================

      if (msg === "!daily") {
        const res = claimDaily(username);

        bot.chat(
          res.msg
        );

        return;
      }

// ============================================================
// ANTI-CHEAT FOR QUIZ SYSTEM
// ============================================================

const quizCooldown = new Map();

function canAnswer(username) {
  const now = Date.now();
  const last = quizCooldown.get(username) || 0;

  if (now - last < 3000) return false;

  quizCooldown.set(username, now);
  return true;
}

function getLeaderboard() {
  return Array.from(datingSim.players.entries())
    .map(([name, data]) => ({
      name,
      points: data.points || 0,
      level: data.level || 1,
    }))
    .sort((a, b) => b.points - a.points);
}

// ============================================================
// CLEANUP ON CRASH / RECONNECT SAFETY
// ============================================================

function resetDatingSimTempState() {
  datingSim.quizActive = false;
  datingSim.current = null;
}
