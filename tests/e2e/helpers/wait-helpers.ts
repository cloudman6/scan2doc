import type { Page } from '@playwright/test';

/**
 * 等待 Store 达到特定状态
 */
export async function waitForStoreState<T>(
  page: Page,
  predicate: (store: any) => T,
  options: { timeout?: number; interval?: number } = {}
): Promise<T> {
  const { timeout = 10000, interval = 100 } = options;

  return await page.waitForFunction(
    (pred) => {
      if (!window.pagesStore) return null;
      return pred(window.pagesStore);
    },
    predicate,
    { timeout, polling: interval }
  );
}

/**
 * 等待页面达到指定状态
 */
export async function waitForPageStatus(
  page: Page,
  pageIndex: number,
  status: string | string[],
  timeout: number = 10000
): Promise<void> {
  const statuses = Array.isArray(status) ? status : [status];

  await page.waitForFunction(
    ([idx, expectedStatuses]) => {
      const pages = window.pagesStore?.pages || [];
      const currentStatus = pages[idx]?.status;
      return expectedStatuses.includes(currentStatus);
    },
    [pageIndex, statuses] as const,
    { timeout }
  );
}

/**
 * 等待通知出现
 */
export async function waitForNotification(
  page: Page,
  text: string | RegExp,
  timeout: number = 5000
): Promise<void> {
  const selector = typeof text === 'string'
    ? `.n-notification:has-text("${text}")`
    : '.n-notification';

  const notification = page.locator(selector);
  await notification.waitFor({ state: 'visible', timeout });

  if (typeof text !== 'string') {
    const content = await notification.textContent();
    if (!text.test(content || '')) {
      throw new Error(`Notification content "${content}" does not match pattern ${text}`);
    }
  }
}

/**
 * 等待数据库操作完成
 */
export async function waitForDatabaseSync(
  page: Page,
  timeout: number = 2000
): Promise<void> {
  // TODO: 实现更精确的数据库同步检测
  // 当前使用固定等待,未来可以监听 IndexedDB 事件
  await page.waitForTimeout(timeout);
}

/**
 * 轮询检查条件(替代 waitForTimeout)
 */
export async function pollUntil<T>(
  condition: () => Promise<T>,
  options: {
    timeout?: number;
    interval?: number;
    errorMessage?: string;
  } = {}
): Promise<T> {
  const { timeout = 10000, interval = 100, errorMessage = 'Condition not met' } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      const result = await condition();
      if (result) return result;
    } catch (e) {
      // 继续轮询
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }

  throw new Error(errorMessage);
}
