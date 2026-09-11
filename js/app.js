/* =========================================================
   QEXUS — Production Frontend App
   Telegram Mini App + FastAPI Backend + AdsGram
   ========================================================= */

"use strict";

/* =========================
   CONFIG
========================= */

const API_BASE = "https://qexus-backend.onrender.com/api";

const ADSGRAM_BLOCK_ID = "47279";

const CONFIG = {
    AD_REWARD_QEXC: 3,
    DAILY_BONUS_QEXC: 10,
    QEXC_TO_BDT: 0.10,
    MIN_WITHDRAW_BDT: 100,

    REQUEST_TIMEOUT: 15000,

    REFERRAL_PERCENT: 10,

    OFFICIAL_CHANNEL: "https://t.me/Qexus_Official",

    SUPPORT_USERNAME: "@QexusSupport"
};


/* =========================
   TELEGRAM
========================= */

const tg = window.Telegram?.WebApp || null;

if (tg) {
    try {
        tg.ready();
        tg.expand();

        if (typeof tg.setHeaderColor === "function") {
            tg.setHeaderColor("#ffffff");
        }

        if (typeof tg.setBackgroundColor === "function") {
            tg.setBackgroundColor("#f6f8fb");
        }

        if (typeof tg.enableClosingConfirmation === "function") {
            tg.enableClosingConfirmation();
        }
    } catch (error) {
        console.warn("Telegram initialization error:", error);
    }
}


/* =========================
   STATE
========================= */

const state = {
    initialized: false,

    user: null,

    wallet: {
        balance_qexc: 0,
        locked_qexc: 0,
        total_earned: 0,
        total_withdrawn: 0
    },

    transactions: [],

    tasks: [],

    leaderboard: [],

    notifications: [],

    currentPage: "home",

    withdrawMethod: "bKash",

    dailyNextClaimAt: null,

    dailyTimer: null,

    adController: null,

    adLoading: false,

    apiBusy: false
};


/* =========================
   DOM HELPERS
========================= */

function $(id) {
    return document.getElementById(id);
}

function $all(selector) {
    return document.querySelectorAll(selector);
}

function setText(id, value) {
    const el = $(id);

    if (el) {
        el.textContent = value ?? "";
    }
}

function showElement(id) {
    const el = $(id);

    if (el) {
        el.style.display = "";
    }
}

function hideElement(id) {
    const el = $(id);

    if (el) {
        el.style.display = "none";
    }
}

function addClass(id, className) {
    const el = $(id);

    if (el) {
        el.classList.add(className);
    }
}

function removeClass(id, className) {
    const el = $(id);

    if (el) {
        el.classList.remove(className);
    }
}


/* =========================
   LOADER
========================= */

function showLoader(text = "Loading...") {
    const loader = $("globalLoader");

    if (!loader) return;

    const loaderText = $("globalLoaderText");

    if (loaderText) {
        loaderText.textContent = text;
    }

    loader.classList.add("show");
}

function hideLoader() {
    const loader = $("globalLoader");

    if (loader) {
        loader.classList.remove("show");
    }
}


/* =========================
   TOAST
========================= */

let toastTimer = null;

function showToast(message, type = "info") {
    const toast = $("toast");

    if (!toast) {
        console.log(message);
        return;
    }

    toast.textContent = message;

    toast.className = "toast";

    if (type) {
        toast.classList.add(type);
    }

    toast.classList.add("show");

    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {
        toast.classList.remove("show");
    }, 3000);
}


/* =========================
   API HELPER
========================= */

async function apiRequest(endpoint, options = {}) {
    const controller = new AbortController();

    const timeout = setTimeout(() => {
        controller.abort();
    }, CONFIG.REQUEST_TIMEOUT);

    const headers = {
        "Content-Type": "application/json",
        "Accept": "application/json"
    };

    /*
     * IMPORTANT:
     * Never send BOT_TOKEN from frontend.
     *
     * Telegram initData is sent to backend.
     */

    if (tg?.initData) {
        headers["X-Telegram-Init-Data"] = tg.initData;
    }

    try {
        const response = await fetch(
            `${API_BASE}${endpoint}`,
            {
                ...options,
                headers: {
                    ...headers,
                    ...(options.headers || {})
                },
                signal: controller.signal
            }
        );

        const contentType =
            response.headers.get("content-type") || "";

        let data;

        if (contentType.includes("application/json")) {
            data = await response.json();
        } else {
            const text = await response.text();

            data = {
                detail: text
            };
        }

        if (!response.ok) {
            const message =
                data?.detail ||
                data?.message ||
                `Request failed (${response.status})`;

            throw new Error(message);
        }

        return data;

    } catch (error) {

        if (error.name === "AbortError") {
            throw new Error("Server response timed out.");
        }

        throw error;

    } finally {
        clearTimeout(timeout);
    }
}


