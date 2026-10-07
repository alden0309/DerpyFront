import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Footer, SOURCE_CODE_URL } from "../../../src/client/components/Footer";

describe("page-footer (Derpy Front)", () => {
  let footer: Footer;

  beforeEach(() => {
    if (!customElements.get("page-footer")) {
      customElements.define("page-footer", Footer);
    }
  });

  afterEach(() => {
    footer?.remove();
  });

  async function mount(): Promise<Footer> {
    footer = document.createElement("page-footer") as Footer;
    document.body.appendChild(footer);
    await footer.updateComplete;
    return footer;
  }

  it("says Hey Buddy", async () => {
    await mount();
    expect(footer.querySelector(".hey-buddy")?.textContent?.trim()).toBe(
      "Hey Buddy",
    );
  });

  it("keeps the legal links, the source link and the language button", async () => {
    await mount();
    const hrefs = [...footer.querySelectorAll("a")].map((a) =>
      a.getAttribute("href"),
    );
    expect(hrefs).toEqual([
      "/terms-of-service.html",
      "/privacy-policy.html",
      SOURCE_CODE_URL,
    ]);
    expect(footer.querySelector("lang-selector")).not.toBeNull();
  });

  it("has no social links or version line", async () => {
    await mount();
    expect(footer.querySelector("img, svg")).toBeNull();
    expect(footer.querySelector(".footer-version")).toBeNull();
  });
});
