#!/usr/bin/env node

// Download files from a GitLab repository using the GitLab API

require('dotenv').config();

const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const yargs = require('yargs');
const crypto = require('crypto');

const argv = yargs
  .option('token', {
    alias: 't',
    type: 'string',
    description: 'GitLab Personal Access Token (PAT)',
    demandOption: true,
    default: process.env.REPOSITORY_TOKEN,
  })
  .option('hostUrl', {
    alias: 'u',
    type: 'string',
    description: 'GitLab host URL',
    demandOption: true,
  })
  .option('projectId', {
    alias: 'p',
    type: 'string',
    description: 'GitLab Numeric Project ID',
    demandOption: true,
  })
  .option('branch', {
    alias: 'b',
    type: 'string',
    description: 'Branch name',
    default: 'master',
  })
  .option('includeOnly', {
    alias: 'i',
    type: 'string',
    description: 'Comma-separated list of folders to include',
    demandOption: false,
  })
  .option('dir', {
    alias: 'd',
    type: 'string',
    description: 'Directory to download files to',
    demandOption: false,
    default: '',
  })
  .help()
  .alias('help', 'h').argv;

const GITLAB_HOST = argv.hostUrl; // Change if needed
const TOKEN = argv.token;
const PROJECT_ID = argv.projectId;
const BRANCH = argv.branch;
const DOWNLOAD_DIR = argv.dir;
const FOLDERS_TO_DOWNLOAD = ['proto', 'build']; // Root folders to scan
const INCLUDE_ONLY = argv.includeOnly ? argv.includeOnly.split(',') : [];
const CACHE_DIR = path.join(__dirname, '.cache');
const COMMIT_FILE = path.join(CACHE_DIR, 'last_commit.json');

/**
 * Generate a hash from the input arguments to detect changes.
 */
function generateArgsHash() {
  const argsString = JSON.stringify({
    PROJECT_ID,
    BRANCH,
    INCLUDE_ONLY,
    DOWNLOAD_DIR,
  });

  return crypto.createHash('sha256').update(argsString).digest('hex');
}

/**
 * Fetch the latest commit hash of the branch
 */
async function fetchLatestCommitHash() {
  const url = `${GITLAB_HOST}/api/v4/projects/${PROJECT_ID}/repository/commits/${BRANCH}`;
  try {
    const response = await axios.get(url, {
      headers: { 'PRIVATE-TOKEN': TOKEN },
    });
    return response.data.id; // Commit hash
  } catch (error) {
    console.error(`Failed to fetch latest commit:`, error.response?.data || error.message);
    return null;
  }
}

/**
 * Fetch the repository tree for a given path
 */
async function fetchTree(folderPath = '') {
  const url = `${GITLAB_HOST}/api/v4/projects/${PROJECT_ID}/repository/tree`;
  try {
    const response = await axios.get(url, {
      headers: { 'PRIVATE-TOKEN': TOKEN },
      params: { ref: BRANCH, path: folderPath, recursive: false },
    });
    return response.data; // Returns a list of files and directories
  } catch (error) {
    console.error(`Failed to fetch tree for ${folderPath}:`, error.response?.data || error.message);
    return [];
  }
}

/**
 * Download a single file
 */
async function downloadFile(filePath) {
  const rawUrl = `${GITLAB_HOST}/api/v4/projects/${PROJECT_ID}/repository/files/${encodeURIComponent(filePath)}/raw?ref=${BRANCH}`;
  try {
    const response = await axios.get(rawUrl, {
      headers: { 'PRIVATE-TOKEN': TOKEN },
      responseType: 'arraybuffer',
    });
    const localPath = path.join(process.cwd(), DOWNLOAD_DIR, filePath);
    await fs.outputFile(localPath, response.data);
    console.debug(`Downloaded: ${localPath}`);
  } catch (error) {
    console.error(`Failed to download ${filePath}:`, error.response?.data || error.message);
  }
}

/**
 * Recursively download a folder (Parallelized)
 */
async function downloadFolder(folderPath) {
  const items = await fetchTree(folderPath);
  const downloadTasks = items.map(async (item) => {
    const fullPath = folderPath ? `${folderPath}/${item.name}` : item.name;

    // Include only specific folders if specified
    if (INCLUDE_ONLY.length > 0 && item.type === 'tree' && !INCLUDE_ONLY.some((accept) => fullPath.includes(accept))) {
      console.log(`Ignoring folder: ${fullPath} (not in includeOnly list)`);
      return;
    }

    if (item.type === 'blob') {
      return downloadFile(fullPath);
    } else if (item.type === 'tree') {
      return downloadFolder(fullPath);
    }
  });

  await Promise.all(downloadTasks);
}

/**
 * Main function to start downloading
 */
async function main() {
  console.log(`Starting download from project ID: ${PROJECT_ID} on branch: ${BRANCH}`);
  if (INCLUDE_ONLY.length > 0) {
    console.log(`Filtering: Only downloading folders that match ${INCLUDE_ONLY.join(', ')}`);
  } else {
    console.log(`No filter applied. Downloading all folders.`);
  }

  const latestCommitHash = await fetchLatestCommitHash();
  if (!latestCommitHash) {
    console.error('Could not retrieve latest commit hash. Exiting.');
    return;
  }

  fs.mkdirp(CACHE_DIR);

  let cachedData = {};
  try {
    cachedData = fs.readJsonSync(COMMIT_FILE);
  } catch (e) {
    console.warn('Could not read commit file, assuming first run.');
  }

  const currentArgsHash = generateArgsHash();
  const { commit: cachedCommit, argsHash: cachedArgsHash } = cachedData;
  if (latestCommitHash === cachedCommit && currentArgsHash === cachedArgsHash) {
    console.log('No changes detected in the repository. Skipping download');
    return;
  }

  for (const folder of FOLDERS_TO_DOWNLOAD) {
    await downloadFolder(folder);
  }

  fs.writeJsonSync(COMMIT_FILE, { commit: latestCommitHash, argsHash: currentArgsHash });
  console.log('Download complete.');
}

main().catch(console.error);
