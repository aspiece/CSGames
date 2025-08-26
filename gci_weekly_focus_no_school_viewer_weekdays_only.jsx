import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import Papa from "papaparse";
import dayjs from "dayjs";
import isBetween from "dayjs/plugin/isBetween";

// dayjs plugins
// @ts-ignore
dayjs.extend(isBetween);

/**
 * === GCI Weekly Focus No‑School Viewer (Weekdays Only) ===
 *
 * Completely removes Saturday and Sunday from the UI.
 * Shows LAST, THIS, and NEXT week with **Mon–Fri only**.
 * Month snapshot is also **Mon–Fri columns only**.
 *
 * Notes:
 * - No external icon libraries (inline SVGs) to avoid CDN fetch issues.
 * - Includes sample CSV fallback and self‑tests.
 */

// ======= CONFIG =======
const DATA_URL = "https://example.com/gci-no-school.csv"; // <-- Replace with your published CSV URL
const REFRESH_EVERY_MS = 15 * 60 * 1000; // 15 minutes
const ENABLE_SELF_TESTS = true;
const WEEK_START: "monday" | "sunday" = "monday"; // schools typically use Monday start

// Map your column headers → field names used in the app
const COLUMN_MAP = {
  date: ["Date", "date"],
  event: [
    "Event",
    "Type",
    "Event (No School / Half Day / Holiday / Teacher PD)",
    "Event Type",
  ],
  school: ["School Name", "School", "District", "Building"],
  notes: ["Notes", "Description", "Reason"],
};

// Event colors (Tailwind classes)
const EVENT_COLORS: Record<string, string> = {
  "No School": "bg-red-100 text-red-800 border-red-200",
  "Half Day": "bg-yellow-100 text-yellow-800 border-yellow-200",
  Holiday: "bg-emerald-100 text-emerald-800 border-emerald-200",
  "Teacher PD": "bg-indigo-100 text-indigo-800 border-indigo-200",
};

// ======= Inline SVG Icons =======
const iconCls = "inline-block align-middle";
const IconCalendar = (props: any) => (
  <svg
    {...props}
    className={(props.className || "") + " " + iconCls}
    viewBox="0 0 24 24"
    width="16"
    height="16"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);
