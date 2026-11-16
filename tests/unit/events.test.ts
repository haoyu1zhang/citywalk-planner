import { afterEach, describe, expect, it, vi } from "vitest";
import { cheapestInsertion, dateRange, formatEventDate, formatEventWhen } from "@/lib/events";
import { combineEventProviders } from "@/lib/providers/events";
import { ezineId, parseEzine, toEvent } from "@/lib/providers/ezine";
import { createSnapshotProvider } from "@/lib/providers/snapshot";
import type { EventProvider } from "@/lib/providers/types";
import type { EventItem } from "@/types";
import { clearHttpCache } from "@/lib/http";
import { buildSearchUrl, createTicketmasterProvider, geohash, parseTicketmaster } from "@/lib/providers/ticketmaster";
import { at, ORIGIN } from "./helpers";

// Hand-written from the Discovery API v2 docs, not a recorded response.
const venue = { name: "Auditorium Parco della Musica", location: { latitude: "41.929", longitude: "12.4747" } };
const sample = {
  _embedded: {
    events: [
      {
        id: "Z698xZb_Z17a",
        name: "Orchestra di Santa Cecilia",
        url: "https://www.ticketmaster.it/event/1",
        dates: { start: { localDate: "2026-11-21", localTime: "20:30:00" } },
        classifications: [{ segment: { name: "Arts & Theatre" } }],
        priceRanges: [{ min: 25, max: 80, currency: "EUR" }],
        _embedded: { venues: [venue] },
      },
      {
        // Same show listed again for another ticket type.
        id: "Z698xZb_Z17b",
        name: "Orchestra di Santa Cecilia",
        url: "https://www.ticketmaster.it/event/2",
        dates: { start: { localDate: "2026-11-21", localTime: "20:30:00" } },
        _embedded: { venues: [venue] },
      },
      {
        id: "vvG1",
        name: "Derby",
        url: "https://www.ticketmaster.it/event/3",
        dates: { start: { localDate: "2026-11-22" } },
        classifications: [{ segment: { name: "Sports" } }],
        _embedded: { venues: [{ name: "Stadio Olimpico", location: { latitude: "41.9341", longitude: "12.4547" } }] },
      },
      { id: "noVenue", name: "Online talk", url: "https://example.com/x", dates: { start: { localDate: "2026-11-22" } }, _embedded: { venues: [{ name: "?" }] } },
      { id: "broken" },
    ],
  },
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

afterEach(() => {
  vi.unstubAllGlobals();
  clearHttpCache();
});

describe("Ticketmaster provider", () => {
  it("normalises events and drops duplicates and events without a mappable venue", () => {
    expect(parseTicketmaster(sample)).toEqual([
      {
        id: "Z698xZb_Z17a",
        name: "Orchestra di Santa Cecilia",
        url: "https://www.ticketmaster.it/event/1",
        startsAt: "2026-11-21T20:30",
        category: "arts",
        venue: "Auditorium Parco della Musica",
        lat: 41.929,
        lng: 12.4747,
        priceFrom: 25,
        currency: "EUR",
        source: "ticketmaster",
      },
      {
        id: "vvG1",
        name: "Derby",
        url: "https://www.ticketmaster.it/event/3",
        startsAt: "2026-11-22",
        category: "sports",
        venue: "Stadio Olimpico",
        lat: 41.9341,
        lng: 12.4547,
        source: "ticketmaster",
      },
    ]);
  });

  it("treats a response with no events as empty, and garbage as an error", () => {
    expect(parseTicketmaster({ page: { totalElements: 0 } })).toEqual([]);
    expect(() => parseTicketmaster("nope")).toThrow();
  });

  it("encodes geohashes (known value for the Colosseum area)", () => {
    expect(geohash(57.64911, 10.40744, 11)).toBe("u4pruydqqvj"); // the reference example
    expect(geohash(41.8902, 12.4922, 5)).toBe("sr2yk");
  });

  it("builds a search URL with location, dates, keyword and category", () => {
    const url = new URL(
      buildSearchUrl(
        { center: { lat: 41.8986, lng: 12.4769 }, radiusKm: 8, from: "2026-11-17", to: "2026-11-24", keyword: "jazz", category: "music" },
        "KEY",
      ),
    );
    expect(url.origin + url.pathname).toBe("https://app.ticketmaster.com/discovery/v2/events.json");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      apikey: "KEY",
      geoPoint: geohash(41.8986, 12.4769),
      radius: "8",
      unit: "km",
      startDateTime: "2026-11-17T00:00:00Z",
      endDateTime: "2026-11-24T23:59:59Z",
      keyword: "jazz",
      classificationName: "Music",
    });
  });

  it("is switched off without a key", () => {
    expect(createTicketmasterProvider("")).toBeNull();
  });

  it("looks events up by id and keeps the requested order", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(sample));
    vi.stubGlobal("fetch", fetchMock);
    const provider = createTicketmasterProvider("KEY")!;
    const found = await provider.byIds(["vvG1", "missing", "Z698xZb_Z17a"]);
    expect(found.map((e) => e.id)).toEqual(["vvG1", "Z698xZb_Z17a"]);
    expect(String(fetchMock.mock.calls[0][0])).toContain("id=Z698xZb_Z17a%2Cmissing%2CvvG1");
  });
});

