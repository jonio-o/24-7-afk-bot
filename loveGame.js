class LoveGame {
  constructor(bot) {
    this.bot = bot;

    this.active = false;
    this.points = {}; // { username: points }
    this.currentQuestion = null;
    this.currentAnswers = [];
    this.currentCorrect = null;
    this.currentPlayer = null;

    this.interval = null;
  }

  start() {
    this.active = true;
    console.log("[LoveGame] Started");

    // listen to chat answers
    this.bot.on("chat", (username, message) => {
      if (!this.active) return;
      if (username === this.bot.username) return;

      this.handleAnswer(username, message.trim());
    });

    // every 5 minutes send a question
    this.interval = setInterval(() => {
      this.askRandomQuestion();
    }, 5 * 60 * 1000);

    // first question faster so it doesn't feel empty
    setTimeout(() => this.askRandomQuestion(), 10000);
  }

  stop() {
    this.active = false;
    if (this.interval) clearInterval(this.interval);
  }

  getRandomPlayer() {
    const players = Object.keys(this.bot.players);
    if (!players.length) return null;

    const filtered = players.filter(p => p !== this.bot.username);
    return filtered[Math.floor(Math.random() * filtered.length)];
  }

  askRandomQuestion() {
    const player = this.getRandomPlayer();
    if (!player) return;

    this.currentPlayer = player;

    const questions = [
      {
        q: "What is the best way to show love?",
        options: ["A) Kind words", "B) Ignoring", "C) Toxic behavior", "D) Stealing items"],
        correct: "A"
      },
      {
        q: "What makes a good relationship?",
        options: ["A) Trust", "B) Lies", "C) Scamming", "D) Greifing"],
        correct: "A"
      },
      {
        q: "What is NOT love?",
        options: ["A) Respect", "B) Care", "C) Hate", "D) Support"],
        correct: "C"
      },
      {
        q: "Best way to win someone's heart?",
        options: ["A) Be kind", "B) Spam insults", "C) Hack server", "D) Steal diamonds"],
        correct: "A"
      }
    ];

    const q = questions[Math.floor(Math.random() * questions.length)];

    this.currentQuestion = q.q;
    this.currentAnswers = q.options;
    this.currentCorrect = q.correct;

    this.bot.chat(`💘 Love Question for ${player}!`);
    this.bot.chat(q.q);

    setTimeout(() => {
      q.options.forEach(opt => this.bot.chat(opt));
      this.bot.chat("💬 Type A, B, C or D to answer!");
    }, 1500);
  }

  handleAnswer(username, message) {
    if (!this.currentQuestion) return;
    if (username !== this.currentPlayer) return;

    const answer = message.toUpperCase();

    if (!["A", "B", "C", "D"].includes(answer)) return;

    if (!this.points[username]) this.points[username] = 0;

    if (answer === this.currentCorrect) {
      this.points[username] += 10;
      this.bot.chat(`💖 Correct ${username}! +10 love points!`);
    } else {
      this.points[username] -= 5;
      this.bot.chat(`💔 Wrong ${username}! -5 love points!`);
    }

    this.showLeaderboard();
    this.currentQuestion = null;
    this.currentPlayer = null;
  }

  showLeaderboard() {
    const sorted = Object.entries(this.points)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    this.bot.chat("🏆 Love Leaderboard:");

    sorted.forEach(([name, pts], i) => {
      this.bot.chat(`${i + 1}. ${name} - ${pts} 💖`);
    });
  }
}

module.exports = LoveGame;
