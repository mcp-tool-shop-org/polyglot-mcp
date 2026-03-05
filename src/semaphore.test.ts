/**
 * Tests for the Semaphore class (src/semaphore.ts).
 */

import { describe, it, expect } from "vitest";
import { Semaphore, DEFAULT_CONCURRENCY } from "./semaphore.js";

describe("Semaphore", () => {
  it("exports a sensible default concurrency", () => {
    expect(DEFAULT_CONCURRENCY).toBeGreaterThanOrEqual(1);
  });

  it("creates with default limit", () => {
    const sem = new Semaphore();
    expect(sem.limit).toBe(DEFAULT_CONCURRENCY);
    expect(sem.active).toBe(0);
    expect(sem.waiting).toBe(0);
  });

  it("throws on limit < 1", () => {
    expect(() => new Semaphore(0)).toThrow("limit must be ≥ 1");
    expect(() => new Semaphore(-1)).toThrow("limit must be ≥ 1");
  });

  it("allows acquiring up to limit concurrently", async () => {
    const sem = new Semaphore(2);
    const r1 = await sem.acquire();
    const r2 = await sem.acquire();
    expect(sem.active).toBe(2);
    expect(sem.waiting).toBe(0);
    r1();
    r2();
    expect(sem.active).toBe(0);
  });

  it("queues when at limit", async () => {
    const sem = new Semaphore(1);
    const r1 = await sem.acquire();
    expect(sem.active).toBe(1);

    let secondAcquired = false;
    const p2 = sem.acquire().then((r) => {
      secondAcquired = true;
      return r;
    });

    // Second acquire should be waiting
    expect(sem.waiting).toBe(1);
    expect(secondAcquired).toBe(false);

    // Release first — second should now acquire
    r1();
    const r2 = await p2;
    expect(secondAcquired).toBe(true);
    expect(sem.active).toBe(1);
    r2();
    expect(sem.active).toBe(0);
  });

  it("handles FIFO ordering", async () => {
    const sem = new Semaphore(1);
    const r1 = await sem.acquire();
    const order: number[] = [];

    const p2 = sem.acquire().then((r) => {
      order.push(2);
      return r;
    });
    const p3 = sem.acquire().then((r) => {
      order.push(3);
      return r;
    });

    expect(sem.waiting).toBe(2);

    r1();
    const r2 = await p2;
    expect(order).toEqual([2]);

    r2();
    const r3 = await p3;
    expect(order).toEqual([2, 3]);
    r3();
  });

  it("works with concurrent workload", async () => {
    const sem = new Semaphore(2);
    let maxConcurrent = 0;
    let current = 0;

    const work = async () => {
      const release = await sem.acquire();
      current++;
      maxConcurrent = Math.max(maxConcurrent, current);
      await new Promise((r) => setTimeout(r, 10));
      current--;
      release();
    };

    await Promise.all(Array.from({ length: 6 }, () => work()));
    expect(maxConcurrent).toBeLessThanOrEqual(2);
    expect(current).toBe(0);
  });

  it("has correct active/waiting counts during use", async () => {
    const sem = new Semaphore(1);

    expect(sem.active).toBe(0);
    expect(sem.waiting).toBe(0);

    const r1 = await sem.acquire();
    expect(sem.active).toBe(1);
    expect(sem.waiting).toBe(0);

    const p2 = sem.acquire();
    expect(sem.active).toBe(1);
    expect(sem.waiting).toBe(1);

    r1();
    const r2 = await p2;
    expect(sem.active).toBe(1);
    expect(sem.waiting).toBe(0);

    r2();
    expect(sem.active).toBe(0);
  });
});