/* =========================
   FORMATTERS
========================= */

function number(value) {
    const n = Number(value);

    if (!Number.isFinite(n)) {
        return "0";
    }

    return n.toLocaleString("en-US", {
        maximumFractionDigits: 2
    });
}

function qexc(value) {
    return `${number(value)} QEXC`;
}

function bdt(value) {
    return `৳${number(value)}`;
}

function qexcToBDT(value) {
    return Number(value || 0) * CONFIG.QEXC_TO_BDT;
}

function formatDate(value) {
    if (!value) return "—";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "—";
    }

    return date.toLocaleString("en-BD", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}

function shortDate(value) {
    if (!value) return "—";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "—";
    }

    return date.toLocaleDateString("en-BD", {
        day: "2-digit",
        month: "short"
    });
}


/* =========================
   USER HELPERS
========================= */

function getTelegramUser() {
    return tg?.initDataUnsafe?.user || null;
}

function userDisplayName() {
    if (state.user?.first_name) {
        return state.user.first_name;
    }

    const telegramUser = getTelegramUser();

    if (telegramUser?.first_name) {
        return telegramUser.first_name;
    }

    return "User";
}

function username() {
    if (state.user?.username) {
        return state.user.username;
    }

    const telegramUser = getTelegramUser();

    return telegramUser?.username || "";
}

function telegramId() {
    return (
        state.user?.telegram_id ||
        state.user?.id ||
        getTelegramUser()?.id ||
        null
    );
}

function initials(name) {
    if (!name) return "Q";

    return name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map(word => word.charAt(0).toUpperCase())
        .join("");
}


/* =========================
   AUTH
========================= */

async function authenticate() {

    if (!tg?.initData) {
        throw new Error(
            "Please open QEXUS from Telegram."
        );
    }

    const data = await apiRequest("/auth", {
        method: "POST"
    });

    if (!data?.user) {
        throw new Error("Invalid authentication response.");
    }

    state.user = data.user;

    if (data.wallet) {
        state.wallet = {
            ...state.wallet,
            ...data.wallet
        };
    }

    renderUser();

    return data;
}


/* =========================
   USER UI
========================= */

function renderUser() {

    const name = userDisplayName();
    const user = username();

    setText("userName", name);
    setText("profileName", name);

    setText(
        "profileUsername",
        user ? `@${user}` : "Telegram User"
    );

    const avatarText = initials(name);

    setText("topAvatarText", avatarText);

    const profileAvatar = $("profileAvatar");

    if (profileAvatar) {
        profileAvatar.textContent = avatarText;
    }

    updateReferralLink();
}


/* =========================
   WALLET
========================= */

async function loadWallet() {

    const data = await apiRequest("/wallet");

    if (data?.wallet) {
        state.wallet = {
            ...state.wallet,
            ...data.wallet
        };
    } else if (data) {
        state.wallet = {
            ...state.wallet,
            ...data
        };
    }

    renderWallet();
}

function renderWallet() {

    const balance = Number(
        state.wallet.balance_qexc || 0
    );

    const earned = Number(
        state.wallet.total_earned || 0
    );

    const withdrawn = Number(
        state.wallet.total_withdrawn || 0
    );

    setText(
        "balanceBDT",
        bdt(qexcToBDT(balance))
    );

    setText(
        "balanceQEXC",
        qexc(balance)
    );

    setText(
        "walletBalance",
        bdt(qexcToBDT(balance))
    );

    setText(
        "walletQEXC",
        qexc(balance)
    );

    setText(
        "totalEarned",
        qexc(earned)
    );

    setText(
        "totalWithdrawn",
        qexc(withdrawn)
    );

    setText(
        "profileEarned",
        qexc(earned)
    );

    setText(
        "profileWithdrawn",
        qexc(withdrawn)
    );

    setText(
        "withdrawAvailable",
        bdt(qexcToBDT(balance))
    );
}


/* =========================
   TRANSACTIONS
========================= */

async function loadTransactions() {

    try {
        const data =
            await apiRequest("/transactions");

        if (Array.isArray(data)) {
            state.transactions = data;
        } else if (Array.isArray(data?.transactions)) {
            state.transactions = data.transactions;
        } else {
            state.transactions = [];
        }

    } catch (error) {

        console.warn(
            "Transactions unavailable:",
            error
        );

        state.transactions = [];
    }

    renderTransactions();
}