const IconRefresh = (props: any) => (
  <svg
    {...props}
    className={(props.className || "") + " " + iconCls}
    viewBox="0 0 24 24"
    width="16"
    height="16"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="23 4 23 10 17 10" />
    <polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0 1 14.13-3.36L23 10" />
    <path d="M20.49 15A9 9 0 0 1 6.36 18.36L1 14" />
  </svg>
);
const IconChevronLeft = (props: any) => (
  <svg
    {...props}
    className={(props.className || "") + " " + iconCls}
    viewBox="0 0 24 24"
    width="16"
    height="16"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="15 18 9 12 15 6" />
  </svg>
);
const IconChevronRight = (props: any) => (
  <svg
    {...props}
    className={(props.className || "") + " " + iconCls}
    viewBox="0 0 24 24"
    width="16"
    height="16"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

// ======= Helpers =======
function normalizeHeader(h: string) {
  return h?.toString().trim().toLowerCase();
}
function pick(row: Record<string, any>, keys: string[]): string | undefined {
  if (!row) return undefined;
  for (const k of keys) {
    const match = Object.keys(row).find(
      (hdr) => normalizeHeader(hdr) === normalizeHeader(k)
    );
    if (match) return String(row[match] ?? "").trim();
  }
  return undefined;
}
function parseDateLoose(v?: string) {
  if (!v) return null;
  const d = dayjs(v);
  return d.isValid() ? d : null;
}
function startOfWeek(d: dayjs.Dayjs, weekStart: "monday" | "sunday") {
  const target = weekStart === "monday" ? 1 : 0; // 0=Sun, 1=Mon
  const wd = d.day();
  const offset = (wd - target + 7) % 7;
  return d.subtract(offset, "day").startOf("day");
}
function endOfWeek(d: dayjs.Dayjs, weekStart: "monday" | "sunday") {
  return startOfWeek(d, weekStart).add(6, "day").endOf("day");
}
function getWeekdays(weekStart: dayjs.Dayjs) {
  // Monday..Friday from a Monday-start weekStart
  return Array.from({ length: 5 }).map((_, i) => weekStart.add(i, "day"));
}

// ======= Types =======
interface Row {
  date: dayjs.Dayjs;
  event: string;
  school: string;
  notes?: string;
}

// ======= Sample CSV (fallback + tests) =======
const SAMPLE_CSV = `Date,Event,School Name,Notes\n2025-08-25,No School,Fenton High School,Teacher Work Day\n2025-09-01,Holiday,All Schools,Labor Day\n2025-09-18,Half Day,Beecher High School,Parent Conferences\n2025-08-27,No School,Lake Fenton High School,PD Day`;

function parseCsvToRows(csvText: string): Row[] {
  const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
  const out: Row[] = [];
  for (const r of parsed.data as any[]) {
    const dateStr = pick(r, COLUMN_MAP.date);
    const event = pick(r, COLUMN_MAP.event) || "";
    const school = pick(r, COLUMN_MAP.school) || "";
    const notes = pick(r, COLUMN_MAP.notes) || "";
    const d = parseDateLoose(dateStr);
    if (!d || !event || !school) continue;
    out.push({ date: d.startOf("day"), event, school, notes });
  }
  out.sort((a, b) => a.date.valueOf() - b.date.valueOf());
  return out;
}

// ======= Main Component =======
export default function App() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters & UI state shared across views
  const [search, setSearch] = useState("");
  const [schoolFilter, setSchoolFilter] = useState<string>("all");
  const [eventFilter, setEventFilter] = useState<string>("all");

  // Anchor week = week that contains "today"
  const [anchorDay, setAnchorDay] = useState<dayjs.Dayjs>(dayjs());

  const loadFromUrl = async () => {
    setLoading(true);
    setError(null);
    try {
      if (!DATA_URL || DATA_URL.includes("example.com")) {
        const sample = parseCsvToRows(SAMPLE_CSV);
        setRows(sample);
        setError("DATA_URL not configured. Showing sample data.");
        return;
      }
      const res = await fetch(DATA_URL, { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to fetch data: ${res.status}`);
      const text = await res.text();
      const out = parseCsvToRows(text);
      setRows(out);
    } catch (e: any) {
      console.error("Fetch error:", e);
      const sample = parseCsvToRows(SAMPLE_CSV);
      setRows(sample);
      setError(e?.message || "Unknown error fetching data. Showing sample data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFromUrl();
    const id = setInterval(loadFromUrl, REFRESH_EVERY_MS);
    return () => clearInterval(id);
  }, []);

  // Derived data
  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const matchesSchool = schoolFilter === "all" || r.school === schoolFilter;
      const matchesEvent = eventFilter === "all" || r.event === eventFilter;
      const matchesSearch = [r.school, r.event, r.notes || ""].some((s) =>
        s.toLowerCase().includes(search.toLowerCase())
      );
      return matchesSchool && matchesEvent && matchesSearch;
    });
  }, [rows, schoolFilter, eventFilter, search]);

  const schools = useMemo(
    () => Array.from(new Set(rows.map((r) => r.school))).sort(),
    [rows]
  );
  const eventTypes = useMemo(
    () => Array.from(new Set(rows.map((r) => r.event))).sort(),
    [rows]
  );

  const currentWeekStart = useMemo(
    () => startOfWeek(anchorDay, WEEK_START),
    [anchorDay]
  );
  const prevWeekStart = useMemo(
    () => currentWeekStart.subtract(7, "day"),
    [currentWeekStart]
  );
  const nextWeekStart = useMemo(
    () => currentWeekStart.add(7, "day"),
    [currentWeekStart]
  );

  // Group rows by date string for quick lookups
  const byDate = useMemo(() => {
    const map: Record<string, Row[]> = {};
    for (const r of filtered) {
      const k = r.date.format("YYYY-MM-DD");
      if (!map[k]) map[k] = [];
      map[k].push(r);
    }
    return map;
  }, [filtered]);

  // ======= Self-tests =======
  useEffect(() => {
    if (!ENABLE_SELF_TESTS) return;
    try {
      const tests: Array<{ name: string; pass: boolean; details?: string }> = [];
      const d1 = dayjs("2025-08-27"); // Wed
      const w1 = startOfWeek(d1, "monday");
      tests.push({
        name: "startOfWeek Monday",
        pass: w1.format("YYYY-MM-DD") === "2025-08-25",
        details: w1.format(),
      });
      const fri = w1.add(4, "day");
      tests.push({
        name: "Mon–Fri end is Friday",
        pass: fri.format("YYYY-MM-DD") === "2025-08-29",
        details: fri.format(),
      });
      const weekdays = getWeekdays(w1);
      tests.push({ name: "Weekdays length", pass: weekdays.length === 5 });
      tests.push({
        name: "Weekdays Mon..Fri",
        pass: weekdays[0].day() === 1 && weekdays[4].day() === 5,
        details: `${weekdays[0].format("ddd")}-${weekdays[4].format("ddd")}`,
      });
      const sampleRows = parseCsvToRows(SAMPLE_CSV);
      tests.push({
        name: "parseCsvToRows count",
        pass: sampleRows.length >= 4,
        details: `rows=${sampleRows.length}`,
      });
      const allPass = tests.every((t) => t.pass);
      console.groupCollapsed("Weekly Focus (Weekdays Only) • Self-tests");
      tests.forEach((t) =>
        console.log(`${t.pass ? "✅" : "❌"} ${t.name}`, t.details || "")
      );
      console.log(allPass ? "All tests passed" : "Some tests failed");
      console.groupEnd();
    } catch (e) {
      console.warn("Self-tests error", e);
    }
  }, []);

  // ======= UI =======
  return (
    <div className="min-h-screen bg-slate-50 p-5">
      <div className="mx-auto max-w-6xl">
        <header className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">GCI • Weekly No‑School Focus (Weekdays Only)</h1>
            <p className="text-sm text-slate-600">
              Shows last, current, and next week (Mon–Fri only) • Auto‑updates from your master sheet
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setAnchorDay(dayjs())}>
              Today
            </Button>
            <Button variant="outline" onClick={loadFromUrl} title="Refresh now">
              <IconRefresh className="mr-2" />
              Refresh
            </Button>
          </div>
        </header>

        {/* Filters */}
        <Card className="mb-4">
          <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:gap-4">
            <div className="flex-1">
              <Input
                placeholder="Search school, event, notes…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="w-full md:w-56">
              <Select value={schoolFilter} onValueChange={setSchoolFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="School" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All schools</SelectItem>
                  {schools.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full md:w-52">
              <Select value={eventFilter} onValueChange={setEventFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Event type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {eventTypes.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Week Strip */}
        <WeekStrip
          currentWeekStart={currentWeekStart}
          prevWeekStart={prevWeekStart}
          nextWeekStart={nextWeekStart}
          byDate={byDate}
          loading={loading}
          onJump={(dir) =>
            setAnchorDay(
              dir === -1
                ? currentWeekStart.subtract(7, "day")
                : currentWeekStart.add(7, "day")
            )
          }
        />

        {/* Month Snapshot (weekdays only) */}
        <MonthSnapshot anchorDay={anchorDay} byDate={byDate} />

        {error && (
          <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            {error}
          </div>
        )}

        <footer className="mt-8 text-xs text-slate-500">
          <p>
            <IconCalendar className="mr-1" /> Data source: <code>{DATA_URL}</code> • Auto‑refresh every
            {" "}
            {Math.round(REFRESH_EVERY_MS / 60000)} min • Week start: {WEEK_START}
          </p>
        </footer>
      </div>
    </div>
  );
}

function WeekStrip({
  currentWeekStart,
  prevWeekStart,
  nextWeekStart,
  byDate,
  loading,
  onJump,
}: {
  currentWeekStart: dayjs.Dayjs;
  prevWeekStart: dayjs.Dayjs;
  nextWeekStart: dayjs.Dayjs;
  byDate: Record<string, Row[]>;
  loading: boolean;
  onJump: (dir: -1 | 1) => void;
}) {
  return (
    <div className="mb-6 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Weekly Focus</h2>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => onJump(-1)}>
            <IconChevronLeft className="mr-2" />
            Previous
          </Button>
          <Button variant="outline" onClick={() => onJump(1)}>
            Next
            <IconChevronRight className="ml-2" />
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <WeekCard
          label="Last week"
          weekStart={prevWeekStart}
          byDate={byDate}
          loading={loading}
          muted
        />
        <WeekCard
          label="This week"
          weekStart={currentWeekStart}
          byDate={byDate}
          loading={loading}
          highlight
        />
        <WeekCard
          label="Next week"
          weekStart={nextWeekStart}
          byDate={byDate}
          loading={loading}
          muted
        />
      </div>
    </div>
  );
}

function WeekCard({
  label,
  weekStart,
  byDate,
  loading,
  highlight,
  muted,
}: {
  label: string;
  weekStart: dayjs.Dayjs;
  byDate: Record<string, Row[]>;
  loading: boolean;
  highlight?: boolean;
  muted?: boolean;
}) {
  const days = getWeekdays(weekStart); // Mon..Fri only
  const weekEnd = weekStart.add(4, "day"); // Friday
  const title = `${weekStart.format("MMM D")} – ${weekEnd.format("MMM D")}`;
  return (
    <Card
      className={
        (highlight ? "ring-2 ring-blue-400 " : "") +
        (muted ? "opacity-95 " : "") +
        "rounded-2xl"
      }
    >
      <CardContent className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500">
              {label}
            </div>
            <div className="text-sm font-medium text-slate-700">{title}</div>
          </div>
        </div>
        <div className="space-y-2">
          {loading ? (
            <div className="text-sm text-slate-500">Loading…</div>
          ) : (
            days.map((d) => {
              const key = d.format("YYYY-MM-DD");
              const list = byDate[key] || [];
              const isToday = d.isSame(dayjs(), "day");
              return (
                <div
                  key={key}
                  className={
                    "rounded-lg border p-2 " +
                    (isToday
                      ? "border-blue-300 bg-blue-50"
                      : "border-slate-200 bg-white")
                  }
                >
                  <div className="mb-1 flex items-center justify-between">
                    <div className="text-xs font-medium text-slate-600">
                      {d.format("ddd, MMM D")}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {list.length} event{list.length === 1 ? "" : "s"}
                    </div>
                  </div>
                  {list.length === 0 ? (
                    <div className="text-xs text-slate-500">—</div>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {list.slice(0, 6).map((it, idx) => (
                        <span
                          key={idx}
                          className={
                            (EVENT_COLORS[it.event] ||
                              "bg-slate-100 text-slate-800 border-slate-200") +
                            " border rounded-md px-2 py-0.5 text-[11px]"
                          }
                          title={`${it.event} • ${it.school}$${it.notes ? " — " + it.notes : ""}`}
                        >
                          {it.event} · {it.school}
                        </span>
                      ))}
                      {list.length > 6 && (
                        <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600">
                          +{list.length - 6} more
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function MonthSnapshot({
  anchorDay,
  byDate,
}: {
  anchorDay: dayjs.Dayjs;
  byDate: Record<string, Row[]>;
}) {
  const monthCursor = anchorDay;
  const monthStart = monthCursor.startOf("month");
  const monthEnd = monthCursor.endOf("month");
  // Build a Monday-start grid and then keep only Mon..Fri
  const gridStart = startOfWeek(monthStart, "monday");
  const gridEnd = endOfWeek(monthEnd, "monday");
  const allDays: dayjs.Dayjs[] = [];
  for (
    let d = gridStart;
    d.isBefore(gridEnd) || d.isSame(gridEnd, "day");
    d = d.add(1, "day")
  )
    allDays.push(d);

  // Split into weeks and filter weekdays
  const weeks: dayjs.Dayjs[][] = [];
  for (let i = 0; i < allDays.length; i += 7) {
    const chunk = allDays.slice(i, i + 7);
    const weekdays = chunk.filter((dd) => dd.day() >= 1 && dd.day() <= 5);
    weeks.push(weekdays); // each is 5 days (Mon..Fri)
  }

  const currStart = startOfWeek(anchorDay, WEEK_START);
  const currEnd = currStart.add(4, "day"); // Friday of current week

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-slate-700">
          <IconCalendar />
          <span className="font-medium">{monthCursor.format("MMMM YYYY")}</span>
        </div>
      </div>
      <div className="mb-2 grid grid-cols-5 gap-2 text-center text-xs uppercase text-slate-500">
        {"Mon Tue Wed Thu Fri".split(" ").map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="space-y-2">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-5 gap-2">
            {week.map((d) => {
              const key = d.format("YYYY-MM-DD");
              const items = byDate[key] || [];
              const isCurrentMonth = d.month() === monthCursor.month();
              const inFocusWeek = d.isBetween(currStart, currEnd, "day", "[]");
              return (
                <div
                  key={key}
                  className={
                    "min-h-[100px] rounded-xl border p-2 text-xs " +
                    (inFocusWeek ? "ring-2 ring-blue-300 " : "") +
                    (isCurrentMonth ? "bg-white" : "bg-slate-50 opacity-70")
                  }
                >
                  <div className="mb-1 flex items-center justify-between text-[11px] text-slate-500">
                    <span>{d.date()}</span>
                    {d.isSame(dayjs(), "day") && (
                      <span className="rounded bg-blue-100 px-1 text-blue-700">
                        Today
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    {items.slice(0, 3).map((it, idx) => (
                      <div
                        key={idx}
                        className={
                          (EVENT_COLORS[it.event] ||
                            "bg-slate-100 text-slate-800 border-slate-200") +
                          " truncate rounded-md border px-2 py-1"
                        }
                        title={`${it.event} • ${it.school}$${
                          it.notes ? " — " + it.notes : ""
                        }`}
                      >
                        <span className="font-medium">{it.event}</span> · {it.school}
                      </div>
                    ))}
                    {items.length > 3 && (
                      <div className="text-[11px] text-slate-500">
                        +{items.length - 3} more…
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
