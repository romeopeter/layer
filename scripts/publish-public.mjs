/**
 * Publishes `main` to the public repo, without the files that stay private.
 *
 * The public repo gets main's own history with the private files cut out of every
 * commit: the same commits, messages, authors and dates, under different IDs. Commits
 * that only changed private files drop out. `git filter-repo` does it in a temporary
 * copy, so this repo's branches and working folder are never touched, and every commit
 * is checked for private files before anything is pushed.
 *
 * Filtering the same history the same way gives the same commits, so each publish adds
 * main's new commits to what's there. Changing PRIVATE changes every commit's ID, and the
 * next publish then has to replace the public history: run it with --replace.
 *
 *   npm run push:public                   shows what would go, then asks
 *   npm run push:public -- --dry-run      shows what would go, and stops
 *   npm run push:public -- --yes          pushes without asking
 *   npm run push:public -- --replace      replaces the public history if it can't be added to
 *
 * What would go is left in the local branch `public-main`: `git log public-main` shows it.
 * Needs git-filter-repo: brew install git-filter-repo.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";

/** What's published. */
const SOURCE = "main";
/** Where it's published: this remote's `main`. */
const REMOTE = "public";
/** The private repo, which `main` should match before anything is published from it. */
const PRIVATE_REMOTE = "private";
/** The local branch that holds the history as it's published, to look through. */
const BRANCH = "public-main";
/** Never published, in any commit. Paths from the repo's root; a folder takes all it holds. */
const PRIVATE = ["AGENTS.md", "implementation.md", "learn"];
/** The most new commits listed before a publish. */
const LISTED = 30;

const OPTIONS = ["--dry-run", "--yes", "--replace"];

class Stop extends Error {}
const stop = (message) => {
  throw new Stop(message);
};

const git = (args, { cwd, env } = {}) =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
  }).trim();
const maybe = (args, options) => {
  try {
    return git(args, options);
  } catch {
    return null;
  }
};
const count = (range) => Number(git(["rev-list", "--count", range]));
const isPrivate = (file) => PRIVATE.some((path) => file === path || file.startsWith(`${path}/`));

