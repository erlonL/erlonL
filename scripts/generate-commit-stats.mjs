import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const USERNAME = "erlonL";
const OUTPUT = resolve(dirname(fileURLToPath(import.meta.url)), "../assets/commit-stats.svg");
const API_VERSION = "2026-03-10";

function token() {
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN;
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  try {
    return execFileSync("gh", ["auth", "token"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    throw new Error("Set GH_TOKEN or authenticate the GitHub CLI before generating stats.");
  }
}

function rollingYear() {
  const to = new Date();
  const from = new Date(to);
  from.setUTCFullYear(from.getUTCFullYear() - 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

async function contributions() {
  const { from, to } = rollingYear();
  const query = `query($login: String!, $from: DateTime!, $to: DateTime!) {
    user(login: $login) {
      contributionsCollection(from: $from, to: $to) {
        totalCommitContributions
        totalRepositoriesWithContributedCommits
        restrictedContributionsCount
        contributionCalendar {
          totalContributions
          weeks { contributionDays { contributionCount date weekday } }
        }
      }
    }
  }`;

  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
      "User-Agent": `${USERNAME}-profile-readme`,
      "X-GitHub-Api-Version": API_VERSION,
    },
    body: JSON.stringify({ query, variables: { login: USERNAME, from, to } }),
  });

  if (!response.ok) throw new Error(`GitHub GraphQL ${response.status}: ${await response.text()}`);
  const payload = await response.json();
  if (payload.errors) throw new Error(payload.errors.map(({ message }) => message).join("; "));
  return payload.data.user.contributionsCollection;
}

function activity(days) {
  let activeDays = 0;
  let longestStreak = 0;
  let running = 0;

  for (const day of days) {
    if (day.contributionCount > 0) {
      activeDays += 1;
      running += 1;
      longestStreak = Math.max(longestStreak, running);
    } else {
      running = 0;
    }
  }

  let currentStreak = 0;
  for (let index = days.length - 1; index >= 0 && days[index].contributionCount > 0; index -= 1) {
    currentStreak += 1;
  }
  return { activeDays, longestStreak, currentStreak };
}

function color(count) {
  if (count === 0) return "#17343D";
  if (count <= 3) return "#245B55";
  if (count <= 8) return "#2F826C";
  if (count <= 18) return "#55B891";
  return "#9BE3C4";
}

function heatmap(weeks) {
  return weeks.slice(-52).map((week, weekIndex) => week.contributionDays.map((day) => {
    const x = 480 + weekIndex * 13;
    const y = 80 + day.weekday * 16;
    return `<rect x="${x}" y="${y}" width="11" height="11" rx="2" fill="${color(day.contributionCount)}"><title>${day.date}: ${day.contributionCount} contributions</title></rect>`;
  }).join("")).join("");
}

function render(collection) {
  const weeks = collection.contributionCalendar.weeks;
  const days = weeks.flatMap(({ contributionDays }) => contributionDays);
  const { activeDays, longestStreak, currentStreak } = activity(days);
  const total = collection.contributionCalendar.totalContributions.toLocaleString("en-US");
  const commits = collection.totalCommitContributions.toLocaleString("en-US");
  const repos = collection.totalRepositoriesWithContributedCommits.toLocaleString("en-US");
  const currentStreakUnit = currentStreak === 1 ? "DAY" : "DAYS";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 260" role="img" aria-labelledby="title desc">
  <title id="title">GitHub contribution statistics</title>
  <desc id="desc">${total} contributions, ${commits} public commits, ${activeDays} active days, and a longest streak of ${longestStreak} days over the last twelve months.</desc>
  <style>
    .mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}.sans{font-family:Inter,ui-sans-serif,system-ui,sans-serif}
    .pulse{animation:pulse 2.4s ease-in-out infinite}@keyframes pulse{0%,100%{opacity:.35}50%{opacity:1}}
    @media (prefers-reduced-motion:reduce){.pulse{animation:none}}
  </style>
  <rect width="1200" height="260" rx="24" fill="#071A24"/>
  <text x="38" y="43" class="mono" font-size="14" letter-spacing="2" fill="#68D5C8">COMMIT RHYTHM · LAST 12 MONTHS</text>
  <text x="38" y="109" class="sans" font-size="52" font-weight="760" fill="#FFF9EA">${total}</text>
  <text x="38" y="137" class="sans" font-size="15" fill="#AFC4C7">contributions</text>
  <g transform="translate(38 174)" class="sans">
    <text y="0" font-size="22" font-weight="720" fill="#F2A65A">${commits}</text><text y="22" font-size="12" fill="#91A9AD">public commits</text>
    <text x="112" y="0" font-size="22" font-weight="720" fill="#68D5C8">${activeDays}</text><text x="112" y="22" font-size="12" fill="#91A9AD">active days</text>
    <text x="224" y="0" font-size="22" font-weight="720" fill="#9BB8FF">${longestStreak}</text><text x="224" y="22" font-size="12" fill="#91A9AD">day streak</text>
    <text x="326" y="0" font-size="22" font-weight="720" fill="#EADFBF">${repos}</text><text x="326" y="22" font-size="12" fill="#91A9AD">repositories</text>
  </g>
  <text x="480" y="47" class="sans" font-size="14" font-weight="700" fill="#D8E4E4">Contribution activity</text>
  <text x="1155" y="47" text-anchor="end" class="mono" font-size="11" fill="#819A9F">CURRENT STREAK · ${currentStreak} ${currentStreakUnit}</text>
  ${heatmap(weeks)}
  <g transform="translate(965 224)" class="mono" font-size="10" fill="#819A9F">
    <text x="0" y="9">LESS</text>
    <rect x="38" width="11" height="11" rx="2" fill="#17343D"/><rect x="53" width="11" height="11" rx="2" fill="#245B55"/><rect x="68" width="11" height="11" rx="2" fill="#2F826C"/><rect x="83" width="11" height="11" rx="2" fill="#55B891"/><rect class="pulse" x="98" width="11" height="11" rx="2" fill="#9BE3C4"/>
    <text x="116" y="9">MORE</text>
  </g>
  <text x="480" y="233" class="mono" font-size="10" fill="#6F898F">PUBLIC ACTIVITY + OPTED-IN PRIVATE COUNTS · UPDATED DAILY</text>
</svg>
`;
}

const next = render(await contributions());
await mkdir(dirname(OUTPUT), { recursive: true });
let previous = "";
try { previous = await readFile(OUTPUT, "utf8"); } catch {}
if (previous !== next) await writeFile(OUTPUT, next, "utf8");
