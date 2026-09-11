/* =========================================================
   QEXUS - APP.JS
   Telegram Mini App + AdsGram + QEXC Rewards
   ========================================================= */

"use strict";

/* =========================================================
   CONFIG
   ========================================================= */

const API_BASE =
  "https://qexus-backend.onrender.com/api";

const ADSGRAM_BLOCK_ID = "47279";

const AD_REWARD_QEXC = 3;
const DAILY_BONUS_QEXC = 10;

const QEXC_TO_BDT = 0.10;
const MIN_WITHDRAW_BDT = 100;

const OFFICIAL_CHANNEL =
  "https://t.me/Qexus_Official";

const REFERRAL_BOT =
  "Qexus_Official_Bot";


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
      tg.setBackgroundColor("#ffffff");
    }
  } catch (error) {
    console.warn("Telegram WebApp init error:", error);
  }
}


/* =========================================================
   STATE
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

  withdrawMethod: null,

  dailyNextClaimAt: null,

  dailyTimer: null,

  adController: null,

  adLoading: false,

  initialized: false
};


/* =========================================================
   DOM HELPERS
   ========================================================= */

function $(id) {
  return document.getElementById(id);
}


function showElement(id) {
  const el = $(id);

  if (el) {
    el.classList.remove("hidden");
  }
}


function hideElement(id) {
  const el = $(id);

  if (el) {
    el.classList.add("hidden");
  }
}


/* =========================================================
   TOAST
   ========================================================= */

function showToast(message, duration = 2500) {

  const toast = $("toast");
  const text = $("toastMessage");

  if (!toast || !text) {
    alert(message);
    return;
  }

  text.textContent = message;

  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
  }, duration);
}


/* =========================================================
   LOADER
   ========================================================= */

function showLoader(text = "QEXUS লোড হচ্ছে...") {

  const loader = $("globalLoader");

  if (!loader) return;

  const loaderText =
    loader.querySelector(".loader-text");

  if (loaderText) {
    loaderText.textContent = text;
  }

  loader.classList.remove("hidden");
}


function hideLoader() {

  const loader = $("globalLoader");

  if (!loader) return;

  loader.classList.add("hidden");
}


/* =========================================================
   TELEGRAM INIT DATA
   ========================================================= */

function getTelegramInitData() {

  if (!tg) {
    return "";
  }

  return tg.initData || "";
}


/* =========================================================
   API HELPER
   ========================================================= */

