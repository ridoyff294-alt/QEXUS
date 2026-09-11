/* =========================================================
   QEXUS — COMPLETE APP.JS
   Telegram Mini App + FastAPI Backend
   ========================================================= */

"use strict";


/* =========================================================
   CONFIG
   ========================================================= */

const API_BASE =
  "https://qexus-backend.onrender.com/api";

const BOT_USERNAME =
  "Qexus_Official_Bot";

const OFFICIAL_CHANNEL_URL =
  "https://t.me/Qexus_Official";

const QEXC_TO_BDT = 0.10;
const MIN_WITHDRAW_BDT = 100;


/* =========================================================
   TELEGRAM
   ========================================================= */

const tg = window.Telegram?.WebApp || null;

if (tg) {
  try {
    tg.ready();
    tg.expand();

    if (tg.setHeaderColor) {
      tg.setHeaderColor("#ffffff");
    }

    if (tg.setBackgroundColor) {
      tg.setBackgroundColor("#f6f8fb");
    }
  } catch (error) {
    console.warn("Telegram initialization failed:", error);
  }
}


/* =========================================================
   APP STATE
   ========================================================= */

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
  leaderboardPeriod: "all",

  withdrawMethod: null,

  daily: {
    claimed: false,
    nextClaimAt: null
  },

  notifications: [],

  loading: false
};


/* =========================================================
   HELPERS
   ========================================================= */

function $(id) {
  return document.getElementById(id);
}


function escapeHTML(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


function formatQEXC(value) {
  const number = Number(value || 0);

  return Math.floor(number).toLocaleString("en-US");
}


function formatBDTFromQEXC(qexc) {
  const amount = Number(qexc || 0) * QEXC_TO_BDT;

  return amount.toLocaleString("en-BD", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}


function formatDate(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString("en-BD", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}


function initials(name) {
  const text = String(name || "U").trim();

  if (!text) {
    return "U";
  }

  return text
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part.charAt(0).toUpperCase())
    .join("");
}


function vibrate() {
  try {
    if (tg?.HapticFeedback?.impactOccurred) {
      tg.HapticFeedback.impactOccurred("light");
    }
  } catch (_) {}
}


/* =========================================================
   TOAST
   ========================================================= */

let toastTimer = null;

function showToast(message) {
  const toast = $("toast");
  const messageEl = $("toastMessage");

  if (!toast || !messageEl) {
    return;
  }

  messageEl.textContent = message;

  toast.classList.add("show");

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2800);
}


/* =========================================================
   LOADER
   ========================================================= */

function showLoader() {
  $("globalLoader")?.classList.remove("hidden");
}


function hideLoader() {
  $("globalLoader")?.classList.add("hidden");
}


/* =========================================================
   API
   ========================================================= */

async function apiRequest(
  endpoint,
  options = {}
) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };


  /*
   * IMPORTANT:
   * Backend validates RAW Telegram initData.
   * Never use initDataUnsafe for authentication.
   */

  if (tg?.initData) {
    headers["X-Telegram-Init-Data"] = tg.initData;
  }


  const response = await fetch(
    `${API_BASE}${endpoint}`,
    {
      ...options,
      headers
    }
  );


  let data = null;

  try {
    data = await response.json();
  } catch (_) {
    data = null;
  }


  if (!response.ok) {

    const message =
      data?.detail ||
      data?.message ||
      `Request failed (${response.status})`;

    throw new Error(message);
  }


  return data;
}


/* =========================================================
   AUTH
   ========================================================= */

async function authenticate() {

  if (!tg?.initData) {

    /*
     * Development fallback.
     * Real Telegram production authentication requires
     * Telegram Mini App initData.
     */

    showToast(
      "Telegram Mini App থেকে অ্যাপটি খুলুন।"
    );

    return false;
  }


  try {

    const data = await apiRequest(
      "/auth",
      {
        method: "POST"
      }
    );


    if (data?.user) {
      state.user = data.user;
    }


    if (data?.wallet) {
      state.wallet = {
        ...state.wallet,
        ...data.wallet
      };
    }


    updateUserUI();
    updateWalletUI();

    return true;

  } catch (error) {

    console.error("Authentication error:", error);

    showToast(
      "Account load করা যাচ্ছে না। আবার চেষ্টা করুন।"
    );

    return false;
  }
}


/* =========================================================
   USER UI
   ========================================================= */

