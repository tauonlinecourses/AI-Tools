import { describe, expect, it } from "vitest";
import {
  isSharePointUrl,
  parseSharePointLink,
  sharePointEmbedUrl,
  sharePointImageSrc,
} from "./sharePoint";

const VIDEO_1 =
  "https://tauex.sharepoint.com/:v:/s/Shakespeare/IQD4Kpaf6AxKQ7-VCuD4w1z1Ae0mNDWHOGiY8RcEyzpjIBE";
const VIDEO_2 =
  "https://tauex.sharepoint.com/:v:/s/Shakespeare/IQBt2okCAq2QT5I2__6tKxe_AamImVqRJaUMKhCB9gmwsCQ";
const IMAGE_1 =
  "https://tauex.sharepoint.com/:i:/s/Shakespeare/IQCci6hbf2jcRZz1i7AFJAS0AY-iWO52r4eRiuqb2M2-ieQ";

const GUID_VIDEO_1 = "9f962af8-0ce8-434a-bf95-0ae0f8c35cf5";
const GUID_VIDEO_2 = "0289da6d-ad02-4f90-9236-fffead2b17bf";
const GUID_IMAGE_1 = "5ba88b9c-687f-45dc-9cf5-8bb0052404b4";
const GUID_ONEDRIVE_IMG = "71545dc5-7b20-4d0a-8b79-11097fba375f";
const GUID_EMBED = "eebb8c6c-9949-4907-8b9d-0e35aa570d0c";

/** OneDrive personal path-based copy link (`/:i:/r/personal/...?d=w…`). */
const ONEDRIVE_IMAGE =
  "https://tauex-my.sharepoint.com/:i:/r/personal/guyshapira2_tauex_tau_ac_il/Documents/%D7%A7%D7%95%D7%A8%D7%A1%D7%99%D7%9D/%D7%9E%D7%94%D7%99%20%D7%92%D7%96%D7%A2%D7%A0%D7%95%D7%AA/05_%D7%94%D7%98%D7%9E%D7%A2%D7%94/%D7%A9%D7%99%D7%A2%D7%95%D7%A8%2001/%D7%99%D7%97%D7%99%D7%93%D7%95%D7%AA%20%D7%98%D7%A7%D7%A1%D7%98/%D7%92%D7%96%D7%A2%20%D7%95%D7%92%D7%96%D7%A2%D7%A0%D7%95%D7%AA%20%D7%91%D7%99%D7%95%D7%9C%D7%95%D7%92%D7%99%D7%AA%20-%20%D7%94%D7%A4%D7%A0%D7%99%D7%94.png?d=w71545dc57b204d0a8b7911097fba375f&csf=1&web=1&e=rkQi5P";

/** Stream player URL copied from the address bar. */
const STREAM_VIDEO =
  "https://tauex-my.sharepoint.com/personal/guyshapira2_tauex_tau_ac_il/_layouts/15/stream.aspx?id=%2Fpersonal%2Fguyshapira2%5Ftauex%5Ftau%5Fac%5Fil%2FDocuments%2F%D7%A7%D7%95%D7%A8%D7%A1%D7%99%D7%9D%2F%D7%9E%D7%94%D7%99%20%D7%92%D7%96%D7%A2%D7%A0%D7%95%D7%AA%2F04%5F%D7%94%D7%A4%D7%A7%D7%AA%20%D7%95%D7%99%D7%93%D7%90%D7%95%2FRUSHES%2F6%2E5%2E26%20%D7%9E%D7%94%D7%99%20%D7%92%D7%96%D7%A2%D7%A0%D7%95%D7%AA%20%D7%AA%D7%9E%D7%A8%20%D7%95%D7%92%D7%9C%D7%99%D7%94%2FMultiCorder4%20%2D%20Output%201%20%2D%2006%20May%202026%20%2D%2011%2D13%2D11%20am%2Emp4&referrer=StreamWebApp%2EWeb&referrerScenario=AddressBarCopied%2Eview%2Eeebb8c6c%2D9949%2D4907%2D8b9d%2D0e35aa570d0c";

