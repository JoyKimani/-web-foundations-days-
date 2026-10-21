const noteText = document.querySelector("#note-text");
const charCount = document.querySelector("#char-count");
const wordCount = document.querySelector("#word-count");
const clearButton = document.querySelector("#clear-btn");
const themeToggle = document.querySelector("#theme-toggle");

const DRAFT_KEY = "quicknotes-day4-draft";
const THEME_KEY = "quicknotes-day4-theme";

function updateCounts() {
  const characterTotal = noteText.value.length;
  const words = noteText.value.trim().match(/\S+/g) || [];

  charCount.textContent = `${characterTotal} / 200 characters`;
  wordCount.textContent = `${words.length} ${words.length === 1 ? "word" : "words"}`;
  charCount.classList.remove("warning", "over");

  if (characterTotal > 200) {
    charCount.classList.add("over");
  } else if (characterTotal > 180) {
    charCount.classList.add("warning");
  }
}

function saveDraft() {
  try {
    localStorage.setItem(DRAFT_KEY, noteText.value);
  } catch {
    // The editor remains usable when storage is unavailable.
  }
}

function clearNote() {
  noteText.value = "";
  updateCounts();

  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Clearing the visible note does not depend on storage.
  }
}

function setTheme(isDark) {
  document.body.classList.toggle("dark", isDark);
  themeToggle.textContent = isDark ? "Light mode" : "Dark mode";
  themeToggle.setAttribute("aria-pressed", String(isDark));
}

noteText.addEventListener("input", () => {
  updateCounts();
  saveDraft();
});

clearButton.addEventListener("click", clearNote);

noteText.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    clearNote();
  }
});

themeToggle.addEventListener("click", () => {
  const isDark = !document.body.classList.contains("dark");
  setTheme(isDark);

  try {
    localStorage.setItem(THEME_KEY, isDark ? "dark" : "light");
  } catch {
    // The theme can still be toggled for the current page session.
  }
});

try {
  noteText.value = localStorage.getItem(DRAFT_KEY) || "";
  setTheme(localStorage.getItem(THEME_KEY) === "dark");
} catch {
  setTheme(false);
}

updateCounts();