function updateUserUI() {

  const user = state.user;

  if (!user) {
    return;
  }


  const name =
    user.first_name ||
    user.username ||
    "User";


  const username =
    user.username
      ? `@${user.username}`
      : "Telegram User";


  if ($("userName")) {
    $("userName").textContent = name;
  }


  if ($("profileName")) {
    $("profileName").textContent = name;
  }


  if ($("profileUsername")) {
    $("profileUsername").textContent = username;
  }


  const avatarText = initials(name);


  if ($("topAvatarText")) {
    $("topAvatarText").textContent = avatarText;
  }


  if ($("profileAvatar")) {
    $("profileAvatar").textContent = avatarText;
  }


  updateReferralLink();
}


/* =========================================================
   WALLET UI
   ========================================================= */

function updateWalletUI() {

  const wallet = state.wallet || {};

  const qexc =
    Number(wallet.balance_qexc || 0);


  const bdt =
    formatBDTFromQEXC(qexc);


  if ($("balanceQEXC")) {
    $("balanceQEXC").textContent =
      formatQEXC(qexc);
  }


  if ($("balanceBDT")) {
    $("balanceBDT").textContent = bdt;
  }


  if ($("walletQEXC")) {
    $("walletQEXC").textContent =
      `${formatQEXC(qexc)} QEXC`;
  }


  if ($("walletBalance")) {
    $("walletBalance").textContent =
      `৳${bdt}`;
  }


  if ($("withdrawAvailable")) {
    $("withdrawAvailable").textContent =
      `৳${bdt}`;
  }


  if ($("totalEarned")) {
    $("totalEarned").textContent =
      formatQEXC(wallet.total_earned || 0);
  }


  if ($("totalWithdrawn")) {
    $("totalWithdrawn").textContent =
      formatQEXC(wallet.total_withdrawn || 0);
  }


  if ($("profileEarned")) {
    $("profileEarned").textContent =
      formatQEXC(wallet.total_earned || 0);
  }


  if ($("profileWithdrawn")) {
    $("profileWithdrawn").textContent =
      formatQEXC(wallet.total_withdrawn || 0);
  }
}


/* =========================================================
   WALLET LOAD
   ========================================================= */

async function loadWallet() {

  try {

    const data =
      await apiRequest("/wallet");


    if (data?.wallet) {

      state.wallet = {
        ...state.wallet,
        ...data.wallet
      };

      updateWalletUI();
    }

  } catch (error) {

    console.error(
      "Wallet load failed:",
      error
    );
  }
}


/* =========================================================
   TRANSACTIONS
   ========================================================= */

async function loadTransactions() {

  try {

    const data =
      await apiRequest(
        "/transactions"
      );


    if (Array.isArray(data)) {
      state.transactions = data;
    } else if (
      Array.isArray(data?.transactions)
    ) {
      state.transactions =
        data.transactions;
    } else {
      state.transactions = [];
    }


    renderTransactions();

  } catch (error) {

    console.error(
      "Transactions load failed:",
      error
    );

    state.transactions = [];

    renderTransactions();
  }
}


function renderTransactions() {

  const lists = [
    $("recentTransactions"),
    $("historyList")
  ];


  lists.forEach(container => {

    if (!container) {
      return;
    }


    const items =
      state.transactions || [];


    if (!items.length) {

      container.innerHTML = `
        <div class="empty-state compact">
          <div class="empty-icon">◌</div>

          <div class="empty-title">
            কোনো transaction নেই
          </div>

          <div class="empty-description">
            আপনার earning ও withdrawal এখানে দেখা যাবে।
          </div>
        </div>
      `;

      return;
    }


    const limited =
      container.id === "recentTransactions"
        ? items.slice(0, 5)
        : items;


    container.innerHTML =
      limited.map(tx => {

        const amount =
          Number(
            tx.amount_qexc ??
            tx.qexc ??
            tx.amount ??
            0
          );


        const type =
          String(
            tx.type ||
            tx.transaction_type ||
            "reward"
          ).toLowerCase();


        const negative =
          type.includes("withdraw") ||
          type.includes("debit") ||
          amount < 0;


        const sign =
          negative ? "-" : "+";


        const title =
          tx.title ||
          tx.description ||
          (
            negative
              ? "Withdrawal"
              : "Reward"
          );


        return `
          <div class="transaction">

            <div class="transaction-icon">
              ${negative ? "↗" : "+"}
            </div>

            <div class="transaction-info">

              <div class="transaction-title">
                ${escapeHTML(title)}
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
              negative
                ? "negative"
                : "positive"
            }">
              ${sign}${formatQEXC(Math.abs(amount))}
              QEXC
            </div>

          </div>
        `;
      }).join("");
  });
}


/* =========================================================
   NAVIGATION
   ========================================================= */