/** Main's files less the private ones: what the filtered history has to end with. */
const expectedTree = () => {
  const scratch = mkdtempSync(join(tmpdir(), "layer-publish-index-"));
  try {
    const env = { GIT_INDEX_FILE: join(scratch, "index") };
    git(["read-tree", SOURCE], { env });
    git(["rm", "-r", "--cached", "--quiet", "--ignore-unmatch", "--", ...PRIVATE], { env });
    return git(["write-tree"], { env });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
};

/** Filters main's history in a temporary copy, checks it, and brings it back as BRANCH. */
const filterHistory = () => {
  const scratch = mkdtempSync(join(tmpdir(), "layer-publish-"));
  const copy = join(scratch, "repo");
  try {
    git(["clone", "--quiet", "--no-local", "--no-tags", "--single-branch", "--branch", SOURCE, process.cwd(), copy]);
    git(["filter-repo", "--force", "--invert-paths", ...PRIVATE.flatMap((path) => ["--path", path])], { cwd: copy });

    // Every path in every commit: each commit's changes against each of its parents
    // name every file it has that a parent didn't.
    const log = git(["log", "-m", "--format=", "--name-only", "--no-renames", SOURCE], { cwd: copy });
    const leaked = [...new Set(log.split("\n").filter(isPrivate))];
    if (leaked.length) stop(`private files are still in the filtered history: ${leaked.join(", ")}. Nothing was pushed.`);

    git(["fetch", "--quiet", "--no-tags", copy, `+${SOURCE}:refs/heads/${BRANCH}`]);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
};

const publish = async () => {
  const argv = process.argv.slice(2);
  const unknown = argv.filter((arg) => !OPTIONS.includes(arg));
  if (unknown.length) stop(`unknown option ${unknown.join(" ")}. The options are ${OPTIONS.join(", ")}.`);
  const dryRun = argv.includes("--dry-run");
  const yes = argv.includes("--yes");
  const replace = argv.includes("--replace");

  process.chdir(git(["rev-parse", "--show-toplevel"]));
  const remotes = git(["remote"]).split("\n");
  if (!remotes.includes(REMOTE)) stop(`there's no "${REMOTE}" remote. Add it: git remote add ${REMOTE} <url>`);
  if (!maybe(["rev-parse", "--verify", "--quiet", SOURCE])) stop(`there's no "${SOURCE}" branch.`);
  if (!maybe(["filter-repo", "--version"])) stop("git filter-repo isn't installed. Install it: brew install git-filter-repo");

  // What goes public is what's merged and pushed: main as the private repo has it.
  if (remotes.includes(PRIVATE_REMOTE)) {
    git(["fetch", "--quiet", PRIVATE_REMOTE, SOURCE]);
    const tracking = `${PRIVATE_REMOTE}/${SOURCE}`;
    const behind = count(`${SOURCE}..${tracking}`);
    const ahead = count(`${tracking}..${SOURCE}`);
    if (behind) stop(`${SOURCE} is ${behind} commit(s) behind ${tracking}. Update it: git fetch ${PRIVATE_REMOTE} ${SOURCE}:${SOURCE}`);
    if (ahead) stop(`${SOURCE} has ${ahead} commit(s) that aren't on ${tracking}. Push them first: git push ${PRIVATE_REMOTE} ${SOURCE}`);
  }

  git(["fetch", "--quiet", REMOTE]);
  const published = maybe(["rev-parse", "--verify", "--quiet", `refs/remotes/${REMOTE}/main`]);

  filterHistory();
  const tip = git(["rev-parse", BRANCH]);
  if (git(["rev-parse", `${tip}^{tree}`]) !== expectedTree()) {
    stop(`the filtered history doesn't end with ${SOURCE}'s files less the private ones. Nothing was pushed.`);
  }

  const from = git(["log", "-1", "--format=%h %s", SOURCE]);
  if (published === tip) {
    console.log(`\nNothing new to publish: ${REMOTE}/main already has ${SOURCE} (${from}).\n`);
    return;
  }
  const replacing = Boolean(published) && maybe(["merge-base", "--is-ancestor", published, tip]) === null;

  console.log(`\nPublishing ${SOURCE} (${from}) to ${REMOTE}/main, with ${PRIVATE.join(", ")} cut out of every commit.\n`);
  if (!published) {
    const dates = git(["log", "--format=%ad", "--date=short", tip]).split("\n");
    console.log(`First publish: ${dates.length} commits, from ${dates.at(-1)} to ${dates[0]}.`);
  } else if (replacing) {
    console.log(
      `${REMOTE}/main can't be added to: ${count(`${tip}..${published}`)} of its ${count(published)} commit(s) aren't in this history, ` +
        `so publishing replaces them with these ${count(tip)} commits. That happens the first time after switching to ` +
        `filtered history, after PRIVATE changes, or when the public repo was changed directly (git log ${REMOTE}/main shows what's there).`,
    );
  } else {
    const fresh = count(`${published}..${tip}`);
    console.log(`${fresh} new commit(s) since the last publish:`);
    console.log(git(["log", "--format=  %h %ad %s", "--date=short", `-${LISTED}`, `${published}..${tip}`]));
    if (fresh > LISTED) console.log(`  …and ${fresh - LISTED} more`);
  }
  console.log(`\nLook through it: git log ${BRANCH}\n`);

  if (dryRun) {
    console.log(`Dry run: nothing was pushed.${replacing && !replace ? " Publishing it needs --replace." : ""}\n`);
    return;
  }
  if (replacing && !replace) stop(`publishing would replace ${REMOTE}/main. If nothing there needs keeping, run again with --replace.`);
  if (!yes) {
    if (!process.stdin.isTTY) stop("not asked to go ahead. Run with --yes to push without asking.");
    const prompt = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await prompt.question(replacing ? `Replace ${REMOTE}/main with this? (y/N) ` : `Push this to ${REMOTE}/main? (y/N) `);
    prompt.close();
    if (answer.trim().toLowerCase() !== "y") {
      console.log("Nothing was pushed.\n");
      return;
    }
  }

  // Replacing is allowed only over the commit looked at above, never over a newer one.
  const lease = replacing ? [`--force-with-lease=main:${published}`] : [];
  execFileSync("git", ["push", ...lease, REMOTE, `${tip}:refs/heads/main`], { stdio: "inherit" });
  console.log(`\nPublished ${SOURCE} as ${tip.slice(0, 7)} on ${REMOTE}/main.\n`);
};

try {
  await publish();
} catch (error) {
  const reason = error instanceof Stop ? error.message : error.stderr?.trim() || error.message;
  console.error(`\npush:public stopped: ${reason}\n`);
  process.exitCode = 1;
}