function transactionTitle(tx) {

    if (tx.title) {
        return tx.title;
    }

    if (tx.description) {
        return tx.description;
    }

    const type =
        String(tx.type || "").toLowerCase();

    if (type.includes("ad")) {
        return "Rewarded Ad";
    }

    if (type.includes("daily")) {
        return "Daily Bonus";
    }

    if (type.includes("task")) {
        return "Task Reward";
    }

    if (type.includes("ref")) {
        return "Referral Reward";
    }

    if (type.includes("withdraw")) {
        return "Withdrawal";
    }

    return "Transaction";
}


function renderTransactions() {

    const recent = $("recentTransactions");
    const history = $("historyList");

    const transactions =
        Array.isArray(state.transactions)
            ? state.transactions
            : [];

    if (recent) {

        if (!transactions.length) {

            recent.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">↔</div>
                    <div class="empty-title">No transactions yet</div>
                    <div class="empty-text">
                        Your earning history will appear here.
                    </div>
                </div>
            `;

        } else {

            recent.innerHTML =
                transactions
                    .slice(0, 5)
                    .map(transactionHTML)
                    .join("");
        }
    }

    if (history) {

        if (!transactions.length) {

            history.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">↔</div>
                    <div class="empty-title">No history</div>
                    <div class="empty-text">
                        Your transactions will appear here.
                    </div>
                </div>
            `;

        } else {

            history.innerHTML =
                transactions
                    .map(transactionHTML)
                    .join("");
        }
    }
}


function transactionHTML(tx) {

    const amount =
        Number(
            tx.amount_qexc ??
            tx.qexc ??
            tx.amount ??
            0
        );

    const positive =
        amount >= 0;

    const sign =
        positive ? "+" : "";

    return `
        <div class="transaction-item">
            <div class="transaction-icon ${
                positive ? "positive" : "negative"
            }">
                ${positive ? "+" : "−"}
            </div>

            <div class="transaction-info">
                <div class="transaction-title">
                    ${escapeHTML(transactionTitle(tx))}
                </div>

                <div class="transaction-date">
                    ${escapeHTML(
                        formatDate(
                            tx.created_at ||
                            tx.createdAt ||
                            tx.date
                        )
                    )}
                </div>
            </div>

            <div class="transaction-amount ${
                positive ? "positive" : "negative"
            }">
                ${sign}${number(amount)}
                <small>QEXC</small>
            </div>
        </div>
    `;
}


/* =========================
   DAILY BONUS
========================= */

async function claimDailyBonus() {

    const button =
        document.querySelector(
            '[onclick="claimDailyBonus()"]'
        );

    if (button) {
        button.disabled = true;
    }

    try {

        const data =
            await apiRequest("/rewards/daily", {
                method: "POST"
            });

        if (data?.wallet) {

            state.wallet = {
                ...state.wallet,
                ...data.wallet
            };

        } else if (
            data?.balance_qexc !== undefined
        ) {

            state.wallet.balance_qexc =
                data.balance_qexc;
        }

        if (data?.next_claim_at) {

            state.dailyNextClaimAt =
                new Date(data.next_claim_at)
                    .getTime();

        } else {

            state.dailyNextClaimAt =
                Date.now() +
                24 * 60 * 60 * 1000;
        }

        saveDailyTimer();

        renderWallet();

        startDailyCountdown();

        await loadTransactions();

        showToast(
            `Daily bonus +${CONFIG.DAILY_BONUS_QEXC} QEXC added!`,
            "success"
        );

    } catch (error) {

        showToast(
            error.message ||
            "Daily bonus unavailable.",
            "error"
        );

    } finally {

        if (button) {
            button.disabled = false;
        }
    }
}


/* =========================
   DAILY TIMER
========================= */

function saveDailyTimer() {

    if (!state.dailyNextClaimAt) {
        return;
    }

    try {
        localStorage.setItem(
            "qexus_daily_next",
            String(state.dailyNextClaimAt)
        );
    } catch (_) {}
}


function loadDailyTimer() {

    try {

        const saved =
            localStorage.getItem(
                "qexus_daily_next"
            );

        if (saved) {

            const timestamp =
                Number(saved);

            if (
                Number.isFinite(timestamp) &&
                timestamp > Date.now()
            ) {

                state.dailyNextClaimAt =
                    timestamp;

            } else {

                localStorage.removeItem(
                    "qexus_daily_next"
                );
            }
        }

    } catch (_) {}
}


function startDailyCountdown() {

    clearInterval(state.dailyTimer);

    updateDailyCountdown();

    state.dailyTimer =
        setInterval(
            updateDailyCountdown,
            1000
        );
}


