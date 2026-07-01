import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabase";

const MEMBERS = [
  { id: "john_newton",   name: "John Newton",   role: "pilot" },
  { id: "craig_andrle",  name: "Craig Andrle",  role: "pilot" },
  { id: "aaron_vosmek",  name: "Aaron Vosmek",  role: "member" },
  { id: "erik_amunson",  name: "Erik Amunson",  role: "member" },
  { id: "todd_scott",    name: "Todd Scott",    role: "member" },
];

const TAIL = "N88606";
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const STATUS_COLOR  = { confirmed: "#22c55e", pending: "#f59e0b", cancelled: "#ef4444" };
const STATUS_BG     = { confirmed: "#dcfce7", pending: "#fef3c7", cancelled: "#fee2e2" };
const STATUS_DARK   = { confirmed: "#14532d", pending: "#78350f", cancelled: "#7f1d1d" };

function getDaysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
function getFirstDay(y, m)    { return new Date(y, m, 1).getDay(); }
function fmtDate(y, m, d)     { return `${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`; }
function parseDate(s)         { const [y,m,d] = s.split("-").map(Number); return { year:y, month:m-1, day:d }; }
function todayStr()           { const t = new Date(); return fmtDate(t.getFullYear(), t.getMonth(), t.getDate()); }
function memberById(id)       { return MEMBERS.find(m => m.id === id); }

const pilots  = MEMBERS.filter(m => m.role === "pilot");
const BLANK_FORM = {
  pilot: "john_newton", passengers: [], date: todayStr(),
  depart_time: "09:00", return_time: "17:00",
  destination: "", notes: "", status: "confirmed", hobbs_out: "",
};

/* ─── Styles ─── */
const label = { display:"block", fontSize:11, fontWeight:700, color:"#64748b", letterSpacing:"0.6px", textTransform:"uppercase", marginBottom:6 };
const input = { width:"100%", boxSizing:"border-box", padding:"10px 14px", borderRadius:8, border:"1px solid #1e3a5f", background:"#0f172a", color:"#e2e8f0", fontSize:14, outline:"none", fontFamily:"inherit" };
const card  = { background:"#1e293b", borderRadius:14, border:"1px solid #1e3a5f", padding:"18px 20px" };

