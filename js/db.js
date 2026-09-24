const DB_KEY = "alamagro_hr_v1";

const SEED_USERS = [
  { id: "u-owner", name: "মালিক", email: "Shahariaraj222@gmail.com", password: "Jotee3025", role: "owner" },
  { id: "u-mgr1", name: "ম্যানেজার ১", email: "Alamagro@gmail.com", password: "Alamagro2026", role: "manager" }
];

function uid(prefix) {
  return prefix + "-" + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
}

function todayISO() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 10);
}

function daysInMonth(ym) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

function monthOf(date) { return date.slice(0, 7); }

function loadState() {
  const raw = localStorage.getItem(DB_KEY);
  if (raw) {
    try { return JSON.parse(raw); } catch (e) {}
  }
  const state = {
    users: SEED_USERS,
    employees: [],
    attendance: [],
    advances: [],
    payments: [],
    salaryHistory: [],
    audits: [],
    seq: 1
  };
  saveState(state);
  return state;
}

function saveState(state) {
  localStorage.setItem(DB_KEY, JSON.stringify(state));
}

let state = loadState();

function persist() { saveState(state); }

function audit(user, action, detail, extra) {
  state.audits.unshift({
    id: uid("log"),
    at: new Date().toISOString(),
    userId: user?.id || null,
    userName: user?.name || "সিস্টেম",
    action,
    detail,
    extra: extra || null
  });
  if (state.audits.length > 800) state.audits.length = 800;
  persist();
}

function nextEmpCode() {
  const n = String(state.seq++).padStart(3, "0");
  persist();
  return "ALG-" + n;
}

function employees(filter) {
  let list = state.employees.slice().sort((a, b) => a.name.localeCompare(b.name, "bn"));
  if (filter?.status) list = list.filter((e) => e.status === filter.status);
  if (filter?.q) {
    const q = filter.q.toLowerCase();
    list = list.filter((e) =>
      e.name.toLowerCase().includes(q) ||
      e.code.toLowerCase().includes(q) ||
      (e.mobile || "").includes(q)
    );
  }
  return list;
}

function empById(id) { return state.employees.find((e) => e.id === id); }

function salaryOnDate(empId, date) {
  const hist = state.salaryHistory
    .filter((s) => s.empId === empId && s.from <= date)
    .sort((a, b) => b.from.localeCompare(a.from));
  if (hist[0]) return Number(hist[0].amount);
  const e = empById(empId);
  return e ? Number(e.salary) : 0;
}

function attendanceOf(date) {
  return state.attendance.filter((a) => a.date === date);
}

function markAttendance(user, date, items) {
  const existing = attendanceOf(date);
  const lockedForManager = user.role !== "owner";
  const saved = [];
  items.forEach((it) => {
    const found = existing.find((a) => a.empId === it.empId);
    if (found) {
      if (lockedForManager) return;
      const prev = found.status;
      found.status = it.status;
      found.updatedAt = new Date().toISOString();
      found.updatedBy = user.id;
      saved.push({ ...found, prev });
    } else {
      const rec = {
        id: uid("att"),
        empId: it.empId,
        date,
        status: it.status,
        createdAt: new Date().toISOString(),
        createdBy: user.id,
        updatedAt: null,
        updatedBy: null
      };
      state.attendance.push(rec);
      saved.push(rec);
    }
  });
  persist();
  return saved;
}

function monthStats(empId, ym) {
  const dim = daysInMonth(ym);
  const recs = state.attendance.filter((a) => a.empId === empId && monthOf(a.date) === ym);
  const present = recs.filter((a) => a.status === "P").length;
  const absent = recs.filter((a) => a.status === "A").length;
  const marked = recs.length;
  const mid = ym + "-15";
  const salary = salaryOnDate(empId, mid);
  const daily = salary / dim;
  const earned = +(daily * present).toFixed(2);
  const deduction = +(daily * absent).toFixed(2);
  return { dim, present, absent, marked, unmarked: Math.max(0, dim - marked), salary, daily, earned, deduction };
}

function advancesOf(empId) {
  return state.advances.filter((a) => a.empId === empId);
}

