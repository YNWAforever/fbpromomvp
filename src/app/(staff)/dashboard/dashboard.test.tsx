import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import EmptyState from "@/components/empty-state";
import MetricCard from "@/components/metric-card";
import OperationsTable from "@/components/operations-table";
import StatusBadge from "@/components/status-badge";

describe("staff dashboard primitives", () => {
  afterEach(() => cleanup());
  it("shows an enabled retry action for send_failed operations", () => {
    render(<OperationsTable rows={[{ id: "p1", state: "send_failed", reason: "provider_timeout" }]} />);

    expect(screen.getByRole("button", { name: "Retry promotion" })).toBeEnabled();
    expect(screen.getByText("Send failed")).toBeInTheDocument();
  });

  it("does not render a retry action for accepted promotions", () => {
    render(<OperationsTable rows={[{ id: "p2", state: "accepted" }]} />);

    expect(screen.queryByRole("button", { name: "Retry promotion" })).not.toBeInTheDocument();
  });

  it("uses the exact match-review status for a coverage mismatch", () => {
    render(<StatusBadge status="needs_match_review" />);

    expect(screen.getByText("Needs match review")).toBeInTheDocument();
  });

  it("renders an explicit empty state", () => {
    render(<EmptyState title="No venues" description="Add a venue to start monitoring." />);

    expect(screen.getByRole("status")).toHaveTextContent("No venues");
    expect(screen.getByText("Add a venue to start monitoring.")).toBeInTheDocument();
  });

  it("labels an absent metric as unavailable", () => {
    render(<MetricCard label="Revenue" value={null} />);

    expect(screen.getByText("Unavailable")).toBeInTheDocument();
  });

  it("accepts action callbacks without making provider calls", () => {
    const onRetry = vi.fn();
    render(<OperationsTable rows={[{ id: "p3", state: "send_failed", onRetry }]} />);

    expect(screen.getByRole("button", { name: "Retry promotion" })).toBeEnabled();
  });
});
