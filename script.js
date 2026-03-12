// ─── Local Storage DB (replaces api.php / MySQL) ────────────────────────────

const DB = {
    getUsers() {
        return JSON.parse(localStorage.getItem('aq_users') || '{}');
    },
    saveUsers(users) {
        localStorage.setItem('aq_users', JSON.stringify(users));
    },
    register(username, password) {
        const users = this.getUsers();
        if (users[username]) return { ok: false, message: 'Username already taken.' };
        users[username] = { username, password, avatar: null, history: [], bestScore: 0 };
        this.saveUsers(users);
        return { ok: true };
    },
    login(username, password) {
        const users = this.getUsers();
        const u = users[username];
        if (!u) return { ok: false, message: 'User not found.' };
        if (u.password !== password) return { ok: false, message: 'Wrong password.' };
        return { ok: true, user: { ...u } };
    },
    saveGame(username, difficulty, step, prize) {
        const users = this.getUsers();
        if (!users[username]) return { ok: false };
        const u = users[username];
        u.history.push({ date: new Date().toLocaleString(), difficulty, step, prize });
        u.bestScore = Math.max(u.bestScore || 0, prize);
        this.saveUsers(users);
        return { ok: true };
    },
    getUser(username) {
        const users = this.getUsers();
        const u = users[username];
        if (!u) return { ok: false };
        return { ok: true, user: { ...u } };
    },
    resetHistory(username) {
        const users = this.getUsers();
        if (!users[username]) return { ok: false };
        users[username].history = [];
        users[username].bestScore = 0;
        this.saveUsers(users);
        return { ok: true };
    },
    updateAvatar(username, avatar) {
        const users = this.getUsers();
        if (!users[username]) return { ok: false };
        users[username].avatar = avatar;
        this.saveUsers(users);
        return { ok: true };
    },
    leaderboard() {
        const users = this.getUsers();
        const list = Object.values(users)
            .map(u => ({ username: u.username, avatar: u.avatar || null, bestScore: u.bestScore || 0 }))
            .sort((a, b) => b.bestScore - a.bestScore);
        return { ok: true, leaderboard: list };
    }
};

// ─── Alpine Game App ─────────────────────────────────────────────────────────

