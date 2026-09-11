/* =========================================================
   QEXUS — Telegram Mini App
   app.js
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

    DAILY_COOLDOWN_MS: 24 * 60 * 60 * 1000,

    REQUEST_TIMEOUT: 15000
};


/* =========================
   TELEGRAM
========================= */

const tg = window.Telegram && window.Telegram.WebApp
    ? window.Telegram.WebApp
    : null;

if (tg) {
    try {
        tg.ready();
        tg.expand();

        if (typeof tg.setHeaderColor === "function") {
            tg.setHeaderColor("#ffffff");
        }

        if (typeof tg.setBackgroundColor === "function") {
            tg.setBackgroundColor("#ffffff");
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

    currentPage: "home",

    withdrawMethod: "bKash",

    adController: null,
    adLoading: false,

    dailyLoading: false,
    dailyNextClaimAt: null,
    dailyTimer: null,

    initialized: false
};


/* =========================
   HELPERS
========================= */

function $(id) {
    return document.getElementById(id);
}


function $$(selector) {
    return document.querySelectorAll(selector);
}


function safeNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}


function escapeHTML(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


function escapeAttribute(value) {
    return escapeHTML(value);
}


function formatQEXC(value) {
    return Math.floor(safeNumber(value)).toLocaleString("en-US");
}


function formatBDTFromQEXC(qexc) {
    return (safeNumber(qexc) * CONFIG.QEXC_TO_BDT)
        .toFixed(2);
}


function qexcToBDT(qexc) {
    return safeNumber(qexc) * CONFIG.QEXC_TO_BDT;
}


function bdtToQEXC(bdt) {
    if (!CONFIG.QEXC_TO_BDT) return 0;

    return safeNumber(bdt) / CONFIG.QEXC_TO_BDT;
}


function formatDate(value) {
    if (!value) return "-";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "-";
    }

    return date.toLocaleString("en-BD", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}


function formatTime(seconds) {
    seconds = Math.max(0, Math.floor(seconds));

    const days = Math.floor(seconds / 86400);
    seconds %= 86400;

    const hours = Math.floor(seconds / 3600);
    seconds %= 3600;

    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;

    if (days > 0) {
        return `${days}d ${String(hours).padStart(2, "0")}h`;
    }

    return [
        String(hours).padStart(2, "0"),
        String(minutes).padStart(2, "0"),
        String(secs).padStart(2, "0")
    ].join(":");
}


function getInitials(name) {
    const text = String(name || "Q");

    const parts = text
        .trim()
        .split(/\s+/)
        .filter(Boolean);

    if (!parts.length) return "Q";

    if (parts.length === 1) {
        return parts[0].slice(0, 2).toUpperCase();
    }

    return (
        parts[0].charAt(0) +
        parts[parts.length - 1].charAt(0)
    ).toUpperCase();
}


/* =========================
   TOAST
========================= */

function showToast(message, type = "info") {

    let toast = $("toast");

    if (!toast) {
        toast = document.createElement("div");
        toast.id = "toast";

        toast.style.position = "fixed";
        toast.style.left = "50%";
        toast.style.bottom = "85px";
        toast.style.transform = "translateX(-50%)";
        toast.style.zIndex = "99999";
        toast.style.maxWidth = "90%";
        toast.style.padding = "12px 18px";
        toast.style.borderRadius = "12px";
        toast.style.background = "#111827";
        toast.style.color = "#fff";
        toast.style.fontSize = "14px";
        toast.style.fontWeight = "600";
        toast.style.boxShadow = "0 10px 30px rgba(0,0,0,.2)";
        toast.style.textAlign = "center";
        toast.style.transition = "opacity .2s ease";

        document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.style.opacity = "1";

    clearTimeout(toast._timer);

    toast._timer = setTimeout(() => {
        toast.style.opacity = "0";
    }, 3000);
}


/* =========================
   LOADER
========================= */

function showLoader(show = true, text = "Loading...") {

    let loader = $("globalLoader");

    if (!loader) {
        loader = document.createElement("div");
        loader.id = "globalLoader";

        loader.style.position = "fixed";
        loader.style.inset = "0";
        loader.style.zIndex = "99998";
        loader.style.background = "rgba(255,255,255,.88)";
        loader.style.display = "none";
        loader.style.alignItems = "center";
        loader.style.justifyContent = "center";
        loader.style.flexDirection = "column";
        loader.style.gap = "12px";

        loader.innerHTML = `
            <div style="
                width:34px;
                height:34px;
                border:3px solid #e5e7eb;
                border-top-color:#2563eb;
                border-radius:50%;
                animation:qexusSpin .8s linear infinite;
            "></div>
            <div id="globalLoaderText"
                style="font-size:14px;font-weight:600;color:#374151;">
                Loading...
            </div>
        `;

        if (!document.getElementById("qexusLoaderStyle")) {
            const style = document.createElement("style");
            style.id = "qexusLoaderStyle";
            style.textContent = `
                @keyframes qexusSpin {
                    to { transform: rotate(360deg); }
                }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(loader);
    }

    const loaderText = $("globalLoaderText");

    if (loaderText) {
        loaderText.textContent = text;
    }

    loader.style.display = show ? "flex" : "none";
}


/* =========================
   API
========================= */

async function apiRequest(endpoint, options = {}) {

    const controller = new AbortController();

    const timeout = setTimeout(() => {
        controller.abort();
    }, CONFIG.REQUEST_TIMEOUT);

    const headers = {
        "Content-Type": "application/json",
        ...(options.headers || {})
    };

    /*
      IMPORTANT:
      Always send raw Telegram initData.
      Never send initDataUnsafe as authentication.
    */

    if (tg && tg.initData) {
        headers["X-Telegram-Init-Data"] = tg.initData;
    }

    try {

        const response = await fetch(
            API_BASE + endpoint,
            {
                ...options,
                headers,
                signal: controller.signal
            }
        );

        const text = await response.text();

        let data = {};

        try {
            data = text ? JSON.parse(text) : {};
        } catch {
            data = {
                detail: text || "Invalid server response"
            };
        }

        if (!response.ok) {

            let message =
                data?.detail ||
                data?.message ||
                `Request failed (${response.status})`;

            if (Array.isArray(message)) {
                message = message
                    .map(item => item?.msg || String(item))
                    .join(", ");
            }

            throw new Error(message);
        }

        return data;

    } catch (error) {

        if (error.name === "AbortError") {
            throw new Error("Server response timeout");
        }

        throw error;

    } finally {
        clearTimeout(timeout);
    }
}


/* =========================
   AUTH
========================= */

async function authenticate() {

    if (!tg || !tg.initData) {
        console.warn("Telegram initData unavailable.");

        showToast(
            "Telegram Mini App থেকে খুললে authentication কাজ করবে।",
            "warning"
        );

        return null;
    }

    try {

        const data = await apiRequest("/auth", {
            method: "POST"
        });

        if (data?.user) {
            state.user = data.user;
        }

        if (data?.wallet) {
            state.wallet = {
                ...state.wallet,
                ...data.wallet
            };
        }

        return data;

    } catch (error) {

        console.error("Authentication error:", error);

        showToast(
            error.message || "Authentication failed",
            "error"
        );

        return null;
    }
}


/* =========================
   WALLET
========================= */

async function loadWallet() {

    try {

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

        return data;

    } catch (error) {

        console.error("Wallet error:", error);

        return null;
    }
}


/* =========================
   TRANSACTIONS
========================= */

async function loadTransactions() {

    try {

        const data = await apiRequest("/transactions");

        if (Array.isArray(data)) {
            state.transactions = data;
        } else if (Array.isArray(data?.transactions)) {
            state.transactions = data.transactions;
        } else if (Array.isArray(data?.items)) {
            state.transactions = data.items;
        } else {
            state.transactions = [];
        }

        renderTransactions();

        return state.transactions;

    } catch (error) {

        console.error("Transactions error:", error);

        state.transactions = [];

        renderTransactions();

        return [];
    }
}


/* =========================
   USER UI
========================= */

function renderUser() {

    if (!state.user) return;

    const firstName =
        state.user.first_name ||
        state.user.name ||
        "User";

    const username =
        state.user.username
            ? `@${state.user.username.replace(/^@/, "")}`
            : "Telegram User";

    const initials = getInitials(
        state.user.first_name ||
        state.user.username ||
        "QX"
    );

    const nameElements = [
        $("userName"),
        $("profileName")
    ];

    nameElements.forEach(el => {
        if (el) {
            el.textContent = firstName;
        }
    });

    const usernameElement = $("profileUsername");

    if (usernameElement) {
        usernameElement.textContent = username;
    }

    const avatarElements = [
        $("profileAvatar"),
        $("topAvatarText")
    ];

    avatarElements.forEach(el => {

        if (!el) return;

        if (
            el.tagName === "IMG" &&
            state.user.photo_url
        ) {
            el.src = state.user.photo_url;
            el.alt = firstName;
        } else {
            el.textContent = initials;
        }
    });
}


/* =========================
   WALLET UI
========================= */

function renderWallet() {

    const balanceQEXC =
        safeNumber(state.wallet.balance_qexc);

    const balanceBDT =
        qexcToBDT(balanceQEXC);

    const totalEarned =
        safeNumber(state.wallet.total_earned);

    const totalWithdrawn =
        safeNumber(state.wallet.total_withdrawn);

    if ($("balanceQEXC")) {
        $("balanceQEXC").textContent =
            `${formatQEXC(balanceQEXC)} QEXC`;
    }

    if ($("balanceBDT")) {
        $("balanceBDT").textContent =
            `৳${balanceBDT.toFixed(2)}`;
    }

    if ($("walletBalance")) {
        $("walletBalance").textContent =
            `৳${balanceBDT.toFixed(2)}`;
    }

    if ($("walletQEXC")) {
        $("walletQEXC").textContent =
            `${formatQEXC(balanceQEXC)} QEXC`;
    }

    if ($("totalEarned")) {
        $("totalEarned").textContent =
            `${formatQEXC(totalEarned)} QEXC`;
    }

    if ($("totalWithdrawn")) {
        $("totalWithdrawn").textContent =
            `${formatQEXC(totalWithdrawn)} QEXC`;
    }

    if ($("profileEarned")) {
        $("profileEarned").textContent =
            `${formatQEXC(totalEarned)} QEXC`;
    }

    if ($("profileWithdrawn")) {
        $("profileWithdrawn").textContent =
            `${formatQEXC(totalWithdrawn)} QEXC`;
    }

    updateWithdrawAvailable();
}


/* =========================
   TRANSACTIONS UI
========================= */

function renderTransactions() {

    const containers = [
        $("recentTransactions"),
        $("historyList")
    ];

    containers.forEach(container => {

        if (!container) return;

        if (!state.transactions.length) {

            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">◷</div>
                    <div class="empty-title">No transactions yet</div>
                    <div class="empty-text">
                        Your earning and withdrawal history will appear here.
                    </div>
                </div>
            `;

            return;
        }

        const list =
            container.id === "recentTransactions"
                ? state.transactions.slice(0, 5)
                : state.transactions;

        container.innerHTML = list
            .map(transactionHTML)
            .join("");
    });
}


function transactionHTML(tx) {

    const type =
        tx.type ||
        tx.transaction_type ||
        "transaction";

    const amount =
        safeNumber(
            tx.amount_qexc ??
            tx.qexc ??
            tx.amount
        );

    const status =
        String(tx.status || "completed")
            .toLowerCase();

    const positive =
        type.includes("earn") ||
        type.includes("reward") ||
        type.includes("bonus") ||
        type.includes("referral") ||
        amount > 0 && !type.includes("withdraw");

    const sign = positive ? "+" : "-";

    const title =
        tx.title ||
        tx.description ||
        prettyTransactionType(type);

    return `
        <div class="transaction-item">
            <div class="transaction-left">
                <div class="transaction-icon">
                    ${positive ? "+" : "−"}
                </div>

                <div>
                    <div class="transaction-title">
                        ${escapeHTML(title)}
                    </div>

                    <div class="transaction-date">
                        ${escapeHTML(
                            formatDate(
                                tx.created_at ||
                                tx.created ||
                                tx.timestamp
                            )
                        )}
                    </div>
                </div>
            </div>

            <div class="transaction-right">
                <div class="${positive ? "positive" : "negative"}">
                    ${sign}${formatQEXC(Math.abs(amount))} QEXC
                </div>

                <div class="transaction-status ${escapeAttribute(status)}">
                    ${escapeHTML(status)}
                </div>
            </div>
        </div>
    `;
}


function prettyTransactionType(type) {

    return String(type)
        .replace(/_/g, " ")
        .replace(/\b\w/g, c => c.toUpperCase());
}


/* =========================
   DAILY BONUS
========================= */

async function loadDailyStatus() {

    const saved =
        localStorage.getItem("qexus_daily_next_claim");

    if (saved) {

        const timestamp = Number(saved);

        if (
            Number.isFinite(timestamp) &&
            timestamp > Date.now()
        ) {
            state.dailyNextClaimAt = timestamp;
        }
    }

    renderDailyStatus();
}


function startDailyCountdown() {

    stopDailyCountdown();

    state.dailyTimer = setInterval(() => {

        renderDailyStatus();

    }, 1000);

    renderDailyStatus();
}


function stopDailyCountdown() {

    if (state.dailyTimer) {
        clearInterval(state.dailyTimer);
        state.dailyTimer = null;
    }
}


function renderDailyStatus() {

    const box = $("dailyCountdownBox");
    const countdown = $("dailyCountdown");
    const status = $("homeDailyStatus");

    const next =
        state.dailyNextClaimAt;

    if (!next || next <= Date.now()) {

        if (countdown) {
            countdown.textContent = "Available now";
        }

        if (status) {
            status.textContent =
                `Claim +${CONFIG.DAILY_BONUS_QEXC} QEXC`;
        }

        if (box) {
            box.classList.remove("disabled");
        }

        return;
    }

    const seconds =
        Math.ceil((next - Date.now()) / 1000);

    if (countdown) {
        countdown.textContent =
            formatTime(seconds);
    }

    if (status) {
        status.textContent =
            "Next daily bonus";
    }

    if (box) {
        box.classList.add("disabled");
    }

    if (seconds <= 0) {
        state.dailyNextClaimAt = null;

        localStorage.removeItem(
            "qexus_daily_next_claim"
        );
    }
}


async function claimDailyBonus() {

    if (state.dailyLoading) return;

    if (
        state.dailyNextClaimAt &&
        state.dailyNextClaimAt > Date.now()
    ) {
        showToast(
            "Daily bonus এখনো available হয়নি।",
            "warning"
        );
        return;
    }

    state.dailyLoading = true;

    try {

        const data =
            await apiRequest("/rewards/daily", {
                method: "POST"
            });

        const reward =
            safeNumber(
                data?.reward_qexc ??
                data?.amount_qexc ??
                CONFIG.DAILY_BONUS_QEXC
            );

        let nextClaim =
            data?.next_claim_at ||
            data?.next_available_at;

        if (nextClaim) {

            const parsed =
                new Date(nextClaim).getTime();

            if (Number.isFinite(parsed)) {
                state.dailyNextClaimAt = parsed;
            }

        } else {

            state.dailyNextClaimAt =
                Date.now() +
                CONFIG.DAILY_COOLDOWN_MS;
        }

        localStorage.setItem(
            "qexus_daily_next_claim",
            String(state.dailyNextClaimAt)
        );

        if (data?.wallet) {
            state.wallet = {
                ...state.wallet,
                ...data.wallet
            };
        } else {
            await loadWallet();
        }

        await loadTransactions();

        renderDailyStatus();

        showToast(
            `Daily bonus: +${formatQEXC(reward)} QEXC`,
            "success"
        );

    } catch (error) {

        console.error("Daily bonus error:", error);

        showToast(
            error.message || "Daily bonus claim failed",
            "error"
        );

    } finally {

        state.dailyLoading = false;
    }
}


/* =========================
   ADSGRAM
========================= */

function initAdsGram() {

    if (
        !window.Adsgram ||
        typeof window.Adsgram.init !== "function"
    ) {
        console.warn(
            "AdsGram SDK not available."
        );

        updateAdStatus(
            "Ads are currently unavailable."
        );

        return false;
    }

    try {

        state.adController =
            window.Adsgram.init({
                blockId: ADSGRAM_BLOCK_ID
            });

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

        if (
            state.adController &&
            typeof state.adController.onComplete === "function"
        ) {

            state.adController.onComplete(() => {

                console.log(
                    "AdsGram ad completed."
                );

            });
        }

        if (
            state.adController &&
            typeof state.adController.onSkip === "function"
        ) {

            state.adController.onSkip(() => {

                console.log(
                    "AdsGram ad skipped."
                );

            });
        }

        if (
            state.adController &&
            typeof state.adController.onError === "function"
        ) {

            state.adController.onError(error => {

                console.error(
                    "AdsGram error:",
                    error
                );

            });
        }

        updateAdStatus(
            "Watch the ad completely to earn QEXC."
        );

        return true;

    } catch (error) {

        console.error(
            "AdsGram initialization error:",
            error
        );

        updateAdStatus(
            "Ads are currently unavailable."
        );

        return false;
    }
}


function updateAdStatus(message) {

    const status = $("adStatus");

    if (status) {
        status.textContent = message;
    }
}


function setWatchAdButtonLoading(loading) {

    const button = $("watchAdButton");

    if (!button) return;

    button.disabled = loading;

    if (loading) {
        button.dataset.originalText =
            button.textContent;

        button.textContent =
            "Loading ad...";
    } else {

        button.textContent =
            button.dataset.originalText ||
            "Watch Ad";
    }
}


/*
  IMPORTANT:
  This endpoint is only compatible with the current
  backend TEST reward implementation.

  For production:
  replace this with a secure server-side
  AdsGram reward verification/callback system.
*/

async function requestAdReward() {

    return await apiRequest("/rewards/ad", {
        method: "POST",
        body: JSON.stringify({
            block_id: ADSGRAM_BLOCK_ID
        })
    });
}


async function watchAd() {

    if (state.adLoading) return;

    if (!state.adController) {

        const initialized =
            initAdsGram();

        if (!initialized) {

            showToast(
                "এই মুহূর্তে কোনো বিজ্ঞাপন available নেই।",
                "warning"
            );

            return;
        }
    }

    state.adLoading = true;

    setWatchAdButtonLoading(true);

    updateAdStatus(
        "Advertisement loading..."
    );

    try {

        /*
          AdsGram resolves show() after
          the rewarded ad has been completed.
        */

        await state.adController.show();

        updateAdStatus(
            "Ad completed. Processing reward..."
        );

        /*
          Current backend endpoint is TEST ONLY.
          Production should verify reward server-side.
        */

        const rewardData =
            await requestAdReward();

        const reward =
            safeNumber(
                rewardData?.reward_qexc ??
                rewardData?.amount_qexc ??
                CONFIG.AD_REWARD_QEXC
            );

        if (rewardData?.wallet) {

            state.wallet = {
                ...state.wallet,
                ...rewardData.wallet
            };

        } else {

            await loadWallet();
        }

        await loadTransactions();

        updateAdStatus(
            `+${formatQEXC(reward)} QEXC added`
        );

        showToast(
            `অভিনন্দন! +${formatQEXC(reward)} QEXC পেয়েছো।`,
            "success"
        );

    } catch (error) {

        console.error(
            "Rewarded ad error:",
            error
        );

        updateAdStatus(
            "Watch cancelled or ad unavailable."
        );

        showToast(
            "বিজ্ঞাপন সম্পূর্ণ হয়নি, তাই reward দেওয়া হয়নি।",
            "warning"
        );

    } finally {

        state.adLoading = false;

        setWatchAdButtonLoading(false);
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
        } else if (Array.isArray(data?.tasks)) {
            state.tasks = data.tasks;
        } else if (Array.isArray(data?.items)) {
            state.tasks = data.items;
        } else {
            state.tasks = [];
        }

        renderTasks();

        return state.tasks;

    } catch (error) {

        console.error(
            "Tasks error:",
            error
        );

        state.tasks = [];

        if (container) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-title">
                        Tasks unavailable
                    </div>

                    <div class="empty-text">
                        Please try again later.
                    </div>
                </div>
            `;
        }

        return [];
    }
}


function renderTasks() {

    const container = $("taskList");

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
            .map(renderTaskHTML)
            .join("");
}


function renderTaskHTML(task) {

    const id =
        task.id ??
        task.task_id;

    const title =
        task.title ||
        task.name ||
        "Task";

    const description =
        task.description ||
        "Complete this task to earn QEXC.";

    const reward =
        safeNumber(
            task.reward_qexc ??
            task.reward ??
            task.amount_qexc
        );

    const completed =
        Boolean(
            task.completed ||
            task.is_completed ||
            task.status === "completed"
        );

    return `
        <div class="task-card">

            <div class="task-info">

                <div class="task-title">
                    ${escapeHTML(title)}
                </div>

                <div class="task-description">
                    ${escapeHTML(description)}
                </div>

                <div class="task-reward">
                    +${formatQEXC(reward)} QEXC
                </div>

            </div>

            <button
                class="task-button"
                ${completed ? "disabled" : ""}
                onclick="completeTask('${escapeAttribute(id)}')"
            >
                ${completed ? "Completed" : "Complete"}
            </button>

        </div>
    `;
}


async function completeTask(taskId) {

    if (!taskId) return;

    try {

        const data =
            await apiRequest(
                `/tasks/${encodeURIComponent(taskId)}/complete`,
                {
                    method: "POST"
                }
            );

        const reward =
            safeNumber(
                data?.reward_qexc ??
                data?.amount_qexc
            );

        if (data?.wallet) {

            state.wallet = {
                ...state.wallet,
                ...data.wallet
            };

        } else {

            await loadWallet();
        }

        await loadTransactions();
        await loadTasks();

        showToast(
            reward > 0
                ? `Task complete! +${formatQEXC(reward)} QEXC`
                : "Task completed successfully.",
            "success"
        );

    } catch (error) {

        console.error(
            "Task completion error:",
            error
        );

        showToast(
            error.message ||
            "Task could not be completed.",
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
        } else if (Array.isArray(data?.leaderboard)) {
            state.leaderboard = data.leaderboard;
        } else if (Array.isArray(data?.items)) {
            state.leaderboard = data.items;
        } else {
            state.leaderboard = [];
        }

        renderLeaderboard();

        return state.leaderboard;

    } catch (error) {

        console.warn(
            "Leaderboard unavailable:",
            error.message
        );

        state.leaderboard = [];

        renderLeaderboard();

        return [];
    }
}


function renderLeaderboard() {

    const container =
        $("leaderboardList");

    if (!container) return;

    if (!state.leaderboard.length) {

        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">#</div>

                <div class="empty-title">
                    Leaderboard unavailable
                </div>

                <div class="empty-text">
                    Rankings will appear when data is available.
                </div>
            </div>
        `;

        return;
    }

    container.innerHTML =
        state.leaderboard
            .slice(0, 100)
            .map((item, index) => {

                const name =
                    item.first_name ||
                    item.name ||
                    item.username ||
                    "User";

                const username =
                    item.username
                        ? `@${String(item.username).replace(/^@/, "")}`
                        : "";

                const score =
                    safeNumber(
                        item.balance_qexc ??
                        item.total_earned ??
                        item.qexc ??
                        item.score
                    );

                return `
                    <div class="leaderboard-row">

                        <div class="leaderboard-rank">
                            ${index + 1}
                        </div>

                        <div class="leaderboard-user">
                            <div class="leaderboard-avatar">
                                ${escapeHTML(
                                    getInitials(name)
                                )}
                            </div>

                            <div>
                                <div class="leaderboard-name">
                                    ${escapeHTML(name)}
                                </div>

                                <div class="leaderboard-username">
                                    ${escapeHTML(username)}
                                </div>
                            </div>
                        </div>

                        <div class="leaderboard-score">
                            ${formatQEXC(score)} QEXC
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

    const modal =
        $("withdrawModal");

    if (!modal) {
        showToast(
            "Withdrawal form পাওয়া যায়নি।",
            "error"
        );
        return;
    }

    updateWithdrawAvailable();

    const amountInput =
        $("withdrawAmount");

    const numberInput =
        $("withdrawNumber");

    if (amountInput) {
        amountInput.value = "";
    }

    if (numberInput) {
        numberInput.value = "";
    }

    modal.classList.add("active");
    modal.classList.add("show");

    modal.style.display = "flex";

    if (typeof tg?.BackButton?.show === "function") {
        tg.BackButton.show();
    }
}


function closeWithdrawModal() {

    const modal =
        $("withdrawModal");

    if (!modal) return;

    modal.classList.remove("active");
    modal.classList.remove("show");

    modal.style.display = "none";

    if (
        state.currentPage === "home" &&
        typeof tg?.BackButton?.hide === "function"
    ) {
        tg.BackButton.hide();
    }
}


function updateWithdrawAvailable() {

    const balance =
        safeNumber(state.wallet.balance_qexc);

    const bdt =
        qexcToBDT(balance);

    const element =
        $("withdrawAvailable");

    if (element) {

        element.textContent =
            `Available: ৳${bdt.toFixed(2)} (${formatQEXC(balance)} QEXC)`;
    }
}


function selectWithdrawMethod(method) {

    if (
        method !== "bKash" &&
        method !== "Nagad"
    ) {
        return;
    }

    state.withdrawMethod = method;

    $$("[data-method]").forEach(button => {

        const buttonMethod =
            button.dataset.method;

        button.classList.toggle(
            "active",
            buttonMethod === method
        );

        button.setAttribute(
            "aria-selected",
            buttonMethod === method
                ? "true"
                : "false"
        );
    });
}


function validateBDPhone(number) {

    const clean =
        String(number || "")
            .replace(/\s+/g, "");

    return /^01[3-9]\d{8}$/.test(clean);
}


async function submitWithdrawal() {

    const amountInput =
        $("withdrawAmount");

    const numberInput =
        $("withdrawNumber");

    const amount =
        safeNumber(
            amountInput?.value
        );

    const accountNumber =
        String(
            numberInput?.value || ""
        ).replace(/\s+/g, "");

    if (amount < CONFIG.MIN_WITHDRAW_BDT) {

        showToast(
            `Minimum withdrawal ৳${CONFIG.MIN_WITHDRAW_BDT}`,
            "warning"
        );

        return;
    }

    if (!validateBDPhone(accountNumber)) {

        showToast(
            "সঠিক bKash/Nagad নম্বর দিন।",
            "warning"
        );

        return;
    }

    const availableBDT =
        qexcToBDT(
            safeNumber(
                state.wallet.balance_qexc
            )
        );

    if (amount > availableBDT) {

        showToast(
            "আপনার balance যথেষ্ট নেই।",
            "warning"
        );

        return;
    }

    const button =
        $("withdrawSubmit");

    if (button) {
        button.disabled = true;
        button.textContent =
            "Submitting...";
    }

    try {

        const data =
            await apiRequest(
                "/withdrawals",
                {
                    method: "POST",

                    body: JSON.stringify({
                        amount_bdt: amount,
                        method: state.withdrawMethod,
                        account_number: accountNumber
                    })
                }
            );

        if (data?.wallet) {

            state.wallet = {
                ...state.wallet,
                ...data.wallet
            };

        } else {

            await loadWallet();
        }

        await loadTransactions();

        closeWithdrawModal();

        showToast(
            "Withdrawal request submitted successfully.",
            "success"
        );

    } catch (error) {

        console.error(
            "Withdrawal error:",
            error
        );

        showToast(
            error.message ||
            "Withdrawal request failed.",
            "error"
        );

    } finally {

        if (button) {

            button.disabled = false;

            button.textContent =
                "Submit Withdrawal";
        }
    }
}


/* =========================
   REFERRAL
========================= */

function getBotUsername() {

    if (tg?.initDataUnsafe?.user) {
        // Only username from unsafe data is used
        // for UI, not authentication.
    }

    return "Qexus_Official_Bot";
}


function generateReferralLink() {

    if (!state.user) {
        return "";
    }

    const telegramId =
        state.user.telegram_id ??
        state.user.id;

    if (!telegramId) {
        return "";
    }

    return `https://t.me/${getBotUsername()}?start=ref_${telegramId}`;
}


function renderReferral() {

    const input =
        $("referralLink");

    if (!input) return;

    const link =
        state.user?.referral_link ||
        generateReferralLink();

    input.value = link;
}


async function copyReferralLink() {

    const input =
        $("referralLink");

    const link =
        input?.value ||
        generateReferralLink();

    if (!link) {

        showToast(
            "Referral link পাওয়া যায়নি।",
            "error"
        );

        return;
    }

    try {

        await navigator.clipboard.writeText(link);

        showToast(
            "Referral link copied!",
            "success"
        );

    } catch {

        if (input) {

            input.select();

            document.execCommand(
                "copy"
            );

            showToast(
                "Referral link copied!",
                "success"
            );
        }
    }
}


/* =========================
   NAVIGATION
========================= */

function navigate(page) {

    if (!page) return;

    state.currentPage = page;

    const pages =
        document.querySelectorAll(
            "[data-page-content]"
        );

    pages.forEach(section => {

        const sectionPage =
            section.dataset.pageContent;

        section.classList.toggle(
            "active",
            sectionPage === page
        );

        if (sectionPage === page) {
            section.style.display = "";
        } else {
            section.style.display = "none";
        }
    });

    /*
      Support common page class patterns
    */

    document
        .querySelectorAll(".page")
        .forEach(section => {

            const id =
                section.id?.replace(
                    /^page-/,
                    ""
                );

            if (!id) return;

            section.classList.toggle(
                "active",
                id === page
            );
        });


    /*
      Navigation buttons
    */

    document
        .querySelectorAll(
            ".nav-item, .bottom-nav-item, [data-nav-page]"
        )
        .forEach(button => {

            const target =
                button.dataset.page ||
                button.dataset.navPage;

            button.classList.toggle(
                "active",
                target === page
            );
        });


    /*
      Load page-specific data
    */

    if (page === "tasks") {
        loadTasks();
    }

    if (page === "wallet") {
        loadWallet();
        loadTransactions();
    }

    if (page === "profile") {
        renderReferral();
    }

    if (page === "leaderboard" || page === "ranks") {
        loadLeaderboard();
    }

    if (typeof tg?.BackButton !== "undefined") {

        if (page === "home") {

            if (
                typeof tg.BackButton.hide === "function"
            ) {
                tg.BackButton.hide();
            }

        } else {

            if (
                typeof tg.BackButton.show === "function"
            ) {
                tg.BackButton.show();
            }
        }
    }
}


/* =========================
   MODALS
========================= */

function closeModalById(id) {

    const modal = $(id);

    if (!modal) return;

    modal.classList.remove("active");
    modal.classList.remove("show");

    modal.style.display = "none";
}


function openModalById(id) {

    const modal = $(id);

    if (!modal) return;

    modal.classList.add("active");
    modal.classList.add("show");

    modal.style.display = "flex";
}


/* =========================
   NOTIFICATIONS
========================= */

function openNotifications() {

    const modal =
        $("notificationModal");

    if (!modal) {
        showToast(
            "No new notifications.",
            "info"
        );
        return;
    }

    openModalById(
        "notificationModal"
    );
}


function closeNotifications() {

    closeModalById(
        "notificationModal"
    );
}


/* =========================
   ANNOUNCEMENT
========================= */

function openAnnouncement() {

    const modal =
        $("announcementModal");

    if (modal) {
        openModalById(
            "announcementModal"
        );
    }
}


function closeAnnouncement() {

    closeModalById(
        "announcementModal"
    );
}


/* =========================
   POLICY
========================= */

const POLICY_CONTENT = {

    terms: {
        title: "Terms & Conditions",
        body: `
            <p>
                QEXUS is a rewards platform where users can
                earn QEXC through available activities.
            </p>

            <p>
                QEXC is an internal reward point and does not
                represent an investment, cryptocurrency,
                security or guaranteed financial return.
            </p>

            <p>
                Fraud, automation, fake accounts, exploitation
                or abuse of the platform may result in account
                restrictions.
            </p>
        `
    },

    privacy: {
        title: "Privacy Policy",
        body: `
            <p>
                QEXUS may process Telegram account information
                required to provide the service.
            </p>

            <p>
                Wallet, reward and withdrawal information may
                be stored for account and fraud-prevention
                purposes.
            </p>

            <p>
                Never share your Telegram authentication data,
                passwords or financial credentials with anyone.
            </p>
        `
    },

    earning: {
        title: "Earning Rules",
        body: `
            <p>
                Rewards are provided only after the required
                activity is successfully verified.
            </p>

            <p>
                Watching an advertisement partially or skipping
                it may result in no reward.
            </p>

            <p>
                Reward rates can change depending on platform
                and advertising conditions.
            </p>
        `
    }
};


function openPolicy(type) {

    const content =
        POLICY_CONTENT[type];

    if (!content) return;

    const title =
        $("policyTitle");

    const body =
        $("policyBody");

    if (title) {
        title.textContent =
            content.title;
    }

    if (body) {
        body.innerHTML =
            content.body;
    }

    openModalById(
        "policyModal"
    );
}


function closePolicy() {

    closeModalById(
        "policyModal"
    );
}


/* =========================
   HELP / ABOUT
========================= */

function openHelp() {

    const title =
        $("infoModalTitle");

    const body =
        $("infoModalBody");

    if (title) {
        title.textContent =
            "Help & Support";
    }

    if (body) {

        body.innerHTML = `
            <p>
                Need help with QEXUS?
            </p>

            <p>
                Make sure your Telegram account is connected
                and your Mini App is opened from the official
                QEXUS bot.
            </p>

            <p>
                For withdrawal issues, keep your request ID
                and transaction information available.
            </p>
        `;
    }

    openModalById(
        "infoModal"
    );
}


function openAbout() {

    const title =
        $("infoModalTitle");

    const body =
        $("infoModalBody");

    if (title) {
        title.textContent =
            "About QEXUS";
    }

    if (body) {

        body.innerHTML = `
            <p>
                QEXUS is a Telegram-based rewards platform
                focused on simple earning activities.
            </p>

            <p>
                Earn QEXC through eligible activities and
                request withdrawals when your balance reaches
                the minimum threshold.
            </p>

            <p>
                <strong>1,000 QEXC = ৳100</strong>
            </p>
        `;
    }

    openModalById(
        "infoModal"
    );
}


function closeInfoModal() {

    closeModalById(
        "infoModal"
    );
}


/* =========================
   TELEGRAM BACK BUTTON
========================= */

function setupTelegramBackButton() {

    if (!tg?.BackButton) return;

    try {

        tg.BackButton.onClick(() => {

            const withdraw =
                $("withdrawModal");

            if (
                withdraw &&
                (
                    withdraw.classList.contains("active") ||
                    withdraw.style.display === "flex"
                )
            ) {
                closeWithdrawModal();
                return;
            }

            const activeModal =
                document.querySelector(
                    ".modal.active, .modal.show"
                );

            if (activeModal) {

                activeModal.classList.remove(
                    "active"
                );

                activeModal.classList.remove(
                    "show"
                );

                activeModal.style.display =
                    "none";

                return;
            }

            if (state.currentPage !== "home") {
                navigate("home");
                return;
            }

            if (
                typeof tg.close === "function"
            ) {
                tg.close();
            }
        });

    } catch (error) {

        console.warn(
            "Back button setup error:",
            error
        );
    }
}


/* =========================
   CLICK HANDLERS
========================= */

function setupGlobalClicks() {

    /*
      Withdrawal method
    */

    $$("[data-method]").forEach(button => {

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
      Bottom navigation
    */

    $$(".nav-item, .bottom-nav-item").forEach(
        button => {

            button.addEventListener(
                "click",
                () => {

                    const page =
                        button.dataset.page ||
                        button.dataset.navPage;

                    if (page) {
                        navigate(page);
                    }
                }
            );
        }
    );


    /*
      Close modals by clicking overlay
    */

    document.addEventListener(
        "click",
        event => {

            const target =
                event.target;

            if (
                target.classList &&
                target.classList.contains("modal")
            ) {
                target.classList.remove(
                    "active"
                );

                target.classList.remove(
                    "show"
                );

                target.style.display =
                    "none";
            }
        }
    );
}


/* =========================
   TELEGRAM MAIN BUTTON
========================= */

function setupTelegramMainButton() {

    if (!tg?.MainButton) return;

    try {

        tg.MainButton.hide();

    } catch {
        // Ignore
    }
}


/* =========================
   INIT UI
========================= */

function initialUI() {

    renderUser();
    renderWallet();
    renderTransactions();
    renderReferral();

    renderDailyStatus();

    selectWithdrawMethod(
        state.withdrawMethod
    );
}


/* =========================
   REFRESH
========================= */

async function refreshAll() {

    await Promise.allSettled([
        loadWallet(),
        loadTransactions(),
        loadTasks(),
        loadLeaderboard()
    ]);

    renderUser();
    renderWallet();
    renderReferral();
}


/* =========================
   APP INIT
========================= */

async function initApp() {

    if (state.initialized) {
        return;
    }

    state.initialized = true;

    showLoader(
        true,
        "Starting QEXUS..."
    );

    try {

        /*
          1. Telegram
        */

        if (tg) {
            try {
                tg.ready();
                tg.expand();
            } catch {}
        }


        /*
          2. Authenticate
        */

        await authenticate();


        /*
          3. Initial UI
        */

        initialUI();


        /*
          4. AdsGram
        */

        initAdsGram();


        /*
          5. Daily
        */

        await loadDailyStatus();

        startDailyCountdown();


        /*
          6. Data
        */

        await refreshAll();


        /*
          7. Telegram Back Button
        */

        setupTelegramBackButton();


        /*
          8. Main button
        */

        setupTelegramMainButton();


        /*
          9. Global clicks
        */

        setupGlobalClicks();


        /*
          10. Start home
        */

        navigate("home");


    } catch (error) {

        console.error(
            "QEXUS initialization error:",
            error
        );

        showToast(
            "QEXUS load করতে সমস্যা হয়েছে। আবার চেষ্টা করুন।",
            "error"
        );

    } finally {

        showLoader(false);
    }
}


/* =========================
   VISIBILITY REFRESH
========================= */

document.addEventListener(
    "visibilitychange",
    async () => {

        if (
            document.visibilityState === "visible" &&
            state.initialized
        ) {

            await loadWallet();
            await loadTransactions();

            renderDailyStatus();
        }
    }
);


/* =========================
   ONLINE / OFFLINE
========================= */

window.addEventListener(
    "online",
    () => {

        showToast(
            "Internet connection restored.",
            "success"
        );
    }
);


window.addEventListener(
    "offline",
    () => {

        showToast(
            "Internet connection lost.",
            "warning"
        );
    }
);


/* =========================
   GLOBAL FUNCTIONS
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

window.submitWithdrawal =
    submitWithdrawal;

window.selectWithdrawMethod =
    selectWithdrawMethod;

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

window.openHelp =
    openHelp;

window.openAbout =
    openAbout;

window.closeInfoModal =
    closeInfoModal;

window.refreshAll =
    refreshAll;


/* =========================
   START
========================= */

if (
    document.readyState === "loading"
) {

    document.addEventListener(
        "DOMContentLoaded",
        initApp
    );

} else {

    initApp();
}
