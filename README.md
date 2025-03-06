# :running: Actionbot

This GitHub action allows you to enforce allow and prohit policies on the actions used in your GitHub workflows. It checks your repository's workflow files (`.github/workflows/*.yaml` or `.yml`) to ensure that the actions they use comply with a defined policy as an "allow" list and/or "prohibit" list, set by you.

## 🏁 Actions can be added to allow/prohit policies by:
* Author
* Author/Action
* Author/Action@Ref

## :dart: Usage

1. Create a policy JSON file (e.g., `allow-policy.json`, `prohibit-policy.json`) that defines your allowed or prohibited actions, respectively.
   
    **Example `allow-policy.json`:**
    
    ```json
    {
      "actions": [
        "Contrast-Security-OSS", //example allowed Author
        "actions/aws-codebuild-run-build", //example allowed Author/Action
        "actions/cache@d4323d4df104b026a6aa633fdb11d772146be0bf", //example allowed Author/Action@Ref (commit hash)
        "actions/cache@v3.1" //example allowed Author/Action@Ref (tag)
        ]
      }
    ```

    **Example `prohibit-policy.json`:**
    
    ```json
    {
      "actions" : [
        "stCarolas", //example prohibited Author
        "actions/upload-artifact", //example prohibited Author/Action
        "actions/upload-artifact@a8a3f3ad30e3422c9c7b888a15615d19a852ae32", //example prohibited Author/Action@Ref (commit hash)
        "actions/download-artifact@v1" //example prohibited Author/Action@Ref (tag)
        ]
      }
    ```
2. Create a workflow file (e.g., `.github/workflows/actionbot.yml`) that uses this action. See the example below.

   ```yaml
   name: "Enforce Github Action Policy"
    on:
      push:
        branches:
          - main
      pull_request:
        types:
          - opened
          - edited
    jobs:
      enforce-allow-policy:
        runs-on: ubuntu-latest
        needs: build
        steps:
          - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2

          - name: Test Allow Policy
            uses: Contrast-Security-OSS/actionbot@v1.0.0
            with:
              policy: 'allow'
              policy-url: 'https://github.com/Contrast-Security-OSS/actionbot/example_allow_policy.json' # Replace with your allow policy URL
              github-token: ${{ secrets.YOUR_GITHUB_PAT }}
              fail-if-violations: 'true'

      enforce-prohibit-policy:
        runs-on: ubuntu-latest
        needs: build
        steps:
          - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2

          - name: Test Prohibit Policy
            uses: Contrast-Security-OSS/actionbot@v1.0.0
            with:
              policy: 'prohibit'
              policy-url: 'https://github.com/Contrast-Security-OSS/actionbot/example_prohibit_policy.json' # Replace with your prohibit policy URL
              github-token: ${{ secrets.YOUR_GITHUB_PAT }}
              fail-if-violations: 'true'
    ```

## :pencil: Configuration

| Input | Description | Required | Default |
|---|---|---|---|
| `policy` |  'allow' or 'prohibit' to specify whether the policy is an allow list or a prohibit list. | Yes | - |
| `policy-url` | URL of the JSON policy file. | Yes | - |
| `github-token` | GitHub token for API access (usually ${{ secrets.GITHUB_TOKEN }}). | Yes | - |
| `fail-if-violations` | Whether to fail the workflow if policy violations are found. | No | 'false' |


## :warning: Responding to Policy Violations

This action provides an output variable `violations` that contains an array of JSON objects representing the policy violations. You can use this output in subsequent steps of your workflow to perform actions like:

* **Creating an issue:** Create a GitHub issue to report the violations.
* **Adding a comment to a pull request:** Comment on the pull request with details about the violations.
* **Sending notifications:** Send notifications to a Slack channel or other communication tools.

**Example using `actions/github-script`:**

```yaml
- name: Respond to action policy violations
  uses: actions/github-script@60a0d83039c74a4aee543508d2ffcb1c3799cdea # v7.0.1
  if: steps.action-policy.outputs.violations
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    script: |
      const violations = JSON.parse(steps.action-policy.outputs.violations);
      console.log('Violations found:', violations);
      // Add your logic here to handle the violations (e.g., create an issue, comment on a PR)
```

## :boom: In Action

* **Workflow Output:** The action logs information about the policy evaluation and any violations found.
* **Workflow Status:** If `fail-if-violations` is set to `true`, the workflow run will fail if violations are detected.

## :scroll: License

MIT
