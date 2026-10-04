const SUPABASE_URL = "https://yiqxylckxkjnmenmykik.supabase.co";
const SUPABASE_KEY = "sb_publishable_8tH2zh33We3vWO7sk9vrtA_VUWQH9NX";

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

const app = document.getElementById("app");

function esc(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function niceDate(value) {
  const d = new Date(value);
  return d.toLocaleString();
}

function msg(text, error = false) {
  return `<div class="notice${error ? " error" : ""}">${esc(text)}</div>`;
}

async function currentUser() {
  const { data } = await db.auth.getUser();
  return data.user || null;
}

function usernameFor(user) {
  return user?.user_metadata?.username || user?.email?.split("@")[0] || "member";
}

async function render() {
  const hash = location.hash || "#/";
  if (hash.startsWith("#/thread/")) {
    const id = hash.split("/")[2];
    return renderThread(id);
  }
  if (hash === "#/new") return renderNewThread();
  if (hash === "#/account") return renderAccount();
  return renderHome();
}

async function renderHome() {
  app.innerHTML = "<p>Loading forum...</p>";

  const user = await currentUser();
  const { data: threads, error } = await db
    .from("threads")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    app.innerHTML = msg(error.message, true);
    return;
  }

  app.innerHTML = `
    <div class="bar">
      General
      <span class="account-line">
        ${user ? `Signed in as ${esc(usernameFor(user))}` : "Guest"}
      </span>
      <div class="clear"></div>
    </div>
    <div class="box">
      Talk about whatever.
      ${user ? `<div><a class="button" href="#/new">New thread</a></div>` : `<div class="small" style="margin-top:8px">Sign in to make a thread or reply.</div>`}
    </div>

    <div class="bar">Threads</div>
    <div id="thread-list">
      ${
        threads.length
          ? threads.map(t => `
              <div class="topic">
                <div>
                  <div class="topic-title"><a href="#/thread/${t.id}">${esc(t.title)}</a></div>
                  <div class="topic-meta">by ${esc(t.author_name)} · ${niceDate(t.created_at)}</div>
                </div>
                <div class="right small">started<br>${niceDate(t.created_at)}</div>
              </div>
            `).join("")
          : `<div class="box">No threads yet.</div>`
      }
    </div>
  `;
}

async function renderNewThread() {
  const user = await currentUser();
  if (!user) {
    app.innerHTML = msg("You need to sign in first.") + `<a class="button" href="#/account">Account</a>`;
    return;
  }

  app.innerHTML = `
    <div class="bar">New thread</div>
    <div class="box">
      <form id="new-thread-form">
        <label for="title">Title</label>
        <input id="title" maxlength="100" required>

        <label for="body">Post</label>
        <textarea id="body" maxlength="10000" required></textarea>

        <button type="submit">Post thread</button>
        <a class="button" href="#/">Cancel</a>
      </form>
      <div id="form-message"></div>
    </div>
  `;

  document.getElementById("new-thread-form").addEventListener("submit", async e => {
    e.preventDefault();

    const title = document.getElementById("title").value.trim();
    const body = document.getElementById("body").value.trim();
    const out = document.getElementById("form-message");

    if (!title || !body) return;

    const { data, error } = await db
      .from("threads")
      .insert({
        title,
        body,
        author_id: user.id,
        author_name: usernameFor(user)
      })
      .select()
      .single();

    if (error) {
      out.innerHTML = msg(error.message, true);
      return;
    }

    location.hash = `#/thread/${data.id}`;
  });
}

