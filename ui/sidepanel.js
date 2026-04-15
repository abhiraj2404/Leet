const endpoint = "https://leetcode.com/graphql";

async function graphQLRequest(query, variables) {
    const response = await fetch(endpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ query, variables }),
        credentials: "include",
    });

    if (!response.ok) {
        throw new Error(`Network error: ${response.status}`);
    }

    const json = await response.json();

    if (json.errors && json.errors.length) {
        const message = json.errors.map((e) => e.message).join(", ");
        throw new Error(message || "GraphQL error");
    }

    return json.data;
}

async function fetchFollowing(username) {
    const query = `
    query Following($username: String!) {
      following(userSlug: $username) {
        users {
          realName
          userSlug
          userAvatar
        }
      }
    }
  `;

    const data = await graphQLRequest(query, { username });
    return data?.following?.users ?? [];
}

// UTC midnight (seconds) for a given day offset: 0=today, -1=yesterday, -6=6 days ago.
function utcMidnight(offsetDays = 0) {
    const now = new Date();
    return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offsetDays) / 1000;
}

// Count unique problems solved in a period from a list of AC submissions.
// Deduplicates by titleSlug so re-submissions of the same problem count once.
// Note: recentAcSubmissionList is hard-capped at 20 by LeetCode regardless of limit.
function countUniqueSolved(submissions, period) {
    const start = utcMidnight(period === "yesterday" ? -1 : period === "week" ? -6 : 0);
    const end   = period === "yesterday" ? utcMidnight(0) : Infinity;

    const seen = new Set();
    for (const s of submissions) {
        const t = Number(s.timestamp);
        if (t >= start && t < end) {
            seen.add(s.titleSlug);
        }
    }
    return seen.size;
}

async function fetchUserPeriodCount(userSlug, period) {
    const query = `
    query RecentAC($username: String!) {
      recentAcSubmissionList(username: $username, limit: 20) {
        titleSlug
        timestamp
      }
    }
  `;

    const data = await graphQLRequest(query, { username: userSlug });
    const submissions = data?.recentAcSubmissionList ?? [];
    return countUniqueSolved(submissions, period);
}

async function fetchUserContestRating(userSlug) {
    const query = `
    query userContestRankingInfo($username: String!) {
      userContestRanking(username: $username) {
        rating
        attendedContestsCount
        globalRanking
      }
    }
  `;
    const data = await graphQLRequest(query, { username: userSlug });
    const r = data?.userContestRanking?.rating;
    return typeof r === "number" ? r : null;
}

async function fetchContestRatingsForFollowing(username, onProgress) {
    const following = await fetchFollowing(username);
    if (!following.length) return [];

    const results = [];
    let processed = 0;

    for (const user of following) {
        let rating = null;
        try {
            rating = await fetchUserContestRating(user.userSlug);
        } catch (err) {
            console.warn(`Failed to fetch rating for ${user.userSlug}:`, err.message);
        }
        results.push({
            userSlug: user.userSlug,
            realName: user.realName,
            rating,
        });
        processed += 1;
        if (onProgress) onProgress(processed, following.length);
    }

    results.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
    return results;
}

async function fetchDailyCountsForFollowing(username, period, onProgress) {
    const following = await fetchFollowing(username);

    if (!following.length) {
        return [];
    }

    const results = [];
    let processed = 0;

    for (const user of following) {
        let count = 0;
        try {
            count = await fetchUserPeriodCount(user.userSlug, period);
        } catch (err) {
            console.warn(`Failed to fetch data for ${user.userSlug}:`, err.message);
        }
        results.push({
            userSlug: user.userSlug,
            realName: user.realName,
            count,
        });
        processed += 1;

        if (onProgress) {
            onProgress(processed, following.length);
        }
    }

    results.sort((a, b) => b.count - a.count);
    return results;
}

function setStatus(message, type = "info") {
    const el = document.getElementById("status");
    if (!el) return;

    el.textContent = message;
    el.classList.remove(
        "lc-status--info",
        "lc-status--error",
        "lc-status--success"
    );

    if (type === "error") {
        el.classList.add("lc-status", "lc-status--error");
    } else if (type === "success") {
        el.classList.add("lc-status", "lc-status--success");
    } else {
        el.classList.add("lc-status", "lc-status--info");
    }
}

