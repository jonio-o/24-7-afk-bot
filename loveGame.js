// loveGame.js

class LoveGame {
    constructor(bot) {
        this.bot = bot;

        this.lovePoints = {};
        this.currentTarget = null;
        this.currentAnswer = null;

        this.questions = [
            {
                question: "What is my favorite color?",
                options: ["Blue", "Red", "Black", "Green"],
                correct: 2
            },
            {
                question: "What do I like most?",
                options: ["Peace", "Chaos", "Sleep", "Games"],
                correct: 1
            },
            {
                question: "What am I looking for?",
                options: ["Friendship", "Power", "Fun", "Nothing"],
                correct: 0
            }
        ];

        this.randomChats = [
            "What’s your favorite color?",
            "Do you like me?",
            "Would you stay with me forever?",
            "I’m watching you... 💖"
        ];
    }

    start() {
        // ask random player every 5 minutes
        setInterval(() => {
            this.askRandomPlayer();
        }, 5 * 60 * 1000);

        // random chat every 2 minutes
        setInterval(() => {
            this.randomSpeak();
        }, 2 * 60 * 1000);

        // IMPORTANT: listen to chat
        this.bot.on("chat", (username, message) => {
            this.handleMessage(username, message);
        });
    }

    getPlayers() {
        return Object.keys(this.bot.players);
    }

    askRandomPlayer() {
        const players = this.getPlayers().filter(p => p !== this.bot.username);
        if (players.length === 0) return;

        const player = players[Math.floor(Math.random() * players.length)];
        const q = this.questions[Math.floor(Math.random() * this.questions.length)];

        this.currentTarget = player;
        this.currentAnswer = q.correct;

        this.bot.chat(
            `💖 ${player}, answer this: ${q.question} | ` +
            `1) ${q.options[0]} 2) ${q.options[1]} 3) ${q.options[2]} 4) ${q.options[3]}`
        );
    }

    handleMessage(player, message) {
        const text = message.toLowerCase();

        // 💖 CHECK POINTS SYSTEM
        if (text === "!love" || text === "!points") {
            const points = this.lovePoints[player] || 0;

            let status = "Stranger 😐";
            if (points >= 50) status = "Soulmate 💖";
            else if (points >= 30) status = "Crush 💕";
            else if (points >= 10) status = "Friend 🙂";
            else if (points < 0) status = "Rejected 💔";

            return this.bot.chat(
                `💖 ${player}: ${points} love points | ${status}`
            );
        }

        // 💬 RANDOM CHAT RESPONSES
        if (text.includes("favorite color")) {
            return this.bot.chat(`💖 My favorite color is BLACK... like the void.`);
        }

        if (text.includes("do you like me")) {
            return this.bot.chat(`💖 Maybe... prove it with love points.`);
        }

        if (text.includes("are you real")) {
            return this.bot.chat(`💭 Real enough to break your heart.`);
        }

        // 🎯 ANSWER CHECK
        if (this.currentTarget && player === this.currentTarget) {
            const answer = parseInt(message);

            if (!this.lovePoints[player]) this.lovePoints[player] = 0;

            if (answer === this.currentAnswer + 1) {
                this.lovePoints[player] += 10;
                this.bot.chat(`💖 Correct! +10 love points (${this.lovePoints[player]})`);
            } else {
                this.lovePoints[player] -= 5;
                this.bot.chat(`💔 Wrong! -5 love points (${this.lovePoints[player]})`);
            }

            this.currentTarget = null;
            this.currentAnswer = null;
        }
    }

    randomSpeak() {
        const msg = this.randomChats[Math.floor(Math.random() * this.randomChats.length)];
        this.bot.chat(`🤖 ${msg}`);
    }
}

module.exports = LoveGame;