describe("parseSharePointLink", () => {
  it("decodes the three known copy links to the expected GUIDs", () => {
    expect(parseSharePointLink(VIDEO_1)).toEqual({
      host: "tauex.sharepoint.com",
      sitePath: "/sites/Shakespeare",
      kind: "v",
      guid: GUID_VIDEO_1,
    });
    expect(parseSharePointLink(VIDEO_2)).toEqual({
      host: "tauex.sharepoint.com",
      sitePath: "/sites/Shakespeare",
      kind: "v",
      guid: GUID_VIDEO_2,
    });
    expect(parseSharePointLink(IMAGE_1)).toEqual({
      host: "tauex.sharepoint.com",
      sitePath: "/sites/Shakespeare",
      kind: "i",
      guid: GUID_IMAGE_1,
    });
  });

  it("accepts links without a scheme", () => {
    const bare =
      "tauex.sharepoint.com/:v:/s/Shakespeare/IQD4Kpaf6AxKQ7-VCuD4w1z1Ae0mNDWHOGiY8RcEyzpjIBE";
    expect(parseSharePointLink(bare)?.guid).toBe(GUID_VIDEO_1);
  });

  it("ignores query strings and surrounding whitespace", () => {
    const withQs = `  ${VIDEO_1}?e=abc&nav=xyz  `;
    expect(parseSharePointLink(withQs)?.guid).toBe(GUID_VIDEO_1);
  });

  it("maps /:v:/t/ team links to /teams/", () => {
    const team =
      "https://tauex.sharepoint.com/:v:/t/MyTeam/IQD4Kpaf6AxKQ7-VCuD4w1z1Ae0mNDWHOGiY8RcEyzpjIBE";
    expect(parseSharePointLink(team)).toMatchObject({
      sitePath: "/teams/MyTeam",
      kind: "v",
      guid: GUID_VIDEO_1,
    });
  });

  it("parses OneDrive personal /r/ path links via d=w GUID", () => {
    const parsed = parseSharePointLink(ONEDRIVE_IMAGE);
    expect(parsed).toMatchObject({
      host: "tauex-my.sharepoint.com",
      sitePath: "/personal/guyshapira2_tauex_tau_ac_il",
      kind: "i",
      guid: GUID_ONEDRIVE_IMG,
    });
    expect(parsed?.filePath).toMatch(
      /^\/personal\/guyshapira2_tauex_tau_ac_il\/Documents\/.+\.png$/
    );
  });

  it("parses Stream stream.aspx address-bar links via path id= (not referrerScenario)", () => {
    const parsed = parseSharePointLink(STREAM_VIDEO);
    expect(parsed).toMatchObject({
      host: "tauex-my.sharepoint.com",
      sitePath: "/personal/guyshapira2_tauex_tau_ac_il",
      kind: "v",
    });
    // referrerScenario GUID must NOT be treated as UniqueId
    expect(parsed?.guid).toBeUndefined();
    expect(parsed?.filePath).toMatch(/\.mp4$/i);
  });

  it("parses embed.aspx?UniqueId links", () => {
    const embed =
      `https://tauex-my.sharepoint.com/personal/guyshapira2_tauex_tau_ac_il/_layouts/15/embed.aspx?UniqueId=${GUID_EMBED}`;
    expect(parseSharePointLink(embed)).toMatchObject({
      sitePath: "/personal/guyshapira2_tauex_tau_ac_il",
      kind: "v",
      guid: GUID_EMBED,
    });
  });

  it("returns null for stream.aspx without id or UniqueId", () => {
    expect(
      parseSharePointLink(
        "https://tauex-my.sharepoint.com/personal/user/_layouts/15/stream.aspx?referrer=StreamWebApp"
      )
    ).toBeNull();
  });

  it("returns null for non-SharePoint and unsupported tokens", () => {
    expect(parseSharePointLink(undefined)).toBeNull();
    expect(parseSharePointLink("")).toBeNull();
    expect(
      parseSharePointLink("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
    ).toBeNull();
    expect(
      parseSharePointLink(
        "https://tau.cloud.panopto.eu/Panopto/Pages/Viewer.aspx?id=abc"
      )
    ).toBeNull();
    // Too short / malformed token
    expect(
      parseSharePointLink(
        "https://tauex.sharepoint.com/:v:/s/Shakespeare/notavalidtoken"
      )
    ).toBeNull();
    // Non-0x21 first byte (AA... base64 starts with 0x00)
    expect(
      parseSharePointLink(
        "https://tauex.sharepoint.com/:v:/s/Shakespeare/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
      )
    ).toBeNull();
  });
});

describe("sharePointEmbedUrl", () => {
  it("builds embed.aspx with UniqueId for videos and images", () => {
    expect(sharePointEmbedUrl(VIDEO_1)).toBe(
      `https://tauex.sharepoint.com/sites/Shakespeare/_layouts/15/embed.aspx?UniqueId=${GUID_VIDEO_1}` +
        `&embed=%7B%22ust%22%3Atrue%2C%22hv%22%3A%22CopyEmbedCode%22%7D` +
        `&referrer=StreamWebApp&referrerScenario=EmbedDialog.Create`
    );
    expect(sharePointEmbedUrl(IMAGE_1)).toContain(
      `UniqueId=${GUID_IMAGE_1}`
    );
  });

  it("returns null for unsupported links", () => {
    expect(sharePointEmbedUrl("https://example.com/x")).toBeNull();
  });
});

describe("sharePointImageSrc", () => {
  it("builds download.aspx only for :i: token links", () => {
    expect(sharePointImageSrc(IMAGE_1)).toBe(
      `https://tauex.sharepoint.com/sites/Shakespeare/_layouts/15/download.aspx?UniqueId=${GUID_IMAGE_1}`
    );
    expect(sharePointImageSrc(VIDEO_1)).toBeNull();
  });

  it("builds personal-site download.aspx for OneDrive /r/ image links", () => {
    expect(sharePointImageSrc(ONEDRIVE_IMAGE)).toBe(
      `https://tauex-my.sharepoint.com/personal/guyshapira2_tauex_tau_ac_il/_layouts/15/download.aspx?UniqueId=${GUID_ONEDRIVE_IMG}`
    );
  });
});

describe("sharePointEmbedUrl (OneDrive / Stream)", () => {
  it("builds personal-site embed.aspx for /r/ links", () => {
    expect(sharePointEmbedUrl(ONEDRIVE_IMAGE)).toBe(
      `https://tauex-my.sharepoint.com/personal/guyshapira2_tauex_tau_ac_il/_layouts/15/embed.aspx?UniqueId=${GUID_ONEDRIVE_IMG}` +
        `&embed=%7B%22ust%22%3Atrue%2C%22hv%22%3A%22CopyEmbedCode%22%7D` +
        `&referrer=StreamWebApp&referrerScenario=EmbedDialog.Create`
    );
  });

  it("converts stream.aspx address-bar links to embed.aspx?id= (path), not UniqueId", () => {
    const embed = sharePointEmbedUrl(STREAM_VIDEO);
    expect(embed).toContain(
      "https://tauex-my.sharepoint.com/personal/guyshapira2_tauex_tau_ac_il/_layouts/15/embed.aspx?id="
    );
    expect(embed).toContain(encodeURIComponent("/personal/guyshapira2_tauex_tau_ac_il/Documents/"));
    expect(embed).toContain(".mp4");
    expect(embed).not.toContain("UniqueId=");
    expect(embed).not.toContain(GUID_EMBED);
  });
});

describe("isSharePointUrl", () => {
  it("detects sharepoint hosts without decoding", () => {
    expect(isSharePointUrl(VIDEO_1)).toBe(true);
    expect(isSharePointUrl("tauex.sharepoint.com/:v:/s/X/Y")).toBe(true);
    expect(isSharePointUrl("https://youtube.com/watch?v=1")).toBe(false);
    expect(isSharePointUrl(undefined)).toBe(false);
  });
});