async function renderThread(id) {
  app.innerHTML = "<p>Loading thread...</p>";

  const user = await currentUser();

  const { data: thread, error: threadError } = await db
    .from("threads")
    .select("*")
    .eq("id", id)
    .single();

  if (threadError || !thread) {
    app.innerHTML = msg("Thread not found.", true) + `<a class="button" href="#/">Back</a>`;
    return;
  }

  const { data: replies, error: repliesError } = await db
    .from("replies")
    .select("*")
    .eq("thread_id", id)
    .order("created_at", { ascending: true });

  if (repliesError) {
    app.innerHTML = msg(repliesError.message, true);
    return;
  }

  const allPosts = [
    {
      author_name: thread.author_name,
      body: thread.body,
      created_at: thread.created_at
    },
    ...replies
  ];

  app.innerHTML = `
    <div class="inline-actions">
      <a href="#/">Forums</a> &gt; ${esc(thread.title)}
    </div>

    <div class="bar">${esc(thread.title)}</div>
    ${allPosts.map((p, i) => `
      <div class="post">
        <div class="post-user">
          <strong>${esc(p.author_name)}</strong><br>
          <span class="small">member</span>
        </div>
        <div class="post-body">
          <div class="post-time">#${i + 1} · ${niceDate(p.created_at)}</div>
          ${esc(p.body)}
        </div>
      </div>
    `).join("")}

    ${
      user
        ? `
          <div class="bar" style="margin-top:14px">Reply</div>
          <div class="box">
            <form id="reply-form">
              <textarea id="reply-body" maxlength="10000" required></textarea>
              <button type="submit">Post reply</button>
            </form>
            <div id="reply-message"></div>
          </div>
        `
        : `<div class="notice" style="margin-top:14px"><a href="#/account">Sign in</a> to reply.</div>`
    }
  `;

  const replyForm = document.getElementById("reply-form");
  if (replyForm) {
    replyForm.addEventListener("submit", async e => {
      e.preventDefault();

      const body = document.getElementById("reply-body").value.trim();
      const out = document.getElementById("reply-message");
      if (!body) return;

      const { error } = await db.from("replies").insert({
        thread_id: Number(id),
        body,
        author_id: user.id,
        author_name: usernameFor(user)
      });

      if (error) {
        out.innerHTML = msg(error.message, true);
        return;
      }

      renderThread(id);
    });
  }
}

async function renderAccount() {
  const user = await currentUser();

  if (user) {
    app.innerHTML = `
      <div class="bar">Account</div>
      <div class="box">
        <p>Signed in as <strong>${esc(usernameFor(user))}</strong>.</p>
        <p class="small">${esc(user.email || "")}</p>
        <button id="logout">Log out</button>
      </div>
    `;

    document.getElementById("logout").addEventListener("click", async () => {
      await db.auth.signOut();
      renderAccount();
    });
    return;
  }

  app.innerHTML = `
    <div class="bar">Account</div>
    <div class="box">
      <form id="login-form">
        <label for="login-email">Email</label>
        <input id="login-email" type="email" required>

        <label for="login-password">Password</label>
        <input id="login-password" type="password" required>

        <button type="submit">Sign in</button>
      </form>
      <div id="login-message"></div>
    </div>

    <div class="bar">Register</div>
    <div class="box">
      <form id="signup-form">
        <label for="signup-name">Username</label>
        <input id="signup-name" maxlength="24" pattern="[A-Za-z0-9_-]{2,24}" required>
        <div class="small">2-24 characters. Letters, numbers, _ and - only.</div>

        <label for="signup-email">Email</label>
        <input id="signup-email" type="email" required>

        <label for="signup-password">Password</label>
        <input id="signup-password" type="password" minlength="6" required>

        <button type="submit">Register</button>
      </form>
      <div id="signup-message"></div>
    </div>
  `;

  document.getElementById("login-form").addEventListener("submit", async e => {
    e.preventDefault();
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;
    const out = document.getElementById("login-message");

    const { error } = await db.auth.signInWithPassword({ email, password });
    if (error) {
      out.innerHTML = msg(error.message, true);
      return;
    }

    location.hash = "#/";
    render();
  });

  document.getElementById("signup-form").addEventListener("submit", async e => {
    e.preventDefault();
    const username = document.getElementById("signup-name").value.trim();
    const email = document.getElementById("signup-email").value.trim();
    const password = document.getElementById("signup-password").value;
    const out = document.getElementById("signup-message");

    const { data, error } = await db.auth.signUp({
      email,
      password,
      options: {
        data: { username }
      }
    });

    if (error) {
      out.innerHTML = msg(error.message, true);
      return;
    }

    if (!data.session) {
      out.innerHTML = msg("Account made. Check your email if confirmation is turned on.");
    } else {
      location.hash = "#/";
      render();
    }
  });
}

window.addEventListener("hashchange", render);
db.auth.onAuthStateChange(() => {
  if (location.hash === "#/account") renderAccount();
});

render();