describe("E-zine mapping", () => {
  // trimmed copy of a real response
  const response = {
    success: true,
    count: 3,
    events: [
      { date: "2026-11-19", start_time: "18:00:00", end_time: "20:00:00", title: "Terra Incognita", address: "Borgo Pio 125", summary: "…", event_start_date: "2026-11-19", event_end_date: "2026-12-19" },
      { date: "2026-11-19", start_time: "16:00:00", end_time: "18:00:00", title: "L’arte Simbolista di Brendea Cosmin sbarca a Venezia", address: "Cannaregio 6301/A", summary: "…", event_start_date: "2026-11-19", event_end_date: "2026-11-19" },
      { date: "2026-11-19", title: "", address: "nowhere", event_start_date: "2026-11-19" },
    ],
  };

  it("parses the list and skips entries without a title", () => {
    expect(parseEzine(response).map((e) => e.title)).toEqual([
      "Terra Incognita",
      "L’arte Simbolista di Brendea Cosmin sbarca a Venezia",
    ]);
    expect(() => parseEzine({ success: false })).toThrow();
  });

  it("maps an exhibition and a one-day event", () => {
    const [show, talk] = parseEzine(response);
    expect(toEvent("rome", show, { lat: 41.90375, lng: 12.46088 })).toEqual({
      id: ezineId("rome", show),
      name: "Terra Incognita",
      url: "https://e-zine.it/?s=Terra%20Incognita",
      startsAt: "2026-11-19T18:00",
      endsAt: "2026-12-19",
      category: "arts",
      venue: "Borgo Pio 125",
      lat: 41.90375,
      lng: 12.46088,
      source: "ezine",
    });
    expect(toEvent("venice", talk, { lat: 45.44, lng: 12.33 }).endsAt).toBeUndefined();
  });

  it("derives a stable id and treats 00:00 as no time", () => {
    const [show] = parseEzine(response);
    expect(ezineId("rome", show)).toMatch(/^ez[0-9a-f]{10}$/);
    expect(ezineId("rome", show)).toBe(ezineId("rome", { ...show, start_time: "19:00:00" }));
    expect(ezineId("rome", show)).not.toBe(ezineId("milan", show));
    expect(toEvent("rome", { ...show, start_time: "00:00:00" }, { lat: 0, lng: 0 }).startsAt).toBe("2026-11-19");
  });
});

