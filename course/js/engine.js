/* Рушій конспекту: маршрути, відмалювання блоків, перевірка питань, прогрес. */

const COURSE = (function () {
  const STORE_KEY = "pryroda6.v1";
  const lessons = [];

  let store = { done: {} };
  try {
    store = Object.assign(store, JSON.parse(localStorage.getItem(STORE_KEY) || "{}"));
  } catch (e) {
    /* зіпсоване сховище просто ігноруємо */
  }

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(store));
    } catch (e) {}
  }

  const isDone = (key) => Boolean(store.done[key]);

  function markDone(key) {
    if (store.done[key]) return;
    store.done[key] = true;
    save();
    refreshProgress();
  }

  /* ---------- дрібні помічники для DOM ---------- */

  function el(tag, attrs, ...kids) {
    const node = document.createElement(tag);
    for (const [name, value] of Object.entries(attrs || {})) {
      if (value === undefined || value === null) continue;
      if (name === "class") node.className = value;
      else if (name === "html") node.innerHTML = value;
      else if (name === "text") node.textContent = value;
      else if (name.startsWith("on")) node.addEventListener(name.slice(2), value);
      else node.setAttribute(name, value);
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid) node.append(kid);
    }
    return node;
  }

  function bar(pct) {
    const fill = el("i");
    fill.style.width = pct + "%";
    return el("div", { class: "bar" }, fill);
  }

  const CHEERS = ["Так!", "Точно.", "Правильно.", "Саме так.", "Влучно."];
  const randomOf = (list) => list[Math.floor(Math.random() * list.length)];

  /* Відповідь у полі порівнюємо м’яко: регістр, апостроф і зайві пробіли не рахуються. */
  function normalize(text) {
    return String(text)
      .toLowerCase()
      .replace(/[’'`ʼ]/g, "'")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/[.,!?;:]+$/, "")
      .trim();
  }

  function shuffled(list) {
    const copy = list.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const swap = copy[i];
      copy[i] = copy[j];
      copy[j] = swap;
    }
    return copy;
  }

  /* ---------- блоки ---------- */

  const BLOCKS = {
    text: (b) => el("section", { class: "block plain", html: b.html }),

    note: (b) => card("note", b.title || "Запам’ятай", null, [el("div", { html: b.html })]),

    cherkasy: (b) => card("cherkasy", b.title || "А тепер — про Черкащину", null, [el("div", { html: b.html })]),

    ukraine: (b) => card("ukraine", b.title || "Це саме — про Україну", null, [el("div", { html: b.html })]),

    life: (b) => card("life", b.title || "Перевір сам", null, [el("div", { html: b.html })]),

    game: (b) => card("game", b.title || "А тепер те саме — у грі", null, [el("div", { html: b.html })]),

    /* Гоґвортс: місток до книжки, яку дитина знає напамʼять. Факти географії від цього
       не міняються — чари лише допомагають запамʼятати, чим справжній світ від них відрізняється. */
    potter: (b) => card("potter", b.title || "А що в Гоґвортсі", null, [el("div", { html: b.html })]),

    /* Стайня: те саме поняття на конях, яких дитина бачить щотижня. */
    horse: (b) => card("horse", b.title || "А тепер — на конях", null, [el("div", { html: b.html })]),

    /* Місце, де підручник помиляється: що в книжці, як насправді, що казати на уроці. */
    errata: (b) =>
      card("errata", b.title || "Тут підручник помиляється", null, [
        el("div", { class: "errata-row book" }, el("b", { text: "У підручнику: " }), el("span", { html: b.book })),
        el("div", { class: "errata-row truth" }, el("b", { text: "Насправді: " }), el("span", { html: b.truth })),
        b.say
          ? el("div", { class: "errata-row say" }, el("b", { text: "На уроці кажи: " }), el("span", { html: b.say }))
          : null,
      ]),

    /* Малюнок з підручника. `max` — найбільша ширина в пікселях: дрібний чи вертикальний
       малюнок на всю ширину розмивається й займає пів екрана. */
    image: (b) =>
      el(
        "figure",
        { class: "figure", style: b.max ? "max-width:" + b.max + "px;margin-left:auto;margin-right:auto" : undefined },
        el("img", { src: "img/" + b.src, alt: b.alt || b.caption || "" }),
        b.caption ? el("figcaption", { html: b.caption }) : null
      ),

    /* Кілька малюнків поруч. */
    gallery: (b) =>
      el(
        "div",
        { class: "gallery cols" + (b.cols || 2) },
        b.items.map((item) =>
          el(
            "figure",
            { class: "figure" },
            el("img", { src: "img/" + item.src, alt: item.alt || item.caption || "" }),
            item.caption ? el("figcaption", { html: item.caption }) : null
          )
        )
      ),

    summary: (b) => card("summary", b.title || "Головна думка", null, [el("div", { html: b.html })]),

    terms(b) {
      /* `d` — просте пояснення; `book` — точне формулювання підручника, дрібним курсивом. */
      const rows = b.items.map((item) =>
        el(
          "tr",
          {},
          el("td", { html: item.t }),
          el(
            "td",
            {},
            el("span", { html: item.d }),
            item.book ? el("span", { class: "book-wording", html: "у підручнику: " + item.book }) : null
          )
        )
      );
      return card("terms", b.title || "Терміни параграфа", null, [el("table", { class: "terms" }, rows)]);
    },

    fold: (b) =>
      el("section", { class: "block plain" }, el("details", {}, el("summary", { text: b.title }), el("div", { html: b.html }))),

    /* Питання з однією правильною відповіддю. */
    quiz(b, ctx) {
      const verdict = el("div", { class: "verdict" });
      const doneMark = el("span", { class: "done-mark", text: isDone(ctx.key) ? "✓" : "" });
      const letters = "АБВГДЕ";
      const options = el("div", { class: "options" });

      b.options.forEach((textOrHtml, index) => {
        const option = el(
          "button",
          { class: "option" },
          el("span", { class: "letter", text: letters[index] }),
          el("span", { html: textOrHtml })
        );
        option.addEventListener("click", () => {
          for (const child of options.children) child.classList.remove("right", "wrong");
          if (index === b.answer) {
            option.classList.add("right");
            verdict.className = "verdict ok";
            verdict.textContent = randomOf(CHEERS) + " " + (b.explain || "");
            doneMark.textContent = "✓";
            markDone(ctx.key);
          } else {
            option.classList.add("wrong");
            verdict.className = "verdict no";
            verdict.textContent = (b.wrong || "Не те.") + " Спробуй інший варіант — за помилку тут нічого не буває.";
          }
        });
        options.append(option);
      });

      return card("quiz", b.title || "Питання", doneMark, [el("div", { html: b.question }), options, verdict]);
    },

    /* Питання, де правильних відповідей кілька. */
    multi(b, ctx) {
      const verdict = el("div", { class: "verdict" });
      const doneMark = el("span", { class: "done-mark", text: isDone(ctx.key) ? "✓" : "" });
      const letters = "АБВГДЕЖЗ";
      const options = el("div", { class: "options" });
      const picked = new Set();

      b.options.forEach((textOrHtml, index) => {
        const option = el(
          "button",
          { class: "option" },
          el("span", { class: "letter", text: letters[index] }),
          el("span", { html: textOrHtml })
        );
        option.addEventListener("click", () => {
          if (picked.has(index)) picked.delete(index);
          else picked.add(index);
          option.classList.toggle("picked", picked.has(index));
          option.classList.remove("right", "wrong");
          verdict.className = "verdict";
          verdict.textContent = "";
        });
        options.append(option);
      });

      const checkBtn = el("button", { class: "btn", text: "Перевірити ✓" });
      checkBtn.addEventListener("click", () => {
        if (!picked.size) {
          verdict.className = "verdict no";
          verdict.textContent = "Познач хоча б один варіант.";
          return;
        }
        const right = new Set(b.answers);
        let ok = right.size === picked.size;
        right.forEach((i) => {
          if (!picked.has(i)) ok = false;
        });
        [...options.children].forEach((child, index) => {
          child.classList.remove("picked");
          if (picked.has(index)) child.classList.add(right.has(index) ? "right" : "wrong");
          else if (!ok && right.has(index)) child.classList.add("right");
        });
        if (ok) {
          verdict.className = "verdict ok";
          verdict.textContent = randomOf(CHEERS) + " " + (b.explain || "");
          doneMark.textContent = "✓";
          markDone(ctx.key);
        } else {
          verdict.className = "verdict no";
          verdict.textContent = "Ще ні. Зеленим підсвічено правильні варіанти — прочитай і спробуй ще раз.";
          picked.clear();
        }
      });

      return card("multi", b.title || "Кілька відповідей", doneMark, [
        el("div", { html: b.question }),
        el("div", { html: "<i>Познач усі правильні варіанти, потім натисни «Перевірити».</i>" }),
        options,
        el("div", { class: "toolbar" }, checkBtn),
        verdict,
      ]);
    },

    /* Послідовність: натискати картки в правильному порядку. */
    order(b, ctx) {
      const verdict = el("div", { class: "verdict" });
      const doneMark = el("span", { class: "done-mark", text: isDone(ctx.key) ? "✓" : "" });
      const slots = el("div", { class: "slots" });
      const chips = el("div", { class: "chips" });
      let step = 0;

      function build() {
        step = 0;
        slots.textContent = "";
        chips.textContent = "";
        b.items.forEach((_, index) => slots.append(el("div", { class: "slot", text: index + 1 + ". …" })));
        const deck = shuffled(b.items.map((text, index) => ({ text: text, index: index })));
        deck.forEach((item) => {
          const chip = el("button", { class: "chip", text: item.text });
          chip.addEventListener("click", () => {
            if (item.index !== step) {
              chip.classList.add("wrong");
              setTimeout(() => chip.classList.remove("wrong"), 600);
              verdict.className = "verdict no";
              verdict.textContent = "Не цей — спершу те, що сталося раніше.";
              return;
            }
            chip.classList.add("used");
            const slot = slots.children[step];
            slot.className = "slot filled";
            slot.textContent = step + 1 + ". " + item.text;
            step += 1;
            verdict.className = "verdict";
            verdict.textContent = "";
            if (step === b.items.length) {
              verdict.className = "verdict ok";
              verdict.textContent = randomOf(CHEERS) + " " + (b.explain || "");
              doneMark.textContent = "✓";
              markDone(ctx.key);
            }
          });
          chips.append(chip);
        });
      }

      build();
      const resetBtn = el("button", { class: "btn flat", text: "Спочатку ↺" });
      resetBtn.addEventListener("click", () => {
        verdict.className = "verdict";
        verdict.textContent = "";
        build();
      });

      return card("order", b.title || "Постав по порядку", doneMark, [
        el("div", { html: b.question }),
        slots,
        chips,
        el("div", { class: "toolbar" }, resetBtn),
        verdict,
      ]);
    },

    /* Коротка письмова відповідь: слово, ім’я або дата. */
    input(b, ctx) {
      const verdict = el("div", { class: "verdict" });
      const doneMark = el("span", { class: "done-mark", text: isDone(ctx.key) ? "✓" : "" });
      const field = el("input", { class: "answer-input", type: "text", placeholder: b.placeholder || "Відповідь" });
      const accept = b.accept.map(normalize);
      let tries = 0;

      const checkBtn = el("button", { class: "btn", text: "Перевірити ✓" });
      checkBtn.addEventListener("click", () => {
        const mine = normalize(field.value);
        if (!mine) {
          verdict.className = "verdict no";
          verdict.textContent = "Впиши відповідь.";
          return;
        }
        if (accept.includes(mine)) {
          verdict.className = "verdict ok";
          verdict.textContent = randomOf(CHEERS) + " " + (b.explain || "");
          doneMark.textContent = "✓";
          markDone(ctx.key);
        } else {
          tries += 1;
          verdict.className = "verdict no";
          verdict.textContent =
            tries === 1
              ? "Ще ні. Подумай і спробуй знову."
              : "Не те. Підказка: " + (b.hint || "перечитай параграф вище.");
        }
      });
      field.addEventListener("keydown", (e) => {
        if (e.key === "Enter") checkBtn.click();
      });

      return card("input", b.title || "Впиши відповідь", doneMark, [
        el("div", { html: b.question }),
        field,
        el("div", { class: "toolbar" }, checkBtn),
        verdict,
      ]);
    },
  };

  const TAGS = {
    quiz: "питання",
    multi: "кілька відповідей",
    order: "по порядку",
    input: "впиши",
    note: "важливо",
    cherkasy: "Черкащина",
    ukraine: "Україна",
    life: "з життя",
    game: "з гри",
    potter: "Гоґвортс",
    horse: "коні",
    errata: "увага",
    terms: "терміни",
    summary: "підсумок",
  };

  function card(kind, title, doneMark, bodyKids) {
    return el(
      "section",
      { class: "block " + kind },
      el(
        "div",
        { class: "block-head" },
        el("span", { class: "tag", text: TAGS[kind] || kind }),
        el("span", { text: title }),
        doneMark
      ),
      el("div", { class: "block-body" }, bodyKids)
    );
  }

  /* ---------- прогрес ---------- */

  const CHECKABLE = new Set(["quiz", "multi", "order", "input"]);

  function blockKey(lesson, block, index) {
    return lesson.id + ":" + (block.id || block.type + index);
  }

  function lessonStats(lesson) {
    let done = 0;
    let total = 0;
    lesson.blocks.forEach((block, index) => {
      if (!CHECKABLE.has(block.type)) return;
      total += 1;
      if (isDone(blockKey(lesson, block, index))) done += 1;
    });
    return { done: done, total: total, pct: total ? Math.round((done / total) * 100) : 0 };
  }

  function overallStats() {
    let done = 0;
    let total = 0;
    lessons.forEach((lesson) => {
      const stats = lessonStats(lesson);
      done += stats.done;
      total += stats.total;
    });
    return { done: done, total: total, pct: total ? Math.round((done / total) * 100) : 0 };
  }

  const progressWatchers = [];
  function refreshProgress() {
    progressWatchers.forEach((fn) => fn());
  }

  /* ---------- сторінки ---------- */

  function renderIndex(app) {
    const overall = overallStats();
    const hero = el(
      "div",
      { class: "hero" },
      el("div", { class: "kicker", text: "інтерактивний конспект" }),
      el("h1", { text: "Пізнаємо природу, 6 клас" }),
      el("p", {
        class: "lead",
        html:
          "За підручником Д. Д. Біди «Пізнаємо природу» (Освіта, 2023), § 7–10: електрика, світло й тінь. " +
          "Спочатку короткий конспект, далі пояснення з прикладами, у кінці — питання з перевіркою. " +
          "Приклади — про Черкаси й Черкащину.",
      }),
      el(
        "div",
        { class: "overall" },
        el("span", { class: "bar-label", text: "Зроблено завдань: " + overall.done + " з " + overall.total }),
        bar(overall.pct)
      )
    );

    const cards = el("div", { class: "cards" });
    lessons.forEach((lesson) => {
      const stats = lessonStats(lesson);
      cards.append(
        el(
          "a",
          { class: "card" + (lesson.exam ? " exam" : ""), href: "#/l/" + lesson.id },
          el("div", { class: "num", text: lesson.num ? "§ " + lesson.num : "Підсумок" }),
          el("div", { class: "title", text: lesson.title }),
          el("div", { class: "sub", text: lesson.subtitle || "" }),
          el("div", { class: "stat", text: "Питань: " + stats.done + " / " + stats.total }),
          bar(stats.pct)
        )
      );
    });

    const resetBtn = el("button", { class: "ghost-btn", text: "Скинути весь прогрес" });
    resetBtn.addEventListener("click", () => {
      if (!confirm("Стерти позначки про виконані завдання?")) return;
      store = { done: {} };
      save();
      render();
    });

    app.append(hero, cards, el("footer", { class: "page-foot" }, resetBtn));
  }

  function renderLesson(app, lesson) {
    app.append(
      el("div", {
        class: "kicker",
        text: lesson.num ? "§ " + lesson.num + (lesson.pages ? " · сторінки " + lesson.pages : "") : "підсумок",
      }),
      el("h1", { text: lesson.title }),
      lesson.subtitle ? el("p", { class: "lead", text: lesson.subtitle }) : null
    );

    if (lesson.goals && lesson.goals.length) {
      app.append(
        el(
          "div",
          { class: "goals" },
          el("b", { text: "Що треба знати з цього параграфа:" }),
          el("ul", { html: lesson.goals.map((goal) => "<li>" + goal + "</li>").join("") })
        )
      );
    }

    const progressLine = el("div", { class: "score" });
    const drawScore = () => {
      const now = lessonStats(lesson);
      progressLine.textContent = "";
      progressLine.append(
        el("span", { class: "bar-label", text: "Питань зроблено: " + now.done + " з " + now.total }),
        bar(now.pct)
      );
    };
    drawScore();
    progressWatchers.push(drawScore);
    app.append(progressLine);

    lesson.blocks.forEach((block, index) => {
      const make = BLOCKS[block.type];
      if (!make) return;
      app.append(make(block, { key: blockKey(lesson, block, index) }));
    });

    const position = lessons.indexOf(lesson);
    const prev = lessons[position - 1];
    const next = lessons[position + 1];
    app.append(
      el(
        "div",
        { class: "navrow" },
        prev
          ? el("a", { class: "ghost-btn", href: "#/l/" + prev.id, text: "← " + prev.title })
          : el("a", { class: "ghost-btn", href: "#/", text: "← На головну" }),
        next
          ? el("a", { class: "ghost-btn", href: "#/l/" + next.id, text: next.title + " →" })
          : el("a", { class: "ghost-btn", href: "#/", text: "На головну →" })
      )
    );
  }

  function updateMini() {
    const mini = document.getElementById("progressMini");
    if (!mini) return;
    const overall = overallStats();
    mini.textContent = overall.done + " / " + overall.total + " завдань";
  }

  function render() {
    const app = document.getElementById("app");
    app.textContent = "";
    progressWatchers.length = 0;
    progressWatchers.push(updateMini);

    const match = (location.hash || "#/").match(/^#\/l\/(.+)$/);
    const lesson = match ? lessons.find((item) => item.id === match[1]) : null;
    if (lesson) renderLesson(app, lesson);
    else renderIndex(app);

    window.scrollTo(0, 0);
    updateMini();
  }

  return {
    addLesson(lesson) {
      lessons.push(lesson);
    },
    start() {
      window.addEventListener("hashchange", render);
      render();
    },
  };
})();
