import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const destinationSource = readFileSync(new URL('./GithubDestinationBar.jsx', import.meta.url), 'utf8');
const gitPaneSource = readFileSync(new URL('./StudioGit.jsx', import.meta.url), 'utf8');
const pushSource = readFileSync(new URL('./GithubPushPanel.jsx', import.meta.url), 'utf8');

test('choosing a repository and branch pulls that working copy into the coding desk', () => {
  assert.match(destinationSource, /function chooseRepository\(row\)[\s\S]*void onOpenInDesk\(next\)/);
  assert.match(destinationSource, /function chooseBranch\(name\)[\s\S]*void onOpenInDesk\(next\)/);
  assert.match(destinationSource, />Pull latest</);
  assert.match(destinationSource, /Pull the latest .* into the desk/);
});

test('selected GitHub destination feeds commit and pull-request panels even without legacy import state', () => {
  assert.match(gitPaneSource, /const destinationRepoUrl = githubDestination\?\.owner && githubDestination\?\.repo/);
  assert.match(gitPaneSource, /const activeRepoUrl = String\(githubRepoUrl \|\| destinationRepoUrl/);
  assert.match(gitPaneSource, /<GithubPushPanel[\s\S]*githubRepoUrl=\{activeRepoUrl\}[\s\S]*onBranchChange=\{setPrHead\}/);
  assert.match(gitPaneSource, /<GithubPullRequests[\s\S]*repoUrl=\{activeRepoUrl\}[\s\S]*headBranch=\{prHead \|\| 'quantora-desk'\}[\s\S]*baseBranch=\{baseBranch\}/);
  assert.match(gitPaneSource, /githubDestination\?\.branch[\s\S]*githubBaseBranch/);
});

test('existing repository commits default to a PR work branch based on the pulled branch', () => {
  assert.match(pushSource, /const DEFAULT_WORK_BRANCH = 'quantora-desk'/);
  assert.match(pushSource, /const baseBranch = chosen\?\.branch \|\| chosen\?\.defaultBranch \|\| 'main'/);
  assert.match(pushSource, /branch,[\s\S]*baseBranch/);
  assert.match(pushSource, /The branch is ready for a pull request/);
});
