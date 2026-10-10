// Наскрізна перевірка конспекту у справжньому Chrome через DevTools Protocol.
//
//   node tools/check.js                      (відкриє index.html через file://)
//   node tools/check.js http://127.0.0.1:8000/
//
// Перевіряє: сторінки малюються, питання всіх типів зараховуються,
// прогрес пишеться в localStorage, у консолі немає помилок.
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const PORT = 9335;
const TARGET =
  process.argv[2] || "file:///" + path.resolve(__dirname, "..", "index.html").replace(/\\/g, "/");

// Параграфи курсу. Додаючи новий, допиши його сюди, у index.html і в coverage.json.
const LESSONS = ["p07", "p08", "p09", "p10", "p11", "p12"];
const PAGES = LESSONS.concat("test", "test2");

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "/usr/bin/google-chrome",
].filter(Boolean);

const chromePath = CHROME_CANDIDATES.find((candidate) => fs.existsSync(candidate));
if (!chromePath) {
  console.error("Chrome не знайдено. Вкажи шлях у змінній CHROME_PATH.");
  process.exit(1);
}

const chrome = spawn(chromePath, [
  "--headless=new",
  "--remote-debugging-port=" + PORT,
  "--user-data-dir=" + path.join(os.tmpdir(), "pryroda-check-" + Date.now()),
  "--no-first-run",
  "--disable-gpu",
  "about:blank",
]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const failures = [];

function expect(name, condition, detail) {
  console.log((condition ? "  ok    " : "  ПРОВАЛ") + "  " + name + (detail ? "  " + detail : ""));
  if (!condition) failures.push(name + " " + (detail || ""));
}

async function browserWs() {
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const response = await fetch("http://127.0.0.1:" + PORT + "/json/version");
      return (await response.json()).webSocketDebuggerUrl;
    } catch (e) {
      await sleep(250);
    }
  }
  throw new Error("Chrome не піднявся");
}

function connect(url) {
  const ws = new WebSocket(url);
  const waiting = new Map();
  const events = [];
  let seq = 0;
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && waiting.has(message.id)) {
      const slot = waiting.get(message.id);
      waiting.delete(message.id);
      message.error ? slot.reject(new Error(JSON.stringify(message.error))) : slot.resolve(message.result);
    } else if (message.method) {
      events.push(message);
    }
  });
  const open = new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve);
    ws.addEventListener("error", reject);
  });
  const send = (method, params, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      waiting.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params: params || {}, sessionId }));
    });
  return { send, open, events };
}

