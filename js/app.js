/* =========================================================
   QEXUS — app.js
   Telegram Mini App Frontend
   Backend: https://qexus-backend.onrender.com/api

   IMPORTANT:
   - Wallet is backend-authoritative.
   - Telegram initData is sent to backend.
   - No fake rewarded-ad reward.
   - Daily bonus is controlled by backend.
   ========================================================= */

(() => {
    "use strict";

    /* =====================================================
       CONFIG
       ===================================================== */

    const API_BASE =
        "https://qexus-backend.onrender.com/api";

    const BOT_USERNAME =
        "Qexus_Official_Bot";

    const OFFICIAL_CHANNEL =
        "https://t.me/QEXUS_Official";

    const DAILY_BONUS_QEXC = 10;

    const QEXC_TO_BDT = 0.10;

    const MIN_WITHDRAW_BDT = 100;

    const tg =
        window.Telegram?.WebApp || null;


    /* =====================================================
       STATE
       ===================================================== */

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

        loading: false,

        authenticated: false,

        selectedWithdrawMethod: "bKash",

        dailyBonus: {
            available: true,
            nextClaimAt: null
        },

        dailyTimerInterval: null,

        ad: {
            available: false,
            processing: false
        },

        currentLeaderboardTab: "all",

        modalOpen: null

    };


    /* =====================================================
       DOM HELPERS
       ===================================================== */

    const $ = (selector) =>
        document.querySelector(selector);

    const $$ = (selector) =>
        Array.from(
            document.querySelectorAll(selector)
        );


    /* =====================================================
       SAFE HTML
       ===================================================== */

    function escapeHTML(value) {

        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }


    /* =====================================================
       NUMBER / CURRENCY
       ===================================================== */

    function formatNumber(value) {

        const number =
            Number(value || 0);

        return new Intl.NumberFormat(
            "en-US",
            {
                maximumFractionDigits: 2
            }
        ).format(number);
    }


    function qexcToBDT(qexc) {

        return Number(qexc || 0) *
            QEXC_TO_BDT;
    }


    function bdtToQexc(bdt) {

        return Number(bdt || 0) /
            QEXC_TO_BDT;
    }


    function formatBDT(amount) {

        return `৳${formatNumber(amount)}`;
    }


    function formatDate(value) {

        if (!value) {
            return "";
        }

        try {

            const date =
                new Date(value);

            if (Number.isNaN(date.getTime())) {
                return "";
            }

            return date.toLocaleString(
                "bn-BD",
                {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit"
                }
            );

        } catch (_) {

            return "";
        }
    }


    function formatCountdown(milliseconds) {

        let seconds =
            Math.max(
                0,
                Math.floor(
                    Number(milliseconds || 0) /
                    1000
                )
            );

        const days =
            Math.floor(
                seconds / 86400
            );

        seconds %= 86400;

        const hours =
            Math.floor(
                seconds / 3600
            );

        seconds %= 3600;

        const minutes =
            Math.floor(
                seconds / 60
            );

        seconds %= 60;


        const pad = (number) =>
            String(number).padStart(
                2,
                "0"
            );


        if (days > 0) {

            return `${days} দিন ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;

        }

        return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }


    /* =====================================================
       TELEGRAM
       ===================================================== */

    function initTelegram() {

        if (!tg) {

            console.warn(
                "Telegram WebApp unavailable."
            );

            return;
        }


        try {

            tg.ready();

            tg.expand();


            if (
                typeof tg.disableVerticalSwipes ===
                "function"
            ) {

                tg.disableVerticalSwipes();
            }


            if (
                typeof tg.setHeaderColor ===
                "function"
            ) {

                tg.setHeaderColor(
                    "#ffffff"
                );
            }


            if (
                typeof tg.setBackgroundColor ===
                "function"
            ) {

                tg.setBackgroundColor(
                    "#f5f7fb"
                );
            }


        } catch (error) {

            console.warn(
                "Telegram initialization error:",
                error
            );
        }
    }


    /* =====================================================
       HAPTIC
       ===================================================== */

    function haptic(
        type = "light"
    ) {

        try {

            if (!tg?.HapticFeedback) {
                return;
            }


            if (type === "success") {

                tg.HapticFeedback
                    .notificationOccurred(
                        "success"
                    );

            } else if (
                type === "error"
            ) {

                tg.HapticFeedback
                    .notificationOccurred(
                        "error"
                    );

            } else if (
                type === "warning"
            ) {

                tg.HapticFeedback
                    .notificationOccurred(
                        "warning"
                    );

            } else {

                tg.HapticFeedback
                    .impactOccurred(
                        "light"
                    );
            }

        } catch (_) {}
    }


    /* =====================================================
       TOAST
       ===================================================== */

    let toastTimer = null;


    function showToast(
        message,
        type = "default"
    ) {

        const toast =
            $("#toast");

        if (!toast) {
            return;
        }


        clearTimeout(
            toastTimer
        );


        toast.className =
            `toast ${type}`;


        toast.textContent =
            message;


        requestAnimationFrame(() => {

            toast.classList.add(
                "show"
            );

        });


        toastTimer =
            setTimeout(() => {

                toast.classList.remove(
                    "show"
                );

            }, 3000);
    }


    /* =====================================================
       LOADER
       ===================================================== */

    function setLoadingState(
        loading
    ) {

        state.loading =
            Boolean(loading);


        const loader =
            $("#globalLoader");


        if (loader) {

            loader.classList.toggle(
                "hidden",
                !loading
            );
        }
    }


    /* =====================================================
       API
       ===================================================== */

    async function apiRequest(
        endpoint,
        options = {}
    ) {

        const headers = {

            "Content-Type":
                "application/json",

            ...(options.headers || {})

        };


        const initData =
            tg?.initData || "";


        if (initData) {

            headers[
                "X-Telegram-Init-Data"
            ] = initData;
        }


        const response =
            await fetch(
                `${API_BASE}${endpoint}`,
                {
                    ...options,
                    headers
                }
            );


        let data = null;


        try {

            data =
                await response.json();

        } catch (_) {

            data = null;
        }


        if (!response.ok) {

            let message =
                data?.detail ||
                data?.message ||
                data?.error ||
                `Request failed (${response.status})`;


            if (
                Array.isArray(message)
            ) {

                message =
                    message
                        .map(
                            item =>
                                item?.msg ||
                                "Invalid request"
                        )
                        .join(", ");
            }


            const error =
                new Error(
                    String(message)
                );


            error.status =
                response.status;


            error.data =
                data;


            throw error;
        }


        return data;
    }


    /* =====================================================
       AUTHENTICATION
       ===================================================== */

    async function authenticate() {

        try {

            if (!tg?.initData) {

                showToast(
                    "Telegram-এর ভিতর থেকে QEXUS খুলুন",
                    "warning"
                );

                return false;
            }


            setLoadingState(true);


            const data =
                await apiRequest(
                    "/auth",
                    {
                        method: "POST",
                        body: JSON.stringify({})
                    }
                );


            state.user =
                data?.user ||
                null;


            if (data?.wallet) {

                state.wallet = {
                    ...state.wallet,
                    ...data.wallet
                };
            }


            state.authenticated =
                Boolean(
                    state.user
                );


            renderUser();

            renderWallet();


            restoreDailyBonusState(
                data
            );


            return true;


        } catch (error) {

            console.error(
                "Authentication error:",
                error
            );


            showToast(
                error.message ||
                "Login করা যায়নি",
                "error"
            );


            return false;


        } finally {

            setLoadingState(false);
        }
    }


    /* =====================================================
       USER
       ===================================================== */

    function renderUser() {

        const user =
            state.user;


        if (!user) {
            return;
        }


        const firstName =
            user.first_name ||
            user.username ||
            "User";


        const username =
            user.username
                ? `@${user.username}`
                : "QEXUS User";


        const initial =
            String(firstName)
                .trim()
                .charAt(0)
                .toUpperCase() ||
            "Q";


        const userName =
            $("#userName");

        if (userName) {

            userName.textContent =
                firstName;
        }


        const profileName =
            $("#profileName");

        if (profileName) {

            profileName.textContent =
                firstName;
        }


        const profileUsername =
            $("#profileUsername");

        if (profileUsername) {

            profileUsername.textContent =
                username;
        }


        const profileAvatar =
            $("#profileAvatar");

        if (profileAvatar) {

            profileAvatar.textContent =
                initial;
        }


        const topAvatarText =
            $("#topAvatarText");

        if (topAvatarText) {

            topAvatarText.textContent =
                initial;
        }
    }


    /* =====================================================
       WALLET
       ===================================================== */

    async function loadWallet() {

        try {

            const data =
                await apiRequest(
                    "/wallet"
                );


            if (data) {

                state.wallet = {
                    ...state.wallet,
                    ...data
                };
            }


            renderWallet();

        } catch (error) {

            console.error(
                "Wallet error:",
                error
            );
        }
    }


    function renderWallet() {

        const wallet =
            state.wallet;


        const qexc =
            Number(
                wallet.balance_qexc ||
                0
            );


        const bdt =
            qexcToBDT(qexc);


        /* Home */

        const balanceBDT =
            $("#balanceBDT");

        if (balanceBDT) {

            balanceBDT.textContent =
                formatBDT(bdt);
        }


        const balanceQEXC =
            $("#balanceQEXC");

        if (balanceQEXC) {

            balanceQEXC.textContent =
                `${formatNumber(qexc)} QEXC`;
        }


        /* Wallet */

        const walletQEXC =
            $("#walletQEXC");

        if (walletQEXC) {

            walletQEXC.textContent =
                `${formatNumber(qexc)} QEXC`;
        }


        const walletBDT =
            $("#walletBDT");

        if (walletBDT) {

            walletBDT.textContent =
                formatBDT(bdt);
        }


        const walletBalance =
            $("#walletBalance");

        if (walletBalance) {

            walletBalance.textContent =
                formatNumber(bdt);
        }


        const totalEarned =
            $("#totalEarned");

        if (totalEarned) {

            totalEarned.textContent =
                `${formatNumber(
                    wallet.total_earned || 0
                )} QEXC`;
        }


        const totalWithdrawn =
            $("#totalWithdrawn");

        if (totalWithdrawn) {

            const withdrawn =
                Number(
                    wallet.total_withdrawn ||
                    0
                );


            totalWithdrawn.textContent =
                `${formatNumber(
                    withdrawn
                )} QEXC`;
        }


        const withdrawAvailable =
            $("#withdrawAvailable");

        if (withdrawAvailable) {

            withdrawAvailable.textContent =
                formatBDT(bdt);
        }


        renderProfileStats();
    }


    /* =====================================================
       PROFILE STATS
       ===================================================== */

    function renderProfileStats() {

        const wallet =
            state.wallet;


        const values =
            $$(".profile-stat-value");


        if (!values.length) {
            return;
        }


        /*
         If the HTML has dedicated IDs,
         update them.
        */

        const profileEarned =
            $("#profileTotalEarned");

        if (profileEarned) {

            profileEarned.textContent =
                formatNumber(
                    wallet.total_earned || 0
                );
        }


        const profileWithdrawn =
            $("#profileTotalWithdrawn");

        if (profileWithdrawn) {

            profileWithdrawn.textContent =
                formatNumber(
                    wallet.total_withdrawn || 0
                );
        }
    }


    /* =====================================================
       TRANSACTIONS
       ===================================================== */

    async function loadTransactions() {

        try {

            const data =
                await apiRequest(
                    "/transactions"
                );


            if (
                Array.isArray(data)
            ) {

                state.transactions =
                    data;

            } else if (
                Array.isArray(
                    data?.transactions
                )
            ) {

                state.transactions =
                    data.transactions;

            } else {

                state.transactions =
                    [];
            }


            renderTransactions();


        } catch (error) {

            console.error(
                "Transactions error:",
                error
            );
        }
    }


    function getTransactionTitle(
        transaction
    ) {

        return (
            transaction?.title ||
            transaction?.description ||
            transaction?.type ||
            "QEXUS Transaction"
        );
    }


    function getTransactionAmount(
        transaction
    ) {

        if (
            transaction?.amount_qexc !==
            undefined
        ) {

            return Number(
                transaction.amount_qexc
            );
        }


        if (
            transaction?.amount !==
            undefined
        ) {

            return Number(
                transaction.amount
            );
        }


        return 0;
    }


    function renderTransactions() {

        renderTransactionList(
            $("#recentTransactions"),
            state.transactions.slice(0, 5)
        );


        renderTransactionList(
            $("#historyList"),
            state.transactions
        );
    }


    function renderTransactionList(
        container,
        transactions
    ) {

        if (!container) {
            return;
        }


        if (
            !Array.isArray(transactions) ||
            transactions.length === 0
        ) {

            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">
                        <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                        >
                            <path d="M4 6h16"></path>
                            <path d="M4 12h16"></path>
                            <path d="M4 18h10"></path>
                        </svg>
                    </div>

                    <div class="empty-title">
                        কোনো transaction নেই
                    </div>

                    <div class="empty-description">
                        আপনার earning শুরু করলে এখানে দেখা যাবে।
                    </div>
                </div>
            `;

            return;
        }


        container.innerHTML =
            transactions
                .map(
                    transaction => {

                        const amount =
                            getTransactionAmount(
                                transaction
                            );


                        const positive =
                            amount >= 0;


                        const title =
                            escapeHTML(
                                getTransactionTitle(
                                    transaction
                                )
                            );


                        const date =
                            formatDate(
                                transaction.created_at ||
                                transaction.createdAt ||
                                transaction.timestamp
                            );


                        return `
                            <div class="transaction">

                                <div class="transaction-icon">
                                    ${positive ? "+" : "−"}
                                </div>

                                <div class="transaction-info">

                                    <div class="transaction-title">
                                        ${title}
                                    </div>

                                    <div class="transaction-date">
                                        ${escapeHTML(date)}
                                    </div>

                                </div>

                                <div class="transaction-amount ${positive ? "positive" : "negative"}">
                                    ${positive ? "+" : "−"}
                                    ${formatNumber(Math.abs(amount))}
                                    QEXC
                                </div>

                            </div>
                        `;
                    }
                )
                .join("");
    }


    /* =====================================================
       DAILY BONUS
       ===================================================== */

    function restoreDailyBonusState(
        data
    ) {

        const nextClaim =
            data?.daily_bonus?.next_claim_at ||
            data?.dailyBonus?.nextClaimAt ||
            data?.next_claim_at ||
            data?.daily_next_claim_at ||
            null;


        const available =
            data?.daily_bonus?.available ??
            data?.dailyBonus?.available ??
            null;


        if (nextClaim) {

            const timestamp =
                new Date(nextClaim)
                    .getTime();


            if (
                Number.isFinite(timestamp)
            ) {

                state.dailyBonus.nextClaimAt =
                    timestamp;


                state.dailyBonus.available =
                    timestamp <= Date.now();
            }
        }


        if (
            typeof available ===
            "boolean"
        ) {

            state.dailyBonus.available =
                available;
        }


        /*
         Backend may not return daily
         data in /auth. In that case
         keep local state only as a UI
         helper. Actual claim is always
         backend-controlled.
        */

        updateDailyBonusUI();

        startDailyBonusTimer();
    }


    function getDailyCountdownElement() {

        return (
            $("#dailyCountdown") ||
            $("#dailyTimer") ||
            null
        );
    }


    function updateDailyBonusUI() {

        const button =
            $("#dailyBonusButton");


        const countdown =
            getDailyCountdownElement();


        const countdownBox =
            $("#dailyCountdownBox");


        const nextClaim =
            state.dailyBonus.nextClaimAt;


        if (
            nextClaim &&
            nextClaim > Date.now()
        ) {

            const remaining =
                nextClaim -
                Date.now();


            state.dailyBonus.available =
                false;


            if (button) {

                button.disabled =
                    true;

                button.textContent =
                    "পরের Bonus-এর অপেক্ষায়";
            }


            if (countdown) {

                countdown.textContent =
                    formatCountdown(
                        remaining
                    );
            }


            if (countdownBox) {

                countdownBox.classList.remove(
                    "hidden"
                );
            }


            return;
        }


        state.dailyBonus.available =
            true;


        if (countdown) {

            countdown.textContent =
                "এখন Available";
        }


        if (countdownBox) {

            countdownBox.classList.remove(
                "hidden"
            );
        }


        if (button) {

            button.disabled =
                false;

            button.textContent =
                "Daily Bonus নিন";
        }
    }


    function startDailyBonusTimer() {

        clearInterval(
            state.dailyTimerInterval
        );


        updateDailyBonusUI();


        state.dailyTimerInterval =
            setInterval(() => {

                if (
                    state.dailyBonus.nextClaimAt &&
                    state.dailyBonus.nextClaimAt <=
                    Date.now()
                ) {

                    state.dailyBonus.nextClaimAt =
                        null;

                    state.dailyBonus.available =
                        true;
                }


                updateDailyBonusUI();

            }, 1000);
    }


    async function claimDailyBonus() {

        const button =
            $("#dailyBonusButton");


        if (
            state.dailyBonus.nextClaimAt &&
            state.dailyBonus.nextClaimAt >
            Date.now()
        ) {

            showToast(
                `পরের Daily Bonus পাবেন ${formatCountdown(
                    state.dailyBonus.nextClaimAt -
                    Date.now()
                )} পরে`,
                "warning"
            );

            return;
        }


        if (button) {

            button.disabled =
                true;

            button.textContent =
                "Checking...";
        }


        try {

            const data =
                await apiRequest(
                    "/rewards/daily",
                    {
                        method: "POST",
                        body: JSON.stringify({})
                    }
                );


            /*
             Backend may return the
             next claim timestamp.
            */

            const nextClaim =
                data?.next_claim_at ||
                data?.nextClaimAt ||
                data?.daily_bonus?.next_claim_at ||
                data?.dailyBonus?.nextClaimAt ||
                null;


            if (nextClaim) {

                const timestamp =
                    new Date(nextClaim)
                        .getTime();


                if (
                    Number.isFinite(timestamp)
                ) {

                    state.dailyBonus.nextClaimAt =
                        timestamp;
                }

            } else {

                /*
                 Fallback UI only.
                 Backend remains the authority.
                */

                state.dailyBonus.nextClaimAt =
                    Date.now() +
                    24 * 60 * 60 * 1000;
            }


            state.dailyBonus.available =
                false;


            if (
                data?.wallet
            ) {

                state.wallet = {
                    ...state.wallet,
                    ...data.wallet
                };

            } else {

                await loadWallet();
            }


            await loadTransactions();


            updateDailyBonusUI();


            showToast(
                `Daily Bonus সফল! +${data?.reward_qexc || DAILY_BONUS_QEXC} QEXC`,
                "success"
            );


            haptic("success");


        } catch (error) {

            console.error(
                "Daily bonus error:",
                error
            );


            /*
             Backend can tell us
             bonus already claimed.
            */

            const nextClaim =
                error?.data?.next_claim_at ||
                error?.data?.nextClaimAt ||
                error?.data?.daily_bonus?.next_claim_at ||
                null;


            if (nextClaim) {

                const timestamp =
                    new Date(nextClaim)
                        .getTime();


                if (
                    Number.isFinite(timestamp)
                ) {

                    state.dailyBonus.nextClaimAt =
                        timestamp;

                    state.dailyBonus.available =
                        false;
                }
            }


            showToast(
                error.message ||
                "আজকের bonus নেওয়া যায়নি",
                "error"
            );


            haptic("error");


            updateDailyBonusUI();
        }
    }


    /* =====================================================
       REWARDED ADS
       ===================================================== */

    function setupRewardedAdUI() {

        const status =
            $("#adStatus");


        const button =
            $("#watchAdButton");


        if (!status || !button) {
            return;
        }


        /*
         No real ad provider is connected
         yet. Therefore do NOT call the
         backend reward endpoint.
        */

        state.ad.available =
            false;


        status.textContent =
            "Rewarded ad এখনো চালু করা হয়নি।";


        button.disabled =
            false;


        button.textContent =
            "বিজ্ঞাপন দেখুন";
    }


    async function watchAd() {

        const button =
            $("#watchAdButton");


        const status =
            $("#adStatus");


        if (
            state.ad.processing
        ) {

            return;
        }


        /*
         SAFETY:
         No real ad provider is connected.
         Never award QEXC on button click.
        */

        state.ad.processing =
            true;


        if (button) {

            button.disabled =
                true;

            button.textContent =
                "Ad unavailable";
        }


        if (status) {

            status.textContent =
                "এই মুহূর্তে কোনো verified rewarded ad available নেই।";
        }


        showToast(
            "Rewarded Ad এখনো চালু করা হয়নি। তাই কোনো reward দেওয়া হবে না।",
            "warning"
        );


        haptic("warning");


        setTimeout(() => {

            state.ad.processing =
                false;


            if (button) {

                button.disabled =
                    false;

                button.textContent =
                    "বিজ্ঞাপন দেখুন";
            }

        }, 1200);
    }


    /* =====================================================
       TASKS
       ===================================================== */

    async function loadTasks() {

        const container =
            $("#taskList");


        if (container) {

            container.innerHTML = `
                <div class="empty-state compact">
                    <div class="empty-title">
                        Tasks লোড হচ্ছে...
                    </div>
                </div>
            `;
        }


        try {

            const data =
                await apiRequest(
                    "/tasks"
                );


            if (
                Array.isArray(data)
            ) {

                state.tasks =
                    data;

            } else if (
                Array.isArray(
                    data?.tasks
                )
            ) {

                state.tasks =
                    data.tasks;

            } else {

                state.tasks =
                    [];
            }


            renderTasks();


        } catch (error) {

            console.error(
                "Tasks error:",
                error
            );


            if (container) {

                container.innerHTML = `
                    <div class="empty-state compact">

                        <div class="empty-title">
                            Tasks লোড করা যায়নি
                        </div>

                        <div class="empty-description">
                            কিছুক্ষণ পরে আবার চেষ্টা করুন।
                        </div>

                    </div>
                `;
            }
        }
    }


    function renderTasks() {

        const container =
            $("#taskList");


        if (!container) {
            return;
        }


        if (
            !state.tasks.length
        ) {

            container.innerHTML = `
                <div class="empty-state">

                    <div class="empty-title">
                        এখন কোনো task নেই
                    </div>

                    <div class="empty-description">
                        নতুন task যোগ হলে এখানে দেখা যাবে।
                    </div>

                </div>
            `;

            return;
        }


        container.innerHTML =
            state.tasks
                .map(
                    task => {

                        const id =
                            task.id ??
                            task.task_id;


                        const title =
                            escapeHTML(
                                task.title ||
                                task.name ||
                                "Available Task"
                            );


                        const description =
                            escapeHTML(
                                task.description ||
                                task.type ||
                                "Complete this task"
                            );


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
                            <div class="task-card">

                                <div class="task-icon">

                                    <svg
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                    >
                                        <path d="M9 11l3 3L22 4"></path>
                                        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
                                    </svg>

                                </div>


                                <div class="task-info">

                                    <div class="task-title">
                                        ${title}
                                    </div>

                                    <div class="task-meta">
                                        ${description}
                                    </div>

                                </div>


                                <button
                                    class="secondary-btn"
                                    style="width:auto;min-width:62px;min-height:34px;padding:7px 9px;"
                                    type="button"
                                    ${completed ? "disabled" : ""}
                                    onclick="completeTask(${JSON.stringify(String(id))}, this)"
                                >
                                    ${
                                        completed
                                            ? "Done"
                                            : `+${formatNumber(reward)}`
                                    }
                                </button>

                            </div>
                        `;
                    }
                )
                .join("");
    }


    async function completeTask(
        taskId,
        button
    ) {

        if (!taskId) {

            showToast(
                "Task ID পাওয়া যায়নি",
                "error"
            );

            return;
        }


        if (button) {

            button.disabled =
                true;

            button.textContent =
                "Checking...";
        }


        const task =
            state.tasks.find(
                item =>
                    String(
                        item.id ??
                        item.task_id
                    ) ===
                    String(taskId)
            );


        try {

            /*
             Open task first if backend
             provides a URL.
            */

            const taskUrl =
                task?.url ||
                task?.link ||
                task?.target_url ||
                null;


            if (taskUrl) {

                openExternalLink(
                    taskUrl
                );
            }


            const data =
                await apiRequest(
                    `/tasks/${encodeURIComponent(
                        taskId
                    )}/complete`,
                    {
                        method: "POST",
                        body: JSON.stringify({})
                    }
                );


            if (
                data?.wallet
            ) {

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
                data?.message ||
                `Task complete! +${task?.reward_qexc || task?.reward || 0} QEXC`,
                "success"
            );


            haptic("success");


        } catch (error) {

            console.error(
                "Task completion error:",
                error
            );


            showToast(
                error.message ||
                "Task complete করা যায়নি",
                "error"
            );


            if (button) {

                button.disabled =
                    false;

                button.textContent =
                    `+${formatNumber(
                        task?.reward_qexc ??
                        task?.reward ??
                        0
                    )}`;
            }


            haptic("error");
        }
    }


    /* =====================================================
       LEADERBOARD
       ===================================================== */

    async function loadLeaderboard(
        period = "all"
    ) {

        state.currentLeaderboardTab =
            period;


        try {

            /*
             Backend may not have this
             endpoint yet. Keep UI safe.
            */

            const data =
                await apiRequest(
                    `/leaderboard?period=${encodeURIComponent(
                        period
                    )}`
                );


            if (
                Array.isArray(data)
            ) {

                state.leaderboard =
                    data;

            } else if (
                Array.isArray(
                    data?.leaderboard
                )
            ) {

                state.leaderboard =
                    data.leaderboard;

            } else {

                state.leaderboard =
                    [];
            }


            renderLeaderboard();


        } catch (error) {

            console.warn(
                "Leaderboard unavailable:",
                error
            );


            state.leaderboard =
                [];


            renderLeaderboard(
                true
            );
        }
    }


    function renderLeaderboard(
        unavailable = false
    ) {

        const list =
            $("#leaderboardList");


        const top =
            $("#leaderboardTop");


        if (unavailable) {

            if (list) {

                list.innerHTML = `
                    <div class="empty-state compact">

                        <div class="empty-title">
                            Leaderboard এখনো available নয়
                        </div>

                        <div class="empty-description">
                            Backend leaderboard চালু হলে এখানে ranking দেখা যাবে।
                        </div>

                    </div>
                `;
            }


            if (top) {

                top.innerHTML = "";
            }


            return;
        }


        const users =
            state.leaderboard;


        if (!users.length) {

            if (list) {

                list.innerHTML = `
                    <div class="empty-state compact">

                        <div class="empty-title">
                            এখনো ranking নেই
                        </div>

                    </div>
                `;
            }


            if (top) {

                top.innerHTML = "";
            }


            return;
        }


        const topThree =
            users.slice(
                0,
                3
            );


        if (top) {

            top.innerHTML =
                topThree
                    .map(
                        (user, index) =>
                            `
                            <div class="podium-card ${index === 0 ? "first" : index === 1 ? "second" : "third"}">

                                <div class="podium-rank">
                                    #${index + 1}
                                </div>

                                <div class="podium-avatar">
                                    ${escapeHTML(
                                        String(
                                            user.first_name ||
                                            user.username ||
                                            "Q"
                                        )
                                            .charAt(0)
                                            .toUpperCase()
                                    )}
                                </div>

                                <div class="podium-name">
                                    ${escapeHTML(
                                        user.first_name ||
                                        user.username ||
                                        "QEXUS User"
                                    )}
                                </div>

                                <div class="podium-score">
                                    ${formatNumber(
                                        user.total_earned ??
                                        user.score ??
                                        user.qexc ??
                                        0
                                    )} QEXC
                                </div>

                            </div>
                            `
                    )
                    .join("");
        }


        if (list) {

            list.innerHTML =
                users
                    .slice(3)
                    .map(
                        (user, index) => {

                            const rank =
                                index + 4;


                            return `
                                <div class="leaderboard-row">

                                    <div class="leaderboard-rank">
                                        #${rank}
                                    </div>

                                    <div class="leaderboard-avatar">
                                        ${escapeHTML(
                                            String(
                                                user.first_name ||
                                                user.username ||
                                                "Q"
                                            )
                                                .charAt(0)
                                                .toUpperCase()
                                        )}
                                    </div>

                                    <div class="leaderboard-user">

                                        <div class="leaderboard-user-name">
                                            ${escapeHTML(
                                                user.first_name ||
                                                user.username ||
                                                "QEXUS User"
                                            )}
                                        </div>

                                        <div class="leaderboard-user-meta">
                                            ${user.username
                                                ? "@" + escapeHTML(user.username)
                                                : "QEXUS User"}
                                        </div>

                                    </div>

                                    <div class="leaderboard-score">
                                        ${formatNumber(
                                            user.total_earned ??
                                            user.score ??
                                            user.qexc ??
                                            0
                                        )} QEXC
                                    </div>

                                </div>
                            `;
                        }
                    )
                    .join("");
        }
    }


    /* =====================================================
       WITHDRAWAL
       ===================================================== */

    function openWithdrawModal() {

        const modal =
            $("#withdrawModal");


        if (!modal) {
            return;
        }


        const available =
            qexcToBDT(
                state.wallet.balance_qexc
            );


        const availableElement =
            $("#withdrawAvailable");


        if (availableElement) {

            availableElement.textContent =
                formatBDT(
                    available
                );
        }


        const amount =
            $("#withdrawAmount");


        if (amount) {

            amount.value =
                "";
        }


        const number =
            $("#withdrawNumber");


        if (number) {

            number.value =
                "";
        }


        selectWithdrawMethod(
            $(
                `.method-btn[data-method="${state.selectedWithdrawMethod}"]`
            ),
            false
        );


        modal.classList.add(
            "show"
        );


        state.modalOpen =
            "withdraw";


        haptic("light");
    }


    function closeWithdrawModal() {

        const modal =
            $("#withdrawModal");


        if (!modal) {
            return;
        }


        modal.classList.remove(
            "show"
        );


        state.modalOpen =
            null;
    }


    function selectWithdrawMethod(
        element,
        vibrate = true
    ) {

        if (!element) {
            return;
        }


        const method =
            element.dataset.method;


        if (!method) {
            return;
        }


        state.selectedWithdrawMethod =
            method;


        $$(".method-btn")
            .forEach(button => {

                button.classList.toggle(
                    "active",
                    button === element
                );
            });


        if (vibrate) {

            haptic("light");
        }
    }


    async function submitWithdrawal() {

        const button =
            $("#withdrawSubmit");


        const amountInput =
            $("#withdrawAmount");


        const numberInput =
            $("#withdrawNumber");


        const amount =
            Number(
                amountInput?.value || 0
            );


        const accountNumber =
            String(
                numberInput?.value || ""
            )
                .replace(/\D/g, "");


        if (
            !Number.isFinite(amount) ||
            amount < MIN_WITHDRAW_BDT
        ) {

            showToast(
                `Minimum withdrawal ${formatBDT(
                    MIN_WITHDRAW_BDT
                )}`,
                "warning"
            );

            return;
        }


        const available =
            qexcToBDT(
                state.wallet.balance_qexc
            );


        if (
            amount > available
        ) {

            showToast(
                "আপনার balance যথেষ্ট নয়",
                "warning"
            );

            return;
        }


        if (
            !/^01\d{9}$/.test(
                accountNumber
            )
        ) {

            showToast(
                "সঠিক ১১ সংখ্যার bKash/Nagad নম্বর দিন",
                "warning"
            );

            return;
        }


        if (button) {

            button.disabled =
                true;

            button.textContent =
                "Request পাঠানো হচ্ছে...";
        }


        try {

            const data =
                await apiRequest(
                    "/withdrawals",
                    {
                        method: "POST",

                        body:
                            JSON.stringify(
                                {
                                    amount_bdt:
                                        amount,

                                    method:
                                        state.selectedWithdrawMethod,

                                    account_number:
                                        accountNumber
                                }
                            )
                    }
                );


            showToast(
                data?.message ||
                "Withdrawal request পাঠানো হয়েছে",
                "success"
            );


            haptic("success");


            closeWithdrawModal();


            await loadWallet();

            await loadTransactions();


        } catch (error) {

            console.error(
                "Withdrawal error:",
                error
            );


            showToast(
                error.message ||
                "Withdrawal request পাঠানো যায়নি",
                "error"
            );


            haptic("error");


        } finally {

            if (button) {

                button.disabled =
                    false;

                button.textContent =
                    "Withdrawal Request পাঠান";
            }
        }
    }


    /* =====================================================
       REFERRAL
       ===================================================== */

    function buildReferralLink() {

        const user =
            state.user;


        if (!user) {
            return "";
        }


        const telegramId =
            user.telegram_id ||
            user.id;


        if (!telegramId) {
            return "";
        }


        return `https://t.me/${BOT_USERNAME}?start=ref_${telegramId}`;
    }


    function renderReferral() {

        const input =
            $("#referralLink");


        if (!input) {
            return;
        }


        const link =
            buildReferralLink();


        input.value =
            link ||
            "Telegram login হলে referral link দেখা যাবে";
    }


    async function copyReferral() {

        const link =
            buildReferralLink();


        if (!link) {

            showToast(
                "আগে Telegram login করুন",
                "warning"
            );

            return;
        }


        try {

            await navigator.clipboard
                .writeText(
                    link
                );


            showToast(
                "Referral link copied!",
                "success"
            );


            haptic("success");


        } catch (_) {

            const input =
                $("#referralLink");


            if (input) {

                input.removeAttribute(
                    "readonly"
                );

                input.select();

                document.execCommand(
                    "copy"
                );

                input.setAttribute(
                    "readonly",
                    "readonly"
                );
            }


            showToast(
                "Referral link copied!",
                "success"
            );
        }
    }


    async function shareReferral() {

        const link =
            buildReferralLink();


        if (!link) {

            showToast(
                "Referral link পাওয়া যায়নি",
                "warning"
            );

            return;
        }


        const text =
            `QEXUS-এ join করুন এবং QEXC earn করুন!\n\n${link}`;


        try {

            const shareUrl =
                `https://t.me/share/url?url=${encodeURIComponent(
                    link
                )}&text=${encodeURIComponent(
                    "QEXUS-এ join করুন এবং QEXC earn করুন!"
                )}`;


            if (
                tg?.openTelegramLink
            ) {

                tg.openTelegramLink(
                    shareUrl
                );

                return;
            }


            if (
                navigator.share
            ) {

                await navigator.share(
                    {
                        title:
                            "QEXUS",

                        text,

                        url:
                            link
                    }
                );

                return;
            }


            await navigator.clipboard
                .writeText(
                    link
                );


            showToast(
                "Referral link copied!",
                "success"
            );


        } catch (error) {

            console.log(
                "Share cancelled:",
                error
            );
        }
    }


    /* =====================================================
       NAVIGATION
       ===================================================== */

    function navigate(page) {

        if (!page) {
            return;
        }


        const pages =
            $$(".page");


        let found =
            false;


        pages.forEach(
            section => {

                const active =
                    section.dataset.page ===
                    page ||
                    section.id ===
                    page;


                section.classList.toggle(
                    "active",
                    active
                );


                if (active) {
                    found = true;
                }
            }
        );


        if (!found) {

            console.warn(
                "Page not found:",
                page
            );

            return;
        }


        $$(".nav-item")
            .forEach(item => {

                item.classList.toggle(
                    "active",
                    item.dataset.page ===
                    page
                );
            });


        window.scrollTo(
            {
                top: 0,
                behavior: "smooth"
            }
        );


        if (
            page ===
            "wallet"
        ) {

            loadWallet();

            loadTransactions();
        }


        if (
            page ===
            "tasks"
        ) {

            loadTasks();
        }


        if (
            page ===
            "profile"
        ) {

            renderReferral();

            renderUser();
        }


        if (
            page ===
            "earn"
        ) {

            updateDailyBonusUI();

            setupRewardedAdUI();
        }


        if (
            page ===
            "leaderboard"
        ) {

            loadLeaderboard(
                state.currentLeaderboardTab
            );
        }


        haptic("light");
    }


    /* =====================================================
       EXTERNAL LINK
       ===================================================== */

    function openExternalLink(
        url
    ) {

        if (!url) {
            return;
        }


        try {

            if (
                tg?.openLink
            ) {

                tg.openLink(
                    url
                );

                return;
            }


            window.open(
                url,
                "_blank",
                "noopener,noreferrer"
            );

        } catch (_) {

            window.open(
                url,
                "_blank"
            );
        }
    }


    /* =====================================================
       OFFICIAL CHANNEL
       ===================================================== */

    function openOfficialChannel() {

        openExternalLink(
            OFFICIAL_CHANNEL
        );
    }


    function showAnnouncement() {

        const modal =
            $("#announcementModal");


        if (!modal) {
            return;
        }


        modal.classList.add(
            "show"
        );


        state.modalOpen =
            "announcement";
    }


    function closeAnnouncement() {

        const modal =
            $("#announcementModal");


        if (!modal) {
            return;
        }


        modal.classList.remove(
            "show"
        );


        state.modalOpen =
            null;
    }


    /* =====================================================
       NOTIFICATIONS
       ===================================================== */

    function showNotifications() {

        const modal =
            $("#notificationModal") ||
            $("#notificationsModal");


        if (!modal) {

            showToast(
                "এখনো কোনো notification নেই",
                "default"
            );

            return;
        }


        modal.classList.add(
            "show"
        );


        state.modalOpen =
            "notifications";
    }


    function closeNotifications() {

        const modal =
            $("#notificationModal") ||
            $("#notificationsModal");


        if (!modal) {
            return;
        }


        modal.classList.remove(
            "show"
        );


        state.modalOpen =
            null;
    }


    /* =====================================================
       HELP
       ===================================================== */

    function showHelp() {

        const modal =
            $("#helpModal") ||
            $("#infoModal");


        if (!modal) {

            showToast(
                "Help section এখনো প্রস্তুত হচ্ছে",
                "default"
            );

            return;
        }


        modal.classList.add(
            "show"
        );


        state.modalOpen =
            "help";
    }


    function showAbout() {

        const modal =
            $("#aboutModal") ||
            $("#infoModal");


        if (!modal) {

            showToast(
                "QEXUS Rewards Platform",
                "default"
            );

            return;
        }


        modal.classList.add(
            "show"
        );


        state.modalOpen =
            "about";
    }


    function closeInfoModal() {

        const modals = [
            $("#helpModal"),
            $("#aboutModal"),
            $("#infoModal")
        ];


        modals.forEach(
            modal => {

                if (modal) {

                    modal.classList.remove(
                        "show"
                    );
                }
            }
        );


        state.modalOpen =
            null;
    }


    /* =====================================================
       POLICY
       ===================================================== */

    function showPolicy(
        type = "terms"
    ) {

        const modal =
            $("#policyModal") ||
            $("#contentModal");


        if (!modal) {

            showToast(
                "Policy section এখনো প্রস্তুত হচ্ছে",
                "default"
            );

            return;
        }


        modal.classList.add(
            "show"
        );


        state.modalOpen =
            "policy";


        const title =
            $("#policyTitle");


        const body =
            $("#policyBody");


        if (title) {

            if (
                type === "privacy"
            ) {

                title.textContent =
                    "Privacy Policy";

            } else if (
                type === "terms"
            ) {

                title.textContent =
                    "Terms & Conditions";

            } else {

                title.textContent =
                    "QEXUS Policy";
            }
        }


        if (body) {

            body.innerHTML = `
                <h3>QEXUS সম্পর্কে</h3>

                <p>
                    QEXUS একটি rewards platform যেখানে
                    eligible activities সম্পন্ন করে QEXC
                    reward point সংগ্রহ করা যায়।
                </p>

                <h3>Reward</h3>

                <p>
                    Reward শুধুমাত্র QEXUS-এর backend
                    verification সম্পন্ন হলে যোগ হবে।
                </p>

                <h3>Withdrawal</h3>

                <p>
                    Minimum withdrawal ৳100।
                    Withdrawal request manual review-এর
                    মাধ্যমে process করা হতে পারে।
                </p>

                <h3>নিরাপত্তা</h3>

                <p>
                    Fraud, duplicate activity,
                    automated abuse অথবা system
                    manipulation শনাক্ত হলে reward
                    বাতিল বা account restriction হতে পারে।
                </p>
            `;
        }
    }


    /* =====================================================
       FIRST VISIT ANNOUNCEMENT
       ===================================================== */

    function setupFirstVisit() {

        const key =
            "qexus_first_visit_seen";


        let seen = false;


        try {

            seen =
                localStorage.getItem(
                    key
                ) === "1";

        } catch (_) {}


        if (seen) {
            return;
        }


        /*
         Give Telegram time to render.
        */

        setTimeout(() => {

            showAnnouncement();


            try {

                localStorage.setItem(
                    key,
                    "1"
                );

            } catch (_) {}

        }, 700);
    }


    /* =====================================================
       EVENT SETUP
       ===================================================== */

    function setupNavigation() {

        $$(".nav-item")
            .forEach(item => {

                item.addEventListener(
                    "click",
                    () => {

                        const page =
                            item.dataset.page;

                        navigate(
                            page
                        );
                    }
                );
            });
    }


    function setupLeaderboardTabs() {

        $$(".leaderboard-tab")
            .forEach(tab => {

                tab.addEventListener(
                    "click",
                    () => {

                        $$(".leaderboard-tab")
                            .forEach(
                                item =>
                                    item.classList.remove(
                                        "active"
                                    )
                            );


                        tab.classList.add(
                            "active"
                        );


                        const period =
                            tab.dataset.period ||
                            tab.dataset.tab ||
                            "all";


                        loadLeaderboard(
                            period
                        );
                    }
                );
            });
    }


    function setupNotificationButton() {

        const button =
            $("#notificationButton") ||
            $("#notificationBtn") ||
            $("#notificationsButton");


        if (!button) {
            return;
        }


        button.addEventListener(
            "click",
            showNotifications
        );
    }


    function setupModalClicks() {

        document.addEventListener(
            "click",
            event => {

                const target =
                    event.target;


                /*
                 Close modal when clicking
                 outside modal-content.
                */

                if (
                    target.classList.contains(
                        "modal"
                    )
                ) {

                    target.classList.remove(
                        "show"
                    );

                    state.modalOpen =
                        null;
                }
            }
        );


        document.addEventListener(
            "keydown",
            event => {

                if (
                    event.key ===
                    "Escape"
                ) {

                    $$(".modal.show")
                        .forEach(
                            modal =>
                                modal.classList.remove(
                                    "show"
                                )
                        );


                    state.modalOpen =
                        null;
                }
            }
        );
    }


    /* =====================================================
       TELEGRAM BACK BUTTON
       ===================================================== */

    function setupBackButton() {

        if (
            !tg?.BackButton
        ) {
            return;
        }


        try {

            tg.BackButton
                .onClick(() => {

                    if (
                        state.modalOpen
                    ) {

                        $$(".modal.show")
                            .forEach(
                                modal =>
                                    modal.classList.remove(
                                        "show"
                                    )
                            );

                        state.modalOpen =
                            null;

                        tg.BackButton.hide();

                        return;
                    }


                    const active =
                        $(".page.active");


                    const currentPage =
                        active?.dataset.page ||
                        active?.id ||
                        "home";


                    if (
                        currentPage !==
                        "home"
                    ) {

                        navigate(
                            "home"
                        );

                    } else {

                        try {

                            tg.close();

                        } catch (_) {}
                    }
                });

        } catch (_) {}
    }


    /* =====================================================
       VISIBILITY REFRESH
       ===================================================== */

    function setupVisibilityRefresh() {

        document.addEventListener(
            "visibilitychange",
            () => {

                if (
                    document.visibilityState ===
                    "visible"
                ) {

                    if (
                        state.authenticated
                    ) {

                        loadWallet();

                        loadTransactions();

                        updateDailyBonusUI();
                    }
                }
            }
        );
    }


    /* =====================================================
       REFRESH
       ===================================================== */

    function refreshApp() {

        if (
            !state.authenticated
        ) {
            return;
        }


        loadWallet();

        loadTransactions();

        loadTasks();

        updateDailyBonusUI();
    }


    /* =====================================================
       BOOT
       ===================================================== */

    async function boot() {

        try {

            initTelegram();


            setupNavigation();

            setupLeaderboardTabs();

            setupNotificationButton();

            setupModalClicks();

            setupBackButton();

            setupVisibilityRefresh();


            /*
             First render.
            */

            navigate(
                "home"
            );


            renderWallet();

            renderReferral();

            setupRewardedAdUI();


            /*
             Authenticate.
            */

            const loggedIn =
                await authenticate();


            if (!loggedIn) {

                return;
            }


            /*
             Load initial data.
            */

            await Promise.allSettled(
                [
                    loadWallet(),
                    loadTransactions(),
                    loadTasks()
                ]
            );


            renderUser();

            renderWallet();

            renderReferral();

            updateDailyBonusUI();


            /*
             First visit announcement.
            */

            setupFirstVisit();


        } catch (error) {

            console.error(
                "QEXUS boot error:",
                error
            );


            showToast(
                "QEXUS load করতে সমস্যা হয়েছে",
                "error"
            );
        }
    }


    /* =====================================================
       GLOBAL FUNCTIONS
       ===================================================== */

    window.navigate =
        navigate;

    window.watchAd =
        watchAd;

    window.claimDailyBonus =
        claimDailyBonus;

    window.openWithdrawModal =
        openWithdrawModal;

    window.closeWithdrawModal =
        closeWithdrawModal;

    window.selectWithdrawMethod =
        selectWithdrawMethod;

    window.submitWithdrawal =
        submitWithdrawal;

    window.copyReferral =
        copyReferral;

    window.shareReferral =
        shareReferral;

    window.completeTask =
        completeTask;

    window.openOfficialChannel =
        openOfficialChannel;

    window.showAnnouncement =
        showAnnouncement;

    window.closeAnnouncement =
        closeAnnouncement;

    window.showNotifications =
        showNotifications;

    window.closeNotifications =
        closeNotifications;

    window.showHelp =
        showHelp;

    window.showAbout =
        showAbout;

    window.closeInfoModal =
        closeInfoModal;

    window.showPolicy =
        showPolicy;

    window.refreshApp =
        refreshApp;

    window.loadLeaderboard =
        loadLeaderboard;


    /* =====================================================
       START
       ===================================================== */

    if (
        document.readyState ===
        "loading"
    ) {

        document.addEventListener(
            "DOMContentLoaded",
            boot
        );

    } else {

        boot();
    }

})();
