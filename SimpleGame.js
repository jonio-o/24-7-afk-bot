class SimpleGame {
  constructor(bot) {
    this.bot = bot;
    this.points = {};
    this.active = false;

    this.lastWinner = null;
  }

  start() {
    this.active = true;

    // ask "test" every 30 seconds
    setInterval(() => {
      if (!this.active) return;

      this.lastWinner = null;
      this.bot.chat("test");
    }, 30000);

    // listen to chat
    this.bot.on("chat", (username, message) => {
      if (!this.active) return;
      if (username === this.bot.username) return;

      this.handleChat(username, message);
    });

    // first test instantly
    setTimeout(() => this.bot.chat("test"), 3000);
  }

  stop() {
    this.active = false;
  }

  handleChat(username, message) {
    const msg = message.toLowerCase().trim();

    if (msg === "yes") {
      // only first person gets point
      if (this.lastWinner) return;

      this.lastWinner = username;

      if (!this.points[username]) {
        this.points[username] = 0;
      }

      this.points[username] += 1;

      this.bot.chat(`✔ ${username} got +1 point! Total: ${this.points[username]}`);
    }
  }
}

module.exports = SimpleGame;