function advanceOutstanding(empId) {
  return advancesOf(empId).reduce((s, a) => s + Number(a.amount) - Number(a.recovered || 0), 0);
}

function paymentsOf(empId, ym) {
  return state.payments.filter((p) => p.empId === empId && (!ym || p.month === ym) && !p.voided);
}

function paidAmount(empId, ym) {
  return paymentsOf(empId, ym).reduce((s, p) => s + Number(p.amount), 0);
}

function monthPayable(empId, ym) {
  const st = monthStats(empId, ym);
  const adv = advanceOutstanding(empId);
  const recover = Math.min(adv, st.earned);
  const net = +(st.earned - recover).toFixed(2);
  const paid = paidAmount(empId, ym);
  const due = +(net - paid).toFixed(2);
  return { ...st, advanceOut: adv, recover, net, paid, due };
}

function companyOwes(empId) {
  const months = new Set(state.attendance.filter((a) => a.empId === empId).map((a) => monthOf(a.date)));
  months.add(todayISO().slice(0, 7));
  let due = 0;
  months.forEach((m) => {
    const p = monthPayable(empId, m);
    due += Math.max(0, p.due);
  });
  return +due.toFixed(2);
}

function employeeOwes(empId) {
  return +advanceOutstanding(empId).toFixed(2);
}

function canClose(empId) {
  return companyOwes(empId) <= 0.009 && employeeOwes(empId) <= 0.009;
}

