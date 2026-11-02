import { spawn } from 'child_process';
import fs from 'fs';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9222;
const OUTPUT_DIR = '/Users/sankalp/.gemini/antigravity/brain/a38e8ff5-ae90-44ce-96b9-24591b4b3996';

// 1. Obtain a valid JWT and User profile from backend
async function getAuthCredentials() {
  const email = 'demo.operator@stockflow.dev';
  const password = 'Password123!';
  const fullName = 'Sarah Connor';

  // Try to register or login
  let token = '';
  let user = null;
  try {
    const regRes = await fetch('http://localhost:4000/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, fullName, role: 'ADMIN' }),
    });
    const regData = await regRes.json();
    if (regData.success) {
      token = regData.data.token;
      user = regData.data.user;
    }
  } catch (e) {
    // Ignore conflict
  }

  if (!token) {
    const loginRes = await fetch('http://localhost:4000/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const loginData = await loginRes.json();
    token = loginData.data.token;
    user = loginData.data.user;
  }

  return { token, user };
}

// 2. Launch Chrome headless with remote debugging
function launchChrome() {
  const profileDir = `/tmp/chrome_dev_profile_${Date.now()}`;
  return spawn(CHROME_PATH, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profileDir}`,
    '--window-size=1440,900',
    '--disable-gpu',
    '--no-sandbox',
    '--no-first-run',
  ]);
}

// 3. Connect CDP client
async function run() {
  const { token, user } = await getAuthCredentials();
  console.log('Acquired auth token for operator:', user.email);

  const chromeProc = launchChrome();
  chromeProc.stderr.on('data', (d) => console.log('[Chrome Stderr]', d.toString().slice(0, 100)));
  
  let versionData = null;
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (res.ok) {
        versionData = await res.json();
        break;
      }
    } catch (e) {
      // retry
    }
  }

  if (!versionData) {
    throw new Error('Chrome failed to expose remote debugging port 9222');
  }

  try {
    const wsUrl = versionData.webSocketDebuggerUrl;

    const ws = new WebSocket(wsUrl);
    let id = 1;
    const callbacks = new Map();

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && callbacks.has(msg.id)) {
        callbacks.get(msg.id)(msg.result);
        callbacks.delete(msg.id);
      }
    };

    await new Promise((resolve) => (ws.onopen = resolve));

    function send(method, params = {}) {
      return new Promise((resolve) => {
        const msgId = id++;
        callbacks.set(msgId, resolve);
        ws.send(JSON.stringify({ id: msgId, method, params }));
      });
    }

    // Create a new target/page
    const { targetId } = await send('Target.createTarget', { url: 'http://localhost:3000/dashboard' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });

    function sendSession(method, params = {}) {
      return new Promise((resolve) => {
        const msgId = id++;
        callbacks.set(msgId, resolve);
        ws.send(JSON.stringify({ id: msgId, sessionId, method, params }));
      });
    }

    await sendSession('Page.enable');
    await sendSession('Runtime.enable');

    // Inject localStorage before loading
    const userJson = JSON.stringify(user);
    await sendSession('Page.addScriptToEvaluateOnNewDocument', {
      source: `
        localStorage.setItem('stockflow_auth_token', ${JSON.stringify(token)});
        localStorage.setItem('stockflow_auth_user', ${JSON.stringify(userJson)});
      `,
    });

    // Capture Dashboard
    console.log('Navigating to http://localhost:3000/dashboard ...');
    await sendSession('Page.navigate', { url: 'http://localhost:3000/dashboard' });
    await new Promise((r) => setTimeout(r, 3000)); // wait for TanStack query to fetch

    const dashShot = await sendSession('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`${OUTPUT_DIR}/screenshot_dashboard.png`, Buffer.from(dashShot.data, 'base64'));
    console.log(`Saved screenshot: ${OUTPUT_DIR}/screenshot_dashboard.png`);

    // Capture Products Module
    console.log('Navigating to http://localhost:3000/products ...');
    await sendSession('Page.navigate', { url: 'http://localhost:3000/products' });
    await new Promise((r) => setTimeout(r, 1500));
    const prodShot = await sendSession('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`${OUTPUT_DIR}/screenshot_products.png`, Buffer.from(prodShot.data, 'base64'));
    console.log(`Saved screenshot: ${OUTPUT_DIR}/screenshot_products.png`);

    // Capture Orders Module
    console.log('Navigating to http://localhost:3000/orders ...');
    await sendSession('Page.navigate', { url: 'http://localhost:3000/orders' });
    await new Promise((r) => setTimeout(r, 1500));
    const orderShot = await sendSession('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`${OUTPUT_DIR}/screenshot_orders.png`, Buffer.from(orderShot.data, 'base64'));
    console.log(`Saved screenshot: ${OUTPUT_DIR}/screenshot_orders.png`);

    ws.close();
  } finally {
    chromeProc.kill();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
