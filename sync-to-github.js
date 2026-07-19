const https = require('https');
const fs = require('fs');
const path = require('path');

const GITHUB_TOKEN = process.env.GH_TOKEN;
const REPO = 'djtoljan/pp-dashboard';
const DATA_FILES = [
  'data.json',
  'data_konstantin.json',
  'data_molodezh.json',
  'data_dvizhenie78.json',
  'data_flowers.json',
];

if (!GITHUB_TOKEN) {
  console.error('❌ GH_TOKEN environment variable not set');
  console.error('   Set it: $env:GH_TOKEN="ghp_..."');
  process.exit(1);
}

function api(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'api.github.com',
      path: `/repos/${REPO}${path}`,
      method,
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'User-Agent': 'pp-agent-sync',
        'Content-Type': 'application/json',
      },
    };
    
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(data); }
      });
    });
    
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function sync() {
  console.log('🔄 Pushing data to GitHub...\n');
  
  // 1. Get current HEAD
  const ref = await api('GET', '/git/ref/heads/main');
  const latestCommitSha = ref.object.sha;
  console.log(`📌 HEAD: ${latestCommitSha}`);
  
  const commit = await api('GET', `/git/commits/${latestCommitSha}`);
  const baseTreeSha = commit.tree.sha;
  
  // 2. Create blobs for each data file
  const blobs = [];
  for (const file of DATA_FILES) {
    const filePath = path.join(__dirname, file);
    if (!fs.existsSync(filePath)) {
      console.log(`  ⚠️ ${file} not found, skipping`);
      continue;
    }
    
    const content = fs.readFileSync(filePath).toString('base64');
    const blob = await api('POST', '/git/blobs', { content, encoding: 'base64' });
    blobs.push({ path: file, mode: '100644', type: 'blob', sha: blob.sha });
    console.log(`  📄 ${file} → ${blob.sha.slice(0, 7)}`);
  }
  
  // 3. Create tree
  const tree = await api('POST', '/git/trees', { base_tree: baseTreeSha, tree: blobs });
  
  // 4. Create commit
  const newCommit = await api('POST', '/git/commits', {
    message: `🔄 Sync data ${new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}`,
    tree: tree.sha,
    parents: [latestCommitSha],
  });
  
  // 5. Update branch
  await api('PATCH', '/git/refs/heads/main', { sha: newCommit.sha, force: false });
  
  console.log(`\n✅ Synced! Commit: ${newCommit.sha.slice(0, 7)}`);
  console.log(`🌐 Dashboard will update within ~30 min`);
  console.log(`   Or trigger manually: https://github.com/${REPO}/actions/workflows/deploy.yml`);
}

sync().catch(err => {
  console.error('❌ Sync failed:', err.message);
  process.exit(1);
});