function navigate(page) {

  const validPages = [
    "home",
    "earn",
    "tasks",
    "leaderboard",
    "wallet",
    "profile"
  ];


  if (!validPages.includes(page)) {
    return;
  }


  state.currentPage = page;


  document
    .querySelectorAll(".page")
    .forEach(section => {
      section.classList.remove("active");
    });


  const target =
    $(`page-${page}`);


  if (target) {
    target.classList.add("active");
  }


  document
    .querySelectorAll(".nav-item")
    .forEach(item => {

      item.classList.toggle(
        "active",
        item.dataset.page === page
      );

    });


  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });


  vibrate();


  if (page === "wallet") {
    loadWallet();
    loadTransactions();
  }


  if (page === "tasks") {
    loadTasks();
  }


  if (page === "leaderboard") {
    loadLeaderboard(
      state.leaderboardPeriod
    );
  }


  if (page === "profile") {
    updateUserUI();
    updateWalletUI();
  }
}


/* =========================================================
   DAILY BONUS
   ========================================================= */

let dailyTimer = null;


async function loadDailyStatus() {

  /*
   * Backend may return daily status from /rewards/daily
   * only after claim. Therefore we also support local
   * countdown fallback.
   */


  try {

    const stored =
      localStorage.getItem(
        "qexus_daily_next_claim"
      );


    if (stored) {

      const timestamp =
        Number(stored);


      if (
        Number.isFinite(timestamp) &&
        timestamp > Date.now()
      ) {

        state.daily.nextClaimAt =
          timestamp;

        startDailyCountdown();

        return;
      }


      localStorage.removeItem(
        "qexus_daily_next_claim"
      );
    }

  } catch (_) {}


  state.daily.claimed = false;

  renderDailyAvailable();
}


