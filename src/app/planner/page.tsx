"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type PlannerStatus = "INBOX" | "SCHEDULED" | "COMPLETED" | "DISMISSED";
type PlannerView = "TODAY" | "WEEK" | "MONTH" | "INBOX";
type PlannerItem = {
  id: string;
  title: string;
  details: string | null;
  status: PlannerStatus;
  source: string;
  priority: number;
  durationMinutes: number;
  scheduledStart: string | null;
  scheduledEnd: string | null;
};
type CalendarEvent = {
  id: string;
  title: string;
  details: string | null;
  htmlLink: string | null;
  allDay: boolean;
  start: string;
  end: string | null;
};

const durations = [15, 30, 45, 60, 90, 120];
const views: Array<{ value: PlannerView; label: string }> = [
  { value: "TODAY", label: "Today" },
  { value: "WEEK", label: "Week" },
  { value: "MONTH", label: "Month" },
  { value: "INBOX", label: "Inbox" },
];

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function addDays(value: Date, amount: number) {
  const result = new Date(value);
  result.setDate(result.getDate() + amount);
  return result;
}

function startOfWeek(value: Date) {
  const day = startOfDay(value);
  const mondayOffset = day.getDay() === 0 ? -6 : 1 - day.getDay();
  return addDays(day, mondayOffset);
}

function sameDay(first: Date, second: Date) {
  return first.getFullYear() === second.getFullYear() && first.getMonth() === second.getMonth() && first.getDate() === second.getDate();
}

function localInputValue(value: Date) {
  const shifted = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

function defaultScheduleTime() {
  const value = new Date();
  value.setMinutes(0, 0, 0);
  value.setHours(value.getHours() + 1);
  return localInputValue(value);
}

function timeLabel(value: string | null) {
  return value ? new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(value)) : "Unscheduled";
}

function calendarEventDate(event: CalendarEvent) {
  return event.allDay ? new Date(`${event.start}T00:00:00`) : new Date(event.start);
}

function calendarTimeLabel(event: CalendarEvent) {
  return event.allDay ? "All day" : timeLabel(event.start);
}

function shortDate(value: Date) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(value);
}

