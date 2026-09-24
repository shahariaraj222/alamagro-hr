let currentUser = null;
let attDraft = {};
let attDate = db.todayISO();

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

function taka(n) {
  const x = Number(n || 0);
  return x.toLocaleString("bn-BD", { maximumFractionDigits: 0 }) + "৳";
}
function bnDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.style.display = "block";
  setTimeout(() => { el.style.display = "none"; }, 2400);
}
function initials(name) {
  return (name || "?").trim().slice(0, 1);
}

function showLogin() {
  $("#loginScreen").classList.remove("hidden");
  $("#appShell").classList.add("hidden");
}
function showApp() {
  $("#loginScreen").classList.add("hidden");
  $("#appShell").classList.remove("hidden");
  $("#whoLine").innerHTML = `${currentUser.name}<small style="display:block;opacity:.75">${currentUser.role === "owner" ? "মালিক" : "ম্যানেজার"}</small>`;
  $$(".owner-only").forEach((el) => el.classList.toggle("hidden", currentUser.role !== "owner"));
  go("dash");
}

function go(page) {
  $$(".page").forEach((p) => p.classList.remove("active"));
  $$(".nav button").forEach((b) => b.classList.toggle("active", b.dataset.page === page));
  $("#page-" + page).classList.add("active");
  if (page === "dash") renderDash();
  if (page === "emp") renderEmp();
  if (page === "att") renderAtt();
  if (page === "adv") renderAdv();
  if (page === "pay") renderPay();
  if (page === "rep") renderRep();
  if (page === "set") renderSet();
}

function renderDash() {
  const date = db.todayISO();
  const active = db.employees({ status: "active" });
  const marked = db.attendanceOf(date);
  const p = marked.filter((a) => a.status === "P").length;
  const a = marked.filter((a) => a.status === "A").length;
  const pending = db.pendingActive(date).length;
  $("#dashDate").textContent = bnDate(date);
  $("#stActive").textContent = active.length;
  $("#stP").textContent = p;
  $("#stA").textContent = a;
  $("#stPend").textContent = pending;

  const logs = db.state.audits.slice(0, 8);
  $("#dashAudit").innerHTML = logs.length
    ? logs.map((l) => `<div class="audit"><b>${l.userName}</b> · ${l.action}<div class="muted">${l.detail}<br>${new Date(l.at).toLocaleString("bn-BD")}</div></div>`).join("")
    : `<p class="muted">এখনো কোনো ইনপুট নেই</p>`;
}

function empPhoto(e) {
  if (e.photo) return `<div class="avatar"><img src="${e.photo}" alt=""></div>`;
  return `<div class="avatar">${initials(e.name)}</div>`;
}

function renderEmp() {
  const q = $("#empSearch")?.value || "";
  const status = $("#empFilter")?.value || "";
  const list = db.employees({ q, status: status || undefined });
  $("#empList").innerHTML = list.map((e) => {
    const due = db.companyOwes(e.id);
    const adv = db.employeeOwes(e.id);
    const stLabel = e.status === "active" ? "এক্টিভ" : e.status === "suspended" ? "সাসপেন্ড" : "ক্লোজ";
    const tag = e.status === "active" ? "tag" : e.status === "suspended" ? "tag warn" : "tag off";
    return `<div class="item">
      ${empPhoto(e)}
      <div class="meta">
        <b>${e.name}</b>
        <span>${e.code} · ${e.mobile || "মোবাইল নেই"} · বেতন ${taka(e.salary)}</span>
        <span>কোম্পানি পাওনা ${taka(due)} · অগ্রিম বাকি ${taka(adv)}</span>
      </div>
      <span class="${tag}">${stLabel}</span>
      <button class="btn ghost sm" onclick="openEmp('${e.id}')">খুলুন</button>
    </div>`;
  }).join("") || `<p class="muted">কোনো কর্মচারী নেই</p>`;
}

