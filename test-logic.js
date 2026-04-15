/**
 * test-logic.js
 *
 * Run with: node test-logic.js
 * (Node 18+ required for built-in fetch)
 *
 * Test username: chauhanabhiraj06
 */

const TEST_USERNAME = "chauhanabhiraj06";
const ENDPOINT = "https://leetcode.com/graphql";

// ─── helpers ────────────────────────────────────────────────────────────────

async function gql(query, variables) {
    const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables }),
        credentials: "include",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.errors?.length) throw new Error(json.errors.map(e => e.message).join(", "));
    return json.data;
}

// UTC midnight (seconds) for a given day offset: 0=today, -1=yesterday, -6=6 days ago
function utcMidnight(offsetDays = 0) {
    const now = new Date();
    return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offsetDays) / 1000;
}

// Filter AC submissions to a period and count unique problems (by titleSlug)
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

// ─── STEP 1: probe the actual limit LeetCode honors ─────────────────────────

async function step1_probeLimit() {
    console.group("STEP 1 — Probe recentAcSubmissionList limits");
    const query = `
    query Probe($username: String!, $limit: Int!) {
      recentAcSubmissionList(username: $username, limit: $limit) {
        titleSlug
        timestamp
      }
    }`;

    for (const limit of [20, 40, 100]) {
        const data = await gql(query, { username: TEST_USERNAME, limit });
        const count = data?.recentAcSubmissionList?.length ?? 0;
        console.log(`  limit=${limit} → returned ${count} entries`);
    }
    console.groupEnd();
}

// ─── STEP 2: fetch & count unique problems for own account ──────────────────

async function step2_ownUniqueSolved() {
    console.group(`STEP 2 — Unique problems solved by ${TEST_USERNAME}`);
    const query = `
    query RecentAC($username: String!, $limit: Int!) {
      recentAcSubmissionList(username: $username, limit: $limit) {
        titleSlug
        timestamp
      }
    }`;

    const data = await gql(query, { username: TEST_USERNAME, limit: 100 });
    const submissions = data?.recentAcSubmissionList ?? [];
    console.log(`  Fetched ${submissions.length} recent AC submissions`);

    for (const period of ["today", "yesterday", "week"]) {
        const count = countUniqueSolved(submissions, period);
        console.log(`  ${period}: ${count} unique problems`);
    }

    // Show duplicates if any exist in today's submissions
    const todayStart = utcMidnight(0);
    const todaySubs = submissions.filter(s => Number(s.timestamp) >= todayStart);
    const slugCounts = {};
    for (const s of todaySubs) {
        slugCounts[s.titleSlug] = (slugCounts[s.titleSlug] || 0) + 1;
    }
    const dupes = Object.entries(slugCounts).filter(([, c]) => c > 1);
    if (dupes.length) {
        console.log("  Today's duplicate submissions (same problem submitted multiple times):");
        dupes.forEach(([slug, c]) => console.log(`    ${slug}: ${c} submissions`));
    } else {
        console.log("  No duplicate problems in today's submissions.");
    }
    console.groupEnd();
}

// ─── STEP 3: fetch following list ────────────────────────────────────────────

async function step3_following() {
    console.group(`STEP 3 — Fetch following list for ${TEST_USERNAME}`);
    const query = `
    query Following($username: String!) {
      following(userSlug: $username) {
        users { realName userSlug }
      }
    }`;
    const data = await gql(query, { username: TEST_USERNAME });
    const users = data?.following?.users ?? [];
    console.log(`  Found ${users.length} following:`, users.map(u => u.userSlug));
    console.groupEnd();
    return users;
}

// ─── STEP 4: count unique solved for each follower ───────────────────────────

async function step4_followingUniqueSolved(users) {
    console.group("STEP 4 — Unique problems solved today per follower");
    const query = `
    query RecentAC($username: String!, $limit: Int!) {
      recentAcSubmissionList(username: $username, limit: $limit) {
        titleSlug
        timestamp
      }
    }`;

    const results = [];
    for (const user of users) {
        try {
            const data = await gql(query, { username: user.userSlug, limit: 100 });
            const submissions = data?.recentAcSubmissionList ?? [];
            const count = countUniqueSolved(submissions, "today");
            console.log(`  ✓ ${user.userSlug}: ${count} unique problems today`);
            results.push({ userSlug: user.userSlug, count, ok: true });
        } catch (err) {
            console.warn(`  ✗ ${user.userSlug}: FAILED — ${err.message}`);
            results.push({ userSlug: user.userSlug, count: 0, ok: false });
        }
    }

    const failed = results.filter(r => !r.ok);
    if (failed.length) {
        console.warn(`  ${failed.length} user(s) failed:`, failed.map(r => r.userSlug));
    } else {
        console.log("  All followers fetched successfully.");
    }
    console.groupEnd();
}

// ─── RUN ALL STEPS ────────────────────────────────────────────────────────────

(async () => {
    console.log("=== LeetCode Extension Logic Test ===");
    console.log(`UTC time: ${new Date().toUTCString()}`);
    console.log(`Today UTC midnight: ${new Date(utcMidnight(0) * 1000).toISOString()}`);
    console.log("");

    await step1_probeLimit();
    await step2_ownUniqueSolved();
    const users = await step3_following();
    if (users.length) await step4_followingUniqueSolved(users);

    console.log("=== Done ===");
})();
