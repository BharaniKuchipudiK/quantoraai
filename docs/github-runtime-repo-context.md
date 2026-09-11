# GitHub runtime repository contract

When a signed-in user selects a GitHub repository in the Coding Desk:

1. The selected repository and branch are immediately checked out through `/api/github/checkout` into the desk working copy.
2. `Pull latest` repeats that checkout so the user can refresh the working copy from GitHub.
3. The desk context sent to **every inference route** carries a bounded snapshot of real workspace source files. This is provider-neutral and prevents OpenRouter/NVIDIA/DeepSeek routes from claiming the repository is inaccessible simply because they do not have a shell tool.
4. Secret-bearing local files such as `.env`, `.npmrc`, `.pypirc`, credential files, and SSH private-key filenames are excluded from model prompt context.
5. The Git pane resolves the selected composer destination as the active repository even when the legacy Import Repository flow was not used.
6. The GitHub push panel commits desk files to the selected branch through the existing authenticated server-side GitHub write endpoint.
7. The Pull Requests panel uses the same selected repository and branch, so a pushed branch can be opened as a PR without re-importing the repository.
8. Merge remains a human-controlled action under the existing product policy.

The checkout is intentionally bounded by the existing repository checkout limits and the model prompt source snapshot is separately bounded. A partial checkout must continue to report its omissions rather than pretending to be complete.