function clearEmpForm() {
  $("#empEditId").value = "";
  $("#fName").value = "";
  $("#fMobile").value = "";
  $("#fAddress").value = "";
  $("#fNid").value = "";
  $("#fGName").value = "";
  $("#fGMobile").value = "";
  $("#fJoin").value = db.todayISO();
  $("#fSalary").value = "";
  $("#fPhoto").value = "";
  $("#photoPrev").classList.add("hidden");
  $("#empFormTitle").textContent = "নতুন কর্মচারী";
}

function openEmp(id) {
  const e = db.empById(id);
  if (!e) return;
  $("#empEditId").value = e.id;
  $("#fName").value = e.name;
  $("#fMobile").value = e.mobile;
  $("#fAddress").value = e.address;
  $("#fNid").value = e.nid;
  $("#fGName").value = e.guardianName;
  $("#fGMobile").value = e.guardianMobile;
  $("#fJoin").value = e.joinDate;
  $("#fSalary").value = e.salary;
  if (e.photo) {
    $("#photoPrev").src = e.photo;
    $("#photoPrev").classList.remove("hidden");
  } else $("#photoPrev").classList.add("hidden");
  $("#empFormTitle").textContent = e.name + " · " + e.code;
  $("#empStatusBox").classList.remove("hidden");
  $("#empStatusBox").dataset.id = e.id;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function fileToData(file) {
  return new Promise((res) => {
    if (!file) return res("");
    const img = new Image();
    const fr = new FileReader();
    fr.onload = () => {
      img.onload = () => {
        const c = document.createElement("canvas");
        const max = 320;
        const s = Math.min(1, max / Math.max(img.width, img.height));
        c.width = img.width * s; c.height = img.height * s;
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        res(c.toDataURL("image/jpeg", 0.7));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

async function saveEmp(ev) {
  ev.preventDefault();
  const id = $("#empEditId").value;
  const file = $("#fPhoto").files[0];
  let photo = id ? (db.empById(id)?.photo || "") : "";
  if (file) photo = await fileToData(file);
  const data = {
    name: $("#fName").value.trim(),
    mobile: $("#fMobile").value.trim(),
    address: $("#fAddress").value.trim(),
    nid: $("#fNid").value.trim(),
    guardianName: $("#fGName").value.trim(),
    guardianMobile: $("#fGMobile").value.trim(),
    joinDate: $("#fJoin").value,
    salary: Number($("#fSalary").value || 0),
    photo
  };
  if (!data.name || !data.salary) return toast("নাম ও বেতন লাগবে");
  if (id) {
    const old = db.empById(id);
    if (currentUser.role !== "owner") data.salary = old.salary;
    db.updateEmployee(currentUser, id, data);
    if (currentUser.role === "owner" && Number(old.salary) !== Number(data.salary)) {
      db.setSalary(currentUser, id, data.salary, db.todayISO(), "ফর্ম থেকে বেতন হালনাগাদ");
    }
    toast("কর্মী আপডেট হয়েছে");
  } else {
    db.addEmployee(currentUser, data);
    toast("নতুন কর্মচারী যোগ হয়েছে");
  }
  clearEmpForm();
  $("#empStatusBox").classList.add("hidden");
  renderEmp();
}

function changeStatus(status) {
  const id = $("#empStatusBox").dataset.id;
  const r = db.setStatus(currentUser, id, status);
  if (!r.ok) return toast(r.msg);
  toast("স্ট্যাটাস বদলানো হয়েছে");
  renderEmp();
}

function renderAtt() {
  attDate = $("#attDate").value || db.todayISO();
  $("#attDate").value = attDate;
  const pending = db.pendingActive(attDate);
  const done = db.markedList(attDate);
  $("#attHint").textContent = `বাকি ${pending.length} জন · জমা ${done.length} জন`;

  $("#attPending").innerHTML = pending.map((e) => {
    const sel = attDraft[e.id] || "";
    return `<div class="item">
      ${empPhoto(e)}
      <div class="meta"><b>${e.name}</b><span>${e.code}</span></div>
      <div class="pa">
        <button class="${sel === "P" ? "on-p" : ""}" onclick="tick('${e.id}','P')">P</button>
        <button class="${sel === "A" ? "on-a" : ""}" onclick="tick('${e.id}','A')">A</button>
      </div>
    </div>`;
  }).join("") || `<p class="muted">এই তারিখের সব এন্ট্রি হয়ে গেছে</p>`;

  const canEdit = currentUser.role === "owner";
  $("#attDone").innerHTML = done.map(({ emp, rec }) => `<div class="item">
    ${empPhoto(emp)}
    <div class="meta">
      <b>${emp.name}</b>
      <span>${rec.status === "P" ? "প্রেজেন্ট" : "অ্যাবসেন্ট"} · ${rec.updatedAt ? "সংশোধিত" : "জমা"}</span>
    </div>
    ${canEdit ? `<div class="pa">
      <button class="${rec.status === "P" ? "on-p" : ""}" onclick="ownerFix('${rec.id}','P')">P</button>
      <button class="${rec.status === "A" ? "on-a" : ""}" onclick="ownerFix('${rec.id}','A')">A</button>
    </div>` : `<span class="tag ${rec.status === "P" ? "" : "bad"}">${rec.status}</span>`}
  </div>`).join("") || `<p class="muted">এখনো সাবমিট হয়নি</p>`;
}

function tick(id, status) {
  attDraft[id] = attDraft[id] === status ? "" : status;
  renderAtt();
}

function submitAtt() {
  const items = Object.entries(attDraft)
    .filter(([, s]) => s)
    .map(([empId, status]) => ({ empId, status }));
  if (!items.length) return toast("অন্তত একজনকে P বা A দিন");
  db.markAttendance(currentUser, attDate, items);
  attDraft = {};
  toast("হাজিরা জমা হয়েছে");
  renderAtt();
}

function ownerFix(recId, status) {
  const reason = prompt("সংশোধনের কারণ লিখুন");
  if (!reason) return;
  db.ownerEditAttendance(currentUser, recId, status, reason);
  toast("সংশোধন হয়েছে");
  renderAtt();
}

function renderAdv() {
  const emps = db.employees({ status: "active" });
  $("#advEmp").innerHTML = emps.map((e) => `<option value="${e.id}">${e.name} · ${e.code}</option>`).join("");
  const rows = [...db.state.advances].reverse().slice(0, 30);
  $("#advList").innerHTML = rows.map((a) => {
    const e = db.empById(a.empId);
    const open = Number(a.amount) - Number(a.recovered || 0);
    return `<div class="item">
      <div class="meta">
        <b>${e?.name || "?"}</b>
        <span>${bnDate(a.date)} · ${taka(a.amount)} · বাকি ${taka(open)}${a.note ? " · " + a.note : ""}</span>
      </div>
    </div>`;
  }).join("") || `<p class="muted">কোনো অগ্রিম নেই</p>`;
}

function saveAdv(ev) {
  ev.preventDefault();
  const empId = $("#advEmp").value;
  const amount = Number($("#advAmt").value);
  if (!empId || !amount) return toast("কর্মী ও টাকা দিন");
  db.addAdvance(currentUser, empId, amount, $("#advDate").value || db.todayISO(), $("#advNote").value);
  $("#advAmt").value = "";
  $("#advNote").value = "";
  toast("অগ্রিম সেভ হয়েছে");
  renderAdv();
}

function renderPay() {
  const ym = $("#payMonth").value || db.todayISO().slice(0, 7);
  $("#payMonth").value = ym;
  const list = db.employees({ status: "active" }).concat(db.employees({ status: "suspended" }));
  $("#payTable").innerHTML = `<tr>
    <th>কর্মী</th><th>প্রেজেন্ট</th><th>অর্জিত</th><th>অগ্রিম</th><th>নেট</th><th>দেওয়া</th><th>বকেয়া</th><th></th>
  </tr>` + list.map((e) => {
    const p = db.monthPayable(e.id, ym);
    return `<tr>
      <td><b>${e.name}</b><div class="muted">${e.code}</div></td>
      <td>${p.present}/${p.dim}</td>
      <td>${taka(p.earned)}</td>
      <td>${taka(p.advanceOut)}</td>
      <td>${taka(p.net)}</td>
      <td>${taka(p.paid)}</td>
      <td><b>${taka(p.due)}</b></td>
      <td><button class="btn sm" onclick="openPay('${e.id}','${ym}')">ক্যাশ</button></td>
    </tr>`;
  }).join("");

  const pays = db.state.payments.filter((x) => x.month === ym).slice().reverse();
  $("#payLogs").innerHTML = pays.map((p) => {
    const e = db.empById(p.empId);
    const who = db.users().find((u) => u.id === p.by);
    return `<div class="item">
      <div class="meta">
        <b>${e?.name || "?"} · ${taka(p.amount)}</b>
        <span>${who?.name || ""} · ${bnDate(p.date)}${p.voided ? " · বাতিল" : ""}</span>
      </div>
      ${currentUser.role === "owner" && !p.voided ? `<button class="btn danger sm" onclick="voidPay('${p.id}')">বাতিল</button>` : ""}
    </div>`;
  }).join("") || `<p class="muted">এই মাসে পেমেন্ট নেই</p>`;
}

function openPay(empId, ym) {
  const e = db.empById(empId);
  const p = db.monthPayable(empId, ym);
  const amt = prompt(`${e.name}\nনেট ${Math.round(p.net)}৳, বকেয়া ${Math.round(p.due)}৳\nএখন কত ক্যাশ দিচ্ছেন?`, String(Math.max(0, Math.round(p.due))));
  if (amt === null) return;
  const n = Number(amt);
  if (!(n > 0)) return toast("সঠিক টাকা দিন");
  const recDef = Math.min(p.advanceOut, p.earned);
  const rec = prompt("এই পেমেন্টে অগ্রিম থেকে কত সমন্বয় হবে?", String(Math.round(recDef))) || "0";
  db.addPayment(currentUser, empId, ym, n, "ক্যাশ", Number(rec || 0));
  toast("ক্যাশ মার্ক হয়েছে");
  renderPay();
}

function voidPay(id) {
  const reason = prompt("বাতিলের কারণ");
  if (!reason) return;
  db.voidPayment(currentUser, id, reason);
  renderPay();
}

function renderRep() {
  const ym = $("#repMonth").value || db.todayISO().slice(0, 7);
  $("#repMonth").value = ym;
  const q = ($("#repQ").value || "").toLowerCase();
  let list = db.employees();
  if (q) list = list.filter((e) => e.name.toLowerCase().includes(q) || e.code.toLowerCase().includes(q));
  const dim = db.daysInMonth(ym);
  const dates = Array.from({ length: dim }, (_, i) => ym + "-" + String(i + 1).padStart(2, "0"));
  let html = `<div style="overflow:auto"><table><tr><th>কর্মী</th>`;
  dates.forEach((d) => { html += `<th>${d.slice(-2)}</th>`; });
  html += `<th>P</th><th>A</th><th>নেট</th><th>বকেয়া</th></tr>`;
  list.forEach((e) => {
    const map = {};
    db.state.attendance.filter((a) => a.empId === e.id && a.date.startsWith(ym)).forEach((a) => { map[a.date] = a.status; });
    const p = db.monthPayable(e.id, ym);
    html += `<tr><td>${e.name}<div class="muted">${e.code}</div></td>`;
    dates.forEach((d) => {
      const s = map[d];
      html += `<td>${s === "P" ? "P" : s === "A" ? "A" : ""}</td>`;
    });
    html += `<td>${p.present}</td><td>${p.absent}</td><td>${Math.round(p.net)}</td><td>${Math.round(p.due)}</td></tr>`;
  });
  html += `</table></div>`;
  $("#repBox").innerHTML = html;
}

function downloadExcel() {
  const ym = $("#repMonth").value || db.todayISO().slice(0, 7);
  const dim = db.daysInMonth(ym);
  const dates = Array.from({ length: dim }, (_, i) => String(i + 1).padStart(2, "0"));
  const rows = [];
  const head = ["কোড", "নাম", "মোবাইল", "বেতন", ...dates.map((d) => d), "প্রেজেন্ট", "অ্যাবসেন্ট", "অর্জিত", "অগ্রিম", "নেট", "পরিশোধ", "বকেয়া"];
  rows.push(head);
  db.employees().forEach((e) => {
    const map = {};
    db.state.attendance.filter((a) => a.empId === e.id && a.date.startsWith(ym)).forEach((a) => { map[a.date.slice(-2)] = a.status; });
    const p = db.monthPayable(e.id, ym);
    rows.push([
      e.code, e.name, e.mobile, e.salary,
      ...dates.map((d) => map[d] || ""),
      p.present, p.absent, Math.round(p.earned), Math.round(p.advanceOut),
      Math.round(p.net), Math.round(p.paid), Math.round(p.due)
    ]);
  });
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, ym);
  XLSX.writeFile(wb, `Alamagro-HR-${ym}.xlsx`);
  db.audit(currentUser, "এক্সেল ডাউনলোড", ym);
}

function renderSet() {
  if (currentUser.role !== "owner") {
    $("#setBody").innerHTML = `<p class="muted">সেটিংস শুধু মালিক দেখতে পারবেন</p>`;
    return;
  }
  const emps = db.employees({ status: "active" });
  $("#setEmp").innerHTML = emps.map((e) => `<option value="${e.id}">${e.name} · এখন ${e.salary}৳</option>`).join("");
  $("#userList").innerHTML = db.users().map((u) => `<div class="item">
    <div class="meta"><b>${u.name}</b><span>${u.email} · ${u.role === "owner" ? "মালিক" : "ম্যানেজার"}</span></div>
  </div>`).join("");
}

function saveInc(ev) {
  ev.preventDefault();
  const id = $("#setEmp").value;
  const amt = Number($("#incAmt").value);
  const from = $("#incFrom").value;
  if (!id || !amt || !from) return toast("সব ঘর পূরণ করুন");
  db.setSalary(currentUser, id, amt, from, $("#incNote").value || "ইনক্রিমেন্ট");
  toast("ইনক্রিমেন্ট সেভ");
  $("#incAmt").value = "";
  renderSet();
}

function addMgr(ev) {
  ev.preventDefault();
  db.addUser(currentUser, {
    name: $("#mgrName").value.trim(),
    email: $("#mgrEmail").value.trim(),
    password: $("#mgrPass").value,
    role: "manager"
  });
  $("#mgrName").value = $("#mgrEmail").value = $("#mgrPass").value = "";
  toast("ম্যানেজার যোগ হয়েছে");
  renderSet();
}

function backupDown() {
  const blob = new Blob([db.exportAll()], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "alamagro-hr-backup.json";
  a.click();
}

function backupUp(ev) {
  const file = ev.target.files[0];
  if (!file) return;
  const fr = new FileReader();
  fr.onload = () => {
    try {
      db.importAll(fr.result, currentUser);
      toast("রিস্টোর হয়েছে");
      go("dash");
    } catch (e) { toast("ফাইল ঠিক নেই"); }
  };
  fr.readAsText(file);
}

function doLogin(ev) {
  ev.preventDefault();
  const u = db.login($("#email").value, $("#password").value);
  if (!u) return toast("ইমেইল বা পাসওয়ার্ড ভুল");
  currentUser = u;
  sessionStorage.setItem("alamagro_uid", u.id);
  showApp();
}

function logout() {
  currentUser = null;
  sessionStorage.removeItem("alamagro_uid");
  showLogin();
}

function restoreSession() {
  const id = sessionStorage.getItem("alamagro_uid");
  if (!id) return showLogin();
  currentUser = db.users().find((u) => u.id === id);
  if (currentUser) showApp();
  else showLogin();
}

window.addEventListener("DOMContentLoaded", () => {
  $("#attDate").value = db.todayISO();
  $("#advDate").value = db.todayISO();
  $("#fJoin").value = db.todayISO();
  $("#payMonth").value = db.todayISO().slice(0, 7);
  $("#repMonth").value = db.todayISO().slice(0, 7);
  $("#incFrom").value = db.todayISO();
  restoreSession();
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
});