function updateDailyCountdown() {

    const next =
        state.dailyNextClaimAt;

    if (!next || next <= Date.now()) {

        setText(
            "dailyCountdown",
            "Available now"
        );

        setText(
            "dailyCountdownEarn",
            "Available now"
        );

        setText(
            "homeDailyStatus",
            "Ready to claim"
        );

        const box =
            $("dailyCountdownBox");

        if (box) {
            box.classList.remove("disabled");
        }

        return;
    }

    const diff =
        Math.max(
            0,
            next - Date.now()
        );

    const totalSeconds =
        Math.floor(diff / 1000);

    const hours =
        Math.floor(
            totalSeconds / 3600
        );

    const minutes =
        Math.floor(
            (totalSeconds % 3600) / 60
        );

    const seconds =
        totalSeconds % 60;

    const formatted =
        `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;

    setText(
        "dailyCountdown",
        formatted
    );

    setText(
        "dailyCountdownEarn",
        formatted
    );

    setText(
        "homeDailyStatus",
        `Next bonus in ${formatted}`
    );

    const box =
        $("dailyCountdownBox");

    if (box) {
        box.classList.add("disabled");
    }
}


/* =========================
   ADSGRAM
========================= */

function initializeAdsGram() {

    if (
        !window.Adsgram ||
        typeof window.Adsgram.init !== "function"
    ) {

        console.warn(
            "AdsGram SDK not available."
        );

        setAdStatus(
            "Rewarded ads are currently unavailable."
        );

        return false;
    }

    try {

        state.adController =
            window.Adsgram.init({
                blockId: ADSGRAM_BLOCK_ID
            });

        /*
         * Optional event listeners.
         * Actual reward must still be confirmed
         * by the backend in production.
         */

        if (
            state.adController &&
            typeof state.adController.onReward === "function"
        ) {

            state.adController.onReward(() => {

                console.log(
                    "AdsGram reward event received."
                );

            });
        }

        return true;

    } catch (error) {

        console.error(
            "AdsGram initialization failed:",
            error
        );

        setAdStatus(
            "Ad service unavailable."
        );

        return false;
    }
}


function setAdStatus(message) {

    const el = $("adStatus");

    if (el) {
        el.textContent = message;
    }
}


/*
 * IMPORTANT PRODUCTION NOTE
 *
 * This function calls the backend reward endpoint.
 *
 * The backend MUST verify the ad reward server-side
 * before crediting QEXC.
 */

async function requestAdReward() {

    return await apiRequest(
        "/rewards/ad",
        {
            method: "POST",

            body: JSON.stringify({
                block_id: ADSGRAM_BLOCK_ID
            })
        }
    );
}


async function watchAd() {

    if (state.adLoading) {
        return;
    }

    if (!tg?.initData) {

        showToast(
            "Open QEXUS from Telegram first.",
            "error"
        );

        return;
    }

    if (!state.adController) {

        const ready =
            initializeAdsGram();

        if (!ready) {

            showToast(
                "Rewarded ads are unavailable right now.",
                "error"
            );

            return;
        }
    }

    const button =
        $("watchAdButton");

    state.adLoading = true;

    if (button) {
        button.disabled = true;
        button.textContent = "Loading ad...";
    }

    setAdStatus(
        "Preparing rewarded advertisement..."
    );

    try {

        /*
         * AdsGram resolves after the rewarded
         * advertisement has been completed.
         */

        await state.adController.show();

        setAdStatus(
            "Verifying your reward..."
        );

        /*
         * DO NOT credit QEXC directly from frontend.
         *
         * Backend must validate the reward.
         */

        const reward =
            await requestAdReward();

        if (reward?.wallet) {

            state.wallet = {
                ...state.wallet,
                ...reward.wallet
            };

        } else if (
            reward?.balance_qexc !== undefined
        ) {

            state.wallet.balance_qexc =
                reward.balance_qexc;
        }

        renderWallet();

        await loadTransactions();

        setAdStatus(
            `Reward received: +${CONFIG.AD_REWARD_QEXC} QEXC`
        );

        showToast(
            `+${CONFIG.AD_REWARD_QEXC} QEXC added!`,
            "success"
        );

    } catch (error) {

        console.warn(
            "Rewarded ad error:",
            error
        );

        setAdStatus(
            "Ad was not completed or reward verification failed."
        );

        showToast(
            error.message ||
            "No reward was added.",
            "error"
        );

    } finally {

        state.adLoading = false;

        if (button) {

            button.disabled = false;

            button.textContent =
                "Watch Ad & Earn";
        }
    }
}


/* =========================
   TASKS
========================= */

async function loadTasks() {

    const container = $("taskList");

    if (container) {

        container.innerHTML = `
            <div class="loading-state">
                Loading tasks...
            </div>
        `;
    }

    try {

        const data =
            await apiRequest("/tasks");

        if (Array.isArray(data)) {

            state.tasks = data;

        } else if (
            Array.isArray(data?.tasks)
        ) {

            state.tasks = data.tasks;

        } else {

            state.tasks = [];
        }

    } catch (error) {

        console.warn(
            "Tasks unavailable:",
            error
        );

        state.tasks = [];
    }

    renderTasks();
}


function renderTasks() {

    const container =
        $("taskList");

    if (!container) return;

    if (!state.tasks.length) {

        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">✓</div>
                <div class="empty-title">
                    No tasks available
                </div>
                <div class="empty-text">
                    New tasks will appear here.
                </div>
            </div>
        `;

        return;
    }

    container.innerHTML =
        state.tasks
            .map(task => {

                const id =
                    task.id ??
                    task.task_id;

                const title =
                    task.title ||
                    "Task";

                const description =
                    task.description ||
                    "Complete this task and earn QEXC.";

                const reward =
                    Number(
                        task.reward_qexc ??
                        task.reward ??
                        0
                    );

                const completed =
                    Boolean(
                        task.completed ||
                        task.is_completed
                    );

                return `
                    <div class="task-card ${
                        completed ? "completed" : ""
                    }">

                        <div class="task-main">

                            <div class="task-icon">
                                ✓
                            </div>

                            <div class="task-content">

                                <div class="task-title">
                                    ${escapeHTML(title)}
                                </div>

                                <div class="task-description">
                                    ${escapeHTML(description)}
                                </div>

                                <div class="task-reward">
                                    +${number(reward)} QEXC
                                </div>

                            </div>

                        </div>

                        <button
                            class="task-button"
                            onclick="completeTask('${escapeAttribute(id)}')"
                            ${completed ? "disabled" : ""}
                        >
                            ${
                                completed
                                    ? "Completed"
                                    : "Complete"
                            }
                        </button>

                    </div>
                `;
            })
            .join("");
}


