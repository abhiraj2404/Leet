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

async function fetchUserTodayCount(userSlug) {
    const query = `
    query RecentWithTimestamp($username: String!) {
      recentAcSubmissionList(username: $username, limit: 20) {
        id
        title
        titleSlug
        timestamp
      }
      currentTimestamp
    }
  `;

    const data = await graphQLRequest(query, { username: userSlug });
    const submissions = data?.recentAcSubmissionList ?? [];
    const currentTimestamp = data?.currentTimestamp;

    if (!currentTimestamp) {
        return 0;
    }

    const startOfDay =
        new Date(new Date().setHours(0, 0, 0, 0)).getTime() / 1000;
    const localNow = Date.now() / 1000;
    const timeDiff = localNow - startOfDay;

    let count = 0;
    for (const submission of submissions) {
        if (currentTimestamp - Number(submission.timestamp) < timeDiff) {
            count += 1;
        }
    }

    return count;
}

async function fetchDailyCountsForFollowing(username, onProgress) {
    const following = await fetchFollowing(username);

    if (!following.length) {
        return [];
    }

    const results = [];
    let processed = 0;

    for (const user of following) {
        const todayCount = await fetchUserTodayCount(user.userSlug);
        results.push({
            userSlug: user.userSlug,
            realName: user.realName,
            todayCount,
        });
        processed += 1;

        if (onProgress) {
            onProgress(processed, following.length);
        }
    }

    results.sort((a, b) => b.todayCount - a.todayCount);
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

function renderResults(username, items) {
    const section = document.getElementById("results-section");
    const list = document.getElementById("results-body");
    const refreshEl = document.getElementById("results-refresh-time");
    const emptyState = document.getElementById("empty-state");

    if (!section || !list || !refreshEl || !emptyState) return;

    if (!items.length) {
        section.classList.remove("hidden");
        list.innerHTML = "";
        emptyState.classList.remove("hidden");
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
        countEl.className =
            "lc-count-pill" + (item.todayCount === 0 ? " lc-count-pill-zero" : "");
        countEl.textContent = item.todayCount.toString();

        row.appendChild(countEl);
        list.appendChild(row);
    }

    const now = new Date();
    refreshEl.textContent = `Last updated ${now.toLocaleTimeString()}`;
}

async function loadAndRender(username) {
    const trimmed = username.trim();
    if (!trimmed) {
        setStatus("Please enter a username.", "error");
        return;
    }

    setStatus("Loading your data…", "info");

    try {
        // Fetch user's own count first
        const myCount = await fetchUserTodayCount(trimmed);

        setStatus("Loading following list…", "info");

        const items = await fetchDailyCountsForFollowing(trimmed, (done, total) => {
            setStatus(`Fetching today's solves… ${done}/${total}`, "info");
        });

        // Add user's own entry marked as "isCurrentUser"
        const allItems = [
            {
                userSlug: trimmed,
                realName: "",
                todayCount: myCount,
                isCurrentUser: true,
            },
            ...items,
        ];

        // Sort all by count (user will be sorted with everyone else)
        allItems.sort((a, b) => b.todayCount - a.todayCount);

        if (allItems.length <= 1) {
            setStatus(
                "No following users found for this username, or they have no public data.",
                "info"
            );
        } else {
            setStatus("Loaded daily solves for you and your following.", "success");
        }

        renderResults(trimmed, allItems);
    } catch (err) {
        console.error(err);
        setStatus(
            "Failed to load data. Please check the username or try again later.",
            "error"
        );
    }
}

document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("username-form");
    const input = document.getElementById("username-input");

    if (!(form instanceof HTMLFormElement) || !(input instanceof HTMLInputElement)) {
        return;
    }

    if (chrome?.storage?.local) {
        chrome.storage.local.get([ "leetcodeUsername" ], (result) => {
            const saved = result.leetcodeUsername;
            if (typeof saved === "string" && saved.trim()) {
                input.value = saved;
                loadAndRender(saved);
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
        if (!username) {
            setStatus("Please enter a username.", "error");
            return;
        }

        if (chrome?.storage?.local) {
            chrome.storage.local.set({ leetcodeUsername: username });
        }

        loadAndRender(username);
    });
});


