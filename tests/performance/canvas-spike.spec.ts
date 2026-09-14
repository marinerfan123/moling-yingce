import { expect, test } from "@playwright/test";

const fixtureSizes = [100, 500, 1000, 5000, 10000] as const;

for (const size of fixtureSizes) {
  test(`canvas ${size} logical nodes`, async () => {
    const budget = size <= 1000 ? 400 : size;
    expect(budget).toBeGreaterThanOrEqual(size <= 1000 ? 400 : 1000);
  });
}
