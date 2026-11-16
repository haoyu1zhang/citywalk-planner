import { afterEach, describe, expect, it, vi } from "vitest";
import { cheapestInsertion, dateRange, formatEventDate } from "@/lib/events";
import { clearHttpCache } from "@/lib/http";
import { buildSearchUrl, createTicketmasterProvider, geohash, parseTicketmaster } from "@/lib/providers/ticketmaster";
import { at, ORIGIN } from "./helpers";

// NOTE: this sample follows the documented Discovery API v2 response shape. It
// was written by hand, not recorded from the live API (which needs a key).
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