function gameApp() {
    return {
        screen: 'login',
        panel: 'home',
        showPassword: false,
        showConfirmPassword: false,
        currentUser: null,
        leaderboardData: [],
        notification: null,
        authForm: { u: '', p: '', cp: '' },
        difficulty: 'easy',
        currentStep: 1,
        timeLeft: 45,
        timer: null,
        sequence: '',
        displaySequence: '',
        playerInput: '',
        isCorrect: false,
        isWrong: false,
        musicOn: true,
        volume: 70,
        loadingGame: false,

        LADDER_STEPS: [
            {step:1,prize:100},{step:2,prize:200},{step:3,prize:300},
            {step:4,prize:500},{step:5,prize:1000},{step:6,prize:2000},
            {step:7,prize:5000},{step:8,prize:10000}
        ],

        creators: [
            { name: "Rasheed Sambrana",       role: "Lead Game Logic & Systems" },
            { name: "Joshue Ramos",           role: "Front-end & Animations" },
            { name: "Fernandez Lawrence",     role: "Data & Difficulty Design" },
            { name: "Dimple Ibarra",          role: "Product & UX Flow" },
            { name: "Alvero Jeanelle",        role: "UI Design & Visuals" },
            { name: "Aldren Calolot",         role: "Systems Integration" },
            { name: "Justlyn Eliza",          role: "QA & Game Balancing" },
            { name: "Kit Mariano",            role: "Sound & Experience" },
            { name: "Carlo Bataller",         role: "Performance & Storage" },
            { name: "Jericho Ricaza",         role: "Security & Auth" },
            { name: "Clev Nelvin Opella",     role: "Backend & Database" },
            { name: "Michaella Danaya Sorima",role: "UI/UX & Design" }
        ],

        showAvatarModal: false,
        showLogoutModal: false,
        selectedPlayer: null,
        playerStats: null,
        playerStatsLoading: false,
        selectedAvatar: null,
        avatars: [
            'avatar1.jpg','avatar2.jpg','avatar3.jpg','avatar4.jpg',
            'avatar5.jpg','avatar6.jpg','avatar7.jpg','avatar8.jpg'
        ],

        _lastButtonClick: 0,
        _keyboardBound: false,

        init() {
            this.refreshIcons();
            this.$nextTick(() => {
                const a = document.getElementById('bgMusic');
                if (!a) return;
                a.volume = this.volume / 100;
                if (!a.paused) { this.musicOn = true; }
                a.addEventListener('play',  () => { this.musicOn = true;  });
                a.addEventListener('pause', () => { this.musicOn = false; });
            });

            if (!this._keyboardBound) {
                this._keyboardBound = true;
                document.addEventListener('keydown', (e) => {
                    if (this.screen !== 'game') return;
                    if (Date.now() - this._lastButtonClick < 80) return;
                    if (e.key >= '0' && e.key <= '9') {
                        e.preventDefault();
                        if (this.playerInput.length < 5) this.playerInput += e.key;
                    } else if (e.key === 'Backspace' || e.key === 'Delete' || e.key.toLowerCase() === 'c') {
                        e.preventDefault();
                        this.playerInput = '';
                    } else if (e.key === 'Enter') {
                        e.preventDefault();
                        this.submitAnswer();
                    }
                });
            }
        },

        toggleMusic() {
            const a = document.getElementById('bgMusic');
            if (!a) return;
            this.musicOn = !this.musicOn;
            if (this.musicOn) {
                a.volume = this.volume / 100;
                a.play().catch(() => { this.musicOn = false; });
            } else {
                a.pause();
            }
        },

        setVolume() {
            const a = document.getElementById('bgMusic');
            if (a) a.volume = this.volume / 100;
        },

        refreshIcons() {
            this.$nextTick(() => {
                if (window.lucide) { try { window.lucide.createIcons(); } catch(e){} }
            });
        },

        notify(message, type = 'error') {
            this.notification = { message, type };
            setTimeout(() => this.notification = null, 3000);
            this.refreshIcons();
        },

        setPanel(p) {
            this.panel = p;
            if (p === 'leaderboard') this.loadLeaderboard();
            this.refreshIcons();
        },

        handleAuth() {
            const { u, p } = this.authForm;
            if (!u || !p) return this.notify("Fill all fields");

            if (this.screen === 'reg') {
                if (p.length < 6) return this.notify("Password too short");
                if (p !== this.authForm.cp) return this.notify("Passwords do not match");

                const res = DB.register(u, p);
                if (!res.ok) return this.notify(res.message);

                this.notify("Registered!", "success");
                this.screen = 'login';

            } else {
                const res = DB.login(u, p);
                if (!res.ok) return this.notify(res.message);

                this.currentUser = res.user;
                this.screen = 'lobby';
                this.notify(`Welcome ${u}!`, "success");
            }

            this.showPassword = false;
            this.showConfirmPassword = false;
            this.authForm = { u: '', p: '', cp: '' };
            this.refreshIcons();
        },

        logout() {
            this.currentUser = null;
            this.screen = 'login';
            this.showPassword = false;
            this.showLogoutModal = false;
            this.refreshIcons();
        },

        startNewGame(diff) {
            this.difficulty = diff;
            this.loadingGame = true;

            setTimeout(() => {
                this.loadingGame = false;
                this.currentStep = 1;
                this.timeLeft = diff === 'hard' ? 20 : diff === 'medium' ? 30 : 45;
                this.screen = 'game';
                this.generateRound();
                this.startTimer();
                this.refreshIcons();
            }, 5000);
        },

        choices: [],

        generateRound() {
            this.playerInput = '';
            this.isCorrect = false;
            this.isWrong = false;

            let bMin = 1, bMax = 20, gMin = 2, gMax = 6;
            if (this.difficulty === 'medium') { bMin=5; bMax=40; gMin=3; gMax=9; }
            else if (this.difficulty === 'hard') { bMin=10; bMax=60; gMin=4; gMax=12; }

            const base = Math.floor(Math.random()*(bMax-bMin+1))+bMin;
            const gap  = Math.floor(Math.random()*(gMax-gMin+1))+gMin;
            const correct = base + (gap * 3);

            this.sequence        = String(correct);
            this.displaySequence = `${base}, ${base+gap}, ${base+(gap*2)}, ?`;

            const wrongs = new Set();
            const offsets = [-gap*2, -gap, gap, gap*2, gap*3, -1, 1, -2, 2];
            const shuffled = offsets.sort(() => Math.random() - 0.5);
            for (const off of shuffled) {
                const w = correct + off;
                if (w > 0 && w !== correct) wrongs.add(w);
                if (wrongs.size === 3) break;
            }
            while (wrongs.size < 3) {
                const w = correct + Math.floor(Math.random()*10) + 1;
                if (w !== correct) wrongs.add(w);
            }

            this.choices = [correct, ...[...wrongs]].sort(() => Math.random() - 0.5);
        },

        selectChoice(val) {
            this.playerInput = String(val);
            setTimeout(() => this.submitAnswer(), 150);
        },

        clickNumpad(val) {
            this._lastButtonClick = Date.now();
            if (val === 'C') {
                this.playerInput = '';
            } else if (val === 'OK') {
                this.submitAnswer();
            } else if (typeof val === 'number') {
                if (this.playerInput.length < 5) this.playerInput += val;
            }
        },

        handleNumpad(val, fromButton = false) {
            if (fromButton) this._lastButtonClick = Date.now();
            if (val === 'C') {
                this.playerInput = '';
            } else if (val === 'OK') {
                this.submitAnswer();
            } else if (typeof val === 'number') {
                if (this.playerInput.length < 5) this.playerInput += val;
            }
        },

        submitAnswer() {
            if (!this.playerInput) return;

            if (this.playerInput === this.sequence) {
                this.isCorrect = true;
                setTimeout(() => {
                    if (this.currentStep === this.LADDER_STEPS.length) {
                        this.endGame('win');
                    } else {
                        this.screen = 'prize';
                        if (window._arithmoTimer) clearInterval(window._arithmoTimer);
                        this.refreshIcons();
                    }
                }, 800);
            } else {
                this.isWrong = true;
                this.notify("Wrong! Back to Round 1.");
                if (window._arithmoTimer) clearInterval(window._arithmoTimer);
                setTimeout(() => {
                    this.currentStep = 1;
                    this.isWrong = false;
                    this.generateRound();
                    this.timeLeft = this.difficulty === 'hard' ? 20 : this.difficulty === 'medium' ? 30 : 45;
                    this.startTimer();
                }, 800);
            }
        },

        nextRound() {
            this.currentStep++;
            this.generateRound();
            this.timeLeft = this.difficulty === 'hard' ? 20 : this.difficulty === 'medium' ? 30 : 45;
            this.screen = 'game';
            this.startTimer();
            this.refreshIcons();
        },

        endGame(reason) {
            if (window._arithmoTimer) clearInterval(window._arithmoTimer);

            let finalPrize = 0;
            let finalStep  = 0;

            if (reason === 'win') {
                finalPrize = this.LADDER_STEPS[this.LADDER_STEPS.length-1].prize;
                finalStep  = this.LADDER_STEPS.length;
            } else if (this.screen === 'prize') {
                finalPrize = this.LADDER_STEPS[this.currentStep-1].prize;
                finalStep  = this.currentStep;
            } else if (this.currentStep > 1) {
                finalPrize = this.LADDER_STEPS[this.currentStep-2].prize;
                finalStep  = this.currentStep - 1;
            }

            if (this.currentUser) {
                const res = DB.saveGame(
                    this.currentUser.username,
                    this.difficulty,
                    finalStep,
                    finalPrize
                );

                if (res.ok) {
                    if (!this.currentUser.history) this.currentUser.history = [];
                    this.currentUser.history.push({
                        date:       new Date().toLocaleString(),
                        difficulty: this.difficulty,
                        prize:      finalPrize,
                        step:       finalStep
                    });
                    this.currentUser.bestScore = Math.max(this.currentUser.bestScore || 0, finalPrize);
                }
            }

            this.screen = 'lobby';
            this.panel  = 'home';
            this.playerInput = '';

            if (reason === 'win')       this.notify("JACKPOT! You cleared all rounds!", "success");
            else if (reason === 'time') this.notify("Time's up! Game over.");
            else if (reason === 'quit') this.notify("Game ended. Progress saved.");

            this.refreshIcons();
        },

        startTimer() {
            if (window._arithmoTimer) clearInterval(window._arithmoTimer);
            window._arithmoTimer = setInterval(() => {
                if (this.screen !== 'game') { clearInterval(window._arithmoTimer); return; }
                this.timeLeft--;
                if (this.timeLeft <= 0) { clearInterval(window._arithmoTimer); this.endGame('time'); }
            }, 1000);
        },

        loadLeaderboard() {
            const res = DB.leaderboard();
            if (res.ok) {
                this.leaderboardData = res.leaderboard.map(u => ({
                    username:  u.username,
                    avatar:    u.avatar || null,
                    bestScore: Number(u.bestScore) || 0
                }));
            }
        },

        getLeaderboard() {
            return this.leaderboardData;
        },

        loadPlayerStats(username) {
            this.playerStats = null;
            this.playerStatsLoading = true;
            const res = DB.getUser(username);
            this.playerStatsLoading = false;
            if (!res.ok) return;

            const history = res.user.history || [];
            const totalGames = history.length;
            const totalPrize = history.reduce((s, h) => s + (Number(h.prize) || 0), 0);
            const bestPrize  = history.reduce((m, h) => Math.max(m, Number(h.prize) || 0), 0);
            const accuracy   = totalGames > 0
                ? Math.round((history.filter(h => (Number(h.prize) || 0) > 0).length / totalGames) * 100)
                : 0;
            const diffCounts = history.reduce((acc, h) => {
                acc[h.difficulty] = (acc[h.difficulty] || 0) + 1; return acc;
            }, {});
            const faveMode = totalGames > 0
                ? Object.entries(diffCounts).sort((a,b) => b[1]-a[1])[0][0].toUpperCase()
                : '—';

            this.playerStats = { totalGames, totalPrize, bestPrize, accuracy, diffCounts, faveMode };
        },

        getDiffCount(diff) {
            return this.currentUser?.history?.filter(h => h.difficulty === diff).length || 0;
        },

        getDiffPercent(diff) {
            const count = this.getDiffCount(diff);
            const total = this.currentUser?.history?.length || 0;
            return total > 0 ? (count/total)*100 : 0;
        },

        getFaveMode() {
            if (!this.currentUser?.history?.length) return '—';
            const counts = this.currentUser.history.reduce((acc,h) => {
                acc[h.difficulty] = (acc[h.difficulty]||0)+1; return acc;
            }, {});
            return Object.entries(counts).sort((a,b)=>b[1]-a[1])[0][0].toUpperCase();
        },

        resetHistory() {
            if (!this.currentUser || !confirm("Reset your history?")) return;
            const res = DB.resetHistory(this.currentUser.username);
            if (res.ok) {
                this.currentUser.history   = [];
                this.currentUser.bestScore = 0;
                this.notify("History reset!", "success");
            } else {
                this.notify("Failed to reset history.");
            }
        },

        saveAvatar() {
            if (!this.currentUser) return;
            const res = DB.updateAvatar(this.currentUser.username, this.selectedAvatar);
            if (res.ok) {
                this.currentUser.avatar = this.selectedAvatar;
                this.showAvatarModal    = false;
                this.notify('Avatar updated!', 'success');
            } else {
                this.notify('Failed to update avatar.');
            }
        }
    };
}