(async () => {
  const cdp = connect(await browserWs());
  await cdp.open;
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  const call = (method, params) => cdp.send(method, params, sessionId);

  await call("Runtime.enable");
  await call("Log.enable");
  await call("Page.enable");
  await call("Page.navigate", { url: TARGET });
  await sleep(1500);

  const evaluate = async (expression) => {
    const result = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails.exception));
    return result.result.value;
  };

  const go = (hash) =>
    evaluate("(async () => { location.hash = '" + hash + "'; await new Promise(r => setTimeout(r, 300)); return document.querySelectorAll('.block').length; })()");

  const cards = await evaluate("document.querySelectorAll('.card').length");
  expect("головна намалювалась", cards === PAGES.length, "карток: " + cards);

  for (const id of PAGES) {
    const blocks = await go("#/l/" + id);
    expect("сторінка " + id + " намалювалась", blocks > 5, "блоків: " + blocks);
  }

  // правило проєкту: у кожному параграфі всі шість наскрізних врізок
  for (const id of LESSONS) {
    await go("#/l/" + id);
    const local = await evaluate(
      "['cherkasy','ukraine','life','game','potter','horse']" +
        ".map(k => document.querySelectorAll('.block.' + k).length).join('/')"
    );
    expect("у " + id + " є врізки «Черкащина», «Україна», «з життя», «з гри», «Гоґвортс», «коні»", local === "1/1/1/1/1/1", local);

    // головний закон: простих прикладів має бути щонайменше три
    const examples = await evaluate("document.querySelectorAll('.block.life li').length");
    expect("у " + id + " не менше трьох прикладів з життя", examples >= 3, "прикладів: " + examples);

    // 6–8 питань на параграф, і всі чотири типи
    const kinds = await evaluate(
      "['quiz','multi','order','input'].map(k => document.querySelectorAll('.block.' + k).length)"
    );
    const total = kinds.reduce((a, b) => a + b, 0);
    expect("у " + id + " 6–8 питань усіх чотирьох типів", total >= 6 && total <= 8 && kinds.every((n) => n > 0), kinds.join("/"));
  }

  // знайдені помилки підручника показані на сторінці, а не загублені в чаті
  const errata = JSON.parse(fs.readFileSync(path.join(__dirname, "errata.json"), "utf8"));
  for (const id of Object.keys(errata).filter((key) => !key.startsWith("_"))) {
    await go("#/l/" + id);
    const shown = await evaluate("document.querySelectorAll('.block.errata').length");
    expect(
      "у " + id + " показані всі знайдені помилки підручника",
      shown >= errata[id].length,
      "блоків: " + shown + ", у реєстрі: " + errata[id].length
    );
  }

  // правило проєкту: головне з підручника не загублено
  const coverage = JSON.parse(fs.readFileSync(path.join(__dirname, "coverage.json"), "utf8"));
  for (const id of LESSONS) {
    expect("для " + id + " є перелік обовʼязкового змісту", Array.isArray(coverage[id]) && coverage[id].length > 10);
  }
  for (const id of Object.keys(coverage).filter((key) => !key.startsWith("_"))) {
    await go("#/l/" + id);
    const text = String(await evaluate("document.getElementById('app').textContent")).toLowerCase();
    const missing = coverage[id].filter((needle) => !text.includes(needle));
    expect("у " + id + " присутній увесь обовʼязковий зміст", missing.length === 0, missing.join(", "));
  }

  // малюнки з підручника справді вантажаться
  for (const id of LESSONS) {
    await go("#/l/" + id);
    const imgs = await evaluate(
      "(async () => { const list = [...document.images];" +
        " await Promise.all(list.map(i => i.complete ? null : new Promise(r => { i.onload = r; i.onerror = r; })));" +
        " return list.length + '/' + list.filter(i => i.naturalWidth > 0).length; })()"
    );
    const [total, loaded] = String(imgs).split("/");
    expect("малюнки в " + id + " відкриваються", total > 0 && total === loaded, imgs);
  }

  // одна відповідь: клік по правильному варіанту
  await go("#/l/p07");
  const quiz = await evaluate(
    "(async () => { const b = document.querySelector('.block.quiz'); b.querySelectorAll('.option')[0].click();" +
      " await new Promise(r => setTimeout(r, 50)); return b.querySelector('.verdict').className + '|' + b.querySelector('.done-mark').textContent; })()"
  );
  expect("quiz зараховує правильну відповідь", quiz === "verdict ok|✓", quiz);

  const quizWrong = await evaluate(
    "(async () => { const b = document.querySelectorAll('.block.quiz')[1]; b.querySelectorAll('.option')[0].click();" +
      " await new Promise(r => setTimeout(r, 50)); return b.querySelector('.verdict').className; })()"
  );
  expect("quiz не зараховує хибну відповідь", quizWrong === "verdict no", quizWrong);

  // кілька відповідей
  const multi = await evaluate(
    "(async () => { const b = document.querySelector('.block.multi'); const opts = b.querySelectorAll('.option');" +
      " opts[1].click(); opts[2].click(); b.querySelector('.btn').click(); await new Promise(r => setTimeout(r, 50));" +
      " return b.querySelector('.verdict').className + '|' + b.querySelector('.done-mark').textContent; })()"
  );
  expect("multi зараховує повний набір", multi === "verdict ok|✓", multi);

  // впиши відповідь
  const input = await evaluate(
    "(async () => { const b = document.querySelector('.block.input'); const f = b.querySelector('.answer-input');" +
      " f.value = '  Ізолятори.  '; b.querySelector('.btn').click(); await new Promise(r => setTimeout(r, 50));" +
      " return b.querySelector('.verdict').className + '|' + b.querySelector('.done-mark').textContent; })()"
  );
  expect("input приймає відповідь без огляду на регістр, пробіли й крапку", input === "verdict ok|✓", input);

  // послідовність: як виникає блискавка
  const order = await evaluate(
    "(async () => { const b = document.querySelector('.block.order');" +
      " for (let step = 0; step < 5; step++) { const chips = [...b.querySelectorAll('.chip')];" +
      "   const correct = ['Вітер','Краплинки','Негативні','Потік','Повітря'][step];" +
      "   chips.find(c => c.textContent.startsWith(correct)).click(); await new Promise(r => setTimeout(r, 30)); }" +
      " return b.querySelector('.verdict').className + '|' + b.querySelector('.done-mark').textContent; })()"
  );
  expect("order зараховує правильну послідовність", order === "verdict ok|✓", order);

  const stored = await evaluate("(() => { try { return localStorage.getItem('pryroda6.v1') || 'null'; } catch (e) { return 'SecurityError'; } })()");
  expect("прогрес пишеться в localStorage", stored !== "null" && stored !== "SecurityError", String(stored).slice(0, 80));

  const mini = await evaluate("document.getElementById('progressMini').textContent");
  expect("лічильник угорі рахує", /^[1-9]/.test(mini), mini);

  const errors = cdp.events
    .filter((event) => event.method === "Log.entryAdded" && event.params.entry.level === "error")
    .map((event) => event.params.entry.text);
  expect("у консолі немає помилок", errors.length === 0, errors.join(" | "));

  chrome.kill();
  if (failures.length) {
    console.error("\nПровалів: " + failures.length);
    process.exit(1);
  }
  console.log("\nУсе гаразд.");
  process.exit(0);
})().catch((error) => {
  console.error(error);
  chrome.kill();
  process.exit(1);
});
