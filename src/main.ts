import fetch from "node-fetch";
import fs from "fs";
import * as ghf from "./github_files";
import path from "path";
import yamlParse from "js-yaml";
const github = require("@actions/github");
const core = require("@actions/core");

export class Action {
  constructor(actionString: string) {
    actionString = actionString.toLowerCase();
    let as = actionString.split("/");
    this.author = as[0];

    let action = as[1].split("@");
    this.name = action[0];
    this.ref = action.length > 1 ? action[1] : "*";
  }

  toString(): string {
    return `${this.author}/${this.name}@${this.ref}`;
  }

  author: string;
  name: string;
  ref: string;
}

export interface Workflow {
  filePath: string;
  actions: Array<Action>;
}

interface PolicyResponse {
  actions: string[];
}

function isGitHubUrl(url: string): boolean {
  const githubPattern = /^https?:\/\/(www\.)?github\.com\/.+/;
  return githubPattern.test(url);
}

function isPolicyResponse(obj: any): obj is PolicyResponse {
  return typeof obj === "object" && obj !== null && Array.isArray(obj.actions);
}

async function run(context: typeof github.context): Promise<void> {
  try {
    const line = "-------------------------------------------";

    const policyType = core.getInput("policy", { required: true });
    const policyUrl = core.getInput("policy-url", { required: true });
    const gitHubToken = core.getInput("github-token", { required: true });
    const failIfViolations =
      core.getInput("fail-if-violations", { required: false }) == "true";

    if (!policyType || (policyType != "allow" && policyType != "prohibit"))
      throw new Error("policy must be set to 'allow' or 'prohibit'");

    if (!policyUrl) throw new Error("policy-url not set");

    const client = github.getOctokit(gitHubToken);

    //get all the modified or added files in the commits
    let allFiles = new Set<string>();
    let commits;

    switch (context.eventName) {
      case "pull_request":
        // Get the pull request number
        const prNumber = github.context.payload.pull_request?.number;

        if (prNumber) {
          console.log("prNumber : " + prNumber);
          // Fetch the pull request details to get the commits_url
          const prDetails = await client.rest.pulls.get({
            owner: github.context.repo.owner,
            repo: github.context.repo.repo,
            pull_number: prNumber,
          });
          console.log("prDetails : " + prDetails);

          // Use the commits_url to fetch commits related to the pull request
          const url = prDetails.data.commits_url;
          console.log("url : " + url);

          commits = await client.paginate(`GET ${url}`, {
            owner: github.context.repo.owner,
            repo: github.context.repo.repo,
          });
          console.log("commits : " + commits);
        } else {
          console.error("Pull request number not found in payload.");
          commits = [];
        }
        break;
      case "push":
        // Get the pull request number
        const prNumber2 = github.context.payload.pull_request?.number;

        if (prNumber2) {
          console.log("prNumber2 : " + prNumber2);
          // Fetch the pull request details to get the commits_url
          const prDetails2 = await client.rest.pulls.get({
            owner: github.context.repo.owner,
            repo: github.context.repo.repo,
            pull_number: prNumber2,
          });
          console.log("prDetails : " + prDetails2);

          // Use the commits_url to fetch commits related to the pull request
          const url2 = prDetails2.data.commits_url;
          console.log("url2 : " + url2);

          commits = await client.paginate(`GET ${url2}`, {
            owner: github.context.repo.owner,
            repo: github.context.repo.repo,
          });
          console.log("commits : " + commits);
        } else {
          console.error("Pull request number not found in payload.");
          commits = [];
        }
        break;
      default:
        commits = [];
    }

    for (let i = 0; i < commits.length; i++) {
      var f = await ghf.getFilesInCommit(commits[i], gitHubToken);
      f.forEach((element) => allFiles.add(element));
    }

    let actionPolicyList = new Array<Action>();
    let actionViolations = new Array<Workflow>();
    let workflowFiles = new Array<Workflow>();
    let workflowFilePaths = new Array<string>();

    //look for any workflow file updates
    allFiles.forEach((file) => {
      let filePath = path.parse(file);

      console.log("filePath : " + filePath);
      const dirLower = filePath.dir.toLowerCase();
      if (
        ((filePath.ext.toLowerCase() == ".yaml" ||
          filePath.ext.toLowerCase() == ".yml") &&
          dirLower.startsWith(".github/workflows")) ||
        dirLower.startsWith(".github/actions")
      ) {
        workflowFilePaths.push(file);
      }
    });

    //No workflow updates - byeee!
    if (workflowFilePaths.length == 0) {
      console.log("No workflow files detected in change set.");
      return;
    }

    if (!isGitHubUrl(policyUrl)) {
      // Load up the remote policy list
      await fetch(policyUrl)
        .then((response) => response.json() as Promise<PolicyResponse>)
        .then((json) => {
          // json is now correctly typed as PolicyResponse
          json.actions.forEach((as) => {
            actionPolicyList.push(new Action(as));
          });
        })
        .catch((error) => {
          console.error("Error fetching or parsing policy:", error);
          // Handle the error appropriately (e.g., throw an error, set a default policy)
        });
    } else {
      // Extract owner, repo, and file path from the policyUrl
      const urlParts = policyUrl.replace("https://github.com/", "").split("/");
      const owner = urlParts[0]; // Extract the owner
      const repo = urlParts[1]; // Extract the repository name
      const filePath = urlParts.slice(4).join("/"); // Extract the file path after 'blob/{branch}'

      const response = await client.rest.repos.getContent({
        owner: owner, // Use the extracted owner
        repo: repo, // Use the extracted repo
        path: filePath, // Use the extracted file path
      });

      if (response.data && "content" in response.data) {
        const content = Buffer.from(response.data.content, "base64").toString(
          "utf-8",
        );
        const json = JSON.parse(content) as PolicyResponse;
        json.actions.forEach((as) => {
          actionPolicyList.push(new Action(as));
        });
      } else {
        throw new Error("Failed to load GitHub policy list.");
      }
    }

    console.log("\nACTION POLICY LIST");
    console.log(line);
    actionPolicyList.forEach((item) => {
      console.log(item.toString());
    });

    console.log("\nREADING WORKFLOW FILES");
    workflowFilePaths.forEach((wf) => {
      console.log(line);
      let workflow: Workflow = { filePath: wf, actions: Array<Action>() };
      workflowFiles.push(workflow);
      if (fs.existsSync(workflow.filePath)) {
        console.log("\nReading:" + workflow.filePath);
      try {
        let yaml: any = yamlParse.load(
          fs.readFileSync(workflow.filePath, "utf-8"),
        );
        let actionStrings = getPropertyValues(yaml, "uses");

        actionStrings.forEach((as) => {
          workflow.actions.push(new Action(as));
        });
      } catch (error: unknown) {
        if (error instanceof Error) {
          core.debug(error.message);
          core.setFailed(
            `Unable to parse workflow file '${workflow.filePath}' - please ensure it's formatted properly.`,
          );
        } else {
          // Handle cases where error is not an Error object
          core.debug("An unknown error occurred.");
          core.setFailed("An unknown error occurred.");
        }
        console.log(error);
      }
      }
      
    });

    //iterate through all the workflow files found
    workflowFiles.forEach((workflow: Workflow) => {
      console.log(`\nEvaluating '${workflow.filePath}'`);
      console.log(line);

      let violation: Workflow = {
        filePath: workflow.filePath,
        actions: Array<Action>(),
      };
      workflow.actions.forEach((action: Action) => {
        console.log(` - ${action.toString()}`);

        if (action.author == ".") return;

        let match = actionPolicyList.find(
          (policy) =>
            policy.author === action.author &&
            (policy.name === "*" || action.name === policy.name) &&
            (policy.ref === "*" || action.ref == policy.ref),
        );

        if (policyType == "allow") {
          if (!match) {
            violation.actions.push(action);
          }
        } else if (policyType == "prohibit") {
          if (match) {
            violation.actions.push(action);
          }
        }
      });

      if (violation.actions.length > 0) {
        actionViolations.push(violation);
      } else {
        console.log("\n ✅ No violations detected");
      }
    });

    if (actionViolations.length > 0) {
      core.setOutput("violations", actionViolations);
      console.log("\n ❌ ACTION POLICY VIOLATIONS DETECTED ❌");
      console.log(line);

      actionViolations.forEach((workflow) => {
        console.log(`Workflow: ${workflow.filePath}`);

        workflow.actions.forEach((action) => {
          console.log(` - ${action.toString()}`);
        });

        console.log();
      });

      if (failIfViolations) {
        core.setFailed(" ❌ ACTION POLICY VIOLATIONS DETECTED ❌");
      }
    } else {
      console.log(
        "\n ✅ All workflow files contain actions that conform to the policy provided.",
      );
    }
  } catch (error: unknown) {
    if (error instanceof Error) {
      core.debug(error.message);
      core.setFailed(error.message);
    } else {
      // Handle cases where error is not an Error object
      core.debug("An unknown error occurred.");
      core.setFailed("An unknown error occurred.");
    }
    console.log(error);
  }
}

function getPropertyValues(
  obj: any,
  propName: string,
  values?: string[],
): string[] {
  if (!values) values = [];

  for (var property in obj) {
    if (obj.hasOwnProperty(property)) {
      if (typeof obj[property] == "object") {
        getPropertyValues(obj[property], propName, values);
      } else {
        if (property == propName) {
          values.push(obj[property]);
          //console.log(property + "   " + obj[property]);
        }
      }
    }
  }
  return values;
}

run(github.context);