async function apiRequest(
  endpoint,
  options = {}
) {

  const headers = {
    "Content-Type": "application/json",

    ...(options.headers || {})
  };


  const initData = getTelegramInitData();

  if (initData) {
    headers["X-Telegram-Init-Data"] =
      initData;
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
  } catch {
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

  const initData = getTelegramInitData();

  if (!initData) {

    showToast(
      "Telegram Mini App-এর ভিতর থেকে খুলুন।"
    );

    return false;
  }


  try {

    const data =
      await apiRequest(
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


    return true;

  } catch (error) {

    console.error(
      "Authentication error:",
      error
    );

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

  if (!state.user) return;


  const firstName =
    state.user.first_name ||
    state.user.username ||
    "User";


  const username =
    state.user.username
      ? `@${state.user.username}`
      : "Telegram User";


  if ($("userName")) {
    $("userName").textContent =
      firstName;
  }


  if ($("profileName")) {
    $("profileName").textContent =
      firstName;
  }


  if ($("profileUsername")) {
    $("profileUsername").textContent =
      username;
  }


  const initial =
    String(firstName)
      .trim()
      .charAt(0)
      .toUpperCase() || "U";


  if ($("topAvatarText")) {
    $("topAvatarText").textContent =
      initial;
  }


  if ($("profileAvatar")) {
    $("profileAvatar").textContent =
      initial;
  }


  updateReferralLink();
}


/* =========================================================
   BALANCE UI
   ========================================================= */

function getBalanceBDT() {

  return (
    Number(state.wallet.balance_qexc || 0)
    * QEXC_TO_BDT
  );
}


function formatBDT(value) {

  return Number(value || 0)
    .toFixed(2);
}


function updateWalletUI() {

  const qexc =
    Number(state.wallet.balance_qexc || 0);


  const bdt =
    qexc * QEXC_TO_BDT;


  /* HOME */

  if ($("balanceQEXC")) {
    $("balanceQEXC").textContent =
      qexc.toFixed(0);
  }


  if ($("balanceBDT")) {
    $("balanceBDT").textContent =
      formatBDT(bdt);
  }


  /* WALLET */

  if ($("walletQEXC")) {
    $("walletQEXC").textContent =
      `${qexc.toFixed(0)} QEXC`;
  }


  if ($("walletBalance")) {
    $("walletBalance").textContent =
      `৳${formatBDT(bdt)}`;
  }


  if ($("totalEarned")) {
    $("totalEarned").textContent =
      Number(
        state.wallet.total_earned || 0
      ).toFixed(0);
  }


  if ($("totalWithdrawn")) {
    $("totalWithdrawn").textContent =
      Number(
        state.wallet.total_withdrawn || 0
      ).toFixed(0);
  }


  /* PROFILE */

  if ($("profileEarned")) {
    $("profileEarned").textContent =
      Number(
        state.wallet.total_earned || 0
      ).toFixed(0);
  }


  if ($("profileWithdrawn")) {
    $("profileWithdrawn").textContent =
      Number(
        state.wallet.total_withdrawn || 0
      ).toFixed(0);
  }


  /* WITHDRAW */

  if ($("withdrawAvailable")) {
    $("withdrawAvailable").textContent =
      `৳${formatBDT(bdt)}`;
  }
}


/* =========================================================
   WALLET LOAD
   ========================================================= */

async function loadWallet() {

  try {

    const data =
      await apiRequest(
        "/wallet"
      );


    if (data?.wallet) {

      state.wallet = {
        ...state.wallet,
        ...data.wallet
      };

    }


    updateWalletUI();

  } catch (error) {

    console.warn(
      "Wallet load error:",
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


    state.transactions =
      Array.isArray(data)
        ? data
        : (
          data?.transactions || []
        );


    renderTransactions();

  } catch (error) {

    console.warn(
      "Transaction error:",
      error
    );
  }
}


function renderTransactions() {

  const history =
    $("historyList");

  const recent =
    $("recentTransactions");


  if (!Array.isArray(state.transactions)) {
    state.transactions = [];
  }


  if (history) {

    history.innerHTML =
      buildTransactionsHTML(
        state.transactions
      );

  }


  if (recent) {

    recent.innerHTML =
      buildTransactionsHTML(
        state.transactions.slice(0, 5)
      );

  }
}


function buildTransactionsHTML(
  transactions
) {

  if (!transactions.length) {

    return `
      <div class="empty-state compact">

        <div class="empty-icon">
          ◌
        </div>

        <div class="empty-title">
          কোনো transaction নেই
        </div>

        <div class="empty-description">
          আপনার earning ও withdrawal এখানে দেখা যাবে।
        </div>

      </div>
    `;
  }


  return transactions
    .map((tx) => {

      const amount =
        Number(
          tx.amount_qexc ??
          tx.qexc ??
          tx.amount ??
          0
        );


      const title =
        tx.title ||
        tx.description ||
        tx.type ||
        "Transaction";


      const date =
        tx.created_at ||
        tx.createdAt ||
        "";


      const sign =
        amount >= 0
          ? "+"
          : "";


      const status =
        String(
          tx.status || ""
        ).toLowerCase();


      return `
        <div class="transaction">

          <div class="transaction-icon">
            Q
          </div>

          <div class="transaction-info">

            <div class="transaction-title">
              ${escapeHTML(title)}
            </div>

            <div class="transaction-date">
              ${escapeHTML(formatDate(date))}
            </div>

          </div>

          <div class="transaction-amount ${amount >= 0 ? "success" : "failed"}">
            ${sign}${amount.toFixed(0)} QEXC
          </div>

        </div>
      `;

    })
    .join("");
}


/* =========================================================
   DAILY BONUS
   ========================================================= */

async function claimDailyBonus() {

  const button =
    $("dailyBonusButton");


  if (button) {
    button.disabled = true;
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

      state.dailyNextClaimAt =
        data.next_claim_at;

    } else {

      state.dailyNextClaimAt =
        Date.now() + (
          24 * 60 * 60 * 1000
        );

    }


    localStorage.setItem(
      "qexus_daily_next",
      String(
        state.dailyNextClaimAt
      )
    );


    updateWalletUI();

    updateDailyCountdown();

    await loadTransactions();


    showToast(
      `+${DAILY_BONUS_QEXC} QEXC Daily Bonus পেয়েছেন!`
    );


  } catch (error) {

    console.error(
      "Daily bonus error:",
      error
    );


    showToast(
      error.message ||
      "Daily Bonus নেওয়া যায়নি।"
    );


    updateDailyCountdown();

  } finally {

    if (button) {
      button.disabled = false;
    }

  }
}


/* =========================================================
   DAILY COUNTDOWN
   ========================================================= */

function loadSavedDailyTimer() {

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

    }

  }


  updateDailyCountdown();
}


function updateDailyCountdown() {

  const countdown =
    $("dailyCountdown");

  const homeStatus =
    $("homeDailyStatus");

  const button =
    $("dailyBonusButton");


  if (!countdown) return;


  if (state.dailyTimer) {

    clearInterval(
      state.dailyTimer
    );

  }


  function render() {

    if (!state.dailyNextClaimAt) {

      countdown.textContent =
        "Available";

      if (homeStatus) {
        homeStatus.textContent =
          "আজকের bonus সংগ্রহ করুন";
      }

      if (button) {
        button.disabled = false;
      }

      return;
    }


    const remaining =
      Number(
        state.dailyNextClaimAt
      ) - Date.now();


    if (remaining <= 0) {

      state.dailyNextClaimAt =
        null;

      localStorage.removeItem(
        "qexus_daily_next"
      );


      countdown.textContent =
        "Available";


      if (homeStatus) {
        homeStatus.textContent =
          "আজকের bonus সংগ্রহ করুন";
      }


      if (button) {
        button.disabled = false;
      }


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


    countdown.textContent =
      `${String(hours).padStart(2, "0")}:` +
      `${String(minutes).padStart(2, "0")}:` +
      `${String(seconds).padStart(2, "0")}`;


    if (homeStatus) {

      homeStatus.textContent =
        `পরবর্তী bonus ${String(hours).padStart(2, "0")}:` +
        `${String(minutes).padStart(2, "0")}:` +
        `${String(seconds).padStart(2, "0")} পরে`;
    }


    if (button) {
      button.disabled = true;
    }

  }


  render();


  state.dailyTimer =
    setInterval(
      render,
      1000
    );
}


/* =========================================================
   ADSGRAM
   ========================================================= */

function initializeAdsgram() {

  try {

    if (
      !window.Adsgram ||
      typeof window.Adsgram.init !== "function"
    ) {

      console.warn(
        "AdsGram SDK not available."
      );

      setAdStatus(
        "AdsGram লোড হয়নি।"
      );

      return false;
    }


    state.adController =
      window.Adsgram.init({
        blockId: ADSGRAM_BLOCK_ID
      });


    setAdStatus(
      "বিজ্ঞাপন দেখার জন্য প্রস্তুত।"
    );


    return true;

  } catch (error) {

    console.error(
      "AdsGram initialization error:",
      error
    );


    setAdStatus(
      "বিজ্ঞাপন বর্তমানে unavailable"
    );


    return false;
  }
}


function setAdStatus(message) {

  const status =
    $("adStatus");

  if (status) {
    status.textContent =
      message;
  }
}


/* =========================================================
   WATCH REWARDED AD
   ========================================================= */

async function watchAd() {

  if (state.adLoading) {
    return;
  }


  if (!state.adController) {

    const initialized =
      initializeAdsgram();


    if (!initialized) {

      showToast(
        "বিজ্ঞাপন এখনো প্রস্তুত হয়নি।"
      );

      return;
    }
  }


  const button =
    $("watchAdButton");


  state.adLoading = true;


  if (button) {
    button.disabled = true;
    button.textContent =
      "বিজ্ঞাপন লোড হচ্ছে...";
  }


  setAdStatus(
    "বিজ্ঞাপন লোড হচ্ছে..."
  );


  try {

    /*
     * AdsGram Reward format:
     * show() resolves when the rewarded ad
     * has been watched till the end.
     */

    const result =
      await state.adController.show();


    console.log(
      "AdsGram result:",
      result
    );


    /*
     * Reward only after successful completion.
     */

    setAdStatus(
      "বিজ্ঞাপন সম্পূর্ণ হয়েছে। Reward যাচাই হচ্ছে..."
    );


    await requestAdReward();


  } catch (error) {

    console.warn(
      "AdsGram show error:",
      error
    );


    setAdStatus(
      "বিজ্ঞাপন সম্পূর্ণ হয়নি।"
    );


    showToast(
      "বিজ্ঞাপন সম্পূর্ণ না হওয়ায় কোনো QEXC দেওয়া হয়নি।"
    );

  } finally {

    state.adLoading = false;


    if (button) {

      button.disabled = false;

      button.textContent =
        "বিজ্ঞাপন দেখুন";

    }

  }
}


/* =========================================================
   REQUEST AD REWARD FROM BACKEND
   ========================================================= */

async function requestAdReward() {

  try {

    /*
     * IMPORTANT:
     * Reward must come from backend.
     * Never add QEXC directly in browser.
     */

    const data =
      await apiRequest(
        "/rewards/ad",
        {
          method: "POST",

          body: JSON.stringify({
            block_id: ADSGRAM_BLOCK_ID
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


    setAdStatus(
      `বিজ্ঞাপন সম্পূর্ণ হয়েছে — +${AD_REWARD_QEXC} QEXC`
    );


    showToast(
      `+${AD_REWARD_QEXC} QEXC পেয়েছেন!`
    );


  } catch (error) {

    console.error(
      "Ad reward backend error:",
      error
    );


    setAdStatus(
      "Reward যাচাই করা যায়নি।"
    );


    showToast(
      "বিজ্ঞাপন দেখা হয়েছে, কিন্তু reward এখনো যাচাই হয়নি।"
    );

  }
}


/* =========================================================
   TASKS
   ========================================================= */

async function loadTasks() {

  try {

    const data =
      await apiRequest(
        "/tasks"
      );


    state.tasks =
      Array.isArray(data)
        ? data
        : (
          data?.tasks || []
        );


    renderTasks();


  } catch (error) {

    console.warn(
      "Tasks error:",
      error
    );


    state.tasks = [];

    renderTasks();
  }
}


function renderTasks() {

  const container =
    $("taskList");

  const count =
    $("taskCount");


  if (count) {
    count.textContent =
      state.tasks.length;
  }


  if (!container) return;


  if (!state.tasks.length) {

    container.innerHTML = `
      <div class="empty-state">

        <div class="empty-icon">
          ✓
        </div>

        <div class="empty-title">
          এখন কোনো Task নেই
        </div>

        <div class="empty-description">
          নতুন task available হলে এখানে দেখা যাবে।
        </div>

      </div>
    `;

    return;
  }


  container.innerHTML =
    state.tasks
      .map(
        (task) => {

          const reward =
            Number(
              task.reward_qexc ??
              task.reward ??
              0
            );


          const completed =
            Boolean(
              task.completed
            );


          return `
            <div class="task-card">

              <div class="task-icon">
                ✓
              </div>

              <div class="task-info">

                <div class="task-title">
                  ${escapeHTML(
                    task.title ||
                    "Task"
                  )}
                </div>

                <div class="task-meta">
                  ${escapeHTML(
                    task.description ||
                    "Task complete করুন"
                  )}
                </div>

              </div>

              <div class="task-reward">
                +${reward} QEXC

                <button
                  type="button"
                  class="secondary-btn"
                  ${
                    completed
                      ? "disabled"
                      : ""
                  }
                  onclick="completeTask('${escapeAttribute(task.id)}')"
                >
                  ${
                    completed
                      ? "Done"
                      : "Complete"
                  }
                </button>

              </div>

            </div>
          `;
        }
      )
      .join("");
}


/* =========================================================
   COMPLETE TASK
   ========================================================= */

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


    if (data?.wallet) {

      state.wallet = {
        ...state.wallet,
        ...data.wallet
      };

    }


    updateWalletUI();

    await loadTransactions();

    await loadTasks();


    showToast(
      "Task complete হয়েছে!"
    );


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

  setActiveLeaderboardTab(
    period
  );


  const list =
    $("leaderboardList");

  const top =
    $("leaderboardTop");


  if (list) {

    list.innerHTML = `
      <div class="leaderboard-loading">
        Leaderboard লোড হচ্ছে...
      </div>
    `;
  }


  try {

    const data =
      await apiRequest(
        `/leaderboard?period=${encodeURIComponent(period)}`
      );


    state.leaderboard =
      Array.isArray(data)
        ? data
        : (
          data?.leaderboard || []
        );


    renderLeaderboard();


  } catch (error) {

    console.warn(
      "Leaderboard unavailable:",
      error
    );


    if (list) {

      list.innerHTML = `
        <div class="empty-state">

          <div class="empty-icon">
            ★
          </div>

          <div class="empty-title">
            Leaderboard unavailable
          </div>

          <div class="empty-description">
            Leaderboard service এখনো প্রস্তুত হয়নি।
          </div>

        </div>
      `;

    }


    if (top) {
      top.innerHTML = "";
    }
  }
}


function setActiveLeaderboardTab(
  period
) {

  document
    .querySelectorAll(
      ".leaderboard-tab"
    )
    .forEach(
      (button) => {

        button.classList.toggle(
          "active",
          button.dataset.period === period
        );

      }
    );
}


function renderLeaderboard() {

  const top =
    $("leaderboardTop");

  const list =
    $("leaderboardList");


  if (!state.leaderboard.length) {

    if (top) {
      top.innerHTML = "";
    }

    if (list) {

      list.innerHTML = `
        <div class="empty-state">

          <div class="empty-icon">
            ★
          </div>

          <div class="empty-title">
            এখনো কোনো ranking নেই
          </div>

        </div>
      `;

    }

    return;
  }


  const first =
    state.leaderboard
      .slice(0, 3);


  if (top) {

    top.innerHTML =
      first
        .map(
          (item, index) => {

            return `
              <div class="leaderboard-top-item">

                <div>
                  #${index + 1}
                </div>

                <strong>
                  ${escapeHTML(
                    item.username ||
                    item.first_name ||
                    "User"
                  )}
                </strong>

                <span>
                  ${Number(
                    item.total_earned ||
                    item.earned ||
                    item.qexc ||
                    0
                  ).toFixed(0)} QEXC
                </span>

              </div>
            `;
          }
        )
        .join("");

  }


  if (list) {

    list.innerHTML =
      state.leaderboard
        .map(
          (item, index) => {

            return `
              <div class="leaderboard-item">

                <div class="leaderboard-rank">
                  #${index + 1}
                </div>

                <div class="leaderboard-user">
                  ${escapeHTML(
                    item.username ||
                    item.first_name ||
                    "User"
                  )}
                </div>

                <div class="leaderboard-score">
                  ${Number(
                    item.total_earned ||
                    item.earned ||
                    item.qexc ||
                    0
                  ).toFixed(0)}
                  QEXC
                </div>

              </div>
            `;

          }
        )
        .join("");
  }
}


/* =========================================================
   WITHDRAW
   ========================================================= */

function openWithdrawModal() {

  const modal =
    $("withdrawModal");

  if (!modal) return;


  updateWalletUI();

  modal.classList.add("show");

  if (tg?.BackButton) {
    try {
      tg.BackButton.show();
      tg.BackButton.onClick(
        closeWithdrawModal
      );
    } catch {}
  }
}


function closeWithdrawModal() {

  const modal =
    $("withdrawModal");

  if (!modal) return;

  modal.classList.remove("show");

  if (tg?.BackButton) {
    try {
      tg.BackButton.hide();
    } catch {}
  }
}


function selectWithdrawMethod(
  method
) {

  state.withdrawMethod =
    method;


  document
    .querySelectorAll(
      ".method-btn"
    )
    .forEach(
      (button) => {

        button.classList.toggle(
          "active",
          button.dataset.method === method
        );

      }
    );
}


async function submitWithdrawal() {

  const amountInput =
    $("withdrawAmount");

  const numberInput =
    $("withdrawNumber");

  const button =
    $("withdrawSubmit");


  const amount =
    Number(
      amountInput?.value || 0
    );


  const number =
    String(
      numberInput?.value || ""
    ).trim();


  if (
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
      "Payment method নির্বাচন করুন।"
    );

    return;
  }


  if (
    !/^01\d{9}$/.test(number)
  ) {

    showToast(
      "সঠিক 11-digit mobile number দিন।"
    );

    return;
  }


  if (
    getBalanceBDT() < amount
  ) {

    showToast(
      "আপনার balance যথেষ্ট নয়।"
    );

    return;
  }


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

            amount_bdt:
              amount,

            method:
              state.withdrawMethod,

            account_number:
              number

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


    closeWithdrawModal();


    if (amountInput) {
      amountInput.value = "";
    }


    if (numberInput) {
      numberInput.value = "";
    }


    showToast(
      "Withdrawal request submitted!"
    );


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

    if (button) {

      button.disabled = false;

      button.textContent =
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

  if (!input) return;


  if (!state.user?.telegram_id) {

    input.value = "";

    return;
  }


  input.value =
    `https://t.me/${REFERRAL_BOT}?start=ref_${state.user.telegram_id}`;
}


async function copyReferral() {

  const input =
    $("referralLink");


  if (!input?.value) {

    showToast(
      "Referral link এখনো প্রস্তুত হয়নি।"
    );

    return;
  }


  try {

    await navigator.clipboard.writeText(
      input.value
    );


    showToast(
      "Referral link copied!"
    );

  } catch {

    input.select();

    document.execCommand(
      "copy"
    );

    showToast(
      "Referral link copied!"
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
    encodeURIComponent(
      "QEXUS-এ join করে rewards earn করুন!"
    );


  const url =
    `https://t.me/share/url?url=${encodeURIComponent(input.value)}&text=${text}`;


  if (tg?.openTelegramLink) {

    tg.openTelegramLink(
      url
    );

  } else {

    window.open(
      url,
      "_blank"
    );

  }
}


/* =========================================================
   NAVIGATION
   ========================================================= */

function navigate(page) {

  const pages =
    document.querySelectorAll(
      ".page"
    );


  pages.forEach(
    (section) => {

      section.classList.toggle(
        "active",
        section.id ===
          `page-${page}`
      );

    }
  );


  document
    .querySelectorAll(
      ".nav-item"
    )
    .forEach(
      (button) => {

        button.classList.toggle(
          "active",
          button.dataset.page === page
        );

      }
    );


  state.currentPage =
    page;


  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });


  if (page === "wallet") {

    loadWallet();
    loadTransactions();

  }


  if (page === "tasks") {

    loadTasks();

  }


  if (page === "leaderboard") {

    loadLeaderboard("all");

  }


  if (tg?.BackButton) {

    try {

      if (page === "home") {
        tg.BackButton.hide();
      } else {
        tg.BackButton.show();
      }

    } catch {}
  }
}


/* =========================================================
   OFFICIAL CHANNEL
   ========================================================= */

function openOfficialChannel() {

  if (tg?.openTelegramLink) {

    tg.openTelegramLink(
      OFFICIAL_CHANNEL
    );

  } else {

    window.open(
      OFFICIAL_CHANNEL,
      "_blank"
    );

  }
}


function showAnnouncement() {

  const modal =
    $("announcementModal");

  if (!modal) return;

  modal.classList.add("show");
}


function closeAnnouncement() {

  const modal =
    $("announcementModal");

  if (!modal) return;

  modal.classList.remove("show");
}


/* =========================================================
   FIRST VISIT ANNOUNCEMENT
   ========================================================= */

function handleFirstVisitPopup() {

  const shown =
    localStorage.getItem(
      "qexus_announcement_seen"
    );


  if (shown) return;


  setTimeout(
    () => {

      showAnnouncement();

      localStorage.setItem(
        "qexus_announcement_seen",
        "1"
      );

    },
    1200
  );
}


/* =========================================================
   NOTIFICATIONS
   ========================================================= */

function showNotifications() {

  const modal =
    $("notificationModal");

  if (!modal) return;

  modal.classList.add("show");
}


function closeNotifications() {

  const modal =
    $("notificationModal");

  if (!modal) return;

  modal.classList.remove("show");
}


/* =========================================================
   POLICY
   ========================================================= */

function showPolicy(type) {

  const modal =
    $("policyModal");

  const title =
    $("policyTitle");

  const body =
    $("policyBody");


  if (!modal || !title || !body) {
    return;
  }


  if (type === "privacy") {

    title.textContent =
      "Privacy Policy";


    body.innerHTML = `
      <p>
        QEXUS আপনার Telegram account information
        শুধুমাত্র service পরিচালনা ও reward system
        চালানোর প্রয়োজন অনুযায়ী ব্যবহার করে।
      </p>

      <p>
        আমরা আপনার password, OTP বা payment PIN
        চাই না।
      </p>

      <p>
        Withdrawal-এর জন্য দেওয়া payment number
        শুধুমাত্র withdrawal processing-এর কাজে
        ব্যবহার করা হবে।
      </p>
    `;

  } else {

    title.textContent =
      "Terms & Conditions";


    body.innerHTML = `
      <p>
        QEXUS একটি rewards platform।
      </p>

      <p>
        QEXC হলো QEXUS-এর internal reward point।
        এটি cryptocurrency, investment বা
        financial security নয়।
      </p>

      <p>
        Fraud, bot abuse, multiple-account abuse,
        automated activity বা system manipulation
        নিষিদ্ধ।
      </p>

      <p>
        Fraudulent activity শনাক্ত হলে account
        restriction বা reward cancellation হতে পারে।
      </p>
    `;
  }


  modal.classList.add("show");
}


/* =========================================================
   HELP
   ========================================================= */

function showHelp() {

  const modal =
    $("infoModal");

  const title =
    $("infoModalTitle");

  const body =
    $("infoModalBody");


  if (!modal || !title || !body) {
    return;
  }


  title.textContent =
    "Help & Support";


  body.innerHTML = `
    <p>
      QEXUS ব্যবহার করতে কোনো সমস্যা হলে
      support-এর সঙ্গে যোগাযোগ করুন।
    </p>

    <p>
      Reward না পেলে কিছুক্ষণ অপেক্ষা করে
      Wallet refresh করুন।
    </p>

    <p>
      Withdrawal request manual review-এর
      মাধ্যমে process করা হয়।
    </p>
  `;


  modal.classList.add("show");
}


/* =========================================================
   ABOUT
   ========================================================= */

function showAbout() {

  const modal =
    $("infoModal");

  const title =
    $("infoModalTitle");

  const body =
    $("infoModalBody");


  if (!modal || !title || !body) {
    return;
  }


  title.textContent =
    "About QEXUS";


  body.innerHTML = `
    <p>
      <strong>QEXUS</strong>
      একটি Telegram-based rewards platform।
    </p>

    <p>
      Watch, complete tasks এবং অন্যান্য
      available activities-এর মাধ্যমে QEXC earn
      করা যায়।
    </p>

    <p>
      Conversion:
      <strong>1,000 QEXC = ৳100</strong>
    </p>
  `;


  modal.classList.add("show");
}


/* =========================================================
   CLOSE INFO MODALS
   ========================================================= */

function closeInfoModal() {

  const policy =
    $("policyModal");

  const info =
    $("infoModal");


  if (policy) {
    policy.classList.remove("show");
  }


  if (info) {
    info.classList.remove("show");
  }
}


/* =========================================================
   MODAL OUTSIDE CLICK
   ========================================================= */

document.addEventListener(
  "click",
  (event) => {

    const target =
      event.target;


    if (
      target.classList.contains(
        "modal"
      )
    ) {

      target.classList.remove(
        "show"
      );

    }

  }
);


/* =========================================================
   FORMAT DATE
   ========================================================= */

function formatDate(value) {

  if (!value) {
    return "";
  }


  const date =
    new Date(value);


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return String(value);
  }


  return date.toLocaleString(
    "bn-BD",
    {
      day: "numeric",
      month: "short",
      year: "numeric"
    }
  );
}


/* =========================================================
   ESCAPE HTML
   ========================================================= */

function escapeHTML(value) {

  return String(value ?? "")
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#039;"
    );
}


function escapeAttribute(value) {

  return String(value ?? "")
    .replace(
      /\\/g,
      "\\\\"
    )
    .replace(
      /'/g,
      "\\'"
    );
}


/* =========================================================
   REFRESH APP
   ========================================================= */

async function refreshApp() {

  await Promise.allSettled([
    loadWallet(),
    loadTransactions(),
    loadTasks()
  ]);

  updateUserUI();
  updateWalletUI();
}


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

      refreshApp();

    }

  }
);


