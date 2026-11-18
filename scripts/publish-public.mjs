/**
 * Publishes `main` to the public repo, without the files that stay private.
 *
 * The public repo has a history of its own: one commit per publish, holding main's files
 * minus the private ones. It never shares a commit with the private repo, so nothing
 * private is anywhere in its history. The commit is built in a separate index, so the
 * working folder and the current branch are never touched, and the script checks the
 * commit has no private file before pushing it.
 *
 *   npm run publish:public                     shows what would go, then asks
 *   npm run publish:public -- --dry-run        shows what would go, and stops
 *   npm run publish:public -- --yes            pushes without asking
 *   npm run publish:public -- -m "message"     the public commit's message
 *
 * Changes made on the public repo itself would be replaced by main's files on the next
 * publish: bring them into main by hand first. Every publish is marked with a trailer, and
 * the script stops if the public repo has a commit without it.
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
/** The local branch that keeps the public history. */
const BRANCH = "public-main";
/** Never published. Paths from the repo's root; a folder takes all it holds. */
const PRIVATE = ["AGENTS.md", "implementation.md", "learn"];
/** Ends every commit this makes, so a change made on the public repo itself stands out. */
const TRAILER = "Published-by: publish:public";

const git = (args, env = {}) =>
  execFileSync("git", args, { encoding: "utf8", env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] }).trim();
const maybe = (args) => {
  try {
    return git(args);
  } catch {
    return null;
  }
};
const fail = (message) => {
  console.error(`\npublish:public stopped: ${message}\n`);
  process.exit(1);
};

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
const yes = argv.includes("--yes");
const messageAt = Math.max(argv.indexOf("-m"), argv.indexOf("--message"));
const message = messageAt >= 0 ? argv[messageAt + 1] : "Update Layer";
if (!message) fail("-m needs a message.");

const remotes = git(["remote"]).split("\n");
if (!remotes.includes(REMOTE)) fail(`there's no "${REMOTE}" remote. Add it: git remote add ${REMOTE} <url>`);
if (!maybe(["rev-parse", "--verify", "--quiet", SOURCE])) fail(`there's no "${SOURCE}" branch.`);

// What goes public is what's merged and pushed: main as the private repo has it.
if (remotes.includes(PRIVATE_REMOTE)) {
  git(["fetch", "--quiet", PRIVATE_REMOTE, SOURCE]);
  const tracking = `${PRIVATE_REMOTE}/${SOURCE}`;
  const behind = git(["rev-list", "--count", `${SOURCE}..${tracking}`]);
  const ahead = git(["rev-list", "--count", `${tracking}..${SOURCE}`]);
  if (behind !== "0") fail(`${SOURCE} is ${behind} commit(s) behind ${tracking}. Update it: git fetch ${PRIVATE_REMOTE} ${SOURCE}:${SOURCE}`);
  if (ahead !== "0") fail(`${SOURCE} has ${ahead} commit(s) that aren't on ${tracking}. Push them first: git push ${PRIVATE_REMOTE} ${SOURCE}`);
}

// The public repo's main, which the new commit follows, from whichever computer published it.
git(["fetch", "--quiet", REMOTE]);
const published = maybe(["rev-parse", "--verify", "--quiet", `refs/remotes/${REMOTE}/main`]);
if (published) {
  // Every publish is marked; anything else was changed on the public repo itself, and
  // publishing would replace it with main's files.
  const foreign = git(["rev-list", "--invert-grep", `--grep=^${TRAILER}$`, published]).split("\n").filter(Boolean);
  if (foreign.length) {
    fail(
      `${REMOTE}/main has ${foreign.length} commit(s) not made by this script, so the public repo was changed directly. ` +
        `Bring those changes into ${SOURCE} by hand first (git log ${REMOTE}/main shows them).`,
    );
  }
}
const parent = published ?? maybe(["rev-parse", "--verify", "--quiet", `refs/heads/${BRANCH}`]);

// Main's files, less the private ones, in an index of their own.
const scratch = mkdtempSync(join(tmpdir(), "layer-publish-"));
let tree;
try {
  const env = { GIT_INDEX_FILE: join(scratch, "index") };
  git(["read-tree", SOURCE], env);
  git(["rm", "-r", "--cached", "--quiet", "--ignore-unmatch", "--", ...PRIVATE], env);
  tree = git(["write-tree"], env);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

const files = git(["ls-tree", "-r", "--name-only", tree]).split("\n").filter(Boolean);
const leaked = files.filter((file) => PRIVATE.some((path) => file === path || file.startsWith(`${path}/`)));
if (leaked.length) fail(`private files are still in the tree: ${leaked.join(", ")}`);

const from = git(["log", "-1", "--format=%h %s", SOURCE]);
if (parent && git(["rev-parse", `${parent}^{tree}`]) === tree) {
  console.log(`\nNothing new to publish: ${REMOTE}/main already has ${SOURCE} (${from}).\n`);
  process.exit(0);
}

console.log(`\nPublishing ${SOURCE} (${from}) to ${REMOTE}/main, leaving out ${PRIVATE.join(", ")}.`);
console.log(`Commit message: "${message}"`);
if (parent) {
  console.log(`\nChanges since the last publish:\n${git(["diff", "--stat", parent, tree]) || "(none)"}\n`);
} else {
  console.log(`\nFirst publish: ${files.length} files.\n`);
}

if (dryRun) {
  console.log("Dry run: nothing was pushed.\n");
  process.exit(0);
}
if (!yes) {
  if (!process.stdin.isTTY) fail("not asked to go ahead. Run with --yes to push without asking.");
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await prompt.question(`Push this to ${REMOTE}/main? (y/N) `);
  prompt.close();
  if (answer.trim().toLowerCase() !== "y") {
    console.log("Nothing was pushed.\n");
    process.exit(0);
  }
}

const commit = git(["commit-tree", tree, ...(parent ? ["-p", parent] : []), "-m", message, "-m", TRAILER]);
execFileSync("git", ["push", REMOTE, `${commit}:refs/heads/main`], { stdio: "inherit" });
git(["update-ref", `refs/heads/${BRANCH}`, commit]);
console.log(`\nPublished ${SOURCE} as ${commit.slice(0, 7)} on ${REMOTE}/main.\n`);
