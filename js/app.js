/* =========================================================
   QEXUS — app.js
   Telegram Mini App frontend
   Backend: https://qexus-backend.onrender.com/api

   FIXES:
   1. Daily Bonus countdown timer
   2. Daily Bonus local cooldown persistence
   3. Prevent repeated bonus clicks
   4. Fake rewarded-ad payment removed
   5. Ad reward only works when backend/ad verification exists
   ========================================================= */

(() => {
  "use strict";

  /* =========================
     CONFIG
  ========================= */

  const API_BASE =
    "https://qexus-backend.onrender.com/api";

  const DAILY_BONUS_QEXC = 10;
  const AD_REWARD_QEXC = 3;

  /*
    Bangladesh timezone:
    UTC + 6
  */
  const BD_OFFSET_MS = 6 * 60 * 60 * 1000;

  const tg =
    window.Telegram?.WebApp || null;


  /* =========================
     STATE
  ========================= */

  let state = {
    user: null,

    wallet: {
      balance_qexc: 0,
      locked_qexc: 0,
      total_earned: 0,
      total_withdrawn: 0
    },

    transactions: [],
    tasks: [],

    loading: false,

    selectedWithdrawMethod: "bKash",

    dailyBonus: {
      claimed: false,
      nextClaimAt: 0
    },

    ad: {
      available: false,
      processing: false
    }
  };


  /* =========================
     HELPERS
  ========================= */

  const $ = selector =>
    document.querySelector(selector);

  const $$ = selector =>
    [...document.querySelectorAll(selector)];


  function escapeHTML(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }


  function formatNumber(number) {
    const n = Number(number || 0);

    return new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 2
    }).format(n);
  }


  function qexcToBDT(qexc) {
    return Number(qexc || 0) * 0.10;
  }


  function bdtToQexc(bdt) {
    return Number(bdt || 0) * 10;
  }


  function formatBDT(amount) {
    return `৳${formatNumber(amount)}`;
  }


  function delay(ms) {
    return new Promise(resolve =>
      setTimeout(resolve, ms)
    );
  }


  function nowText() {
    return new Date().toLocaleString("en-BD", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }


  /* =========================
     BANGLADESH DATE
  ========================= */

  function getBangladeshDate() {
    return new Date(
      Date.now() + BD_OFFSET_MS
    );
  }


  function getBangladeshDateKey() {
    const d = getBangladeshDate();

    const year = d.getUTCFullYear();
    const month = String(
      d.getUTCMonth() + 1
    ).padStart(2, "0");

    const day = String(
      d.getUTCDate()
    ).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }


  function getNextBangladeshMidnight() {
    const d = getBangladeshDate();

    const year = d.getUTCFullYear();
    const month = d.getUTCMonth();
    const day = d.getUTCDate();

    /*
      Bangladesh midnight represented
      as UTC timestamp.
    */

    const next =
      Date.UTC(
        year,
        month,
        day + 1,
        0,
        0,
        0
      ) - BD_OFFSET_MS;

    return next;
  }


  /* =========================
     DAILY BONUS STORAGE
  ========================= */

  function getDailyStorageKey() {
    const id =
      state.user?.telegram_id ||
      state.user?.id ||
      "guest";

    return `qexus_daily_bonus_${id}`;
  }


  function saveDailyBonusState() {
    try {
      localStorage.setItem(
        getDailyStorageKey(),
        JSON.stringify({
          date: getBangladeshDateKey(),
          nextClaimAt:
            state.dailyBonus.nextClaimAt
        })
      );
    } catch (error) {
      console.warn(
        "Daily bonus storage error:",
        error
      );
    }
  }


  function loadDailyBonusState() {
    try {
      const raw =
        localStorage.getItem(
          getDailyStorageKey()
        );

      if (!raw) {
        state.dailyBonus = {
          claimed: false,
          nextClaimAt: 0
        };

        return;
      }

      const data =
        JSON.parse(raw);

      const today =
        getBangladeshDateKey();

      /*
        If stored date is not today,
        bonus is available again.
      */

      if (
        data.date !== today ||
        !data.nextClaimAt ||
        Date.now() >= Number(data.nextClaimAt)
      ) {
        state.dailyBonus = {
          claimed: false,
          nextClaimAt: 0
        };

        localStorage.removeItem(
          getDailyStorageKey()
        );

        return;
      }

      state.dailyBonus = {
        claimed: true,
        nextClaimAt:
          Number(data.nextClaimAt)
      };

    } catch (error) {
      console.warn(
        "Daily bonus load error:",
        error
      );

      state.dailyBonus = {
        claimed: false,
        nextClaimAt: 0
      };
    }
  }


  /* =========================
     DAILY BONUS UI
  ========================= */

  let dailyTimerInterval = null;


  function formatCountdown(ms) {
    if (ms <= 0) {
      return "00:00:00";
    }

    const totalSeconds =
      Math.floor(ms / 1000);

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

    return [
      String(hours).padStart(2, "0"),
      String(minutes).padStart(2, "0"),
      String(seconds).padStart(2, "0")
    ].join(":");
  }


  function getDailyButtons() {
    return $$(
      '[data-action="daily-bonus"]'
    );
  }


  function updateDailyBonusUI() {
    const buttons =
      getDailyButtons();

    if (!buttons.length) {
      return;
    }

    const now = Date.now();

    /*
      Cooldown finished
    */

    if (
      state.dailyBonus.claimed &&
      now >= state.dailyBonus.nextClaimAt
    ) {
      state.dailyBonus.claimed = false;
      state.dailyBonus.nextClaimAt = 0;

      try {
        localStorage.removeItem(
          getDailyStorageKey()
        );
      } catch (_) {}
    }


    buttons.forEach(button => {

      if (state.dailyBonus.claimed) {

        const remaining =
          state.dailyBonus.nextClaimAt -
          now;

        button.disabled = true;

        button.textContent =
          `আবার পাবেন ${formatCountdown(remaining)}`;

        button.classList.add(
          "disabled"
        );

      } else {

        button.disabled = false;

        button.textContent =
          "Daily Bonus নিন";

        button.classList.remove(
          "disabled"
        );
      }
    });
  }


  function startDailyBonusTimer() {
    if (dailyTimerInterval) {
      clearInterval(
        dailyTimerInterval
      );
    }

    updateDailyBonusUI();

    dailyTimerInterval =
      setInterval(() => {
        updateDailyBonusUI();
      }, 1000);
  }


  function markDailyBonusClaimed() {
    state.dailyBonus = {
      claimed: true,
      nextClaimAt:
        getNextBangladeshMidnight()
    };

    saveDailyBonusState();

    updateDailyBonusUI();
  }


  /* =========================
     TOAST
  ========================= */

  function showToast(
    message,
    type = "default"
  ) {
    let toast = $("#toast");

    if (!toast) {
      toast =
        document.createElement("div");

      toast.id = "toast";
      toast.className = "toast";

      document.body.appendChild(
        toast
      );
    }

    toast.className =
      `toast ${type}`;

    toast.textContent =
      message;

    requestAnimationFrame(() => {
      toast.classList.add(
        "show"
      );
    });

    clearTimeout(
      window.__qexusToastTimer
    );

    window.__qexusToastTimer =
      setTimeout(() => {
        toast.classList.remove(
          "show"
        );
      }, 2800);
  }


  /* =========================
     HAPTIC
  ========================= */

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

      } else if (type === "error") {

        tg.HapticFeedback
          .notificationOccurred(
            "error"
          );

      } else if (type === "warning") {

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


  /* =========================
     TELEGRAM
  ========================= */

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

      if (tg.setHeaderColor) {
        tg.setHeaderColor(
          "#ffffff"
        );
      }

      if (tg.setBackgroundColor) {
        tg.setBackgroundColor(
          "#f6f8fb"
        );
      }

      if (tg.disableVerticalSwipes) {
        tg.disableVerticalSwipes();
      }

    } catch (error) {

      console.warn(
        "Telegram initialization error:",
        error
      );
    }
  }


  /* =========================
     API
  ========================= */

  async function apiRequest(
    endpoint,
    options = {}
  ) {

    const headers = {
      "Content-Type":
        "application/json",

      ...(options.headers || {})
    };


    /*
      IMPORTANT:
      Only Telegram raw initData.
      Never send BOT_TOKEN.
    */

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

      const message =
        data?.detail ||
        data?.message ||
        data?.error ||
        `Request failed (${response.status})`;

      throw new Error(
        message
      );
    }


    return data;
  }


  /* =========================
     AUTH
  ========================= */

  async function authenticate() {

    try {

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
        data.user || null;


      if (data.wallet) {

        state.wallet = {
          ...state.wallet,
          ...data.wallet
        };
      }


      renderUser();
      renderWallet();


      /*
        Load daily state only
        after user is known.
      */

      loadDailyBonusState();
      startDailyBonusTimer();


      return true;

    } catch (error) {

      console.error(
        "Auth error:",
        error
      );


      if (!tg?.initData) {

        showToast(
          "Telegram-এর ভিতর থেকে QEXUS খুলুন",
          "warning"
        );

      } else {

        showToast(
          error.message ||
          "Login করা যায়নি",
          "error"
        );
      }


      return false;

    } finally {

      setLoadingState(false);
    }
  }


  /* =========================
     USER
  ========================= */

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


    if ($("#userName")) {

      $("#userName")
        .textContent =
        firstName;
    }


    if ($("#profileName")) {

      $("#profileName")
        .textContent =
        firstName;
    }


    if ($("#profileUsername")) {

      $("#profileUsername")
        .textContent =
        username;
    }


    if ($("#profileAvatar")) {

      $("#profileAvatar")
        .textContent =
        String(firstName)
          .charAt(0)
          .toUpperCase();
    }


    if ($("#avatar")) {

      $("#avatar")
        .textContent =
        String(firstName)
          .charAt(0)
          .toUpperCase();
    }
  }


  /* =========================
     WALLET
  ========================= */

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
        wallet.balance_qexc || 0
      );


    const bdt =
      qexcToBDT(qexc);


    if ($("#balanceQEXC")) {

      $("#balanceQEXC")
        .textContent =
        `${formatNumber(qexc)} QEXC`;
    }


    if ($("#balanceBDT")) {

      $("#balanceBDT")
        .textContent =
        formatBDT(bdt);
    }


    if ($("#walletQEXC")) {

      $("#walletQEXC")
        .textContent =
        `${formatNumber(qexc)} QEXC`;
    }


    if ($("#walletBalance")) {

      $("#walletBalance")
        .textContent =
        formatBDT(bdt);
    }


    if ($("#totalEarned")) {

      $("#totalEarned")
        .textContent =
        formatNumber(
          wallet.total_earned
        );
    }


    if ($("#totalWithdrawn")) {

      $("#totalWithdrawn")
        .textContent =
        formatNumber(
          wallet.total_withdrawn
        );
    }


    if ($("#withdrawAvailable")) {

      $("#withdrawAvailable")
        .textContent =
        formatBDT(bdt);
    }


    updateWithdrawButton();
  }


  /* =========================
     TRANSACTIONS
  ========================= */

  async function loadTransactions() {

    try {

      const data =
        await apiRequest(
          "/transactions"
        );


      state.transactions =
        Array.isArray(data)
          ? data
          : data?.transactions || [];


      renderTransactions();

    } catch (error) {

      console.error(
        "Transaction error:",
        error
      );

      renderTransactions();
    }
  }


  function getTransactionIcon(type) {

    const t =
      String(type || "")
        .toLowerCase();


    if (
      t.includes("withdraw") ||
      t.includes("payout")
    ) {
      return "↗";
    }


    if (
      t.includes("reward") ||
      t.includes("earn") ||
      t.includes("bonus")
    ) {
      return "+";
    }


    if (
      t.includes("task") ||
      t.includes("mission")
    ) {
      return "✓";
    }


    return "•";
  }


  function transactionStatusClass(
    status
  ) {

    const s =
      String(status || "")
        .toLowerCase();


    if (
      s.includes("paid") ||
      s.includes("success") ||
      s.includes("completed")
    ) {
      return "success";
    }


    if (
      s.includes("pending") ||
      s.includes("processing")
    ) {
      return "pending";
    }


    if (
      s.includes("cancel") ||
      s.includes("refund")
    ) {
      return "cancelled";
    }


    if (
      s.includes("fail") ||
      s.includes("reject")
    ) {
      return "failed";
    }


    return "pending";
  }


  function renderTransactions() {

    const containers = [
      $("#recentTransactions"),
      $("#historyList")
    ].filter(Boolean);


    containers.forEach(
      container => {

        container.innerHTML =
          "";


        if (
          !state.transactions.length
        ) {

          container.innerHTML = `
            <div class="empty-state">
              <div class="empty-icon">↔</div>
              <div class="empty-title">
                কোনো transaction নেই
              </div>
              <div class="empty-description">
                আপনার earning ও withdrawal history এখানে দেখা যাবে।
              </div>
            </div>
          `;

          return;
        }


        const list =
          container.id ===
          "recentTransactions"
            ? state.transactions.slice(
                0,
                5
              )
            : state.transactions;


        list.forEach(tx => {

          const amount =
            Number(
              tx.amount_qexc || 0
            );


          const positive =
            amount > 0 &&
            !String(
              tx.type || ""
            )
              .toLowerCase()
              .includes(
                "withdraw"
              );


          const status =
            tx.status
              ? `
                <span class="status ${
                  transactionStatusClass(
                    tx.status
                  )
                }">
                  ${escapeHTML(
                    tx.status
                  )}
                </span>
              `
              : "";


          const item =
            document.createElement(
              "div"
            );


          item.className =
            "transaction";


          item.innerHTML = `
            <div class="transaction-icon">
              ${escapeHTML(
                getTransactionIcon(
                  tx.type
                )
              )}
            </div>

            <div class="transaction-info">
              <div class="transaction-title">
                ${escapeHTML(
                  tx.description ||
                  tx.type ||
                  "Transaction"
                )}
              </div>

              <div class="transaction-date">
                ${escapeHTML(
                  tx.created_at
                    ? new Date(
                        tx.created_at
                      ).toLocaleString(
                        "en-BD"
                      )
                    : nowText()
                )}
                ${status}
              </div>
            </div>

            <div class="transaction-amount ${
              positive
                ? "positive"
                : "negative"
            }">
              ${
                positive
                  ? "+"
                  : ""
              }${formatNumber(
                amount
              )}
              <small>QEXC</small>
            </div>
          `;


          container.appendChild(
            item
          );
        });
      }
    );
  }


  /* =========================
     TASKS
  ========================= */

  async function loadTasks() {

    try {

      const data =
        await apiRequest(
          "/tasks"
        );


      state.tasks =
        Array.isArray(data)
          ? data
          : data?.tasks || [];


      renderTasks();

    } catch (error) {

      console.error(
        "Task loading error:",
        error
      );


      if ($("#taskList")) {

        $("#taskList").innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">!</div>
            <div class="empty-title">
              Task load করা যায়নি
            </div>
            <div class="empty-description">
              একটু পরে আবার চেষ্টা করুন।
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


    container.innerHTML =
      "";


    if (!state.tasks.length) {

      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">✓</div>
          <div class="empty-title">
            এখন কোনো task নেই
          </div>
          <div class="empty-description">
            নতুন task এলে এখানে দেখানো হবে।
          </div>
        </div>
      `;

      return;
    }


    state.tasks.forEach(
      task => {

        const card =
          document.createElement(
            "div"
          );


        card.className =
          "task-card";


        const reward =
          Number(
            task.reward_qexc || 0
          );


        card.innerHTML = `
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
              Complete করুন এবং reward নিন
            </div>
          </div>

          <div class="task-reward">
            +${formatNumber(
              reward
            )}
            <small>QEXC</small>
          </div>

          <button
            class="secondary-btn task-btn"
            type="button"
            data-task-id="${escapeHTML(
              task.id
            )}"
          >
            Start
          </button>
        `;


        const button =
          card.querySelector(
            ".task-btn"
          );


        button.addEventListener(
          "click",
          () => {

            completeTask(
              task,
              card,
              button
            );
          }
        );


        container.appendChild(
          card
        );
      }
    );
  }


  /* =========================
     COMPLETE TASK
  ========================= */

  async function completeTask(
    task,
    card,
    button
  ) {

    if (
      !task?.id ||
      !button
    ) {
      return;
    }


    if (
      button.dataset.processing ===
      "true"
    ) {
      return;
    }


    button.dataset.processing =
      "true";

    button.disabled =
      true;

    button.textContent =
      "Checking...";


    haptic("light");


    try {

      if (task.url) {

        try {

          if (tg?.openLink) {

            tg.openLink(
              task.url
            );

          } else {

            window.open(
              task.url,
              "_blank",
              "noopener,noreferrer"
            );
          }

        } catch (_) {}
      }


      await delay(
        task.url
          ? 1200
          : 300
      );


      const data =
        await apiRequest(
          `/tasks/${encodeURIComponent(
            task.id
          )}/complete`,
          {
            method: "POST",
            body: JSON.stringify({})
          }
        );


      if (
        data?.balance_qexc !==
        undefined
      ) {

        state.wallet.balance_qexc =
          Number(
            data.balance_qexc
          );
      }


      button.textContent =
        "Completed";


      button.classList.add(
        "success"
      );


      showToast(
        `Task complete! +${formatNumber(
          task.reward_qexc
        )} QEXC`,
        "success"
      );


      haptic("success");


      await Promise.all([
        loadWallet(),
        loadTransactions(),
        loadTasks()
      ]);


    } catch (error) {

      console.error(
        "Task completion error:",
        error
      );


      button.disabled =
        false;

      button.dataset.processing =
        "false";

      button.textContent =
        "Start";


      showToast(
        error.message ||
        "Task complete করা যায়নি",
        "error"
      );


      haptic("error");
    }
  }


  /* =========================
     DAILY BONUS
     ========================= */

  async function claimDailyBonus() {

    /*
      Local protection:
      If already claimed, don't even
      call the backend again.
    */

    if (
      state.dailyBonus.claimed &&
      Date.now() <
        state.dailyBonus.nextClaimAt
    ) {

      updateDailyBonusUI();

      showToast(
        `পরের Daily Bonus পাবেন ${formatCountdown(
          state.dailyBonus.nextClaimAt -
          Date.now()
        )} পরে`,
        "warning"
      );

      haptic("warning");

      return;
    }


    const buttons =
      getDailyButtons();


    buttons.forEach(
      button => {

        button.disabled =
          true;

        button.textContent =
          "Checking...";
      }
    );


    try {

      const data =
        await apiRequest(
          "/rewards/daily",
          {
            method: "POST",
            body: JSON.stringify({})
          }
        );


      if (
        data?.balance_qexc !==
        undefined
      ) {

        state.wallet.balance_qexc =
          Number(
            data.balance_qexc
          );
      }


      /*
        IMPORTANT:
        Successful backend response means
        bonus was actually granted.

        Start countdown until next
        Bangladesh calendar day.
      */

      markDailyBonusClaimed();


      showToast(
        `Daily Bonus পেয়েছেন! +${DAILY_BONUS_QEXC} QEXC`,
        "success"
      );


      haptic("success");


      await Promise.all([
        loadWallet(),
        loadTransactions()
      ]);


      updateDailyBonusUI();


    } catch (error) {

      console.error(
        "Daily bonus error:",
        error
      );


      /*
        Backend says already claimed.
        We don't give another reward.

        Start local timer until next
        Bangladesh midnight.
      */

      const message =
        String(
          error.message || ""
        ).toLowerCase();


      if (
        message.includes(
          "already"
        ) ||
        message.includes(
          "claimed"
        ) ||
        message.includes(
          "today"
        ) ||
        message.includes(
          "bonus"
        )
      ) {

        state.dailyBonus = {
          claimed: true,
          nextClaimAt:
            getNextBangladeshMidnight()
        };


        saveDailyBonusState();

        updateDailyBonusUI();


        showToast(
          `আজকের bonus নেওয়া হয়েছে। আবার পাবেন ${formatCountdown(
            state.dailyBonus.nextClaimAt -
            Date.now()
          )} পরে`,
          "warning"
        );

      } else {

        showToast(
          error.message ||
          "আজকের bonus নেওয়া যায়নি",
          "error"
        );


        /*
          Restore button only if
          there was an actual error.
        */

        buttons.forEach(
          button => {

            button.disabled =
              false;

            button.textContent =
              "Daily Bonus নিন";
          }
        );
      }


      haptic("error");

    }
  }


  /* =========================
     REWARDED AD
     ========================= */

  async function watchAd() {

    /*
      VERY IMPORTANT:

      বর্তমানে QEXUS-এ কোনো real rewarded
      ad network connected নেই।

      তাই frontend থেকে সরাসরি
      /rewards/ad call করা হবে না।

      এতে user শুধু button চাপেই
      +3 QEXC পেয়ে যাবে না।
    */

    const button =
      $('[data-action="watch-ad"]');


    const status =
      $("#adStatus");


    if (
      state.ad.processing
    ) {
      return;
    }


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
        "এই মুহূর্তে কোনো rewarded ad available নেই।";
    }


    showToast(
      "এখনো Rewarded Ad চালু করা হয়নি। তাই reward দেওয়া হবে না।",
      "warning"
    );


    haptic("warning");


    /*
      NO API CALL HERE.

      Therefore:
      Button click = 0 QEXC
      Fake reward = impossible
    */


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


  /* =========================
     WITHDRAWAL
  ========================= */

  function openWithdrawModal() {

    const modal =
      $("#withdrawModal");


    if (!modal) {
      return;
    }


    renderWallet();


    const available =
      qexcToBDT(
        state.wallet.balance_qexc
      );


    if ($("#withdrawAvailable")) {

      $("#withdrawAvailable")
        .textContent =
        formatBDT(
          available
        );
    }


    if ($("#withdrawAmount")) {

      $("#withdrawAmount")
        .value = "";
    }


    if ($("#withdrawNumber")) {

      $("#withdrawNumber")
        .value = "";
    }


    state.selectedWithdrawMethod =
      "bKash";


    $$(".method-btn")
      .forEach(button => {

        button.classList.toggle(
          "active",
          button.dataset.method ===
          "bKash"
        );
      });


    modal.classList.add(
      "show"
    );


    document.body.classList.add(
      "modal-open"
    );


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


    document.body.classList.remove(
      "modal-open"
    );
  }


  function selectWithdrawMethod(
    method
  ) {

    if (
      ![
        "bKash",
        "Nagad"
      ].includes(method)
    ) {
      return;
    }


    state.selectedWithdrawMethod =
      method;


    $$(".method-btn")
      .forEach(button => {

        button.classList.toggle(
          "active",
          button.dataset.method ===
          method
        );
      });


    haptic("light");
  }


  function updateWithdrawButton() {

    const amountInput =
      $("#withdrawAmount");


    const button =
      $("#withdrawSubmit");


    if (
      !amountInput ||
      !button
    ) {
      return;
    }


    const amount =
      Number(
        amountInput.value || 0
      );


    const available =
      qexcToBDT(
        state.wallet.balance_qexc
      );


    button.disabled =
      amount < 100 ||
      amount > available;
  }


  async function submitWithdrawal() {

    const amountInput =
      $("#withdrawAmount");


    const numberInput =
      $("#withdrawNumber");


    const submitButton =
      $("#withdrawSubmit");


    if (
      !amountInput ||
      !numberInput
    ) {
      return;
    }


    const amount =
      Number(
        amountInput.value || 0
      );


    const number =
      String(
        numberInput.value || ""
      )
        .replace(
          /\s+/g,
          ""
        );


    const method =
      state.selectedWithdrawMethod;


    if (
      !Number.isFinite(amount) ||
      amount < 100
    ) {

      showToast(
        "Minimum withdrawal ৳100",
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
      !/^01[3-9]\d{8}$/.test(
        number
      )
    ) {

      showToast(
        "সঠিক ১১ সংখ্যার bKash/Nagad নম্বর দিন",
        "warning"
      );

      return;
    }


    if (
      ![
        "bKash",
        "Nagad"
      ].includes(method)
    ) {

      showToast(
        "Payment method নির্বাচন করুন",
        "warning"
      );

      return;
    }


    if (submitButton) {

      submitButton.disabled =
        true;

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
              amount_bdt:
                amount,

              method:
                method,

              account_number:
                number
            })
          }
        );


      if (
        data?.balance_qexc !==
        undefined
      ) {

        state.wallet.balance_qexc =
          Number(
            data.balance_qexc
          );
      }


      showToast(
        "Withdrawal request পাঠানো হয়েছে!",
        "success"
      );


      haptic("success");


      closeWithdrawModal();


      await Promise.all([
        loadWallet(),
        loadTransactions()
      ]);


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

      if (submitButton) {

        submitButton.disabled =
          false;

        submitButton.textContent =
          "Request Withdrawal";
      }


      updateWithdrawButton();
    }
  }


  /* =========================
     REFERRAL
     ========================= */

  function buildReferralLink() {

    if (!state.user) {
      return "";
    }


    const botUsername =
      "Qexus_Official_Bot";


    const telegramId =
      state.user.telegram_id ||
      state.user.id;


    if (!telegramId) {
      return "";
    }


    return `https://t.me/${botUsername}?start=ref_${telegramId}`;
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
      "Telegram login required";
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
        .writeText(link);


      showToast(
        "Referral link copied!",
        "success"
      );


      haptic("success");


    } catch (_) {

      const input =
        $("#referralLink");


      if (input) {

        input.select();

        document.execCommand(
          "copy"
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

      if (
        tg?.openTelegramLink
      ) {

        const shareUrl =
          `https://t.me/share/url?url=${encodeURIComponent(
            link
          )}&text=${encodeURIComponent(
            "QEXUS-এ join করুন এবং QEXC earn করুন!"
          )}`;


        tg.openTelegramLink(
          shareUrl
        );

        return;
      }


      if (
        navigator.share
      ) {

        await navigator.share({
          title:
            "QEXUS",

          text:
            text,

          url:
            link
        });

        return;
      }


      await navigator.clipboard
        .writeText(link);


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


  /* =========================
     NAVIGATION
     ========================= */

  function navigate(page) {

    if (!page) {
      return;
    }


    const pages =
      $$(".page");


    pages.forEach(
      section => {

        section.classList.toggle(
          "active",

          section.dataset.page ===
            page ||

          section.id ===
            page
        );
      }
    );


    $$(".nav-item")
      .forEach(item => {

        item.classList.toggle(
          "active",

          item.dataset.page ===
          page
        );
      });


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


    if (page === "profile") {

      renderReferral();
    }


    if (page === "earn") {

      updateDailyBonusUI();
    }


    haptic("light");
  }


  /* =========================
     LOADING
  ========================= */

  function setLoadingState(
    isLoading
  ) {

    state.loading =
      isLoading;


    document.body.classList.toggle(
      "is-loading",
      isLoading
    );
  }


  /* =========================
     MODAL
  ========================= */

  function setupModal() {

    const modal =
      $("#withdrawModal");


    if (!modal) {
      return;
    }


    modal.addEventListener(
      "click",
      event => {

        if (
          event.target ===
          modal
        ) {

          closeWithdrawModal();
        }
      }
    );


    const closeButton =
      modal.querySelector(
        '[data-action="close-withdraw"]'
      );


    if (closeButton) {

      closeButton.addEventListener(
        "click",
        closeWithdrawModal
      );
    }


    $$(".method-btn")
      .forEach(button => {

        button.addEventListener(
          "click",
          () => {

            selectWithdrawMethod(
              button.dataset.method
            );
          }
        );
      });


    const amountInput =
      $("#withdrawAmount");


    if (amountInput) {

      amountInput.addEventListener(
        "input",
        updateWithdrawButton
      );
    }


    const submitButton =
      $("#withdrawSubmit");


    if (submitButton) {

      submitButton.addEventListener(
        "click",
        submitWithdrawal
      );
    }
  }


  /* =========================
     ACTIONS
  ========================= */

  function setupActions() {

    document.addEventListener(
      "click",
      event => {

        const target =
          event.target.closest(
            "[data-action]"
          );


        if (!target) {
          return;
        }


        const action =
          target.dataset.action;


        switch (action) {

          case "navigate":

            navigate(
              target.dataset.page
            );

            break;


          case "withdraw":

            openWithdrawModal();

            break;


          case "daily-bonus":

            claimDailyBonus();

            break;


          case "watch-ad":

            watchAd();

            break;


          case "copy-referral":

            copyReferral();

            break;


          case "share-referral":

            shareReferral();

            break;


          case "close-withdraw":

            closeWithdrawModal();

            break;


          case "refresh":

            refreshApp();

            break;
        }
      }
    );


    $$(".nav-item")
      .forEach(item => {

        item.addEventListener(
          "click",
          () => {

            navigate(
              item.dataset.page
            );
          }
        );
      });
  }


  /* =========================
     REFRESH
  ========================= */

  async function refreshApp() {

    try {

      showToast(
        "Refreshing...",
        "default"
      );


      await Promise.all([
        authenticate(),
        loadTransactions(),
        loadTasks()
      ]);


      renderReferral();
      updateDailyBonusUI();


    } catch (error) {

      console.error(
        error
      );
    }
  }


  /* =========================
     VISIBILITY
  ========================= */

  let lastVisibleRefresh = 0;


  document.addEventListener(
    "visibilitychange",
    () => {

      if (
        document.visibilityState !==
        "visible"
      ) {
        return;
      }


      updateDailyBonusUI();


      const now =
        Date.now();


      if (
        now -
          lastVisibleRefresh <
        5000
      ) {
        return;
      }


      lastVisibleRefresh =
        now;


      loadWallet();
      loadTransactions();
      loadTasks();
    }
  );


  /* =========================
     TELEGRAM BACK
  ========================= */

  function setupTelegramBackButton() {

    if (!tg?.BackButton) {
      return;
    }


    tg.BackButton.onClick(
      () => {

        navigate("home");

        tg.BackButton.hide();
      }
    );
  }


  /* =========================
     BOOT
  ========================= */

  async function boot() {

    initTelegram();

    setupActions();
    setupModal();
    setupTelegramBackButton();

    navigate("home");


    const authenticated =
      await authenticate();


    if (!authenticated) {
      return;
    }


    await Promise.all([
      loadWallet(),
      loadTransactions(),
      loadTasks()
    ]);


    renderReferral();

    loadDailyBonusState();
    startDailyBonusTimer();


    console.log(
      "QEXUS initialized successfully."
    );
  }


  /* =========================
     GLOBAL FUNCTIONS
  ========================= */

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

  window.submitWithdrawal =
    submitWithdrawal;

  window.copyReferral =
    copyReferral;

  window.shareReferral =
    shareReferral;

  window.refreshApp =
    refreshApp;


  /* =========================
     START
  ========================= */

  if (
    document.readyState ===
    "loading"
  ) {

    document.addEventListener(
      "DOMContentLoaded",
      boot,
      {
        once: true
      }
    );

  } else {

    boot();
  }

})();