describe("snapshot provider", () => {
  const show: EventItem = {
    id: "ez0000000001",
    name: "Terra Incognita",
    url: "https://e-zine.it/?s=Terra%20Incognita",
    startsAt: "2026-11-19T18:00",
    endsAt: "2026-12-19",
    category: "arts",
    venue: "Borgo Pio 125",
    lat: 41.9036,
    lng: 12.4601,
    source: "ezine",
  };
  const talk: EventItem = { ...show, id: "ez0000000002", name: "Artist talk", startsAt: "2026-11-25T19:00", endsAt: undefined };
  const provider = createSnapshotProvider([show, talk]);
  const near = { center: { lat: 41.8986, lng: 12.4769 }, radiusKm: 8 };

  it("lists an exhibition for as long as it runs", async () => {
    const ids = async (from: string, to: string) => (await provider.search({ ...near, from, to })).map((e) => e.id);
    expect(await ids("2026-11-17", "2026-11-18")).toEqual([]);
    expect(await ids("2026-11-19", "2026-11-19")).toEqual([show.id]);
    expect(await ids("2026-12-01", "2026-12-07")).toEqual([show.id]);
    expect(await ids("2026-11-20", "2026-11-26")).toEqual([show.id, talk.id]);
    expect(await ids("2026-12-20", "2026-12-31")).toEqual([]);
  });

  it("filters by keyword, category and distance", async () => {
    const week = { from: "2026-11-19", to: "2026-11-26" };
    expect(await provider.search({ ...near, ...week, keyword: "TALK" })).toEqual([talk]);
    expect(await provider.search({ ...near, ...week, keyword: "borgo pio" })).toHaveLength(2);
    expect(await provider.search({ ...near, ...week, category: "music" })).toEqual([]);
    expect(await provider.search({ center: { lat: 45.4642, lng: 9.19 }, radiusKm: 8, ...week })).toEqual([]);
  });

  it("finds events by id", async () => {
    expect(await provider.byIds([talk.id, "nope", show.id])).toEqual([talk, show]);
  });

  it("merges sources and survives one of them failing", async () => {
    const down: EventProvider = {
      name: "down",
      search: () => Promise.reject(new Error("503")),
      byIds: () => Promise.reject(new Error("503")),
    };
    const both = combineEventProviders([provider, down]);
    const week = { ...near, from: "2026-11-19", to: "2026-11-26" };
    expect((await both.search(week)).map((e) => e.id)).toEqual([show.id, talk.id]);
    expect(await both.byIds([show.id])).toEqual([show]);
    await expect(combineEventProviders([down]).search(week)).rejects.toThrow();
  });

  it("ships a snapshot file that passes the schema", async () => {
    await expect(createSnapshotProvider().byIds([])).resolves.toEqual([]);
  });
});

describe("dateRange", () => {
  const on = (iso: string) => new Date(`${iso}T12:00:00`);
  it("covers today, a week and a month", () => {
    expect(dateRange("today", on("2026-11-17"))).toEqual({ from: "2026-11-17", to: "2026-11-17" });
    expect(dateRange("week", on("2026-11-17"))).toEqual({ from: "2026-11-17", to: "2026-11-24" });
    expect(dateRange("month", on("2026-11-17"))).toEqual({ from: "2026-11-17", to: "2026-12-17" });
  });
  it("finds the weekend from any weekday", () => {
    expect(dateRange("weekend", on("2026-11-17"))).toEqual({ from: "2026-11-21", to: "2026-11-22" }); // Tuesday
    expect(dateRange("weekend", on("2026-11-21"))).toEqual({ from: "2026-11-21", to: "2026-11-22" }); // Saturday
    expect(dateRange("weekend", on("2026-11-22"))).toEqual({ from: "2026-11-22", to: "2026-11-22" }); // Sunday
  });
});

describe("formatEventDate", () => {
  it("formats in the visitor's language, with or without a time", () => {
    expect(formatEventDate("2026-11-21T20:30", "en")).toMatch(/Sat.*21 Nov.*20:30/);
    expect(formatEventDate("2026-11-21T20:30", "it")).toMatch(/sab.*21 nov.*20:30/);
    expect(formatEventDate("2026-11-21", "zh")).toMatch(/11月21日/);
  });

  it("shows the run of an exhibition", () => {
    expect(formatEventWhen({ startsAt: "2026-11-19T18:00", endsAt: "2026-12-19" }, "en")).toBe("19 Nov – 19 Dec");
    expect(formatEventWhen({ startsAt: "2026-11-19T18:00" }, "en")).toMatch(/19 Nov.*18:00/);
  });
});

describe("cheapestInsertion", () => {
  const stops = [at(0, 500), at(0, 1000), at(0, 1500)];
  it("inserts where the detour is smallest", () => {
    expect(cheapestInsertion(ORIGIN, stops, at(50, 750))).toBe(1);
    expect(cheapestInsertion(ORIGIN, stops, at(50, 100))).toBe(0);
  });
  it("appends a point beyond the last stop", () => {
    expect(cheapestInsertion(ORIGIN, stops, at(0, 2500))).toBe(3);
    expect(cheapestInsertion(ORIGIN, [], at(100, 100))).toBe(0);
  });
});
