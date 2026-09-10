/* =========================================================
   QEXUS — app.js
   Telegram Mini App frontend
   Backend: https://qexus-backend.onrender.com/api
   ========================================================= */

(() => {
  "use strict";

  /* =========================
     CONFIG
  ========================= */

  const API_BASE = "https://qexus-backend.onrender.com/api";

  const tg = window.Telegram?.WebApp || null;

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
    selectedWithdrawMethod: "bKash"
  };


  /* =========================
     TELEGRAM INIT
  ========================= */

  function initTelegram() {
    if (!tg) {
      console.warn("Telegram WebApp is not available.");
      return;
    }

    try {
      tg.ready();
      tg.expand();

      if (tg.setHeaderColor) {
        tg.setHeaderColor("#ffffff");
      }

      if (tg.setBackgroundColor) {
        tg.setBackgroundColor("#f6f8fb");
      }

      if (tg.disableVerticalSwipes) {
        tg.disableVerticalSwipes();
      }
    } catch (error) {
      console.warn("Telegram initialization error:", error);
    }
  }


  /* =========================
     HELPERS
  ========================= */

  const $ = (selector) => document.querySelector(selector);

  const $$ = (selector) => [...document.querySelectorAll(selector)];

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
     TOAST
  ========================= */

  function showToast(message, type = "default") {
    let toast = $("#toast");

    if (!toast) {
      toast = document.createElement("div");
      toast.id = "toast";
      toast.className = "toast";
      document.body.appendChild(toast);
    }

    toast.className = `toast ${type}`;
    toast.textContent = message;

    requestAnimationFrame(() => {
      toast.classList.add("show");
    });

    clearTimeout(window.__qexusToastTimer);

    window.__qexusToastTimer = setTimeout(() => {
      toast.classList.remove("show");
    }, 2800);
  }


  /* =========================
     HAPTIC
  ========================= */

  function haptic(type = "light") {
    try {
      if (!tg?.HapticFeedback) return;

      if (type === "success") {
        tg.HapticFeedback.notificationOccurred("success");
      } else if (type === "error") {
        tg.HapticFeedback.notificationOccurred("error");
      } else if (type === "warning") {
        tg.HapticFeedback.notificationOccurred("warning");
      } else {
        tg.HapticFeedback.impactOccurred("light");
      }
    } catch (_) {}
  }


  /* =========================
     API
  ========================= */

  async function apiRequest(endpoint, options = {}) {
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {})
    };

    /*
      IMPORTANT:
      Never send BOT_TOKEN from frontend.

      Telegram raw initData is used so backend
      can securely validate the Telegram user.
    */

    const initData = tg?.initData || "";

    if (initData) {
      headers["X-Telegram-Init-Data"] = initData;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers
    });

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
        data?.error ||
        `Request failed (${response.status})`;

      throw new Error(message);
    }

    return data;
  }


  /* =========================
     AUTH
  ========================= */

  async function authenticate() {
    try {
      setLoadingState(true);

      const data = await apiRequest("/auth", {
        method: "POST",
        body: JSON.stringify({})
      });

      state.user = data.user || null;

      if (data.wallet) {
        state.wallet = {
          ...state.wallet,
          ...data.wallet
        };
      }

      renderUser();
      renderWallet();

      return true;

    } catch (error) {
      console.error("Auth error:", error);

      /*
        Browser testing outside Telegram can still show
        the interface, but real authentication requires
        Telegram initData.
      */

      if (!tg?.initData) {
        showToast(
          "Telegram-এর ভিতর থেকে QEXUS খুলুন",
          "warning"
        );
      } else {
        showToast(
          error.message || "Login করা যায়নি",
          "error"
        );
      }

      return false;

    } finally {
      setLoadingState(false);
    }
  }


  /* =========================
     USER RENDER
  ========================= */

  function renderUser() {
    const user = state.user;

    if (!user) return;

    const firstName =
      user.first_name ||
      user.username ||
      "User";

    const username =
      user.username
        ? `@${user.username}`
        : "QEXUS User";

    if ($("#userName")) {
      $("#userName").textContent = firstName;
    }

    if ($("#profileName")) {
      $("#profileName").textContent = firstName;
    }

    if ($("#profileUsername")) {
      $("#profileUsername").textContent = username;
    }

    if ($("#profileAvatar")) {
      const avatarLetter =
        String(firstName).charAt(0).toUpperCase();

      $("#profileAvatar").textContent = avatarLetter;
    }

    if ($("#avatar")) {
      $("#avatar").textContent =
        String(firstName).charAt(0).toUpperCase();
    }
  }


  /* =========================
     WALLET
  ========================= */

  async function loadWallet() {
    try {
      const data = await apiRequest("/wallet");

      if (data) {
        state.wallet = {
          ...state.wallet,
          ...data
        };
      }

      renderWallet();

    } catch (error) {
      console.error("Wallet error:", error);
    }
  }


  function renderWallet() {
    const wallet = state.wallet;

    const qexc =
      Number(wallet.balance_qexc || 0);

    const bdt =
      qexcToBDT(qexc);

    if ($("#balanceQEXC")) {
      $("#balanceQEXC").textContent =
        `${formatNumber(qexc)} QEXC`;
    }

    if ($("#balanceBDT")) {
      $("#balanceBDT").textContent =
        formatBDT(bdt);
    }

    if ($("#walletQEXC")) {
      $("#walletQEXC").textContent =
        `${formatNumber(qexc)} QEXC`;
    }

    if ($("#walletBalance")) {
      $("#walletBalance").textContent =
        formatBDT(bdt);
    }

    if ($("#totalEarned")) {
      $("#totalEarned").textContent =
        formatNumber(wallet.total_earned);
    }

    if ($("#totalWithdrawn")) {
      $("#totalWithdrawn").textContent =
        formatNumber(wallet.total_withdrawn);
    }

    if ($("#withdrawAvailable")) {
      $("#withdrawAvailable").textContent =
        formatBDT(bdt);
    }

    updateWithdrawButton();
  }


  /* =========================
     TRANSACTIONS
  ========================= */

  async function loadTransactions() {
    try {
      const data = await apiRequest("/transactions");

      state.transactions =
        Array.isArray(data)
          ? data
          : data?.transactions || [];

      renderTransactions();

    } catch (error) {
      console.error("Transaction error:", error);
      renderTransactions();
    }
  }


  function getTransactionIcon(type) {
    const t = String(type || "").toLowerCase();

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


  function transactionStatusClass(status) {
    const s =
      String(status || "").toLowerCase();

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

    containers.forEach(container => {
      container.innerHTML = "";

      if (!state.transactions.length) {
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
        container.id === "recentTransactions"
          ? state.transactions.slice(0, 5)
          : state.transactions;

      list.forEach(tx => {
        const amount =
          Number(tx.amount_qexc || 0);

        const positive =
          amount > 0 &&
          !String(tx.type || "")
            .toLowerCase()
            .includes("withdraw");

        const status =
          tx.status
            ? `<span class="status ${transactionStatusClass(tx.status)}">
                ${escapeHTML(tx.status)}
              </span>`
            : "";

        const item = document.createElement("div");

        item.className = "transaction";

        item.innerHTML = `
          <div class="transaction-icon">
            ${escapeHTML(getTransactionIcon(tx.type))}
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
                  ? new Date(tx.created_at).toLocaleString("en-BD")
                  : nowText()
              )}
              ${status}
            </div>
          </div>

          <div class="transaction-amount ${
            positive ? "positive" : "negative"
          }">
            ${positive ? "+" : ""}${formatNumber(amount)}
            <small>QEXC</small>
          </div>
        `;

        container.appendChild(item);
      });
    });
  }


  /* =========================
     TASKS
  ========================= */

  async function loadTasks() {
    try {
      const data = await apiRequest("/tasks");

      state.tasks =
        Array.isArray(data)
          ? data
          : data?.tasks || [];

      renderTasks();

    } catch (error) {
      console.error("Task loading error:", error);

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
    const container = $("#taskList");

    if (!container) return;

    container.innerHTML = "";

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

    state.tasks.forEach(task => {
      const card =
        document.createElement("div");

      card.className = "task-card";

      const reward =
        Number(task.reward_qexc || 0);

      card.innerHTML = `
        <div class="task-icon">✓</div>

        <div class="task-info">
          <div class="task-title">
            ${escapeHTML(task.title || "Task")}
          </div>

          <div class="task-meta">
            Complete করুন এবং reward নিন
          </div>
        </div>

        <div class="task-reward">
          +${formatNumber(reward)}
          <small>QEXC</small>
        </div>

        <button
          class="secondary-btn task-btn"
          type="button"
          data-task-id="${escapeHTML(task.id)}"
        >
          Start
        </button>
      `;

      const button =
        card.querySelector(".task-btn");

      button.addEventListener("click", () => {
        completeTask(task, card, button);
      });

      container.appendChild(card);
    });
  }


  /* =========================
     COMPLETE TASK
  ========================= */

  async function completeTask(task, card, button) {
    if (!task?.id || !button) return;

    if (button.dataset.processing === "true") {
      return;
    }

    button.dataset.processing = "true";
    button.disabled = true;
    button.textContent = "Checking...";

    haptic("light");

    try {
      /*
        Open task URL first if available.
      */

      if (task.url) {
        try {
          if (tg?.openLink) {
            tg.openLink(task.url);
          } else {
            window.open(
              task.url,
              "_blank",
              "noopener,noreferrer"
            );
          }
        } catch (_) {}
      }

      /*
        Small delay gives the user time to complete
        an external task before calling backend.
      */

      await delay(
        task.url ? 1200 : 300
      );

      const data =
        await apiRequest(
          `/tasks/${encodeURIComponent(task.id)}/complete`,
          {
            method: "POST",
            body: JSON.stringify({})
          }
        );

      if (data?.balance_qexc !== undefined) {
        state.wallet.balance_qexc =
          Number(data.balance_qexc);
      }

      /*
        IMPORTANT:
        The backend must enforce task completion
        and prevent duplicate rewards.
        Frontend alone cannot provide anti-fraud.
      */

      button.textContent = "Completed";
      button.classList.add("success");

      showToast(
        `Task complete! +${formatNumber(task.reward_qexc)} QEXC`,
        "success"
      );

      haptic("success");

      await Promise.all([
        loadWallet(),
        loadTransactions(),
        loadTasks()
      ]);

    } catch (error) {
      console.error("Task completion error:", error);

      button.disabled = false;
      button.dataset.processing = "false";
      button.textContent = "Start";

      showToast(
        error.message || "Task complete করা যায়নি",
        "error"
      );

      haptic("error");
    }
  }


  /* =========================
     DAILY BONUS
  ========================= */

  async function claimDailyBonus() {
    const buttons =
      $$('[data-action="daily-bonus"]');

    buttons.forEach(button => {
      button.disabled = true;
      button.textContent = "Checking...";
    });

    try {
      const data =
        await apiRequest("/rewards/daily", {
          method: "POST",
          body: JSON.stringify({})
        });

      if (data?.balance_qexc !== undefined) {
        state.wallet.balance_qexc =
          Number(data.balance_qexc);
      }

      showToast(
        "Daily bonus claimed successfully!",
        "success"
      );

      haptic("success");

      await Promise.all([
        loadWallet(),
        loadTransactions()
      ]);

    } catch (error) {
      console.error("Daily bonus error:", error);

      showToast(
        error.message || "আজকের bonus নেওয়া যায়নি",
        "error"
      );

      haptic("error");

    } finally {
      buttons.forEach(button => {
        button.disabled = false;
        button.textContent = "Claim Bonus";
      });
    }
  }


  /* =========================
     REWARDED AD
     ========================= */

  async function watchAd() {
    const button =
      $('[data-action="watch-ad"]');

    const status =
      $("#adStatus");

    if (button) {
      button.disabled = true;
      button.textContent = "Preparing...";
    }

    if (status) {
      status.textContent =
        "Ad প্রস্তুত করা হচ্ছে...";
    }

    try {
      /*
        Current backend endpoint is TEST ONLY.

        Production:
        Real rewarded-ad SDK + server-side
        verification must be added.
      */

      if (status) {
        status.textContent =
          "Reward যাচাই করা হচ্ছে...";
      }

      const data =
        await apiRequest("/rewards/ad", {
          method: "POST",
          body: JSON.stringify({})
        });

      if (data?.balance_qexc !== undefined) {
        state.wallet.balance_qexc =
          Number(data.balance_qexc);
      }

      showToast(
        "Ad reward যোগ হয়েছে!",
        "success"
      );

      haptic("success");

      await Promise.all([
        loadWallet(),
        loadTransactions()
      ]);

      if (status) {
        status.textContent =
          "Reward সফলভাবে যোগ হয়েছে";
      }

    } catch (error) {
      console.error("Ad reward error:", error);

      if (status) {
        status.textContent =
          "এই মুহূর্তে ad reward unavailable";
      }

      showToast(
        error.message || "Ad reward পাওয়া যায়নি",
        "error"
      );

      haptic("error");

    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = "Watch Ad";
      }
    }
  }


  /* =========================
     WITHDRAWAL
  ========================= */

  function openWithdrawModal() {
    const modal = $("#withdrawModal");

    if (!modal) return;

    renderWallet();

    const available =
      qexcToBDT(state.wallet.balance_qexc);

    if ($("#withdrawAvailable")) {
      $("#withdrawAvailable").textContent =
        formatBDT(available);
    }

    if ($("#withdrawAmount")) {
      $("#withdrawAmount").value = "";
    }

    if ($("#withdrawNumber")) {
      $("#withdrawNumber").value = "";
    }

    state.selectedWithdrawMethod = "bKash";

    $$(".method-btn").forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.method === "bKash"
      );
    });

    modal.classList.add("show");
    document.body.classList.add("modal-open");

    haptic("light");
  }


  function closeWithdrawModal() {
    const modal = $("#withdrawModal");

    if (!modal) return;

    modal.classList.remove("show");
    document.body.classList.remove("modal-open");
  }


  function selectWithdrawMethod(method) {
    if (!["bKash", "Nagad"].includes(method)) {
      return;
    }

    state.selectedWithdrawMethod = method;

    $$(".method-btn").forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.method === method
      );
    });

    haptic("light");
  }


  function updateWithdrawButton() {
    const amountInput =
      $("#withdrawAmount");

    const button =
      $("#withdrawSubmit");

    if (!amountInput || !button) return;

    const amount =
      Number(amountInput.value || 0);

    const available =
      qexcToBDT(state.wallet.balance_qexc);

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

    if (!amountInput || !numberInput) {
      return;
    }

    const amount =
      Number(amountInput.value || 0);

    const number =
      String(numberInput.value || "")
        .replace(/\s+/g, "");

    const method =
      state.selectedWithdrawMethod;


    /* Minimum */

    if (!Number.isFinite(amount) || amount < 100) {
      showToast(
        "Minimum withdrawal ৳100",
        "warning"
      );
      return;
    }


    /* Balance */

    const available =
      qexcToBDT(state.wallet.balance_qexc);

    if (amount > available) {
      showToast(
        "আপনার balance যথেষ্ট নয়",
        "warning"
      );
      return;
    }


    /* Bangladesh mobile */

    if (!/^01[3-9]\d{8}$/.test(number)) {
      showToast(
        "সঠিক ১১ সংখ্যার bKash/Nagad নম্বর দিন",
        "warning"
      );
      return;
    }


    if (!["bKash", "Nagad"].includes(method)) {
      showToast(
        "Payment method নির্বাচন করুন",
        "warning"
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
        await apiRequest("/withdrawals", {
          method: "POST",
          body: JSON.stringify({
            amount_bdt: amount,
            method,
            account_number: number
          })
        });


      /*
        Backend locks/deducts balance.
      */

      if (data?.balance_qexc !== undefined) {
        state.wallet.balance_qexc =
          Number(data.balance_qexc);
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
        submitButton.disabled = false;
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

    if (!telegramId) return "";

    return `https://t.me/${botUsername}?start=ref_${telegramId}`;
  }


  function renderReferral() {
    const input =
      $("#referralLink");

    if (!input) return;

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
      await navigator.clipboard.writeText(link);

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
        document.execCommand("copy");
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
      if (tg?.openTelegramLink) {
        const shareUrl =
          `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent("QEXUS-এ join করুন এবং QEXC earn করুন!")}`;

        tg.openTelegramLink(shareUrl);
        return;
      }

      if (navigator.share) {
        await navigator.share({
          title: "QEXUS",
          text,
          url: link
        });

        return;
      }

      await navigator.clipboard.writeText(link);

      showToast(
        "Referral link copied!",
        "success"
      );

    } catch (error) {
      console.log("Share cancelled:", error);
    }
  }


  /* =========================
     NAVIGATION
  ========================= */

  function navigate(page) {
    if (!page) return;

    const pages =
      $$(".page");

    pages.forEach(section => {
      section.classList.toggle(
        "active",
        section.dataset.page === page ||
        section.id === page
      );
    });


    $$(".nav-item").forEach(item => {
      item.classList.toggle(
        "active",
        item.dataset.page === page
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

    haptic("light");
  }


  /* =========================
     LOADING
  ========================= */

  function setLoadingState(isLoading) {
    state.loading = isLoading;

    document.body.classList.toggle(
      "is-loading",
      isLoading
    );
  }


  /* =========================
     MODAL EVENTS
  ========================= */

  function setupModal() {
    const modal =
      $("#withdrawModal");

    if (!modal) return;

    modal.addEventListener("click", event => {
      if (event.target === modal) {
        closeWithdrawModal();
      }
    });


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


    $$(".method-btn").forEach(button => {
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
     GLOBAL CLICK ACTIONS
  ========================= */

  function setupActions() {
    document.addEventListener("click", event => {
      const target =
        event.target.closest("[data-action]");

      if (!target) return;

      const action =
        target.dataset.action;

      switch (action) {

        case "navigate":
          navigate(target.dataset.page);
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
    });


    /*
      Bottom navigation
    */

    $$(".nav-item").forEach(item => {
      item.addEventListener("click", () => {
        navigate(item.dataset.page);
      });
    });
  }


  /* =========================
     REFRESH APP
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

    } catch (error) {
      console.error(error);
    }
  }


  /* =========================
     VISIBILITY REFRESH
  ========================= */

  let lastVisibleRefresh = 0;

  document.addEventListener(
    "visibilitychange",
    () => {

      if (
        document.visibilityState !== "visible"
      ) {
        return;
      }

      const now =
        Date.now();

      /*
        Prevent repeated API calls when Telegram
        fires visibility events rapidly.
      */

      if (
        now - lastVisibleRefresh <
        5000
      ) {
        return;
      }

      lastVisibleRefresh = now;

      /*
        Refresh server state when user returns.
        This ensures the frontend doesn't rely on
        old local wallet data.
      */

      loadWallet();
      loadTransactions();
      loadTasks();
    }
  );


  /* =========================
     BACK BUTTON
  ========================= */

  function setupTelegramBackButton() {
    if (!tg?.BackButton) return;

    tg.BackButton.onClick(() => {
      navigate("home");
      tg.BackButton.hide();
    });
  }


  /* =========================
     UTILITY
  ========================= */

  function delay(ms) {
    return new Promise(resolve =>
      setTimeout(resolve, ms)
    );
  }


  /* =========================
     INITIAL LOAD
  ========================= */

  async function boot() {
    initTelegram();

    setupActions();
    setupModal();
    setupTelegramBackButton();

    /*
      Home first
    */

    navigate("home");

    /*
      Authentication first.
    */

    const authenticated =
      await authenticate();

    if (!authenticated) {
      return;
    }

    /*
      Load all server data.
    */

    await Promise.all([
      loadWallet(),
      loadTransactions(),
      loadTasks()
    ]);

    renderReferral();

    console.log(
      "QEXUS initialized successfully."
    );
  }


  /* =========================
     GLOBAL FUNCTIONS
     ========================= */

  /*
    These are kept global so old HTML
    onclick attributes continue to work.
  */

  window.navigate = navigate;
  window.watchAd = watchAd;
  window.claimDailyBonus = claimDailyBonus;
  window.openWithdrawModal = openWithdrawModal;
  window.closeWithdrawModal = closeWithdrawModal;
  window.submitWithdrawal = submitWithdrawal;
  window.copyReferral = copyReferral;
  window.shareReferral = shareReferral;
  window.refreshApp = refreshApp;


  /* =========================
     START
  ========================= */

  if (
    document.readyState === "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      boot,
      { once: true }
    );
  } else {
    boot();
  }

})();