export default function PlannerPage() {
  const [items, setItems] = useState<PlannerItem[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [calendarReconnectRequired, setCalendarReconnectRequired] = useState(false);
  const [calendarAddress, setCalendarAddress] = useState<string | null>(null);
  const [calendarError, setCalendarError] = useState("");
  const [view, setView] = useState<PlannerView>("TODAY");
  const [focusDate, setFocusDate] = useState(() => startOfDay(new Date()));
  const [loadedAt] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState(30);
  const [error, setError] = useState("");

  async function loadItems() {
    setLoading(true);
    try {
      const response = await fetch("/api/planner/items", { cache: "no-store" });
      const result = await response.json().catch(() => ({} as { items?: PlannerItem[]; error?: string }));
      if (!response.ok) throw new Error(result.error || "Your plan could not be loaded.");
      setItems(result.items || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Your plan could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Initial server-backed planner hydration happens after the client mounts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadItems();
  }, []);

  const calendarRange = useMemo(() => {
    if (view === "MONTH") {
      const first = new Date(focusDate.getFullYear(), focusDate.getMonth(), 1);
      const gridStart = addDays(first, -first.getDay());
      return { start: gridStart, end: addDays(gridStart, 42) };
    }
    if (view === "WEEK") {
      const weekStart = startOfWeek(focusDate);
      return { start: weekStart, end: addDays(weekStart, 7) };
    }
    return { start: startOfDay(focusDate), end: addDays(startOfDay(focusDate), 1) };
  }, [focusDate, view]);

  useEffect(() => {
    const controller = new AbortController();
    async function loadCalendarEvents() {
      setCalendarLoading(true);
      setCalendarError("");
      try {
        const parameters = new URLSearchParams({ timeMin: calendarRange.start.toISOString(), timeMax: calendarRange.end.toISOString() });
        const response = await fetch(`/api/calendar/events?${parameters}`, { cache: "no-store", signal: controller.signal });
        const result = await response.json().catch(() => ({} as { events?: CalendarEvent[]; error?: string; reconnectRequired?: boolean; address?: string }));
        if (controller.signal.aborted) return;
        setCalendarReconnectRequired(Boolean(result.reconnectRequired));
        setCalendarAddress(result.address || null);
        if (!response.ok) {
          setCalendarEvents([]);
          if (!result.reconnectRequired) throw new Error(result.error || "Google Calendar could not be loaded.");
          return;
        }
        setCalendarEvents(result.events || []);
      } catch (loadError) {
        if (controller.signal.aborted) return;
        setCalendarError(loadError instanceof Error ? loadError.message : "Google Calendar could not be loaded.");
      } finally {
        if (!controller.signal.aborted) setCalendarLoading(false);
      }
    }
    // Calendar events are fetched whenever the visible date range changes.
    void loadCalendarEvents();
    return () => controller.abort();
  }, [calendarRange]);

  async function addItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/planner/items", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, durationMinutes: duration }),
      });
      const result = await response.json().catch(() => ({} as { item?: PlannerItem; error?: string }));
      if (!response.ok || !result.item) throw new Error(result.error || "That item could not be added.");
      setItems((current) => [result.item!, ...current]);
      setTitle("");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "That item could not be added.");
    } finally {
      setSaving(false);
    }
  }

  async function updateItem(id: string, update: { status?: PlannerStatus; scheduledStart?: string | null; durationMinutes?: number }) {
    setError("");
    try {
      const response = await fetch(`/api/planner/items/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(update),
      });
      const result = await response.json().catch(() => ({} as { item?: PlannerItem; error?: string }));
      if (!response.ok || !result.item) throw new Error(result.error || "That item could not be updated.");
      setItems((current) => current.map((item) => item.id === id ? result.item! : item).filter((item) => item.status !== "DISMISSED"));
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "That item could not be updated.");
    }
  }

  const activeItems = useMemo(() => items.filter((item) => item.status !== "COMPLETED" && item.status !== "DISMISSED"), [items]);
  const inboxItems = useMemo(() => activeItems.filter((item) => item.status === "INBOX" || !item.scheduledStart), [activeItems]);
  const scheduledItems = useMemo(() => activeItems.filter((item) => item.status === "SCHEDULED" && item.scheduledStart).sort((a, b) => new Date(a.scheduledStart!).getTime() - new Date(b.scheduledStart!).getTime()), [activeItems]);
  const todayItems = useMemo(() => scheduledItems.filter((item) => sameDay(new Date(item.scheduledStart!), focusDate)), [focusDate, scheduledItems]);
  const actualTodayItems = useMemo(() => scheduledItems.filter((item) => sameDay(new Date(item.scheduledStart!), new Date(loadedAt))), [loadedAt, scheduledItems]);
  const completedToday = useMemo(() => items.filter((item) => item.status === "COMPLETED" && item.scheduledStart && sameDay(new Date(item.scheduledStart), new Date(loadedAt))).length, [items, loadedAt]);
  const todayMinutes = actualTodayItems.reduce((total, item) => total + item.durationMinutes, 0);

  function moveFocus(direction: number) {
    const amount = view === "MONTH" ? 0 : view === "WEEK" ? direction * 7 : direction;
    if (view === "MONTH") setFocusDate((current) => new Date(current.getFullYear(), current.getMonth() + direction, 1));
    else setFocusDate((current) => addDays(current, amount));
  }

  const heading = view === "MONTH"
    ? new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(focusDate)
    : view === "WEEK"
      ? `${shortDate(startOfWeek(focusDate))} – ${shortDate(addDays(startOfWeek(focusDate), 6))}`
      : view === "INBOX"
        ? "Unscheduled ideas"
        : new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(focusDate);

  return <main className="min-h-screen bg-[#F7F9FC] px-5 py-9 text-[#14213D] sm:px-10 lg:px-16">
    <div className="mx-auto max-w-6xl">
      <header className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <p className="text-sm font-semibold text-[#0F766E]">Planner</p>
          <h1 className="mt-2 max-w-2xl text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">Turn career priorities into a realistic day.</h1>
          <p className="mt-3 max-w-2xl text-[#5D6B82]">Capture what matters, give it time, and keep unfinished work visible without crowding your calendar.</p>
        </div>
        <div aria-label="Planner view" className="flex w-fit rounded-full border border-[#DCE4F0] bg-white p-1">
          {views.map((option) => <button className={`rounded-full px-4 py-2 text-sm font-semibold ${view === option.value ? "bg-[#0F766E] text-white" : "text-[#5D6B82] hover:bg-[#EAF6F4]"}`} key={option.value} onClick={() => setView(option.value)} type="button">{option.label}{option.value === "INBOX" && inboxItems.length ? ` · ${inboxItems.length}` : ""}</button>)}
        </div>
      </header>

      <section className="mt-8 grid gap-4 sm:grid-cols-3">
        <Metric label="Planned today" value={todayMinutes ? `${todayMinutes} min` : "Open"} hint={todayMinutes ? `${actualTodayItems.length} focused ${actualTodayItems.length === 1 ? "block" : "blocks"}` : "Your day still has room"} />
        <Metric label="Needs scheduling" value={String(inboxItems.length)} hint={inboxItems.length ? "Keep these on your radar" : "Inbox is clear"} />
        <Metric label="Completed" value={String(completedToday)} hint="Finished on this day" />
      </section>

      <section className={`mt-6 flex flex-col justify-between gap-4 rounded-2xl border p-4 sm:flex-row sm:items-center ${calendarReconnectRequired ? "border-[#F2D39B] bg-[#FFF8EC]" : "border-[#BFD7F2] bg-[#F4F8FD]"}`}>
        <div>
          <p className="text-sm font-semibold text-[#14213D]">Google Calendar</p>
          <p className="mt-1 text-sm text-[#5D6B82]">{calendarReconnectRequired ? "Reconnect Google once to add read-only Calendar access." : calendarLoading ? "Loading your existing calendar commitments…" : calendarError ? calendarError : `${calendarAddress || "Your Google account"} · ${calendarEvents.length} ${calendarEvents.length === 1 ? "event" : "events"} in this view`}</p>
        </div>
        {calendarReconnectRequired ? <a className="w-fit rounded-full bg-[#0F766E] px-4 py-2 text-sm font-semibold text-white" href="/api/gmail/connect?returnTo=/planner">Connect Calendar</a> : <span className="w-fit rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#356A9A]">Read only</span>}
      </section>

      <section className="mt-6 rounded-3xl border border-[#DCE4F0] bg-white p-5 sm:p-6">
        <form className="flex flex-col gap-3 lg:flex-row lg:items-end" onSubmit={addItem}>
          <label className="flex-1 text-sm font-semibold">Quick capture<span className="mt-2 block text-xs font-normal text-[#6B7280]">What do you want to make time for?</span><input className="mt-2 w-full rounded-xl border border-[#DCE4F0] bg-[#FBFCFE] px-4 py-3 font-normal outline-none focus:border-[#0F766E]" onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Prepare examples for Thursday’s interview" value={title} /></label>
          <label className="text-sm font-semibold">Time needed<select className="mt-2 block w-full rounded-xl border border-[#DCE4F0] bg-white px-4 py-3 font-normal lg:w-36" onChange={(event) => setDuration(Number(event.target.value))} value={duration}>{durations.map((minutes) => <option key={minutes} value={minutes}>{minutes < 60 ? `${minutes} min` : `${minutes / 60} hr${minutes > 60 ? "s" : ""}`}</option>)}</select></label>
          <button className="rounded-xl bg-[#0F766E] px-5 py-3 font-semibold text-white disabled:opacity-60" disabled={saving || !title.trim()} type="submit">{saving ? "Saving…" : "Add to Inbox"}</button>
        </form>
        <p className="mt-3 text-xs text-[#6B7280]">Inbox items remain unscheduled until you choose a time.</p>
      </section>

      {error ? <p className="mt-5 rounded-2xl bg-[#FEF2F2] px-4 py-3 text-sm text-[#C2413B]">{error}</p> : null}

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
        <div><p className="text-sm font-semibold text-[#0F766E]">Your plan</p><h2 className="mt-1 text-2xl font-semibold">{heading}</h2></div>
        {view !== "INBOX" ? <div className="flex items-center gap-2"><button aria-label="Previous period" className="rounded-full border border-[#DCE4F0] bg-white px-3 py-2" onClick={() => moveFocus(-1)} type="button">←</button><button className="rounded-full border border-[#DCE4F0] bg-white px-4 py-2 text-sm font-semibold" onClick={() => setFocusDate(startOfDay(new Date()))} type="button">Today</button><button aria-label="Next period" className="rounded-full border border-[#DCE4F0] bg-white px-3 py-2" onClick={() => moveFocus(1)} type="button">→</button></div> : null}
      </div>

      {loading ? <div className="mt-6 rounded-3xl border border-[#DCE4F0] bg-white p-10 text-center text-[#6B7280]">Building your plan…</div> : view === "TODAY" ? <TodayView calendarEvents={calendarEvents} inboxItems={inboxItems} items={todayItems} loadedAt={loadedAt} onUpdate={updateItem} /> : view === "WEEK" ? <WeekView calendarEvents={calendarEvents} focusDate={focusDate} items={scheduledItems} onUpdate={updateItem} /> : view === "MONTH" ? <MonthView calendarEvents={calendarEvents} focusDate={focusDate} items={scheduledItems} /> : <InboxView items={inboxItems} onUpdate={updateItem} />}
    </div>
  </main>;
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return <div className="rounded-2xl border border-[#DCE4F0] bg-white p-5"><p className="text-xs font-semibold tracking-[0.1em] text-[#6B7280] uppercase">{label}</p><p className="mt-2 text-3xl font-semibold">{value}</p><p className="mt-1 text-sm text-[#6B7280]">{hint}</p></div>;
}

function TodayView({ items, calendarEvents, inboxItems, loadedAt, onUpdate }: { items: PlannerItem[]; calendarEvents: CalendarEvent[]; inboxItems: PlannerItem[]; loadedAt: number; onUpdate: (id: string, update: { status?: PlannerStatus; scheduledStart?: string | null; durationMinutes?: number }) => Promise<void> }) {
  const nextItem = items.find((item) => new Date(item.scheduledEnd || item.scheduledStart!).getTime() >= loadedAt);
  return <div className="mt-6 grid gap-6 lg:grid-cols-[1.45fr_0.75fr]">
    <section className="rounded-3xl border border-[#DCE4F0] bg-white p-5 sm:p-6"><div className="flex items-center justify-between"><h3 className="text-lg font-semibold">Timeline</h3>{nextItem ? <span className="rounded-full bg-[#EAF6F4] px-3 py-1 text-xs font-semibold text-[#0F766E]">Next · {timeLabel(nextItem.scheduledStart)}</span> : null}</div>{calendarEvents.length ? <div className="mt-5 grid gap-3">{calendarEvents.map((event) => <CalendarEventCard event={event} key={event.id} />)}</div> : null}{items.length ? <div className={`${calendarEvents.length ? "mt-3" : "mt-5"} grid gap-3`}>{items.map((item) => <ScheduledCard item={item} key={item.id} onUpdate={onUpdate} />)}</div> : !calendarEvents.length ? <EmptyState title="Your day is open" text="Schedule an Inbox item when you are ready to protect time for it." /> : null}</section>
    <section className="rounded-3xl border border-[#DCE4F0] bg-[#14213D] p-5 text-white sm:p-6"><p className="text-sm font-semibold text-[#8ED8D0]">Career focus</p><h3 className="mt-2 text-2xl font-semibold">{inboxItems.length ? `${inboxItems.length} ${inboxItems.length === 1 ? "item is" : "items are"} waiting for time.` : "Everything has a place."}</h3><p className="mt-3 text-sm leading-6 text-[#CFD8E8]">{inboxItems.length ? "Choose the most important one and schedule it before the week fills up." : "Capture your next thought whenever it comes up."}</p>{inboxItems.slice(0, 3).map((item) => <div className="mt-4 rounded-2xl bg-white/10 p-4" key={item.id}><p className="font-semibold">{item.title}</p><p className="mt-1 text-xs text-[#CFD8E8]">About {item.durationMinutes} minutes</p><ScheduleControl compact item={item} onUpdate={onUpdate} /></div>)}</section>
  </div>;
}

function WeekView({ focusDate, items, calendarEvents, onUpdate }: { focusDate: Date; items: PlannerItem[]; calendarEvents: CalendarEvent[]; onUpdate: (id: string, update: { status?: PlannerStatus; scheduledStart?: string | null; durationMinutes?: number }) => Promise<void> }) {
  const weekStart = startOfWeek(focusDate);
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  return <div className="mt-6 overflow-x-auto pb-2"><div className="grid min-w-[980px] grid-cols-7 gap-3">{days.map((day) => { const dayItems = items.filter((item) => sameDay(new Date(item.scheduledStart!), day)); const dayEvents = calendarEvents.filter((event) => sameDay(calendarEventDate(event), day)); return <section className={`min-h-64 rounded-2xl border p-3 ${sameDay(day, new Date()) ? "border-[#0F766E] bg-[#F0FAF8]" : "border-[#DCE4F0] bg-white"}`} key={day.toISOString()}><p className="text-xs font-semibold tracking-[0.08em] text-[#6B7280] uppercase">{new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(day)}</p><p className="mt-1 text-xl font-semibold">{day.getDate()}</p><div className="mt-4 grid gap-2">{dayEvents.map((event) => <a className="rounded-xl border border-[#BFD7F2] bg-[#F4F8FD] p-3 text-left" href={event.htmlLink || undefined} key={event.id} rel="noreferrer" target={event.htmlLink ? "_blank" : undefined}><span className="block text-xs font-semibold text-[#356A9A]">{calendarTimeLabel(event)}</span><span className="mt-1 block text-sm font-semibold leading-5">{event.title}</span></a>)}{dayItems.map((item) => <button className="rounded-xl border border-[#C9DDD9] bg-white p-3 text-left" key={item.id} onClick={() => void onUpdate(item.id, { status: "COMPLETED" })} title="Mark complete" type="button"><span className="block text-xs font-semibold text-[#0F766E]">{timeLabel(item.scheduledStart)}</span><span className="mt-1 block text-sm font-semibold leading-5">{item.title}</span></button>)}{!dayItems.length && !dayEvents.length ? <span className="text-xs text-[#9AA5B5]">Open</span> : null}</div></section>; })}</div></div>;
}

function MonthView({ focusDate, items, calendarEvents }: { focusDate: Date; items: PlannerItem[]; calendarEvents: CalendarEvent[] }) {
  const first = new Date(focusDate.getFullYear(), focusDate.getMonth(), 1);
  const gridStart = addDays(first, -first.getDay());
  const days = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
  return <div className="mt-6 overflow-x-auto"><div className="min-w-[760px] overflow-hidden rounded-3xl border border-[#DCE4F0] bg-white"><div className="grid grid-cols-7 border-b border-[#DCE4F0] bg-[#FBFCFE]">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <div className="p-3 text-center text-xs font-semibold tracking-[0.08em] text-[#6B7280] uppercase" key={day}>{day}</div>)}</div><div className="grid grid-cols-7">{days.map((day) => { const dayItems = items.filter((item) => sameDay(new Date(item.scheduledStart!), day)); const dayEvents = calendarEvents.filter((event) => sameDay(calendarEventDate(event), day)); const combinedCount = dayItems.length + dayEvents.length; const inMonth = day.getMonth() === focusDate.getMonth(); return <div className={`min-h-28 border-r border-b border-[#E8EDF5] p-2 ${inMonth ? "bg-white" : "bg-[#F8FAFC] text-[#A4ADBA]"}`} key={day.toISOString()}><p className={`flex h-7 w-7 items-center justify-center rounded-full text-sm ${sameDay(day, new Date()) ? "bg-[#0F766E] font-semibold text-white" : ""}`}>{day.getDate()}</p>{dayEvents.slice(0, 2).map((event) => <div className="mt-1 truncate rounded-md bg-[#E8F1FB] px-2 py-1 text-xs font-medium text-[#356A9A]" key={event.id} title={event.title}>{event.title}</div>)}{dayItems.slice(0, Math.max(0, 2 - dayEvents.length)).map((item) => <div className="mt-1 truncate rounded-md bg-[#EAF6F4] px-2 py-1 text-xs font-medium text-[#0F766E]" key={item.id} title={item.title}>{item.title}</div>)}{combinedCount > 2 ? <p className="mt-1 text-xs text-[#6B7280]">+{combinedCount - 2} more</p> : null}</div>; })}</div></div></div>;
}

function CalendarEventCard({ event }: { event: CalendarEvent }) {
  const content = <><div className="w-24 shrink-0"><p className="font-semibold text-[#356A9A]">{calendarTimeLabel(event)}</p><p className="mt-1 text-xs text-[#6B7280]">Calendar</p></div><div className="min-w-0 flex-1"><h4 className="font-semibold">{event.title}</h4><p className="mt-1 text-xs text-[#6B7280]">Existing commitment · read only</p></div>{event.htmlLink ? <span className="text-sm font-semibold text-[#356A9A]">Open ↗</span> : null}</>;
  return event.htmlLink ? <a className="flex flex-col gap-4 rounded-2xl border border-[#BFD7F2] bg-[#F4F8FD] p-4 sm:flex-row sm:items-center" href={event.htmlLink} rel="noreferrer" target="_blank">{content}</a> : <article className="flex flex-col gap-4 rounded-2xl border border-[#BFD7F2] bg-[#F4F8FD] p-4 sm:flex-row sm:items-center">{content}</article>;
}

function InboxView({ items, onUpdate }: { items: PlannerItem[]; onUpdate: (id: string, update: { status?: PlannerStatus; scheduledStart?: string | null; durationMinutes?: number }) => Promise<void> }) {
  return <section className="mt-6 rounded-3xl border border-[#DCE4F0] bg-white p-5 sm:p-6"><div><h3 className="text-lg font-semibold">Things you want to make time for</h3><p className="mt-1 text-sm text-[#6B7280]">Nothing enters your schedule until you confirm it.</p></div>{items.length ? <div className="mt-5 grid gap-3">{items.map((item) => <InboxCard item={item} key={item.id} onUpdate={onUpdate} />)}</div> : <EmptyState title="Inbox cleared" text="Your unscheduled ideas will wait here until you are ready." />}</section>;
}

function ScheduledCard({ item, onUpdate }: { item: PlannerItem; onUpdate: (id: string, update: { status?: PlannerStatus; scheduledStart?: string | null; durationMinutes?: number }) => Promise<void> }) {
  return <article className="flex flex-col gap-4 rounded-2xl border border-[#DCE4F0] p-4 sm:flex-row sm:items-center"><div className="w-24 shrink-0"><p className="font-semibold text-[#0F766E]">{timeLabel(item.scheduledStart)}</p><p className="mt-1 text-xs text-[#6B7280]">{item.durationMinutes} min</p></div><div className="min-w-0 flex-1"><h4 className="font-semibold">{item.title}</h4><p className="mt-1 text-xs text-[#6B7280]">{item.source === "MANUAL" ? "Added by you" : item.source}</p></div><div className="flex gap-2"><button className="rounded-full bg-[#0F766E] px-4 py-2 text-sm font-semibold text-white" onClick={() => void onUpdate(item.id, { status: "COMPLETED" })} type="button">Complete</button><button className="rounded-full border border-[#DCE4F0] px-4 py-2 text-sm font-semibold text-[#5D6B82]" onClick={() => void onUpdate(item.id, { status: "INBOX", scheduledStart: null })} type="button">Unschedule</button></div></article>;
}

function InboxCard({ item, onUpdate }: { item: PlannerItem; onUpdate: (id: string, update: { status?: PlannerStatus; scheduledStart?: string | null; durationMinutes?: number }) => Promise<void> }) {
  return <article className="rounded-2xl border border-[#DCE4F0] p-4"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h4 className="font-semibold">{item.title}</h4><p className="mt-1 text-xs text-[#6B7280]">About {item.durationMinutes} minutes · Added by you</p></div><button className="w-fit text-sm font-semibold text-[#C2413B]" onClick={() => void onUpdate(item.id, { status: "DISMISSED" })} type="button">Dismiss</button></div><ScheduleControl item={item} onUpdate={onUpdate} /></article>;
}

function ScheduleControl({ item, onUpdate, compact = false }: { item: PlannerItem; onUpdate: (id: string, update: { status?: PlannerStatus; scheduledStart?: string | null; durationMinutes?: number }) => Promise<void>; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [scheduledStart, setScheduledStart] = useState(defaultScheduleTime);
  const [duration, setDuration] = useState(item.durationMinutes);
  if (!open) return <button className={`mt-3 rounded-full px-4 py-2 text-sm font-semibold ${compact ? "bg-white text-[#0F766E]" : "border border-[#A7CFCB] text-[#0F766E]"}`} onClick={() => setOpen(true)} type="button">Choose a time</button>;
  return <div className={`mt-3 flex flex-col gap-2 sm:flex-row sm:items-end ${compact ? "text-white" : ""}`}><label className="text-xs font-semibold">Date and time<input className="mt-1 block rounded-lg border border-[#DCE4F0] bg-white px-3 py-2 text-sm text-[#14213D]" onChange={(event) => setScheduledStart(event.target.value)} type="datetime-local" value={scheduledStart} /></label><label className="text-xs font-semibold">Duration<select className="mt-1 block rounded-lg border border-[#DCE4F0] bg-white px-3 py-2 text-sm text-[#14213D]" onChange={(event) => setDuration(Number(event.target.value))} value={duration}>{durations.map((minutes) => <option key={minutes} value={minutes}>{minutes} min</option>)}</select></label><button className="rounded-lg bg-[#0F766E] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" disabled={!scheduledStart} onClick={() => void onUpdate(item.id, { status: "SCHEDULED", scheduledStart: new Date(scheduledStart).toISOString(), durationMinutes: duration })} type="button">Schedule</button><button className="px-2 py-2 text-sm font-semibold" onClick={() => setOpen(false)} type="button">Cancel</button></div>;
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return <div className="mt-5 rounded-2xl border border-dashed border-[#A7CFCB] bg-[#FBFDFD] p-8 text-center"><p className="font-semibold">{title}</p><p className="mt-2 text-sm text-[#6B7280]">{text}</p></div>;
}
