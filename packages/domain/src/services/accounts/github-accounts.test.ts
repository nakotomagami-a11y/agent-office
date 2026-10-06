/**
 * `hosts.yml` holds N logins per config dir, not one. Reading only the active
 * `user:` key hid every other account: a machine authenticated as two users
 * showed one of them, and the missing one looked like it had never been added
 * — while being the only account with push rights.
 *
 * Fixtures are the real shapes `gh` 2.x writes, with GitHub's own sample logins
 * (`octocat`/`hubot`) — never a real account name, which is user data and does
 * not belong in a public repo.
 */
import assert from "node:assert";
import { test } from "node:test";
import { parseHostsUsers } from "./github-accounts";

const TWO_LOGINS = `github.com:
    git_protocol: https
    users:
        octocat:
        hubot:
    user: octocat
`;

const ONE_LOGIN = `github.com:
    git_protocol: https
    users:
        octocat:
    user: octocat
`;

test("every login in a dir is reported, active one first", () => {
  const { username, usernames, ready } = parseHostsUsers(TWO_LOGINS);
  assert.equal(username, "octocat", "active login");
  assert.deepEqual(usernames, ["octocat", "hubot"]);
  assert.equal(ready, true);
});

test("a single-login dir is unchanged — no phantom second entry", () => {
  assert.deepEqual(parseHostsUsers(ONE_LOGIN), {
    username: "octocat",
    usernames: ["octocat"],
    ready: true,
  });
});

test("the active login is never duplicated when `users:` also lists it", () => {
  const { usernames } = parseHostsUsers(TWO_LOGINS);
  assert.equal(new Set(usernames).size, usernames.length);
});

test("a non-active login still surfaces when `user:` is absent", () => {
  const { username, usernames, ready } = parseHostsUsers(
    "github.com:\n    users:\n        hubot:\n",
  );
  assert.equal(username, undefined, "nothing is active");
  assert.deepEqual(usernames, ["hubot"], "but the login is still there");
  assert.equal(ready, true);
});

test("the pre-`users:` layout gh used to write still reads", () => {
  const legacy = "github.com:\n    user: solo\n    oauth_token: gho_x\n";
  assert.deepEqual(parseHostsUsers(legacy), { username: "solo", usernames: ["solo"], ready: true });
});

test("a token with no login is ready but nameless", () => {
  const { username, usernames, ready } = parseHostsUsers("github.com:\n    oauth_token: gho_x\n");
  assert.equal(username, undefined);
  assert.deepEqual(usernames, []);
  assert.equal(ready, true, "a token alone still authenticates");
});

test("empty, malformed and wrong-host files never claim readiness", () => {
  for (const yaml of ["", "github.com:\n", "github.com: nonsense\n", "not-a-mapping", "gitlab.com:\n    user: x\n"]) {
    const r = parseHostsUsers(yaml);
    assert.equal(r.ready, false, JSON.stringify(yaml));
    assert.deepEqual(r.usernames, [], JSON.stringify(yaml));
  }
});

/** gh writes logins as bare keys, and a GitHub login is `[A-Za-z0-9-]` — so a
 *  quoted or space-padded key is not a shape this file can take, and the parser
 *  (which keeps quotes on keys) is never asked to handle one. */
test("the login characters gh can actually write all survive", () => {
  const { usernames } = parseHostsUsers(
    "github.com:\n    users:\n        hubot:\n        A1:\n    user: A1\n",
  );
  assert.deepEqual(usernames, ["A1", "hubot"]);
});
