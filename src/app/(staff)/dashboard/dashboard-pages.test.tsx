import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ requireStaff: vi.fn() }));
const database = vi.hoisted(() => ({ withDatabase: vi.fn() }));
const venues = vi.hoisted(() => ({
  listActiveVenues: vi.fn(),
  getVenue: vi.fn(),
  listVenueIntegrations: vi.fn(),
  listActiveOfferTemplates: vi.fn(),
  getLatestForecastSnapshot: vi.fn(),
}));
const promotions = vi.hoisted(() => ({
  listPromotions: vi.fn(),
  getPromotion: vi.fn(),
}));
const triggers = vi.hoisted(() => ({
  listLiveReadings: vi.fn(),
  listTriggersForVenue: vi.fn(),
  listCopyCandidates: vi.fn(),
  findApprovalByTriggerId: vi.fn(),
  getApproval: vi.fn(),
}));
const reports = vi.hoisted(() => ({
  listWeeklyReports: vi.fn(),
  getWeeklyReport: vi.fn(),
}));
const redemption = vi.hoisted(() => ({ getRedemptionReport: vi.fn() }));
const audit = vi.hoisted(() => ({ listAuditEvents: vi.fn() }));

vi.mock("@/lib/auth/require-staff", () => auth);
vi.mock("@/db/client", () => database);
vi.mock("@/db/repositories/venues", () => venues);
vi.mock("@/db/repositories/promotions", () => promotions);
vi.mock("@/db/repositories/triggers", () => triggers);
vi.mock("@/db/repositories/reports", () => ({ ...reports, ...redemption }));
vi.mock("@/db/repositories/audit", () => audit);

import VenuesPage from "./venues/page";
import VenueDetailPage from "./venues/[venueId]/page";
import PromotionsPage from "./promotions/page";
import PromotionDetailPage from "./promotions/[promotionId]/page";
import ReportsPage from "./reports/page";
import OperationsPage from "./operations/page";

const staff = { id: "staff-1", email: "ops@example.com", name: "Ops" };

describe("staff dashboard pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.requireStaff.mockResolvedValue(staff);
    database.withDatabase.mockImplementation(async (work: (db: unknown) => Promise<unknown>) => work({}));
    venues.listActiveVenues.mockResolvedValue([]);
    venues.listVenueIntegrations.mockResolvedValue([]);
    venues.listActiveOfferTemplates.mockResolvedValue([]);
    venues.getLatestForecastSnapshot.mockResolvedValue(undefined);
    promotions.listPromotions.mockResolvedValue([]);
    triggers.listLiveReadings.mockResolvedValue([]);
    triggers.listTriggersForVenue.mockResolvedValue([]);
    triggers.listCopyCandidates.mockResolvedValue([]);
    triggers.findApprovalByTriggerId.mockResolvedValue(undefined);
    reports.listWeeklyReports.mockResolvedValue([]);
    audit.listAuditEvents.mockResolvedValue([]);
  });

  it("short-circuits venue list reads when staff authorization fails", async () => {
    auth.requireStaff.mockRejectedValue(new Error("unauthorized"));

    await expect(VenuesPage()).rejects.toThrow("unauthorized");
    expect(database.withDatabase).not.toHaveBeenCalled();
    expect(venues.listActiveVenues).not.toHaveBeenCalled();
  });

  it("renders an explicit empty state for venue, promotion, and operations lists", async () => {
    const venuesMarkup = renderToStaticMarkup(await VenuesPage());
    const promotionsMarkup = renderToStaticMarkup(await PromotionsPage());
    const operationsMarkup = renderToStaticMarkup(await OperationsPage());

    expect(venuesMarkup).toContain("No active venues");
    expect(promotionsMarkup).toContain("No promotions");
    expect(operationsMarkup).toContain("No operations");
  });

  it("renders venue monitoring and promotion delivery context", async () => {
    venues.getVenue.mockResolvedValue({ id: "v1", name: "Harbour Cafe", address: "1 Queen's Road", timezone: "Asia/Hong_Kong", status: "active" });
    venues.listActiveOfferTemplates.mockResolvedValue([{ id: "template-1" }]);
    venues.getLatestForecastSnapshot.mockResolvedValue({ fetchedAt: new Date("2026-07-17T08:00:00Z"), expiresAt: new Date("2026-07-17T12:00:00Z") });
    triggers.listTriggersForVenue.mockResolvedValue([{ id: "trigger-1", reason: "quiet_period", decision: "approval_pending" }]);
    triggers.listCopyCandidates.mockResolvedValue([{ id: "candidate-1" }]);
    triggers.findApprovalByTriggerId.mockResolvedValue({ id: "approval-1", state: "pending", triggerId: "trigger-1" });
    promotions.listPromotions.mockResolvedValue([{ id: "promotion-1", venueId: "v1", campaignCode: "HARBOUR-01", state: "accepted" }]);

    const venueMarkup = renderToStaticMarkup(await VenueDetailPage({ params: Promise.resolve({ venueId: "v1" }) }));
    expect(venueMarkup).toContain("Copy candidates");
    expect(venueMarkup).toContain("Promotions");
    expect(venueMarkup).toContain("1 copy candidates");
    expect(venueMarkup).toContain("Approval pending");
    expect(venueMarkup).toContain("Freshness:");

    promotions.getPromotion.mockResolvedValue({
      id: "promotion-1",
      venueId: "v1",
      approvalId: "approval-1",
      campaignCode: "HARBOUR-01",
      body: "Save 10% today",
      state: "accepted",
      validFrom: new Date("2026-07-17T10:00:00Z"),
      validUntil: new Date("2026-07-17T12:00:00Z"),
      providerBroadcastId: "broadcast-1",
      memberCount: 10,
      sentCount: 9,
      attempts: 1,
    });
    triggers.getApproval.mockResolvedValue({ id: "approval-1", triggerId: "trigger-1", state: "accepted", selectedCandidateId: "candidate-1", providerMessageId: "message-1", createdAt: new Date("2026-07-17T09:00:00Z"), expiresAt: new Date("2026-07-17T09:15:00Z"), resolvedAt: new Date("2026-07-17T09:05:00Z") });
    triggers.listCopyCandidates.mockResolvedValue([{ id: "candidate-1", body: "Save 10% today" }]);

    const promotionMarkup = renderToStaticMarkup(await PromotionDetailPage({ params: Promise.resolve({ promotionId: "promotion-1" }) }));
    expect(promotionMarkup).toContain("Approval and copy");
    expect(promotionMarkup).toContain("Delivery window");
    expect(promotionMarkup).toContain("Broadcast: broadcast-1");
    expect(promotionMarkup).toContain("Selected copy");
  });

  it("renders explicit unavailable states when detail rows are missing", async () => {
    venues.getVenue.mockResolvedValue(undefined);
    promotions.getPromotion.mockResolvedValue(undefined);

    const venueMarkup = renderToStaticMarkup(await VenueDetailPage({ params: Promise.resolve({ venueId: "missing" }) }));
    const promotionMarkup = renderToStaticMarkup(await PromotionDetailPage({ params: Promise.resolve({ promotionId: "missing" }) }));

    expect(venueMarkup).toContain("Venue unavailable");
    expect(promotionMarkup).toContain("Promotion unavailable");
  });

  it("renders explicit empty report state", async () => {
    expect(renderToStaticMarkup(await ReportsPage())).toContain("No reports");
  });
});