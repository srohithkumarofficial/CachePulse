import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Dashboard from "./Dashboard";

const profiles = [
  { id: "claims-processing", name: "Claims Processing", description: "Claims profile", behavior: ["Hot keys"] },
  { id: "member-services", name: "Member Services", description: "Member profile", behavior: ["Repeated lookups"] },
];

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("Dashboard workload profiles", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("loads selectable profiles in Policy Lab", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) =>
      String(input).endsWith("/workloads") ? jsonResponse(profiles) : jsonResponse({ policy: "LRU", capacity: 4 }),
    );
    const user = userEvent.setup();
    render(<Dashboard />);
    await user.click(screen.getByRole("button", { name: "Policy Lab" }));

    const selector = await screen.findByLabelText("Workload profile");
    await waitFor(() => expect((selector as HTMLSelectElement).disabled).toBe(false));
    expect(screen.getByRole("option", { name: "Claims Processing" })).toBeTruthy();
    await user.selectOptions(selector, "member-services");
    expect((selector as HTMLSelectElement).value).toBe("member-services");
  });

  it("lets the user retry after a temporary workload request failure", async () => {
    let attempts = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (String(input).endsWith("/workloads")) {
        attempts++;
        return attempts === 1 ? jsonResponse({ error: { message: "temporarily unavailable" } }, 503) : jsonResponse(profiles);
      }
      return jsonResponse({ policy: "LRU", capacity: 4 });
    });
    const user = userEvent.setup();
    render(<Dashboard />);
    await user.click(screen.getByRole("button", { name: "Policy Lab" }));
    await screen.findByText(/temporarily unavailable/);
    await user.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => expect((screen.getByLabelText("Workload profile") as HTMLSelectElement).disabled).toBe(false));
    expect(screen.getByRole("option", { name: "Member Services" })).toBeTruthy();
  });
});
