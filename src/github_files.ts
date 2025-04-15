const github = require("@actions/github");

export async function getFilesInCommit(
  commit: any,
  token: string,
): Promise<string[]> {
  const repo = github.context.payload.repository;
  console.log("repo : " + repo);
  const owner = repo?.owner;
  console.log("owner : " + owner);
  const allFiles: string[] = [];

  const args: any = { owner: owner?.name || owner?.login, repo: repo?.name };
  args.ref = commit.id || commit.sha;

  const octokit = github.getOctokit(token);
  console.log("octokit : " + octokit);
  const result = await octokit.rest.repos.getCommit(args);
  console.log("result : " + result);

  if (result && result.data && result.data.files) {
    const files = result.data.files;

    files
      .filter(
        (file: { status: string; filename: string }) =>
          file.status == "modified" || file.status == "added",
      )
      .map((file: { filename: string }) => file.filename)
      .forEach((filename: string) => allFiles.push(filename));
  }

  return allFiles;
}
