import { test as base, expect } from '@playwright/test';

/**
 * Known benign patterns that should be filtered out from console logs
 */
const IGNORED_PATTERNS = [
    'scroll-linked positioning effect',
    'Error resuming PDF processing',
    'Failed to save source file to DB',
    'Another connection wants to delete database',
    'legacy pages without fileId link',
    'Importing a module script failed',
    'Loading failed for the module with source',
    'WebKitBlobResource error 1',
    'NotReadableError: The I/O read operation failed',
    'due to access control checks',
];

/**
 * Check if a log entry should be filtered out
 */
function shouldFilterLog(cleanText: string): boolean {
    return IGNORED_PATTERNS.some(pattern => cleanText.includes(pattern));
}

/**
 * Custom fixture that extends the base Playwright test.
 * It monitors the browser console for errors and warnings.
 * If any are found during a test, the test will fail.
 */
export const test = base.extend({
    page: async ({ page }, use) => {
        const logs: { type: string; text: string }[] = [];

        // Listen for console messages
        page.on('console', msg => {
            const type = msg.type();
            if (type === 'error' || type === 'warning') {
                logs.push({ type, text: msg.text() });
            }
        });

        // Listen for uncaught exceptions
        page.on('pageerror', exc => {
            logs.push({ type: 'pageerror', text: exc.message });
        });

        // Run the actual test
        await use(page);

        // After test completion, assert that no errors or warnings were logged
        if (logs.length > 0) {
            // Filter out known benign warnings or environmental issues
            const filteredLogs = logs.filter(log => {
                // Remove ANSI escape codes (color formatting) for more robust matching
                // eslint-disable-next-line no-control-regex, sonarjs/no-control-regex
                const cleanText = log.text.replace(/\x1b\[[0-9;]*m/g, '');
                return !shouldFilterLog(cleanText);
            });

            if (filteredLogs.length > 0) {
                const formattedLogs = filteredLogs
                    .map(log => `[${log.type.toUpperCase()}] ${log.text}`)
                    .join('\n');

                // We use a custom message for the expectation failure
                expect(filteredLogs, `Found browser console logs during test:\n${formattedLogs}`).toHaveLength(0);
            }
        }
    },
});

export { expect };
