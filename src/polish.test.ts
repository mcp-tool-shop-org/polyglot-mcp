import { describe, it, expect } from "vitest";
import { polish, polishHeading, polishCell } from "./polish.js";

describe("polish", () => {
  it("returns clean text unchanged", () => {
    expect(polish("Hello world")).toBe("Hello world");
  });

  it("trims leading and trailing whitespace", () => {
    expect(polish("  hello  ")).toBe("hello");
  });

  it("strips Japanese 'or' alternative (または)", () => {
    expect(polish("翻訳A\nまたは\n翻訳B")).toBe("翻訳A");
  });

  it("strips Korean 'or' alternative (또는)", () => {
    expect(polish("번역A\n또는\n번역B")).toBe("번역A");
  });

  it("strips French 'or' alternative (ou)", () => {
    expect(polish("Traduction A\nou\nTraduction B")).toBe("Traduction A");
  });

  it("strips German 'or' alternative (oder)", () => {
    expect(polish("Übersetzung A\noder\nÜbersetzung B")).toBe("Übersetzung A");
  });

  it("strips Russian 'or' alternative (или)", () => {
    expect(polish("Перевод A\nили\nПеревод B")).toBe("Перевод A");
  });

  it("strips Hindi 'or' alternative (या)", () => {
    expect(polish("अनुवाद A\nया\nअनुवाद B")).toBe("अनुवाद A");
  });

  it("strips Turkish 'or' alternative (veya)", () => {
    expect(polish("Çeviri A\nveya\nÇeviri B")).toBe("Çeviri A");
  });

  it("strips Vietnamese 'or' alternative (hoặc)", () => {
    expect(polish("Bản dịch A\nhoặc\nBản dịch B")).toBe("Bản dịch A");
  });

  it("strips Indonesian/Malay 'or' alternative (atau)", () => {
    expect(polish("Terjemahan A\natau\nTerjemahan B")).toBe("Terjemahan A");
  });

  it("collapses triple+ newlines to double", () => {
    expect(polish("A\n\n\nB")).toBe("A\n\nB");
    expect(polish("A\n\n\n\n\nB")).toBe("A\n\nB");
  });

  it("strips trailing spaces on lines", () => {
    expect(polish("hello   \nworld  ")).toBe("hello\nworld");
  });

  it("preserves paragraph breaks", () => {
    expect(polish("First paragraph.\n\nSecond paragraph.")).toBe(
      "First paragraph.\n\nSecond paragraph."
    );
  });
});

describe("polishHeading", () => {
  it("removes trailing period (EN)", () => {
    expect(polishHeading("My Heading.")).toBe("My Heading");
  });

  it("removes trailing Japanese period", () => {
    expect(polishHeading("見出し。")).toBe("見出し");
  });

  it("removes trailing fullwidth period", () => {
    expect(polishHeading("見出し．")).toBe("見出し");
  });

  it("leaves headings without periods unchanged", () => {
    expect(polishHeading("My Heading")).toBe("My Heading");
  });

  it("also applies base polish rules", () => {
    expect(polishHeading("  My Heading.  ")).toBe("My Heading");
  });
});

describe("polishCell", () => {
  it("replaces embedded newlines with spaces", () => {
    expect(polishCell("line one\nline two")).toBe("line one line two");
  });

  it("also applies base polish rules", () => {
    expect(polishCell("  cell text  ")).toBe("cell text");
  });

  it("strips 'or' alternatives and flattens", () => {
    expect(polishCell("Text A\nまたは\nText B")).toBe("Text A");
  });
});
