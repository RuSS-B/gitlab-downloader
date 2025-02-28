# GitLab Downloader

GitLab Downloader is a CLI tool to download GitLab repositories with filtering options. It allows you to specify which folders to include or exclude during the download process.

## Installation

To install the GitLab Downloader, you can use npm:

```sh
npm install @russ-b/gitlab-downloader
```

## Usage

You can use the GitLab Downloader by running the following command:

```sh
gitlab-downloader --token <your_gitlab_token> --hostUrl <gitlab_host_url> --projectId <project_id> [options]
```

### Options

- `--token, -t` (required): GitLab Personal Access Token (PAT). Default: `process.env.REPOSITORY_TOKEN`
- `--hostUrl, -u` (required): GitLab host URL.
- `--projectId, -p` (required): GitLab Numeric Project ID.
- `--branch, -b`: Branch name. Default: `master`.
- `--includeOnly, -i`: Comma-separated list of folders to include.
- `--dir, -d`: Directory to download files to. Default: current directory.

### Example

```sh
gitlab-downloader --token your_token --hostUrl https://gitlab.com --projectId 123456 --branch develop --includeOnly src,docs --dir ./downloads
```