async function claimDailyBonus() {

  const button =
    $("dailyBonusButton");


  if (button?.disabled) {
    return;
  }


  if (
    state.daily.nextClaimAt &&
    Date.now() <
    state.daily.nextClaimAt
  ) {

    showToast(
      "পরবর্তী Daily Bonus-এর জন্য অপেক্ষা করুন।"
    );

    return;
  }


  if (button) {
    button.disabled = true;
    button.textContent =
      "Processing...";
  }


  try {

    const data =
      await apiRequest(
        "/rewards/daily",
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


    if (data?.next_claim_at) {

      const timestamp =
        new Date(
          data.next_claim_at
        ).getTime();


      if (
        Number.isFinite(timestamp)
      ) {

        state.daily.nextClaimAt =
          timestamp;


        localStorage.setItem(
          "qexus_daily_next_claim",
          String(timestamp)
        );
      }

    } else {

      /*
       * Safe fallback:
       * 24 hours from now.
       */

      const next =
        Date.now() +
        24 * 60 * 60 * 1000;


      state.daily.nextClaimAt =
        next;


      localStorage.setItem(
        "qexus_daily_next_claim",
        String(next)
      );
    }


    state.daily.claimed = true;


    updateWalletUI();
    await loadTransactions();


    startDailyCountdown();


    showToast(
      "Daily Bonus সফলভাবে যোগ হয়েছে।"
    );


    vibrate();

  } catch (error) {

    console.error(
      "Daily bonus error:",
      error
    );


    showToast(
      error.message ||
      "আজকের bonus নেওয়া যায়নি।"
    );

  } finally {

    if (button) {
      button.disabled = false;
    }
  }
}


function renderDailyAvailable() {

  const countdown =
    $("dailyCountdown");


  const button =
    $("dailyBonusButton");


  const homeStatus =
    $("homeDailyStatus");


  if (countdown) {
    countdown.textContent =
      "Available";
  }


  if (button) {
    button.disabled = false;
    button.textContent =
      "Daily Bonus নিন";
  }


  if (homeStatus) {
    homeStatus.textContent =
      "আজকের bonus সংগ্রহ করুন";
  }
}


function startDailyCountdown() {

  clearInterval(dailyTimer);


  const update = () => {

    const target =
      Number(state.daily.nextClaimAt);


    const remaining =
      target - Date.now();


    if (
      !Number.isFinite(target) ||
      remaining <= 0
    ) {

      clearInterval(dailyTimer);

      state.daily.nextClaimAt = null;
      state.daily.claimed = false;


      try {
        localStorage.removeItem(
          "qexus_daily_next_claim"
        );
      } catch (_) {}


      renderDailyAvailable();

      return;
    }


    const totalSeconds =
      Math.floor(
        remaining / 1000
      );


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


    const text =
      `${String(hours).padStart(2, "0")}:` +
      `${String(minutes).padStart(2, "0")}:` +
      `${String(seconds).padStart(2, "0")}`;


    if ($("dailyCountdown")) {
      $("dailyCountdown").textContent =
        text;
    }


    if ($("dailyBonusButton")) {
      $("dailyBonusButton").textContent =
        `আবার পাওয়া যাবে ${text}`;
    }


    if ($("dailyBonusButton")) {
      $("dailyBonusButton").disabled =
        true;
    }


    if ($("homeDailyStatus")) {
      $("homeDailyStatus").textContent =
        `পরবর্তী bonus: ${text}`;
    }
  };


  update();

  dailyTimer =
    setInterval(update, 1000);
}


/* =========================================================
   REWARDED AD
   ========================================================= */

function watchAd() {

  /*
   * PRODUCTION SAFETY:
   *
   * No real rewarded-ad provider is connected yet.
   * Therefore this function MUST NOT call the old
   * /rewards/ad endpoint.
   *
   * No ad = No reward.
   */


  const status =
    $("adStatus");


  if (status) {
    status.textContent =
      "Verified rewarded ad provider এখনো সংযুক্ত হয়নি।";
  }


  showToast(
    "Rewarded Ad এখনো available নয়।"
  );
}


/* =========================================================
   TASKS
   ========================================================= */

async function loadTasks() {

  const container =
    $("taskList");


  if (!container) {
    return;
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


    renderTasks();

  } catch (error) {

    console.error(
      "Tasks error:",
      error
    );


    state.tasks = [];


    container.innerHTML = `
      <div class="empty-state">

        <div class="empty-icon">
          !
        </div>

        <div class="empty-title">
          Tasks unavailable
        </div>

        <div class="empty-description">
          এখন কোনো task পাওয়া যাচ্ছে না।
        </div>

      </div>
    `;
  }
}


function renderTasks() {

  const container =
    $("taskList");


  if (!container) {
    return;
  }


  const tasks =
    state.tasks || [];


  if ($("taskCount")) {
    $("taskCount").textContent =
      tasks.length;
  }


  if (!tasks.length) {

    container.innerHTML = `
      <div class="empty-state">

        <div class="empty-icon">
          ✓
        </div>

        <div class="empty-title">
          কোনো Task নেই
        </div>

        <div class="empty-description">
          নতুন task available হলে এখানে দেখা যাবে।
        </div>

      </div>
    `;

    return;
  }


  container.innerHTML =
    tasks.map(task => {

      const id =
        task.id ??
        task.task_id;


      const title =
        task.title ||
        task.name ||
        "Task";


      const description =
        task.description ||
        task.subtitle ||
        "Complete this task";


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
            ✓
          </div>

          <div class="task-info">

            <div class="task-title">
              ${escapeHTML(title)}
            </div>

            <div class="task-meta">
              ${escapeHTML(description)}
            </div>

          </div>

          <div class="task-reward">
            +${formatQEXC(reward)}
          </div>

          <button
            type="button"
            class="secondary-btn"
            style="width:auto;min-width:78px;margin:0;padding:0 9px;"
            onclick="completeTask('${escapeHTML(id)}')"
            ${completed ? "disabled" : ""}
          >
            ${completed ? "Done" : "Start"}
          </button>

        </div>
      `;

    }).join("");
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

      updateWalletUI();
    }


    showToast(
      "Task completed। Reward update হয়েছে।"
    );


    await loadTasks();
    await loadTransactions();

  } catch (error) {

    console.error(
      "Task completion error:",
      error
    );


    showToast(
      error.message ||
      "Task complete করা যায়নি।"
    );
  }
}


/* =========================================================
   LEADERBOARD
   ========================================================= */

async function loadLeaderboard(
  period = "all"
) {

  state.leaderboardPeriod =
    period;


  document
    .querySelectorAll(".leaderboard-tab")
    .forEach(tab => {

      tab.classList.toggle(
        "active",
        tab.dataset.period === period
      );

    });


  const list =
    $("leaderboardList");


  const top =
    $("leaderboardTop");


  if (!list) {
    return;
  }


  list.innerHTML = `
    <div class="leaderboard-loading">
      Leaderboard লোড হচ্ছে...
    </div>
  `;


  try {

    const data =
      await apiRequest(
        `/leaderboard?period=${encodeURIComponent(period)}`
      );


    const users =
      Array.isArray(data)
        ? data
        : (
          Array.isArray(data?.leaderboard)
            ? data.leaderboard
            : []
        );


    state.leaderboard =
      users;


    renderLeaderboard(users);

  } catch (error) {

    console.error(
      "Leaderboard error:",
      error
    );


    if (top) {
      top.innerHTML = "";
    }


    list.innerHTML = `
      <div class="empty-state">

        <div class="empty-icon">
          ★
        </div>

        <div class="empty-title">
          Leaderboard unavailable
        </div>

        <div class="empty-description">
          Leaderboard API এখনো configured নয়।
        </div>

      </div>
    `;


    if ($("myRankValue")) {
      $("myRankValue").textContent =
        "—";
    }
  }
}


function renderLeaderboard(users) {

  const top =
    $("leaderboardTop");


  const list =
    $("leaderboardList");


  if (!top || !list) {
    return;
  }


  if (!users.length) {

    top.innerHTML = "";

    list.innerHTML = `
      <div class="empty-state">

        <div class="empty-icon">
          ★
        </div>

        <div class="empty-title">
          এখনো কোনো ranking নেই
        </div>

        <div class="empty-description">
          Earn শুরু হলে leaderboard তৈরি হবে।
        </div>

      </div>
    `;

    return;
  }


  const firstThree =
    users.slice(0, 3);


  top.innerHTML =
    firstThree.map((user, index) => {

      const name =
        user.first_name ||
        user.username ||
        user.name ||
        "User";


      const score =
        Number(
          user.total_earned ??
          user.earned ??
          user.score ??
          user.balance_qexc ??
          0
        );


      return `
        <div class="podium-card">

          <div class="podium-rank">
            #${index + 1}
          </div>

          <div class="podium-name">
            ${escapeHTML(name)}
          </div>

          <div class="podium-score">
            ${formatQEXC(score)} QEXC
          </div>

        </div>
      `;

    }).join("");


  list.innerHTML =
    users.slice(3).map((user, index) => {

      const rank =
        index + 4;


      const name =
        user.first_name ||
        user.username ||
        user.name ||
        "User";


      const score =
        Number(
          user.total_earned ??
          user.earned ??
          user.score ??
          0
        );


      return `
        <div class="leaderboard-row">

          <div class="leaderboard-rank">
            #${rank}
          </div>

          <div class="leaderboard-avatar">
            ${escapeHTML(initials(name))}
          </div>

          <div class="leaderboard-user">

            <div class="leaderboard-name">
              ${escapeHTML(name)}
            </div>

          </div>

          <div class="leaderboard-score">
            ${formatQEXC(score)} QEXC
          </div>

        </div>
      `;

    }).join("");


  /*
   * Find current user's rank.
   */

  const myId =
    String(
      state.user?.telegram_id ??
      state.user?.id ??
      ""
    );


  let myIndex = -1;


  users.forEach((user, index) => {

    const id =
      String(
        user.telegram_id ??
        user.user_id ??
        user.id ??
        ""
      );


    if (
      myId &&
      id &&
      id === myId
    ) {
      myIndex = index;
    }
  });


  if ($("myRankValue")) {

    $("myRankValue").textContent =
      myIndex >= 0
        ? `#${myIndex + 1}`
        : "—";
  }
}


/* =========================================================
   WITHDRAWAL
   ========================================================= */

function openWithdrawModal() {

  const modal =
    $("withdrawModal");


  if (!modal) {
    return;
  }


  updateWalletUI();


  modal.classList.add("show");

  document.body.style.overflow =
    "hidden";


  if (!$("[data-method].active")) {

    state.withdrawMethod =
      null;

  }
}


function closeWithdrawModal() {

  const modal =
    $("withdrawModal");


  if (!modal) {
    return;
  }


  modal.classList.remove("show");

  document.body.style.overflow =
    "";
}


function selectWithdrawMethod(method) {

  const allowed = [
    "bKash",
    "Nagad"
  ];


  if (!allowed.includes(method)) {
    return;
  }


  state.withdrawMethod =
    method;


  document
    .querySelectorAll(
      ".method-btn"
    )
    .forEach(button => {

      button.classList.toggle(
        "active",
        button.dataset.method === method
      );

    });


  vibrate();
}


async function submitWithdrawal() {

  const amountInput =
    $("withdrawAmount");


  const numberInput =
    $("withdrawNumber");


  const submitButton =
    $("withdrawSubmit");


  const amount =
    Number(
      amountInput?.value || 0
    );


  const accountNumber =
    String(
      numberInput?.value || ""
    ).trim();


  if (
    !Number.isFinite(amount) ||
    amount < MIN_WITHDRAW_BDT
  ) {

    showToast(
      `Minimum withdrawal ৳${MIN_WITHDRAW_BDT}`
    );

    return;
  }


  if (
    !state.withdrawMethod
  ) {

    showToast(
      "bKash অথবা Nagad নির্বাচন করুন।"
    );

    return;
  }


  if (
    !/^01\d{9}$/.test(
      accountNumber
    )
  ) {

    showToast(
      "সঠিক ১১ সংখ্যার mobile number দিন।"
    );

    return;
  }


  const availableBDT =
    Number(
      state.wallet.balance_qexc || 0
    ) * QEXC_TO_BDT;


  if (amount > availableBDT) {

    showToast(
      "আপনার balance যথেষ্ট নয়।"
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
            amount_bdt: amount,
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


    updateWalletUI();

    await loadTransactions();


    showToast(
      "Withdrawal request submitted।"
    );


    if (amountInput) {
      amountInput.value = "";
    }


    if (numberInput) {
      numberInput.value = "";
    }


    closeWithdrawModal();


  } catch (error) {

    console.error(
      "Withdrawal error:",
      error
    );


    showToast(
      error.message ||
      "Withdrawal request করা যায়নি।"
    );

  } finally {

    if (submitButton) {

      submitButton.disabled =
        false;

      submitButton.textContent =
        "Request Withdrawal";
    }
  }
}


/* =========================================================
   REFERRAL
   ========================================================= */

function updateReferralLink() {

  const input =
    $("referralLink");


  if (!input) {
    return;
  }


  const userId =
    state.user?.telegram_id ??
    state.user?.id;


  if (!userId) {
    return;
  }


  const link =
    `https://t.me/${BOT_USERNAME}?start=ref_${userId}`;


  input.value = link;
}


async function copyReferral() {

  const input =
    $("referralLink");


  if (!input?.value) {

    showToast(
      "Referral link unavailable।"
    );

    return;
  }


  try {

    await navigator.clipboard.writeText(
      input.value
    );


    showToast(
      "Referral link copied।"
    );

  } catch (_) {

    input.select();

    document.execCommand(
      "copy"
    );


    showToast(
      "Referral link copied।"
    );
  }
}


function shareReferral() {

  const input =
    $("referralLink");


  if (!input?.value) {
    return;
  }


  const text =
    "QEXUS-এ join করুন এবং rewards earn করুন।";


  const shareUrl =
    `https://t.me/share/url?url=${encodeURIComponent(
      input.value
    )}&text=${encodeURIComponent(
      text
    )}`;


  if (tg?.openTelegramLink) {

    tg.openTelegramLink(
      shareUrl
    );

  } else {

    window.open(
      shareUrl,
      "_blank"
    );
  }
}


/* =========================================================
   OFFICIAL CHANNEL
   ========================================================= */

function openOfficialChannel() {

  try {

    if (tg?.openTelegramLink) {

      tg.openTelegramLink(
        OFFICIAL_CHANNEL_URL
      );

    } else {

      window.open(
        OFFICIAL_CHANNEL_URL,
        "_blank"
      );
    }

  } catch (error) {

    window.open(
      OFFICIAL_CHANNEL_URL,
      "_blank"
    );
  }
}


function showAnnouncement() {

  const modal =
    $("announcementModal");


  if (!modal) {
    return;
  }


  modal.classList.add("show");

  document.body.style.overflow =
    "hidden";
}


function closeAnnouncement() {

  const modal =
    $("announcementModal");


  if (!modal) {
    return;
  }


  modal.classList.remove("show");

  document.body.style.overflow =
    "";
}


/* =========================================================
   FIRST VISIT POPUP
   ========================================================= */

function checkFirstVisit() {

  try {

    const key =
      "qexus_announcement_seen";


    const seen =
      localStorage.getItem(key);


    if (!seen) {

      setTimeout(() => {

        showAnnouncement();

        localStorage.setItem(
          key,
          "1"
        );

      }, 1000);
    }

  } catch (_) {}
}


/* =========================================================
   NOTIFICATIONS
   ========================================================= */

function showNotifications() {

  const modal =
    $("notificationModal");


  if (!modal) {
    return;
  }


  renderNotifications();


  modal.classList.add("show");

  document.body.style.overflow =
    "hidden";
}


function closeNotifications() {

  const modal =
    $("notificationModal");


  if (!modal) {
    return;
  }


  modal.classList.remove("show");

  document.body.style.overflow =
    "";
}


function renderNotifications() {

  const list =
    $("notificationList");


  if (!list) {
    return;
  }


  const notifications =
    state.notifications || [];


  if (!notifications.length) {

    list.innerHTML = `
      <div class="empty-state compact">

        <div class="empty-icon">
          ♢
        </div>

        <div class="empty-title">
          কোনো notification নেই
        </div>

        <div class="empty-description">
          নতুন notification এলে এখানে দেখা যাবে।
        </div>

      </div>
    `;

    return;
  }


  list.innerHTML =
    notifications.map(item => {

      return `
        <div class="notification-item">

          <div class="notification-title">
            ${escapeHTML(
              item.title || "QEXUS"
            )}
          </div>

          <div class="notification-description">
            ${escapeHTML(
              item.description ||
              item.message ||
              ""
            )}
          </div>

          <div class="notification-date">
            ${escapeHTML(
              formatDate(
                item.created_at ||
                item.date
              )
            )}
          </div>

        </div>
      `;

    }).join("");
}


/* =========================================================
   HELP / ABOUT
   ========================================================= */

function showHelp() {

  const modal =
    $("infoModal");


  if (!modal) {
    return;
  }


  if ($("infoModalTitle")) {
    $("infoModalTitle").textContent =
      "Help & Support";
  }


  if ($("infoModalBody")) {

    $("infoModalBody").innerHTML = `
      <h3>QEXUS কী?</h3>

      <p>
        QEXUS একটি rewards platform যেখানে
        বিভিন্ন eligible activity complete করে
        QEXC reward পাওয়া যায়।
      </p>

      <h3>QEXC কী?</h3>

      <p>
        QEXC হলো QEXUS-এর internal reward point।
        এটি cryptocurrency বা investment asset নয়।
      </p>

      <h3>Withdrawal</h3>

      <p>
        Minimum withdrawal ৳100।
        bKash অথবা Nagad account দিয়ে request করা যায়।
        Request manual review-এর মাধ্যমে process হয়।
      </p>

      <h3>সমস্যা হলে</h3>

      <p>
        আপনার Telegram username এবং সমস্যার
        screenshot সহ official support-এর মাধ্যমে
        যোগাযোগ করুন।
      </p>
    `;
  }


  modal.classList.add("show");

  document.body.style.overflow =
    "hidden";
}


function showAbout() {

  const modal =
    $("infoModal");


  if (!modal) {
    return;
  }


  if ($("infoModalTitle")) {
    $("infoModalTitle").textContent =
      "About QEXUS";
  }


  if ($("infoModalBody")) {

    $("infoModalBody").innerHTML = `
      <h3>QEXUS</h3>

      <p>
        QEXUS একটি lightweight Telegram Mini App
        rewards experience।
      </p>

      <h3>Reward Conversion</h3>

      <p>
        1,000 QEXC = ৳100
      </p>

      <h3>Important</h3>

      <p>
        QEXC শুধুমাত্র QEXUS-এর internal reward
        point। এটি কোনো cryptocurrency,
        security বা investment product নয়।
      </p>

      <p>
        Rewards শুধুমাত্র verified activity-এর
        মাধ্যমে প্রদান করা উচিত।
      </p>
    `;
  }


  modal.classList.add("show");

  document.body.style.overflow =
    "hidden";
}


function closeInfoModal() {

  const modals = [
    $("infoModal"),
    $("policyModal")
  ];


  modals.forEach(modal => {

    if (modal) {
      modal.classList.remove("show");
    }

  });


  document.body.style.overflow =
    "";
}


/* =========================================================
   POLICY
   ========================================================= */

function showPolicy(type) {

  const modal =
    $("policyModal");


  if (!modal) {
    return;
  }


  const title =
    $("policyTitle");


  const body =
    $("policyBody");


  if (!title || !body) {
    return;
  }


  if (type === "privacy") {

    title.textContent =
      "Privacy Policy";


    body.innerHTML = `
      <h3>Information</h3>

      <p>
        QEXUS account ব্যবহারের জন্য প্রয়োজনীয়
        Telegram user information backend-এ
        process হতে পারে।
      </p>

      <h3>Security</h3>

      <p>
        Authentication-এর ক্ষেত্রে Telegram
        Mini App initData server-side validation
        করা উচিত।
      </p>

      <h3>Payment information</h3>

      <p>
        Withdrawal request-এর জন্য দেওয়া payment
        account information শুধুমাত্র request
        processing-এর প্রয়োজন অনুযায়ী ব্যবহার করা হবে।
      </p>

      <h3>Fraud Prevention</h3>

      <p>
        Abuse, duplicate rewards এবং fraudulent
        activity detect করার জন্য প্রয়োজনীয়
        technical information process হতে পারে।
      </p>
    `;

  } else {

    title.textContent =
      "Terms & Conditions";


    body.innerHTML = `
      <h3>1. Account</h3>

      <p>
        QEXUS ব্যবহার করার সময় সঠিক ও বৈধ account
        ব্যবহার করতে হবে।
      </p>

      <h3>2. Rewards</h3>

      <p>
        Reward শুধুমাত্র verified এবং eligible
        activity-এর জন্য প্রদান করা হবে।
      </p>

      <h3>3. Fraud</h3>

      <p>
        Bot abuse, fake activity, multiple-account
        abuse বা reward manipulation নিষিদ্ধ।
      </p>

      <h3>4. Withdrawal</h3>

      <p>
        Withdrawal request manual review-এর
        মাধ্যমে approve বা reject হতে পারে।
      </p>

      <h3>5. Changes</h3>

      <p>
        Reward rates, task availability এবং
        platform rules প্রয়োজন অনুযায়ী পরিবর্তন
        হতে পারে।
      </p>
    `;
  }


  modal.classList.add("show");

  document.body.style.overflow =
    "hidden";
}


/* =========================================================
   REFRESH
   ========================================================= */

async function refreshApp() {

  try {

    await loadWallet();

    await loadTransactions();

    await loadTasks();

    await loadDailyStatus();

  } catch (error) {

    console.error(
      "Refresh error:",
      error
    );
  }
}


/* =========================================================
   NOTIFICATION BUTTON
   ========================================================= */

function setupNotificationButton() {

  const button =
    $("notificationButton");


  if (!button) {
    return;
  }


  button.addEventListener(
    "click",
    showNotifications
  );
}


/* =========================================================
   MODAL BACKDROP
   ========================================================= */

function setupModalBackdrop() {

  document
    .querySelectorAll(".modal")
    .forEach(modal => {

      modal.addEventListener(
        "click",
        event => {

          if (
            event.target === modal
          ) {

            modal.classList.remove(
              "show"
            );

            document.body.style.overflow =
              "";
          }
        }
      );

    });
}


/* =========================================================
   TELEGRAM BACK BUTTON
   ========================================================= */

function setupTelegramBackButton() {

  if (
    !tg?.BackButton
  ) {
    return;
  }


  tg.BackButton.onClick(() => {

    const openModal =
      document.querySelector(
        ".modal.show"
      );


    if (openModal) {

      openModal.classList.remove(
        "show"
      );

      document.body.style.overflow =
        "";

      tg.BackButton.hide();

      return;
    }


    if (
      state.currentPage !==
      "home"
    ) {

      navigate("home");

      return;
    }


    tg.close();
  });
}


/* =========================================================
   INPUT VALIDATION
   ========================================================= */

function setupInputs() {

  const numberInput =
    $("withdrawNumber");


  if (numberInput) {

    numberInput.addEventListener(
      "input",
      () => {

        numberInput.value =
          numberInput.value
            .replace(/\D/g, "")
            .slice(0, 11);
      }
    );
  }


  const amountInput =
    $("withdrawAmount");


  if (amountInput) {

    amountInput.addEventListener(
      "input",
      () => {

        if (
          Number(amountInput.value) < 0
        ) {
          amountInput.value = "0";
        }
      }
    );
  }
}


/* =========================================================
   CLOSE MODALS ON ESC
   ========================================================= */

document.addEventListener(
  "keydown",
  event => {

    if (event.key !== "Escape") {
      return;
    }


    document
      .querySelectorAll(".modal.show")
      .forEach(modal => {

        modal.classList.remove(
          "show"
        );

      });


    document.body.style.overflow =
      "";
  }
);


/* =========================================================
   VISIBILITY REFRESH
   ========================================================= */

document.addEventListener(
  "visibilitychange",
  () => {

    if (
      document.visibilityState ===
      "visible"
    ) {

      loadWallet();
      loadTransactions();
    }
  }
);


/* =========================================================
   INITIALIZATION
   ========================================================= */

async function initApp() {

  showLoader();


  try {

    setupNotificationButton();

    setupModalBackdrop();

    setupTelegramBackButton();

    setupInputs();


    /*
     * Start with Home.
     */

    navigate("home");


    /*
     * Authenticate user.
     */

    await authenticate();


    /*
     * Load application data.
     */

    await Promise.allSettled([
      loadWallet(),
      loadTransactions(),
      loadTasks(),
      loadDailyStatus()
    ]);


    /*
     * First visit announcement.
     */

    checkFirstVisit();


  } catch (error) {

    console.error(
      "QEXUS initialization error:",
      error
    );

    showToast(
      "QEXUS load করতে সমস্যা হয়েছে।"
    );

  } finally {

    setTimeout(
      hideLoader,
      250
    );
  }
}


/* =========================================================
   GLOBAL FUNCTIONS
   ========================================================= */

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


/* =========================================================
   START
   ========================================================= */

if (
  document.readyState ===
  "loading"
) {

  document.addEventListener(
    "DOMContentLoaded",
    initApp
  );

} else {

  initApp();
       }
