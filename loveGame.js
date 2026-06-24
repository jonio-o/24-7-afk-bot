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
            "Do you think I like you?",
            "Would you stay with me forever?",
            "Pick me... if you dare 💖"
        ];
    }

    start(getPlayers, sendMessage) {
        this.getPlayers = getPlayers;
        this.sendMessage = sendMessage;

        setInterval(() => this.askRandomPlayer(), 5 * 60 * 1000);
        setInterval(() => this.randomSpeak(), 2 * 60 * 1000);
    }

    askRandomPlayer() {
        const players = this.getPlayers?.();
        if (!players || players.length === 0) return;

        const player = players[Math.floor(Math.random() * players.length)];
        const q = this.questions[Math.floor(Math.random() * this.questions.length)];

        this.currentTarget = player;
        this.currentAnswer = q.correct;

        this.sendMessage(
            `💖 Hey ${player}! Answer this:\n` +
            `${q.question}\n` +
            `1) ${q.options[0]}\n` +
            `2) ${q.options[1]}\n` +
            `3) ${q.options[2]}\n` +
            `4) ${q.options[3]}`
        );
    }

    handleMessage(player, message) {
        const text = message.toLowerCase();

        // 💖 POINT CHECK SYSTEM
        if (text === "!love" || text === "!points" || text === "!lovecheck") {
            const points = this.lovePoints[player] || 0;

            let status = "Unknown 💭";

            if (points >= 50) status = "Soulmate 💖";
            else if (points >= 30) status = "Crush 💕";
            else if (points >= 10) status = "Friend 🙂";
            else if (points >= 0) status = "Stranger 😐";
            else status = "Rejected 💔";

            return this.sendMessage(
                `💖 ${player}, your love points: ${points}\n` +
                `💌 Status: ${status}`
            );
        }

        // 💬 random chat responses
        if (text.includes("favorite color")) {
            return this.sendMessage(`💖 My favorite color is BLACK... like my lonely heart.`);
        }

        if (text.includes("do you like me")) {
            return this.sendMessage(`💖 Maybe... check your love points first 😳`);
        }

        if (text.includes("are you real")) {
            return this.sendMessage(`💭 I exist in your imagination... and your server logs.`);
        }

        // 🎯 ANSWER SYSTEM
        if (this.currentTarget && player === this.currentTarget) {
            const answer = parseInt(message);

            if (!this.lovePoints[player]) this.lovePoints[player] = 0;

            if (answer === this.currentAnswer + 1) {
                this.lovePoints[player] += 10;
                this.sendMessage(`💖 Correct! +10 love points (${this.lovePoints[player]})`);
            } else {
                this.lovePoints[player] -= 5;
                this.sendMessage(`💔 Wrong... -5 love points (${this.lovePoints[player]})`);
            }

            this.currentTarget = null;
            this.currentAnswer = null;
        }
    }

    randomSpeak() {
        const msg = this.randomChats[Math.floor(Math.random() * this.randomChats.length)];
        this.sendMessage(`🤖 ${msg}`);
    }

    getLove(player) {
        return this.lovePoints[player] || 0;
    }
}

module.exports = LoveGame;