export default function App() {
  const today = new Date();
  const [view,       setView]       = useState("calendar");
  const [calYear,    setCalYear]    = useState(today.getFullYear());
  const [calMonth,   setCalMonth]   = useState(today.getMonth());
  const [bookings,   setBookings]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [form,       setForm]       = useState(BLANK_FORM);
  const [editId,     setEditId]     = useState(null);
  const [formError,  setFormError]  = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [dayModal,   setDayModal]   = useState(null); // dateStr or null

  /* ── DB ── */
  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("bookings").select("*").order("date");
    setBookings(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Realtime subscription
  useEffect(() => {
    const ch = supabase.channel("bookings-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => load())
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [load]);

  async function saveBooking() {
    setFormError("");
    if (!form.pilot)             return setFormError("Select a pilot.");
    if (!form.date)              return setFormError("Select a date.");
    if (!form.destination.trim()) return setFormError("Enter a destination.");
    if (!form.depart_time || !form.return_time) return setFormError("Enter departure and return times.");

    setSaving(true);
    const payload = { ...form, passengers: form.passengers };

    let error;
    if (editId) {
      ({ error } = await supabase.from("bookings").update(payload).eq("id", editId));
    } else {
      ({ error } = await supabase.from("bookings").insert([payload]));
    }

    setSaving(false);
    if (error) return setFormError("Save failed: " + error.message);

    setSuccessMsg(editId ? "Booking updated!" : "Flight booked! The group can see it now.");
    setTimeout(() => setSuccessMsg(""), 4000);
    setForm(BLANK_FORM);
    setEditId(null);
    setView("calendar");
  }

  async function deleteBooking(id) {
    await supabase.from("bookings").delete().eq("id", id);
    setDayModal(null);
  }

  async function changeStatus(booking, status) {
    await supabase.from("bookings").update({ status }).eq("id", booking.id);
    setDayModal(null);
  }

  function startEdit(b) {
    setForm({
      pilot: b.pilot, passengers: b.passengers || [],
      date: b.date, depart_time: b.depart_time, return_time: b.return_time,
      destination: b.destination, notes: b.notes || "",
      status: b.status, hobbs_out: b.hobbs_out || "",
    });
    setEditId(b.id);
    setDayModal(null);
    setView("book");
  }

  function navView(v) {
    setView(v);
    if (v !== "book") { setEditId(null); setForm(BLANK_FORM); setFormError(""); }
  }

  /* ── Calendar helpers ── */
  function prevMonth() { calMonth === 0 ? (setCalYear(y=>y-1), setCalMonth(11)) : setCalMonth(m=>m-1); }
  function nextMonth() { calMonth === 11 ? (setCalYear(y=>y+1), setCalMonth(0))  : setCalMonth(m=>m+1); }
  const daysInMonth = getDaysInMonth(calYear, calMonth);
  const firstDay    = getFirstDay(calYear, calMonth);

  function booksForDay(d) {
    return bookings.filter(b => b.date === fmtDate(calYear, calMonth, d));
  }

  const upcoming = bookings.filter(b => b.date >= todayStr());

  /* ── Render ── */
  return (
    <div style={{ fontFamily:"'Inter',sans-serif", background:"#0f172a", minHeight:"100vh", color:"#e2e8f0" }}>

      {/* ── Header ── */}
      <header style={{ background:"linear-gradient(135deg,#1e293b 0%,#0f172a 100%)", borderBottom:"1px solid #1e3a5f" }}>
        <div style={{ maxWidth:980, margin:"0 auto", padding:"0 20px", display:"flex", alignItems:"center", justifyContent:"space-between", height:60 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <span style={{ fontSize:24 }}>✈</span>
            <div>
              <div style={{ fontWeight:700, fontSize:16, color:"#f1f5f9", letterSpacing:"-0.3px" }}>Panther Aviation</div>
              <div style={{ fontSize:10, color:"#475569", letterSpacing:"1px" }}>{TAIL} · N88606</div>
            </div>
          </div>
          <nav style={{ display:"flex", gap:4 }}>
            {[["calendar","📅 Calendar"],["list","📋 Flights"],["book","+ Book"]].map(([v,lbl]) => (
              <button key={v} onClick={() => navView(v)} style={{
                padding:"6px 14px", borderRadius:8, border:"none", cursor:"pointer", fontSize:13, fontWeight:500,
                background: view===v ? "#2563eb" : "transparent",
                color:      view===v ? "#fff"    : "#94a3b8",
                transition:"all 0.15s",
              }}>{lbl}</button>
            ))}
          </nav>
        </div>
      </header>

      <main style={{ maxWidth:980, margin:"0 auto", padding:"24px 20px" }}>

        {loading && <div style={{ textAlign:"center", color:"#475569", padding:80, fontSize:15 }}>Loading…</div>}

        {/* ════════════ CALENDAR ════════════ */}
        {!loading && view === "calendar" && (
          <div>
            {/* Pilot strips */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:22 }}>
              {pilots.map(p => {
                const pFlights = upcoming.filter(b => b.pilot === p.id);
                const next = pFlights[0];
                return (
                  <div key={p.id} style={{ ...card, display:"flex", alignItems:"center", gap:14 }}>
                    <div style={{ width:44, height:44, borderRadius:12, background:"#1e3a5f", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, flexShrink:0 }}>🧑‍✈️</div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:700, fontSize:14, color:"#f1f5f9" }}>{p.name}</div>
                      <div style={{ fontSize:12, color:"#64748b", marginTop:2 }}>
                        {pFlights.length === 0
                          ? "No upcoming flights"
                          : next
                            ? `Next: ${MONTH_NAMES[parseDate(next.date).month].slice(0,3)} ${parseDate(next.date).day} → ${next.destination}`
                            : `${pFlights.length} upcoming`}
                      </div>
                    </div>
                    <div style={{ fontWeight:700, fontSize:22, color: pFlights.length ? "#2563eb" : "#1e3a5f" }}>
                      {pFlights.length}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Calendar grid */}
            <div style={{ background:"#1e293b", borderRadius:16, border:"1px solid #1e3a5f", overflow:"hidden" }}>
              {/* Month nav */}
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"16px 22px", borderBottom:"1px solid #1e3a5f" }}>
                <button onClick={prevMonth} style={{ background:"none", border:"none", color:"#94a3b8", cursor:"pointer", fontSize:22, lineHeight:1 }}>‹</button>
                <div style={{ fontWeight:700, fontSize:17, color:"#f1f5f9" }}>{MONTH_NAMES[calMonth]} {calYear}</div>
                <button onClick={nextMonth} style={{ background:"none", border:"none", color:"#94a3b8", cursor:"pointer", fontSize:22, lineHeight:1 }}>›</button>
              </div>
              {/* Day labels */}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", borderBottom:"1px solid #1e3a5f" }}>
                {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => (
                  <div key={d} style={{ textAlign:"center", padding:"9px 0", fontSize:11, fontWeight:700, color:"#475569", letterSpacing:"0.5px" }}>{d}</div>
                ))}
              </div>
              {/* Days */}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)" }}>
                {Array.from({length:firstDay}).map((_,i) => (
                  <div key={`e${i}`} style={{ minHeight:88, borderRight:"1px solid #1e3a5f", borderBottom:"1px solid #1e3a5f", background:"#0f172a33" }} />
                ))}
                {Array.from({length:daysInMonth}).map((_,i) => {
                  const day = i+1;
                  const ds  = fmtDate(calYear, calMonth, day);
                  const bks = booksForDay(day);
                  const isToday = ds === todayStr();
                  const col = (firstDay+i) % 7;
                  return (
                    <div key={day} onClick={() => setDayModal(ds)}
                      style={{ minHeight:88, borderRight: col===6?"none":"1px solid #1e3a5f", borderBottom:"1px solid #1e3a5f",
                        padding:"8px 7px 6px", cursor:"pointer", position:"relative",
                        transition:"background 0.1s" }}
                      onMouseEnter={e=>e.currentTarget.style.background="#1e3a5f44"}
                      onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                      <div style={{ width:24, height:24, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", marginBottom:4,
                        background: isToday?"#2563eb":"none", color: isToday?"#fff":"#94a3b8", fontWeight: isToday?700:400, fontSize:13 }}>
                        {day}
                      </div>
                      {bks.slice(0,2).map(b => (
                        <div key={b.id} style={{ fontSize:10, borderRadius:4, padding:"2px 5px", marginBottom:2,
                          background: STATUS_BG[b.status], color: STATUS_COLOR[b.status], fontWeight:600,
                          whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                          {memberById(b.pilot)?.name.split(" ")[0]} → {b.destination}
                        </div>
                      ))}
                      {bks.length > 2 && <div style={{ fontSize:10, color:"#64748b" }}>+{bks.length-2} more</div>}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Legend */}
            <div style={{ display:"flex", gap:16, marginTop:14, justifyContent:"flex-end" }}>
              {Object.entries(STATUS_COLOR).map(([s,c]) => (
                <div key={s} style={{ display:"flex", alignItems:"center", gap:5, fontSize:12, color:"#64748b" }}>
                  <div style={{ width:9, height:9, borderRadius:2, background:c }} />
                  {s.charAt(0).toUpperCase()+s.slice(1)}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ════════════ LIST ════════════ */}
        {!loading && view === "list" && (
          <div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
              <h2 style={{ fontSize:19, fontWeight:700, color:"#f1f5f9" }}>All Flights</h2>
              <button onClick={() => navView("book")} style={{ background:"#2563eb", color:"#fff", border:"none", borderRadius:8, padding:"8px 16px", cursor:"pointer", fontWeight:600, fontSize:13 }}>+ Book Flight</button>
            </div>
            {bookings.length === 0 && <div style={{ textAlign:"center", color:"#475569", padding:60 }}>No bookings yet.</div>}
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {bookings.map(b => {
                const { month, day, year } = parseDate(b.date);
                return (
                  <div key={b.id} style={{ ...card, display:"flex", alignItems:"center", gap:16 }}>
                    <div style={{ width:44, height:44, borderRadius:10, background: STATUS_BG[b.status]+"44", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, flexShrink:0 }}>✈</div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:700, fontSize:15, color:"#f1f5f9" }}>{b.destination}</div>
                      <div style={{ fontSize:12, color:"#94a3b8", marginTop:3 }}>
                        {MONTH_NAMES[month].slice(0,3)} {day}, {year} · {b.depart_time}–{b.return_time} · {memberById(b.pilot)?.name}
                      </div>
                      {b.passengers?.length > 0 && (
                        <div style={{ fontSize:11, color:"#64748b", marginTop:2 }}>
                          Passengers: {b.passengers.map(id=>memberById(id)?.name).filter(Boolean).join(", ")}
                        </div>
                      )}
                    </div>
                    <div style={{ display:"flex", flexDirection:"column", gap:6, alignItems:"flex-end", flexShrink:0 }}>
                      <span style={{ fontSize:10, fontWeight:700, padding:"3px 10px", borderRadius:20, background: STATUS_BG[b.status], color: STATUS_COLOR[b.status], textTransform:"uppercase", letterSpacing:"0.5px" }}>{b.status}</span>
                      <div style={{ display:"flex", gap:6 }}>
                        <button onClick={()=>startEdit(b)} style={{ fontSize:12, padding:"4px 10px", borderRadius:6, border:"1px solid #1e3a5f", background:"none", color:"#94a3b8", cursor:"pointer" }}>Edit</button>
                        <button onClick={()=>deleteBooking(b.id)} style={{ fontSize:12, padding:"4px 10px", borderRadius:6, border:"1px solid #ef444444", background:"none", color:"#ef4444", cursor:"pointer" }}>Delete</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ════════════ BOOK FORM ════════════ */}
        {!loading && view === "book" && (
          <div style={{ maxWidth:540, margin:"0 auto" }}>
            <h2 style={{ fontSize:19, fontWeight:700, color:"#f1f5f9", marginBottom:24 }}>
              {editId ? "Edit Booking" : "Book a Flight"}
            </h2>
            <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

              <div>
                <label style={label}>Pilot *</label>
                <select value={form.pilot} onChange={e=>setForm(f=>({...f,pilot:e.target.value}))} style={input}>
                  {pilots.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              <div>
                <label style={label}>Passengers</label>
                <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                  {MEMBERS.filter(m=>m.id!==form.pilot).map(m=>{
                    const sel = form.passengers.includes(m.id);
                    return (
                      <button key={m.id} type="button"
                        onClick={()=>setForm(f=>({...f, passengers: sel ? f.passengers.filter(id=>id!==m.id) : [...f.passengers,m.id]}))}
                        style={{ padding:"6px 14px", borderRadius:20, border:`1px solid ${sel?"#2563eb":"#1e3a5f"}`,
                          background: sel?"#2563eb22":"none", color: sel?"#60a5fa":"#94a3b8",
                          cursor:"pointer", fontSize:13, fontWeight: sel?600:400, transition:"all 0.1s" }}>
                        {m.name}{m.role==="pilot"?" 🧑‍✈️":""}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label style={label}>Date *</label>
                <input type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} style={input} />
              </div>

              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <div>
                  <label style={label}>Depart *</label>
                  <input type="time" value={form.depart_time} onChange={e=>setForm(f=>({...f,depart_time:e.target.value}))} style={input} />
                </div>
                <div>
                  <label style={label}>Return *</label>
                  <input type="time" value={form.return_time} onChange={e=>setForm(f=>({...f,return_time:e.target.value}))} style={input} />
                </div>
              </div>

              <div>
                <label style={label}>Destination *</label>
                <input type="text" placeholder="e.g. KORD, Galena Airport, Oshkosh" value={form.destination}
                  onChange={e=>setForm(f=>({...f,destination:e.target.value}))} style={input} />
              </div>

              <div>
                <label style={label}>Hobbs Out</label>
                <input type="text" placeholder="e.g. 1234.5" value={form.hobbs_out}
                  onChange={e=>setForm(f=>({...f,hobbs_out:e.target.value}))} style={input} />
              </div>

              <div>
                <label style={label}>Status</label>
                <div style={{ display:"flex", gap:8 }}>
                  {["confirmed","pending","cancelled"].map(s=>(
                    <button key={s} type="button" onClick={()=>setForm(f=>({...f,status:s}))}
                      style={{ flex:1, padding:"9px 0", borderRadius:8,
                        border:`1px solid ${form.status===s ? STATUS_COLOR[s] : "#1e3a5f"}`,
                        background: form.status===s ? STATUS_BG[s]+"33" : "none",
                        color: form.status===s ? STATUS_COLOR[s] : "#94a3b8",
                        cursor:"pointer", fontSize:12, fontWeight:600, textTransform:"capitalize", transition:"all 0.1s" }}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={label}>Notes</label>
                <textarea value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}
                  placeholder="Anything the group should know…" rows={3}
                  style={{ ...input, resize:"vertical", lineHeight:1.6 }} />
              </div>

              {formError  && <div style={{ color:"#ef4444", fontSize:13, padding:"10px 14px", background:"#fee2e222", borderRadius:8 }}>{formError}</div>}
              {successMsg && <div style={{ color:"#22c55e", fontSize:13, padding:"10px 14px", background:"#dcfce722", borderRadius:8 }}>{successMsg}</div>}

              <div style={{ display:"flex", gap:10, marginTop:4 }}>
                <button onClick={()=>navView("calendar")}
                  style={{ flex:1, padding:"12px 0", borderRadius:10, border:"1px solid #1e3a5f", background:"none", color:"#94a3b8", cursor:"pointer", fontSize:14, fontWeight:600 }}>
                  Cancel
                </button>
                <button onClick={saveBooking} disabled={saving}
                  style={{ flex:2, padding:"12px 0", borderRadius:10, border:"none",
                    background: saving?"#1e40af":"#2563eb", color:"#fff",
                    cursor: saving?"not-allowed":"pointer", fontSize:14, fontWeight:700, transition:"background 0.15s" }}>
                  {saving ? "Saving…" : editId ? "Update Booking" : "Confirm Booking"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ════════════ DAY MODAL ════════════ */}
      {dayModal && (
        <div style={{ position:"fixed", inset:0, background:"#00000099", display:"flex", alignItems:"center", justifyContent:"center", zIndex:200, padding:20 }}
          onClick={()=>setDayModal(null)}>
          <div style={{ background:"#1e293b", borderRadius:18, width:"100%", maxWidth:460, maxHeight:"80vh",
            overflowY:"auto", border:"1px solid #1e3a5f", padding:24 }}
            onClick={e=>e.stopPropagation()}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
              <div style={{ fontWeight:700, fontSize:17, color:"#f1f5f9" }}>
                {(() => { const {year,month,day} = parseDate(dayModal); return `${MONTH_NAMES[month]} ${day}, ${year}`; })()}
              </div>
              <button onClick={()=>setDayModal(null)} style={{ background:"none", border:"none", color:"#64748b", cursor:"pointer", fontSize:22, lineHeight:1 }}>×</button>
            </div>

            {bookings.filter(b=>b.date===dayModal).length === 0 && (
              <p style={{ color:"#64748b", fontSize:14, textAlign:"center", padding:"16px 0" }}>No flights scheduled.</p>
            )}

            <div style={{ display:"flex", flexDirection:"column", gap:12, marginBottom:16 }}>
              {bookings.filter(b=>b.date===dayModal).map(b=>(
                <div key={b.id} style={{ background:"#0f172a", borderRadius:10, padding:"14px 16px", border:`1px solid ${STATUS_COLOR[b.status]}44` }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
                    <div style={{ fontWeight:700, fontSize:15, color:"#f1f5f9" }}>{b.destination}</div>
                    <span style={{ fontSize:10, fontWeight:700, padding:"2px 9px", borderRadius:20, background: STATUS_BG[b.status], color: STATUS_COLOR[b.status], textTransform:"uppercase" }}>{b.status}</span>
                  </div>
                  <div style={{ fontSize:13, color:"#94a3b8", display:"flex", flexDirection:"column", gap:3 }}>
                    <div>🧑‍✈️ {memberById(b.pilot)?.name} · {b.depart_time} – {b.return_time}</div>
                    {b.passengers?.length > 0 && <div>👥 {b.passengers.map(id=>memberById(id)?.name).filter(Boolean).join(", ")}</div>}
                    {b.hobbs_out && <div>⏱ Hobbs Out: {b.hobbs_out}</div>}
                    {b.notes && <div style={{ color:"#64748b" }}>📝 {b.notes}</div>}
                  </div>
                  <div style={{ display:"flex", gap:7, marginTop:12, flexWrap:"wrap" }}>
                    <button onClick={()=>startEdit(b)} style={{ fontSize:12, padding:"5px 12px", borderRadius:6, border:"1px solid #1e3a5f", background:"none", color:"#94a3b8", cursor:"pointer" }}>Edit</button>
                    {b.status !== "confirmed"  && <button onClick={()=>changeStatus(b,"confirmed")}  style={{ fontSize:12, padding:"5px 12px", borderRadius:6, border:"1px solid #22c55e44", background:"none", color:"#22c55e", cursor:"pointer" }}>Confirm</button>}
                    {b.status !== "pending"    && <button onClick={()=>changeStatus(b,"pending")}    style={{ fontSize:12, padding:"5px 12px", borderRadius:6, border:"1px solid #f59e0b44", background:"none", color:"#f59e0b", cursor:"pointer" }}>Pending</button>}
                    {b.status !== "cancelled"  && <button onClick={()=>changeStatus(b,"cancelled")}  style={{ fontSize:12, padding:"5px 12px", borderRadius:6, border:"1px solid #ef444444", background:"none", color:"#ef4444", cursor:"pointer" }}>Cancel</button>}
                    <button onClick={()=>deleteBooking(b.id)} style={{ fontSize:12, padding:"5px 12px", borderRadius:6, border:"1px solid #ef444422", background:"#ef444411", color:"#ef4444", cursor:"pointer", marginLeft:"auto" }}>Delete</button>
                  </div>
                </div>
              ))}
            </div>

            <button onClick={()=>{ setForm(f=>({...f,date:dayModal})); setDayModal(null); navView("book"); }}
              style={{ width:"100%", padding:"11px 0", borderRadius:10, border:"1px dashed #2563eb88", background:"#2563eb11", color:"#60a5fa", cursor:"pointer", fontSize:14, fontWeight:600 }}>
              + Book this day
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
