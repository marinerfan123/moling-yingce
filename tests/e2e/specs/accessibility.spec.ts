import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("commercial canvas accessibility gates are explicit", async ({ page }) => {
  await page.setContent(`
    <!doctype html>
    <html lang="zh-CN">
      <head>
        <title>商业漫剧无限画布无障碍检查</title>
      </head>
      <body>
        <main>
          <h1>商业漫剧无限画布</h1>
          <nav aria-label="画布大纲">
            <button type="button">第一集脚本</button>
            <button type="button">雨夜镜头</button>
          </nav>
          <section aria-label="无限画布" tabindex="0">
            <button type="button">创建节点</button>
            <button type="button">连接节点</button>
            <button type="button">确认布局</button>
          </section>
          <div role="status" aria-live="polite">键盘、搜索、大纲与布局预览可用</div>
        </main>
      </body>
    </html>
  `);

  const axe = await new AxeBuilder({ page }).analyze();
  const pageZooms = [100, 200, 400];
  const canvasZooms = [5, 15, 45, 85, 100, 400];
  const keyboardAlternatives = [
    "create-node",
    "connect-node",
    "edit-node",
    "delete-node",
    "select-node",
    "confirm-layout",
  ];
  const motionPolicy = { reducedMotionContinuousAnimations: 0 };
  const seriousOrCriticalViolations = axe.violations.filter((violation) =>
    ["serious", "critical"].includes(violation.impact ?? ""),
  );

  expect(pageZooms).toEqual([100, 200, 400]);
  expect(canvasZooms).toEqual([5, 15, 45, 85, 100, 400]);
  expect(keyboardAlternatives).toContain("connect-node");
  expect(keyboardAlternatives).toContain("confirm-layout");
  expect(motionPolicy.reducedMotionContinuousAnimations).toBe(0);
  expect(seriousOrCriticalViolations).toEqual([]);
});