/* =========================================================
   TELEGRAM BACK BUTTON
   ========================================================= */

if (tg?.BackButton) {

  try {

    tg.BackButton.onClick(
      () => {

        if (
          state.currentPage !==
          "home"
        ) {

          navigate("home");

        } else {

          tg.BackButton.hide();

        }

      }
    );

  } catch {}
}


/* =========================================================
   INITIALIZATION
   ========================================================= */

async function initializeApp() {

  showLoader(
    "QEXUS লোড হচ্ছে..."
  );


  try {

    const authenticated =
      await authenticate();


    if (!authenticated) {

      hideLoader();

      return;
    }


    updateUserUI();

    updateWalletUI();


    loadSavedDailyTimer();


    /*
     * AdsGram
     */

    initializeAdsgram();


    /*
     * Load app data
     */

    await Promise.allSettled([
      loadWallet(),
      loadTransactions(),
      loadTasks()
    ]);


    updateUserUI();
    updateWalletUI();


    handleFirstVisitPopup();


    state.initialized =
      true;


  } catch (error) {

    console.error(
      "QEXUS initialization error:",
      error
    );


    showToast(
      "QEXUS load করতে সমস্যা হয়েছে।"
    );

  } finally {

    hideLoader();

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

document.addEventListener(
  "DOMContentLoaded",
  initializeApp
);
