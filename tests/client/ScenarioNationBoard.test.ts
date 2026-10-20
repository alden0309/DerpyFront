// SCEN (r25): the nations board of the Scenarios screen and the scenario
// lobby: who holds each seat, picking a free nation, the host moving players.

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/client/Utils", () => ({
  translateText: vi.fn((key: string, params?: Record<string, string>) =>
    params?.name ? `${key}:${params.name}` : key,
  ),
}));

import {
  boardSeats,
  ScenarioNationBoard,
} from "../../src/client/scenario/ScenarioNationBoard";

const clients = [
  { clientID: "HOST0001", username: "Alden" },
  { clientID: "GUEST001", username: "Bea" },
  { clientID: "GUEST002", username: "Cal" },
  { clientID: "WATCHER1", username: "Dee", spectator: true },
];

describe("boardSeats", () => {
  it("only players in the lobby hold seats; the rest are listed apart", () => {
    const { seats, unseated } = boardSeats(
      { france: "HOST0001", germany: "GONEAWAY", italy: "WATCHER1" },
      clients,
    );
    expect(seats).toEqual({ france: { clientID: "HOST0001", name: "Alden" } });
    expect(unseated.map((u) => u.name)).toEqual(["Bea", "Cal"]);
  });
});

describe("the nations board", () => {
  let board: ScenarioNationBoard;

  async function mount(props: Partial<ScenarioNationBoard>) {
    board = document.createElement(
      "scenario-nation-board",
    ) as ScenarioNationBoard;
    Object.assign(board, { scenarioId: "europe1939", ...props });
    document.body.appendChild(board);
    await board.updateComplete;
    return board;
  }
  const tile = (key: string) =>
    board.querySelector<HTMLElement>(`[data-nation="${key}"]`)!;
  const events = (name: string) => {
    const got: unknown[] = [];
    board.addEventListener(name, (e) => got.push((e as CustomEvent).detail));
    return got;
  };

  afterEach(() => board?.remove());

  it("groups the nations by side, neutrals last", async () => {
    await mount({});
    const groups = [...board.querySelectorAll("[data-side-group]")];
    expect(groups).toHaveLength(3);
    expect(groups[0].querySelector('[data-nation="germany"]')).not.toBeNull();
    expect(groups[1].querySelector('[data-nation="france"]')).not.toBeNull();
    expect(groups[2].querySelector('[data-nation="spain"]')).not.toBeNull();
  });

  it("shows each seat's player, or Computer, and picks a free nation", async () => {
    const { seats, unseated } = boardSeats(
      { france: "HOST0001", germany: "GUEST001" },
      clients,
    );
    await mount({ seats, unseated, myClientID: "GUEST002" });
    expect(tile("germany").textContent).toContain("Bea");
    expect(tile("italy").textContent).toContain("scenarios.computer");
    const picked = events("nation-picked");
    tile("italy").click();
    // A seat someone holds can't be taken by a guest.
    tile("germany").click();
    expect(picked).toEqual(["italy"]);
  });

  it("lets the host move a player, or free their seat", async () => {
    const { seats, unseated } = boardSeats({ germany: "GUEST001" }, clients);
    await mount({ seats, unseated, myClientID: "HOST0001", canManage: true });
    const changes = events("seat-change");
    // Pick up Bea from Germany, put her on Italy.
    tile("germany").click();
    await board.updateComplete;
    tile("italy").click();
    // Pick up Cal (no seat yet), put him on Hungary.
    const cal = [...board.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === "Cal",
    )!;
    cal.click();
    await board.updateComplete;
    tile("hungary").click();
    // Free Bea's seat.
    tile("germany")
      .querySelector<HTMLButtonElement>(
        'button[aria-label="scenarios.free_seat"]',
      )!
      .click();
    expect(changes).toEqual([
      { nation: "italy", target: "GUEST001" },
      { nation: "hungary", target: "GUEST002" },
      { nation: null, target: "GUEST001" },
    ]);
  });

  it("does nothing once locked", async () => {
    await mount({ seats: {}, unseated: [], myClientID: "X", locked: true });
    const picked = events("nation-picked");
    tile("italy").click();
    expect(picked).toEqual([]);
  });
});