const db = {
  state,
  reload() { state = loadState(); this.state = state; return state; },
  persist,
  audit,
  uid,
  todayISO,
  daysInMonth,
  monthOf,
  users() { return state.users; },
  login(email, password) {
    const e = (email || "").trim().toLowerCase();
    return state.users.find((u) => u.email.toLowerCase() === e && u.password === password) || null;
  },
  addUser(actor, data) {
    const u = { id: uid("u"), role: "manager", ...data };
    state.users.push(u);
    audit(actor, "ম্যানেজার যোগ", u.name + " · " + u.email);
    persist();
    return u;
  },
  updateUser(actor, id, patch) {
    const u = state.users.find((x) => x.id === id);
    if (!u) return;
    Object.assign(u, patch);
    audit(actor, "ইউজার হালনাগাদ", u.name);
    persist();
  },
  employees,
  empById,
  addEmployee(actor, data) {
    const emp = {
      id: uid("emp"),
      code: data.code || nextEmpCode(),
      name: data.name,
      mobile: data.mobile || "",
      address: data.address || "",
      nid: data.nid || "",
      photo: data.photo || "",
      guardianName: data.guardianName || "",
      guardianMobile: data.guardianMobile || "",
      joinDate: data.joinDate || todayISO(),
      salary: Number(data.salary || 0),
      status: "active",
      createdAt: new Date().toISOString()
    };
    state.employees.push(emp);
    state.salaryHistory.push({
      id: uid("sal"),
      empId: emp.id,
      amount: emp.salary,
      from: emp.joinDate,
      note: "শুরুর বেতন",
      by: actor.id
    });
    audit(actor, "নতুন কর্মচারী", emp.name + " · " + emp.code);
    persist();
    return emp;
  },
  updateEmployee(actor, id, patch) {
    const e = empById(id);
    if (!e) return;
    const before = { ...e };
    Object.assign(e, patch);
    audit(actor, "কর্মী হালনাগাদ", e.name, { before, after: { ...e } });
    persist();
  },
  setSalary(actor, empId, amount, from, note) {
    const e = empById(empId);
    if (!e) return;
    const old = e.salary;
    e.salary = Number(amount);
    state.salaryHistory.push({
      id: uid("sal"), empId, amount: Number(amount), from, note: note || "ইনক্রিমেন্ট", by: actor.id
    });
    audit(actor, "বেতন পরিবর্তন", `${e.name}: ${old} → ${amount} (${from})`);
    persist();
  },
  setStatus(actor, empId, status) {
    const e = empById(empId);
    if (!e) return { ok: false, msg: "কর্মী পাওয়া যায়নি" };
    if (status === "closed" && !canClose(empId)) {
      return { ok: false, msg: "পাওনা/অগ্রিম বাকি থাকায় ক্লোজ করা যাবে না" };
    }
    e.status = status;
    audit(actor, "স্ট্যাটাস", `${e.name} → ${status}`);
    persist();
    return { ok: true };
  },
  attendanceOf,
  pendingActive(date) {
    const marked = new Set(attendanceOf(date).map((a) => a.empId));
    return employees({ status: "active" }).filter((e) => !marked.has(e.id));
  },
  markedList(date) {
    const map = Object.fromEntries(attendanceOf(date).map((a) => [a.empId, a]));
    return employees({ status: "active" })
      .map((e) => ({ emp: e, rec: map[e.id] || null }))
      .filter((x) => x.rec);
  },
  markAttendance(user, date, items) {
    const saved = markAttendance(user, date, items);
    const p = items.filter((i) => i.status === "P").length;
    const a = items.filter((i) => i.status === "A").length;
    audit(user, "হাজিরা সাবমিট", `${date} · প্রেজেন্ট ${p}, অ্যাবসেন্ট ${a}`);
    persist();
    return saved;
  },
  ownerEditAttendance(user, recId, status, reason) {
    const rec = state.attendance.find((a) => a.id === recId);
    if (!rec || user.role !== "owner") return;
    const prev = rec.status;
    rec.status = status;
    rec.updatedAt = new Date().toISOString();
    rec.updatedBy = user.id;
    rec.reason = reason;
    audit(user, "হাজিরা সংশোধন", `${empById(rec.empId)?.name || rec.empId} ${rec.date}: ${prev} → ${status} · ${reason}`);
    persist();
  },
  addAdvance(user, empId, amount, date, note) {
    const rec = {
      id: uid("adv"), empId, amount: Number(amount), recovered: 0,
      date, note: note || "", by: user.id, createdAt: new Date().toISOString()
    };
    state.advances.push(rec);
    audit(user, "অগ্রিম", `${empById(empId)?.name}: ${amount}৳`);
    persist();
    return rec;
  },
  recoverAdvance(empId, amount) {
    let left = Number(amount);
    const list = advancesOf(empId).filter((a) => Number(a.amount) - Number(a.recovered || 0) > 0);
    list.forEach((a) => {
      if (left <= 0) return;
      const open = Number(a.amount) - Number(a.recovered || 0);
      const take = Math.min(open, left);
      a.recovered = Number(a.recovered || 0) + take;
      left -= take;
    });
    persist();
  },
  addPayment(user, empId, month, amount, note, recoverAdvanceTk) {
    const rec = {
      id: uid("pay"), empId, month, amount: Number(amount),
      date: todayISO(), note: note || "ক্যাশ", by: user.id,
      recoverAdvance: Number(recoverAdvanceTk || 0),
      voided: false, createdAt: new Date().toISOString()
    };
    state.payments.push(rec);
    if (rec.recoverAdvance > 0) this.recoverAdvance(empId, rec.recoverAdvance);
    audit(user, "ক্যাশ পেমেন্ট", `${empById(empId)?.name}: ${amount}৳ (${month})`);
    persist();
    return rec;
  },
  voidPayment(user, payId, reason) {
    if (user.role !== "owner") return false;
    const p = state.payments.find((x) => x.id === payId);
    if (!p || p.voided) return false;
    p.voided = true;
    p.voidReason = reason;
    if (p.recoverAdvance) {
      state.advances.push({
        id: uid("adv"), empId: p.empId, amount: Number(p.recoverAdvance), recovered: 0,
        date: todayISO(), note: "পেমেন্ট বাতিলের ফেরত অগ্রিম", by: user.id, createdAt: new Date().toISOString()
      });
    }
    audit(user, "পেমেন্ট বাতিল", `${empById(p.empId)?.name}: ${p.amount}৳ · ${reason}`);
    persist();
    return true;
  },
  monthPayable,
  companyOwes,
  employeeOwes,
  canClose,
  monthStats,
  salaryOnDate,
  exportAll() { return JSON.stringify(state, null, 2); },
  importAll(json, actor) {
    const data = JSON.parse(json);
    state = data;
    this.state = state;
    persist();
    audit(actor, "ব্যাকআপ থেকে রিস্টোর", "সম্পূর্ণ ডেটা");
  }
};