function renderResults(username, items, period, mode = "questions") {
    const section = document.getElementById("results-section");
    const list = document.getElementById("results-body");
    const refreshEl = document.getElementById("results-refresh-time");
    const emptyState = document.getElementById("empty-state");

    if (!section || !list || !refreshEl || !emptyState) return;

    const periodLabel = period === "yesterday" ? "yesterday" : period === "week" ? "this week" : "today";

    if (!items.length) {
        section.classList.remove("hidden");
        list.innerHTML = "";
        emptyState.classList.remove("hidden");
        emptyState.textContent = mode === "rating"
            ? "No contest data found for your following list."
            : `No solves ${periodLabel} from your following list.`;
        const now = new Date();
        refreshEl.textContent = `Last updated ${now.toLocaleTimeString()}`;
        return;
    }

    emptyState.classList.add("hidden");
    section.classList.remove("hidden");
    list.innerHTML = "";

    for (const item of items) {
        const row = document.createElement("div");
        row.className = item.isCurrentUser ? "lc-row lc-row-you" : "lc-row";

        const userWrapper = document.createElement("div");
        userWrapper.className = "lc-user-cell";

        const slugLink = document.createElement("a");
        slugLink.className = item.isCurrentUser ? "lc-user-slug lc-user-you" : "lc-user-slug";
        slugLink.textContent = item.isCurrentUser ? "You" : item.userSlug;
        slugLink.href = `https://leetcode.com/u/${item.userSlug}/`;
        slugLink.target = "_blank";
        slugLink.rel = "noopener noreferrer";

        const realNameSpan = document.createElement("span");
        realNameSpan.className = "lc-user-realname";
        realNameSpan.textContent = item.isCurrentUser ? item.userSlug : (item.realName || "");

        userWrapper.appendChild(slugLink);
        userWrapper.appendChild(realNameSpan);
        row.appendChild(userWrapper);

        const countEl = document.createElement("span");
        if (mode === "rating") {
            const r = item.rating;
            countEl.className = "lc-count-pill" + (r === null ? " lc-count-pill-zero" : "");
            countEl.textContent = r !== null ? Math.round(r).toString() : "—";
        } else {
            countEl.className = "lc-count-pill" + (item.count === 0 ? " lc-count-pill-zero" : "");
            countEl.textContent = item.count.toString();
        }

        row.appendChild(countEl);
        list.appendChild(row);
    }

    const now = new Date();
    refreshEl.textContent = `Last updated ${now.toLocaleTimeString()}`;
}

// ── Cache ─────────────────────────────────────────────────────────────────────
// Both datasets are fetched together on load; tab switches just re-render from
// this cache without any network requests.
const dataCache = {
    username: null,
    period: null,
    questions: null,  // sorted array of { userSlug, realName, count, isCurrentUser }
    ratings: null,    // sorted array of { userSlug, realName, rating, isCurrentUser }
};

function clearResultsUI() {
    const list = document.getElementById("results-body");
    const section = document.getElementById("results-section");
    if (list) list.innerHTML = "";
    if (section) section.classList.add("hidden");
}

function getActiveMode() {
    return document.querySelector(".lc-mode-btn--active")?.dataset.mode ?? "questions";
}

function renderFromCache() {
    if (!dataCache.username) return;
    const mode = getActiveMode();
    const items = mode === "rating" ? dataCache.ratings : dataCache.questions;
    renderResults(dataCache.username, items ?? [], dataCache.period, mode);
}

// Build a sorted questions array for a given period.
async function buildQuestionsItems(username, period, onProgress) {
    const myCount = await fetchUserPeriodCount(username, period);
    const items = await fetchDailyCountsForFollowing(username, period, onProgress);
    const all = [
        { userSlug: username, realName: "", count: myCount, isCurrentUser: true },
        ...items,
    ];
    all.sort((a, b) => b.count - a.count);
    return all;
}

// Build a sorted ratings array.
async function buildRatingsItems(username) {
    let myRating = null;
    try { myRating = await fetchUserContestRating(username); } catch (e) {
        console.warn(`Failed to fetch own rating for ${username}:`, e.message);
    }
    const items = await fetchContestRatingsForFollowing(username);
    const all = [
        { userSlug: username, realName: "", rating: myRating, isCurrentUser: true },
        ...items,
    ];
    all.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
    return all;
}

