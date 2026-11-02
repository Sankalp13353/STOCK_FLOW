import { spawn } from 'child_process';
import fs from 'fs';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9223;
const ARTIFACT_DIR = '/Users/sankalp/.gemini/antigravity/brain/a38e8ff5-ae90-44ce-96b9-24591b4b3996';
const DOCS_DIR = '/Users/sankalp/Desktop/SDE_PRO_1/docs/screenshots';

if (!fs.existsSync(DOCS_DIR)) {
  fs.mkdirSync(DOCS_DIR, { recursive: true });
}

// 1. Obtain a valid JWT and User profile from backend
async function getAuthCredentials() {
  const email = 'demo.operator@stockflow.dev';
  const password = 'Password123!';

  const loginRes = await fetch('http://localhost:4000/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const loginData = await loginRes.json();
  if (!loginData.success) {
    throw new Error('Failed to login demo operator: ' + JSON.stringify(loginData));
  }
  return { token: loginData.data.token, user: loginData.data.user };
}

// 2. Launch Chrome headless with remote debugging
function launchChrome() {
  const profileDir = `/tmp/chrome_p2_profile_${Date.now()}`;
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

async function run() {
  const { token, user } = await getAuthCredentials();
  console.log('Acquired auth token for operator:', user.email, 'Role:', user.role);

  const chromeProc = launchChrome();
  
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
    chromeProc.kill();
    throw new Error('Chrome failed to expose remote debugging port ' + PORT);
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
    const { targetId } = await send('Target.createTarget', { url: 'http://localhost:3000/products' });
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
    await sendSession('DOM.enable');

    // Inject localStorage before loading
    const userJson = JSON.stringify(user);
    await sendSession('Page.addScriptToEvaluateOnNewDocument', {
      source: `
        localStorage.setItem('stockflow_auth_token', ${JSON.stringify(token)});
        localStorage.setItem('stockflow_auth_user', ${JSON.stringify(userJson)});
      `,
    });

    async function saveScreenshot(filename) {
      const shot = await sendSession('Page.captureScreenshot', { format: 'png' });
      const buffer = Buffer.from(shot.data, 'base64');
      fs.writeFileSync(`${ARTIFACT_DIR}/${filename}`, buffer);
      fs.writeFileSync(`${DOCS_DIR}/${filename}`, buffer);
      console.log(`Saved screenshot: ${filename}`);
    }

    // 1. Capture Products Listing
    console.log('Navigating to http://localhost:3000/products ...');
    await sendSession('Page.navigate', { url: 'http://localhost:3000/products' });
    await new Promise((r) => setTimeout(r, 2500));
    await saveScreenshot('screenshot_products_list.png');

    // 2. Open "New Product" Modal
    console.log('Opening Create Product modal ...');
    await sendSession('Runtime.evaluate', {
      expression: `
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('New Product'));
        if (btn) btn.click();
      `,
    });
    await new Promise((r) => setTimeout(r, 600));
    await saveScreenshot('screenshot_product_create_modal.png');

    // Close Create Modal
    await sendSession('Runtime.evaluate', {
      expression: `
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Cancel');
        if (btn) btn.click();
      `,
    });
    await new Promise((r) => setTimeout(r, 500));

    // 3. Open Product Detail & Stock Modal for SF-ELEC-001 (populated with stock)
    console.log('Opening Product Detail Stock modal for SF-ELEC-001 ...');
    await sendSession('Runtime.evaluate', {
      expression: `
        const row = Array.from(document.querySelectorAll('tr')).find(r => r.textContent.includes('SF-ELEC-001'));
        if (row) {
          const btn = Array.from(row.querySelectorAll('button')).find(b => b.textContent.includes('Stock'));
          if (btn) btn.click();
        }
      `,
    });
    await new Promise((r) => setTimeout(r, 1500));
    await saveScreenshot('screenshot_product_detail_modal.png');

    // Close Detail Modal
    await sendSession('Runtime.evaluate', {
      expression: `
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Close');
        if (btn) btn.click();
      `,
    });
    await new Promise((r) => setTimeout(r, 500));

    // 4. Capture Warehouses Listing
    console.log('Navigating to http://localhost:3000/warehouses ...');
    await sendSession('Page.navigate', { url: 'http://localhost:3000/warehouses' });
    await new Promise((r) => setTimeout(r, 2500));
    await saveScreenshot('screenshot_warehouses_list.png');

    // 5. Open "Add Warehouse" Modal
    console.log('Opening Add Warehouse modal ...');
    await sendSession('Runtime.evaluate', {
      expression: `
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Add Warehouse'));
        if (btn) btn.click();
      `,
    });
    await new Promise((r) => setTimeout(r, 600));
    await saveScreenshot('screenshot_warehouse_create_modal.png');

    // Close Add Warehouse Modal
    await sendSession('Runtime.evaluate', {
      expression: `
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Cancel');
        if (btn) btn.click();
      `,
    });
    await new Promise((r) => setTimeout(r, 500));

    // 6. Open Warehouse Detail & Stock Modal for WH-ORD-01 (populated with stock)
    console.log('Opening Warehouse Detail Stock modal for WH-ORD-01 ...');
    await sendSession('Runtime.evaluate', {
      expression: `
        const row = Array.from(document.querySelectorAll('tr')).find(r => r.textContent.includes('WH-ORD-01'));
        if (row) {
          const btn = row.querySelector('button');
          if (btn) btn.click();
        }
      `,
    });
    await new Promise((r) => setTimeout(r, 1500));
    await saveScreenshot('screenshot_warehouse_detail_modal.png');

    ws.close();
  } finally {
    chromeProc.kill();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
