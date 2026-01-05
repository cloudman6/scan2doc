import { test as base, expect } from '@playwright/test';

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

                // Ignore Firefox scroll-linked positioning warning
                if (cleanText.includes('scroll-linked positioning effect')) return false;
                // Ignore PDF resume errors during page reload/DB deletion in tests
                if (cleanText.includes('Error resuming PDF processing')) return false;
                // Ignore PDF save errors due to frequent reloads
                if (cleanText.includes('Failed to save source file to DB')) return false;
                // Ignore Dexie warning when another connection tries to delete the database
                if (cleanText.includes('Another connection wants to delete database')) return false;
                // Ignore legacy page recovery warnings in tests
                if (cleanText.includes('legacy pages without fileId link')) return false;
                // Ignore module loading errors
                if (cleanText.includes('Importing a module script failed')) return false;
                if (cleanText.includes('Loading failed for the module with source')) return false;
                // Ignore WebKit specific BlobResource errors (often benign in test environments)
                if (cleanText.includes('WebKitBlobResource error 1')) return false;
                return true;
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