async function completeTask(taskId) {

    if (!taskId) {
        return;
    }

    try {

        const data =
            await apiRequest(
                `/tasks/${encodeURIComponent(taskId)}/complete`,
                {
                    method: "POST"
                }
            );

        if (data?.wallet) {

            state.wallet = {
                ...state.wallet,
                ...data.wallet
            };

        }

        renderWallet();

        await loadTransactions();

        await loadTasks();

        showToast(
            "Task completed successfully!",
            "success"
        );

    } catch (error) {

        showToast(
            error.message ||
            "Could not complete task.",
            "error"
        );
    }
}


/* =========================
   LEADERBOARD
========================= */

async function loadLeaderboard() {

    try {

        const data =
            await apiRequest("/leaderboard");

        if (Array.isArray(data)) {

            state.leaderboard = data;

        } else if (
            Array.isArray(data?.leaderboard)
        ) {

            state.leaderboard =
                data.leaderboard;

        } else {

            state.leaderboard = [];
        }

    } catch (error) {

        console.warn(
            "Leaderboard endpoint unavailable:",
            error
        );

        state.leaderboard = [];
    }

    renderLeaderboard();
}


function renderLeaderboard() {

    const container =
        $("leaderboardList");

    if (!container) return;

    if (!state.leaderboard.length) {

        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">★</div>
                <div class="empty-title">
                    Leaderboard unavailable
                </div>
                <div class="empty-text">
                    Leaderboard data will appear when available.
                </div>
            </div>
        `;

        return;
    }

    container.innerHTML =
        state.leaderboard
            .map((item, index) => {

                const name =
                    item.first_name ||
                    item.name ||
                    item.username ||
                    "User";

                const usernameText =
                    item.username
                        ? `@${item.username}`
                        : "";

                const earned =
                    Number(
                        item.total_earned ??
                        item.earned_qexc ??
                        item.balance_qexc ??
                        0
                    );

                const rank =
                    item.rank ||
                    index + 1;

                return `
                    <div class="leaderboard-item">

                        <div class="leaderboard-rank">
                            #${number(rank)}
                        </div>

                        <div class="leaderboard-avatar">
                            ${escapeHTML(
                                initials(name)
                            )}
                        </div>

                        <div class="leaderboard-user">

                            <div class="leaderboard-name">
                                ${escapeHTML(name)}
                            </div>

                            <div class="leaderboard-username">
                                ${escapeHTML(usernameText)}
                            </div>

                        </div>

                        <div class="leaderboard-score">
                            ${number(earned)}
                            <small>QEXC</small>
                        </div>

                    </div>
                `;
            })
            .join("");
}


/* =========================
   WITHDRAWAL
========================= */

function openWithdrawModal() {

    const balance =
        Number(
            state.wallet.balance_qexc || 0
        );

    const available =
        qexcToBDT(balance);

    setText(
        "withdrawAvailable",
        bdt(available)
    );

    const amount =
        $("withdrawAmount");

    if (amount) {
        amount.value = "";
    }

    const numberInput =
        $("withdrawNumber");

    if (numberInput) {
        numberInput.value = "";
    }

    state.withdrawMethod = "bKash";

    updateWithdrawMethodUI();

    const modal =
        $("withdrawModal");

    if (modal) {
        modal.classList.add("show");
    }
}


function closeWithdrawModal() {

    const modal =
        $("withdrawModal");

    if (modal) {
        modal.classList.remove("show");
    }
}


function updateWithdrawMethodUI() {

    $all("[data-method]").forEach(button => {

        const method =
            button.dataset.method;

        button.classList.toggle(
            "active",
            method === state.withdrawMethod
        );
    });
}


function selectWithdrawMethod(method) {

    if (
        method !== "bKash" &&
        method !== "Nagad"
    ) {
        return;
    }

    state.withdrawMethod = method;

    updateWithdrawMethodUI();
}


async function submitWithdrawal() {

    const amountInput =
        $("withdrawAmount");

    const numberInput =
        $("withdrawNumber");

    const submitButton =
        $("withdrawSubmit");

    const amountBDT =
        Number(
            amountInput?.value || 0
        );

    const accountNumber =
        String(
            numberInput?.value || ""
        ).trim();

    if (
        !Number.isFinite(amountBDT) ||
        amountBDT < CONFIG.MIN_WITHDRAW_BDT
    ) {

        showToast(
            `Minimum withdrawal is ${bdt(CONFIG.MIN_WITHDRAW_BDT)}.`,
            "error"
        );

        return;
    }

    const availableBDT =
        qexcToBDT(
            state.wallet.balance_qexc
        );

    if (amountBDT > availableBDT) {

        showToast(
            "Insufficient balance.",
            "error"
        );

        return;
    }

    if (
        !/^01[3-9]\d{8}$/.test(
            accountNumber
        )
    ) {

        showToast(
            "Enter a valid Bangladesh mobile number.",
            "error"
        );

        return;
    }

    if (submitButton) {

        submitButton.disabled = true;

        submitButton.textContent =
            "Submitting...";
    }

    try {

        const data =
            await apiRequest(
                "/withdrawals",
                {
                    method: "POST",

                    body: JSON.stringify({
                        amount_bdt: amountBDT,
                        method: state.withdrawMethod,
                        account_number:
                            accountNumber
                    })
                }
            );

        if (data?.wallet) {

            state.wallet = {
                ...state.wallet,
                ...data.wallet
            };
        }

        renderWallet();

        await loadTransactions();

        closeWithdrawModal();

        showToast(
            "Withdrawal request submitted for review.",
            "success"
        );

    } catch (error) {

        showToast(
            error.message ||
            "Withdrawal request failed.",
            "error"
        );

    } finally {

        if (submitButton) {

            submitButton.disabled = false;

            submitButton.textContent =
                "Submit Withdrawal";
        }
    }
}


/* =========================
   REFERRAL
========================= */

function updateReferralLink() {

    const element =
        $("referralLink");

    if (!element) return;

    const id =
        telegramId();

    if (!id) {

        element.textContent =
            "Open from Telegram to get your referral link.";

        return;
    }

    element.textContent =
        `https://t.me/Qexus_Official_Bot?start=ref_${id}`;
}


async function copyReferralLink() {

    const element =
        $("referralLink");

    if (!element) return;

    const link =
        element.textContent.trim();

    if (
        !link ||
        !link.startsWith("http")
    ) {

        showToast(
            "Referral link is not ready.",
            "error"
        );

        return;
    }

    try {

        await navigator.clipboard.writeText(
            link
        );

        showToast(
            "Referral link copied!",
            "success"
        );

    } catch (_) {

        showToast(
            "Could not copy link.",
            "error"
        );
    }
}


/* =========================
   NAVIGATION
========================= */

function navigate(page) {

    if (!page) return;

    const pages =
        $all(".page");

    pages.forEach(element => {

        element.classList.remove("active");

    });

    const target =
        $(`page-${page}`);

    if (target) {

        target.classList.add("active");

        state.currentPage = page;
    }

    $all(".nav-item").forEach(item => {

        item.classList.toggle(
            "active",
            item.dataset.page === page
        );
    });

    if (page === "wallet") {
        loadTransactions();
    }

    if (page === "tasks") {
        loadTasks();
    }

    if (page === "leaderboard") {
        loadLeaderboard();
    }

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}


/* =========================
   NOTIFICATIONS
========================= */

function openNotifications() {

    const modal =
        $("notificationModal");

    if (modal) {
        modal.classList.add("show");
    }
}


function closeNotifications() {

    const modal =
        $("notificationModal");

    if (modal) {
        modal.classList.remove("show");
    }
}


/* =========================
   ANNOUNCEMENT
========================= */

function openAnnouncement() {

    const modal =
        $("announcementModal");

    if (modal) {
        modal.classList.add("show");
    }
}


function closeAnnouncement() {

    const modal =
        $("announcementModal");

    if (modal) {
        modal.classList.remove("show");
    }
}


/* =========================
   POLICY / INFO MODALS
========================= */

function openPolicy(title, body) {

    setText(
        "policyTitle",
        title || "Policy"
    );

    const content =
        $("policyBody");

    if (content) {
        content.innerHTML =
            body || "";
    }

    const modal =
        $("policyModal");

    if (modal) {
        modal.classList.add("show");
    }
}


function closePolicy() {

    const modal =
        $("policyModal");

    if (modal) {
        modal.classList.remove("show");
    }
}


function openInfo(title, body) {

    setText(
        "infoModalTitle",
        title || "Information"
    );

    const content =
        $("infoModalBody");

    if (content) {
        content.innerHTML =
            body || "";
    }

    const modal =
        $("infoModal");

    if (modal) {
        modal.classList.add("show");
    }
}


function closeInfo() {

    const modal =
        $("infoModal");

    if (modal) {
        modal.classList.remove("show");
    }
}


/* =========================
   HELP
========================= */

function openHelp() {

    openInfo(
        "Help & Support",
        `
            <p>
                Need help with QEXUS?
            </p>

            <p>
                For account, reward or withdrawal issues,
                contact QEXUS support.
            </p>

            <p>
                Support:
                <strong>${escapeHTML(
                    CONFIG.SUPPORT_USERNAME
                )}</strong>
            </p>
        `
    );
}


/* =========================
   ABOUT
========================= */

function openAbout() {

    openInfo(
        "About QEXUS",
        `
            <p>
                <strong>QEXUS</strong>
                is a Telegram rewards platform.
            </p>

            <p>
                Earn QEXC through available activities
                and request eligible withdrawals.
            </p>

            <p>
                1,000 QEXC = ৳100
            </p>
        `
    );
}


/* =========================
   OFFICIAL CHANNEL
========================= */

function openOfficialChannel() {

    const url =
        CONFIG.OFFICIAL_CHANNEL;

    try {

        if (
            tg &&
            typeof tg.openTelegramLink ===
            "function"
        ) {

            tg.openTelegramLink(url);

        } else {

            window.open(
                url,
                "_blank",
                "noopener"
            );
        }

    } catch (error) {

        window.open(
            url,
            "_blank",
            "noopener"
        );
    }
}


/* =========================
   COPY TEXT
========================= */

async function copyText(text) {

    try {

        await navigator.clipboard.writeText(
            text
        );

        showToast(
            "Copied!",
            "success"
        );

    } catch (_) {

        showToast(
            "Could not copy.",
            "error"
        );
    }
}


/* =========================
   SAFE HTML
========================= */

function escapeHTML(value) {

    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}


function escapeAttribute(value) {

    return String(value ?? "")
        .replaceAll("\\", "\\\\")
        .replaceAll("'", "\\'");
}


/* =========================
   REFRESH
========================= */

async function refreshAll() {

    try {

        await Promise.all([
            loadWallet(),
            loadTransactions(),
            loadTasks(),
            loadLeaderboard()
        ]);

    } catch (error) {

        console.warn(
            "Refresh error:",
            error
        );
    }
}


/* =========================
   EVENT BINDINGS
========================= */

function bindEvents() {

    /*
     * Navigation
     */

    $all(".nav-item").forEach(item => {

        item.addEventListener(
            "click",
            () => {

                navigate(
                    item.dataset.page
                );

            }
        );

    });


    /*
     * Withdrawal methods
     */

    $all("[data-method]").forEach(button => {

        button.addEventListener(
            "click",
            () => {

                selectWithdrawMethod(
                    button.dataset.method
                );

            }
        );

    });


    /*
     * Withdrawal submit
     */

    const withdrawSubmit =
        $("withdrawSubmit");

    if (withdrawSubmit) {

        withdrawSubmit.addEventListener(
            "click",
            submitWithdrawal
        );

    }


    /*
     * Close modal when clicking backdrop
     */

    $all(".modal").forEach(modal => {

        modal.addEventListener(
            "click",
            event => {

                if (
                    event.target === modal
                ) {

                    modal.classList.remove(
                        "show"
                    );
                }

            }
        );

    });


    /*
     * Escape key
     */

    document.addEventListener(
        "keydown",
        event => {

            if (
                event.key === "Escape"
            ) {

                $all(".modal.show")
                    .forEach(modal => {

                        modal.classList.remove(
                            "show"
                        );

                    });
            }

        }
    );


    /*
     * Withdrawal amount validation
     */

    const withdrawAmount =
        $("withdrawAmount");

    if (withdrawAmount) {

        withdrawAmount.addEventListener(
            "input",
            () => {

                let value =
                    Number(
                        withdrawAmount.value
                    );

                if (
                    Number.isFinite(value) &&
                    value < 0
                ) {

                    withdrawAmount.value =
                        "0";
                }

            }
        );

    }


    /*
     * Phone input
     */

    const withdrawNumber =
        $("withdrawNumber");

    if (withdrawNumber) {

        withdrawNumber.addEventListener(
            "input",
            () => {

                withdrawNumber.value =
                    withdrawNumber.value
                        .replace(/\D/g, "")
                        .slice(0, 11);

            }
        );

    }


    /*
     * Telegram back button
     */

    if (tg?.BackButton) {

        tg.BackButton.onClick(
            () => {

                navigate("home");

                tg.BackButton.hide();

            }
        );

    }
}


/* =========================
   INITIALIZATION
========================= */

async function initializeApp() {

    if (state.initialized) {
        return;
    }

    state.initialized = true;

    showLoader(
        "Connecting to QEXUS..."
    );

    try {

        if (!tg?.initData) {

            throw new Error(
                "Please open QEXUS from the official Telegram Mini App."
            );
        }


        /*
         * Load cached daily state
         */

        loadDailyTimer();


        /*
         * Telegram user UI
         */

        renderUser();


        /*
         * AdsGram
         */

        initializeAdsGram();


        /*
         * Authentication
         */

        await authenticate();


        /*
         * Main data
         */

        await Promise.all([
            loadWallet(),
            loadTransactions(),
            loadTasks(),
            loadLeaderboard()
        ]);


        /*
         * Daily timer
         */

        startDailyCountdown();


        /*
         * Events
         */

        bindEvents();


        /*
         * Start on home
         */

        navigate("home");


        hideLoader();

        showToast(
            "Welcome to QEXUS!",
            "success"
        );

    } catch (error) {

        console.error(
            "QEXUS initialization error:",
            error
        );

        hideLoader();

        showToast(
            error.message ||
            "Could not connect to QEXUS.",
            "error"
        );

        /*
         * Keep basic UI visible,
         * but do not create fake wallet data.
         */

        renderUser();
        renderWallet();

    }
}


/* =========================
   GLOBAL FUNCTIONS
   =========================
   Required by HTML onclick=""
========================= */

window.navigate =
    navigate;

window.watchAd =
    watchAd;

window.claimDailyBonus =
    claimDailyBonus;

window.completeTask =
    completeTask;

window.openWithdrawModal =
    openWithdrawModal;

window.closeWithdrawModal =
    closeWithdrawModal;

window.selectWithdrawMethod =
    selectWithdrawMethod;

window.submitWithdrawal =
    submitWithdrawal;

window.copyReferralLink =
    copyReferralLink;

window.openNotifications =
    openNotifications;

window.closeNotifications =
    closeNotifications;

window.openAnnouncement =
    openAnnouncement;

window.closeAnnouncement =
    closeAnnouncement;

window.openPolicy =
    openPolicy;

window.closePolicy =
    closePolicy;

window.openInfo =
    openInfo;

window.closeInfo =
    closeInfo;

window.openHelp =
    openHelp;

window.openAbout =
    openAbout;

window.openOfficialChannel =
    openOfficialChannel;

window.copyText =
    copyText;


/* =========================
   START
========================= */

if (
    document.readyState ===
    "loading"
) {

    document.addEventListener(
        "DOMContentLoaded",
        initializeApp
    );

} else {

    initializeApp();

}
