require('dotenv').config();

const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const yargs = require('yargs');

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
    console.error(
      `Failed to fetch tree for ${folderPath}:`,
      error.response?.data || error.message,
    );
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
    console.log(`Downloaded: ${localPath}`);
  } catch (error) {
    console.error(
      `Failed to download ${filePath}:`,
      error.response?.data || error.message,
    );
  }
}

/**
 * Recursively download a folder
 */
async function downloadFolder(folderPath) {
  const items = await fetchTree(folderPath);
  for (const item of items) {
    const fullPath = folderPath ? `${folderPath}/${item.name}` : item.name;

    if (
      INCLUDE_ONLY.length > 0 &&
      item.type === 'tree' &&
      !INCLUDE_ONLY.some((accept) => fullPath.includes(accept))
    ) {
      console.log(`Ignoring folder: ${fullPath} (not in includeOnly list)`);
      continue;
    }

    if (item.type === 'blob') {
      await downloadFile(fullPath);
    } else if (item.type === 'tree') {
      await downloadFolder(fullPath);
    }
  }
}

/**
 * Main function to start downloading
 */
async function main() {
  console.log(
    `Starting download from project ID: ${PROJECT_ID} on branch: ${BRANCH}`,
  );
  if (INCLUDE_ONLY.length > 0) {
    console.log(
      `Filtering: Only downloading folders that match ${INCLUDE_ONLY.join(', ')}`,
    );
  } else {
    console.log(`No filter applied. Downloading all folders.`);
  }

  for (const folder of FOLDERS_TO_DOWNLOAD) {
    await downloadFolder(folder);
  }
  console.log('Download complete.');
}

main().catch(console.error);
