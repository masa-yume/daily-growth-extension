/**
 * 每日成长 Daily Growth — popup 逻辑
 * 数据保存在 chrome.storage.local，跨刷新/重启持久化。
 */

const STORAGE_KEY = "dailyGrowth";

/** @typedef {{ id: string, name: string, createdAt: number }} Habit */
/** @typedef {{ habits: Habit[], completedIds: string[], date: string }} AppData */

const els = {
  todayDate: document.getElementById("todayDate"),
  doneCount: document.getElementById("doneCount"),
  totalCount: document.getElementById("totalCount"),
  progressFill: document.getElementById("progressFill"),
  progressBar: document.getElementById("progressBar"),
  progressHint: document.getElementById("progressHint"),
  addForm: document.getElementById("addForm"),
  habitInput: document.getElementById("habitInput"),
  formError: document.getElementById("formError"),
  habitList: document.getElementById("habitList"),
  emptyState: document.getElementById("emptyState"),
};

/** @type {AppData} */
let state = {
  habits: [],
  completedIds: [],
  date: getTodayKey(),
};

function getTodayKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDisplayDate(dateKey) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
  const date = new Date(y, m - 1, d);
  return `${y}年${m}月${d}日 星期${weekdays[date.getDay()]}`;
}

function createId() {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `h_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * 跨日时重置今日打卡，保留习惯列表
 * @param {Partial<AppData>} raw
 * @returns {AppData}
 */
function normalizeData(raw) {
  const today = getTodayKey();
  const habits = Array.isArray(raw?.habits) ? raw.habits : [];
  const date = typeof raw?.date === "string" ? raw.date : today;
  const completedIds = Array.isArray(raw?.completedIds) ? raw.completedIds : [];

  if (date !== today) {
    return { habits, completedIds: [], date: today };
  }

  const habitIds = new Set(habits.map((h) => h.id));
  return {
    habits,
    completedIds: completedIds.filter((id) => habitIds.has(id)),
    date: today,
  };
}

function loadData() {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEY], (result) => {
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError);
        resolve(normalizeData({}));
        return;
      }
      resolve(normalizeData(result[STORAGE_KEY] || {}));
    });
  });
}

function saveData() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [STORAGE_KEY]: state }, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      resolve();
    });
  });
}

function showError(message) {
  els.formError.textContent = message;
  els.formError.hidden = !message;
}

function updateProgress() {
  const total = state.habits.length;
  const done = state.completedIds.length;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);

  els.doneCount.textContent = String(done);
  els.totalCount.textContent = String(total);
  els.progressFill.style.width = `${percent}%`;
  els.progressBar.setAttribute("aria-valuenow", String(percent));

  if (total === 0) {
    els.progressHint.textContent = "添加习惯，开始今天的成长吧";
  } else if (done === 0) {
    els.progressHint.textContent = "点击圆圈即可打卡，再点一次可取消";
  } else if (done < total) {
    els.progressHint.textContent = `已完成 ${percent}%，继续加油`;
  } else {
    els.progressHint.textContent = "今日全部完成，真棒！";
  }
}

function renderList() {
  els.habitList.innerHTML = "";
  const hasHabits = state.habits.length > 0;
  els.emptyState.hidden = hasHabits;

  state.habits.forEach((habit) => {
    const checked = state.completedIds.includes(habit.id);
    const li = document.createElement("li");
    li.className = `habit-item${checked ? " done" : ""}`;
    li.dataset.id = habit.id;

    const checkBtn = document.createElement("button");
    checkBtn.type = "button";
    checkBtn.className = `check-btn${checked ? " checked" : ""}`;
    checkBtn.setAttribute("aria-label", checked ? `取消打卡：${habit.name}` : `打卡：${habit.name}`);
    checkBtn.setAttribute("aria-pressed", checked ? "true" : "false");
    checkBtn.addEventListener("click", () => toggleCheck(habit.id));

    const name = document.createElement("span");
    name.className = "habit-name";
    name.textContent = habit.name;

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "delete-btn";
    deleteBtn.setAttribute("aria-label", `删除习惯：${habit.name}`);
    deleteBtn.title = "删除";
    deleteBtn.textContent = "×";
    deleteBtn.addEventListener("click", () => deleteHabit(habit.id));

    li.append(checkBtn, name, deleteBtn);
    els.habitList.appendChild(li);
  });

  updateProgress();
}

async function persistAndRender() {
  await saveData();
  renderList();
}

async function addHabit(name) {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (!trimmed) {
    showError("请输入习惯名称");
    return;
  }
  if (trimmed.length > 30) {
    showError("习惯名称最多 30 个字");
    return;
  }
  const duplicated = state.habits.some(
    (h) => h.name.toLowerCase() === trimmed.toLowerCase()
  );
  if (duplicated) {
    showError("这个习惯已经存在了");
    return;
  }

  showError("");
  state.habits.push({
    id: createId(),
    name: trimmed,
    createdAt: Date.now(),
  });
  els.habitInput.value = "";
  await persistAndRender();
  els.habitInput.focus();
}

async function deleteHabit(id) {
  state.habits = state.habits.filter((h) => h.id !== id);
  state.completedIds = state.completedIds.filter((cid) => cid !== id);
  await persistAndRender();
}

async function toggleCheck(id) {
  const index = state.completedIds.indexOf(id);
  if (index >= 0) {
    state.completedIds.splice(index, 1);
  } else {
    state.completedIds.push(id);
  }
  await persistAndRender();
}

els.addForm.addEventListener("submit", (event) => {
  event.preventDefault();
  addHabit(els.habitInput.value);
});

els.habitInput.addEventListener("input", () => {
  if (!els.formError.hidden) {
    showError("");
  }
});

async function init() {
  els.todayDate.textContent = formatDisplayDate(getTodayKey());
  state = await loadData();

  // 若因跨日重置了打卡，写回存储，保证数据一致
  await saveData();
  renderList();
  els.habitInput.focus();
}

init();