// Fetch questions + ratings together, then render the active tab.
async function loadAll(username, period) {
    const trimmed = username.trim();
    if (!trimmed) { setStatus("Please enter a username.", "error"); return; }

    clearResultsUI();
    setStatus("Loading data…", "info");

    const [qRes, rRes] = await Promise.allSettled([
        buildQuestionsItems(trimmed, period, (done, total) => {
            setStatus(`Loading data… ${done}/${total}`, "info");
        }),
        buildRatingsItems(trimmed),
    ]);

    dataCache.username = trimmed;
    dataCache.period   = period;
    dataCache.questions = qRes.status === "fulfilled" ? qRes.value : [];
    dataCache.ratings   = rRes.status === "fulfilled" ? rRes.value : [];

    if (qRes.status === "rejected") console.error("Questions load failed:", qRes.reason);
    if (rRes.status === "rejected") console.error("Ratings load failed:", rRes.reason);

    const periodLabel = period === "yesterday" ? "yesterday" : period === "week" ? "this week" : "today";
    if (qRes.status === "rejected" && rRes.status === "rejected") {
        setStatus("Failed to load data. Check the username or try again later.", "error");
    } else if (dataCache.questions.length <= 1 && dataCache.ratings.length <= 1) {
        setStatus("No following users found for this username.", "info");
    } else {
        setStatus(`Loaded solves for ${periodLabel} · contest ratings.`, "success");
    }

    renderFromCache();
}

// Period changed: only re-fetch questions (ratings don't depend on period).
async function reloadQuestions(username, period) {
    const trimmed = username.trim();
    if (!trimmed) return;

    clearResultsUI();
    setStatus("Loading questions…", "info");

    try {
        dataCache.questions = await buildQuestionsItems(trimmed, period, (done, total) => {
            setStatus(`Loading questions… ${done}/${total}`, "info");
        });
        dataCache.period = period;
        const periodLabel = period === "yesterday" ? "yesterday" : period === "week" ? "this week" : "today";
        setStatus(`Loaded solves for ${periodLabel}.`, "success");
    } catch (err) {
        console.error(err);
        setStatus("Failed to load questions.", "error");
        dataCache.questions = [];
    }

    renderFromCache();
}

document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("username-form");
    const input = document.getElementById("username-input");
    const periodSelect = document.getElementById("period-select");
    const modeButtons = document.querySelectorAll(".lc-mode-btn");

    if (!(form instanceof HTMLFormElement) || !(input instanceof HTMLInputElement)) {
        return;
    }

    function getSelectedPeriod() {
        return periodSelect instanceof HTMLSelectElement ? periodSelect.value : "today";
    }

    // Tab switch: instant re-render from cache, no network request.
    modeButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
            modeButtons.forEach((b) => b.classList.remove("lc-mode-btn--active"));
            btn.classList.add("lc-mode-btn--active");

            if (periodSelect instanceof HTMLSelectElement) {
                periodSelect.classList.toggle("hidden", btn.dataset.mode === "rating");
            }

            renderFromCache();
        });
    });

    if (chrome?.storage?.local) {
        chrome.storage.local.get(["leetcodeUsername"], (result) => {
            const saved = result.leetcodeUsername;
            if (typeof saved === "string" && saved.trim()) {
                input.value = saved;
                loadAll(saved, getSelectedPeriod());
            } else {
                setStatus("Enter your LeetCode username to get started.", "info");
            }
        });
    } else {
        setStatus("Browser storage unavailable. Data won't be remembered.", "error");
    }

    form.addEventListener("submit", (event) => {
        event.preventDefault();
        const username = input.value.trim();
        if (!username) { setStatus("Please enter a username.", "error"); return; }

        if (chrome?.storage?.local) {
            chrome.storage.local.set({ leetcodeUsername: username });
        }

        loadAll(username, getSelectedPeriod());
    });

    if (periodSelect instanceof HTMLSelectElement) {
        periodSelect.addEventListener("change", () => {
            const username = input.value.trim();
            if (username) reloadQuestions(username, getSelectedPeriod());
        });
    }
});


