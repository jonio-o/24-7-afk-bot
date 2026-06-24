// loveGame.js

class LoveGame {
    constructor(bot) {
        this.bot = bot;

        // playerId -> love points
        this.lovePoints = {};

        this.questions = [
            {
                question: "What is my favorite color?",
                options: ["1) Blue", "2) Red", "3) Black", "4) Green"],
                correct: 3
            },
            {
                question: "What do I like most?",
                options: ["1) Peace", "2) Chaos", "3) Sleep", "4) Coding"],
                correct: 2
            },
            {
                question: "What is my mood today?",
                options: ["1) Happy", "2) Angry", "3) Mysterious", "4) Bored"],
                correct: 3
            }
        ];

        this.randomMessages = [
            "What’s your favorite color?",
            "Do you like me more than the others?",
            "Would you stay with me if I was a bot?",
            "Am I your type?"
        ];
    }

    // call this when bot starts
    start(getOnlinePlayersCallback, sendMessageCallback) {
        this.getPlayers = getOnlinePlayersCallback;
        this.sendMessage = sendMessageCallback;

        // every 5 minutes ask random player
        setInterval(() => {
            this.askRandomPlayer();
        }, 5 * 60 * 1000);

        // occasional chat message
        setInterval(() => {
            this.randomChat();
        }, 90 * 1000);
    }

    askRandomPlayer() {
        const players = this.getPlayers();
        if (!players || players.length === 0) return;

        const player = players[Math.floor(Math.random() * players.length)];
        const q = this.questions[Math.floor(Math.random() * this.questions.length)];

        this.currentAnswer = q.correct;
        this.currentTarget = player;

        const message =
            `💖 Hey ${player}! Answer this:\n` +
            `${q.question}\n` +
            q.options.join("\n");

        this.sendMessage(message);
    }

    handleAnswer(player, answer) {
        if (!this.currentTarget) return;
        if (player !== this.currentTarget) return;

        const num = parseInt(answer);

        if (!this.lovePoints[player]) {
            this.lovePoints[player] = 0;
        }

        if (num === this.currentAnswer) {
            this.lovePoints[player] += 10;
            this.sendMessage(`💖 Correct! +10 love points (${this.lovePoints[player]})`);
        } else {
            this.lovePoints[player] -= 5;
            this.sendMessage(`💔 Wrong! -5 love points (${this.lovePoints[player]})`);
        }

        this.currentTarget = null;
        this.currentAnswer = null;
    }

    randomChat() {
        const msg =
            this.randomMessages[
                Math.floor(Math.random() * this.randomMessages.length)
            ];

        this.sendMessage("🤖 " + msg);
    }

    getLovePoints(player) {
        return this.lovePoints[player] || 0;
    }
}

module.exports = LoveGame;
