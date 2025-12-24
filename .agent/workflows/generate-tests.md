---
description: Generate comprehensive Vitest unit tests for specified files aiming for 100% coverage.
---

This workflow guides you through generating high-coverage unit tests for one or more target files using Vitest.

### Prerequisites
- Target file paths must be provided.
- Project uses Vitest (already configured with `vitest.config.ts`).
- **Dependencies**: Ensure `@vitest/coverage-v8` or `@vitest/coverage-istanbul` is installed to run coverage reports.

### Steps

1. **Analyze Target Files**
   - Read the content of each target file.
   - Identify all functions, classes, and exported members.
   - Identify all imports and external dependencies.
   - Map out all logical branches (if/else, switch, try/catch, ternary operators).

2. **Setup Mocks and Environment**
   - Identify dependencies that need mocking (e.g., IndexedDB, PDF.js, external APIs).
   - Use `fake-indexeddb` for database-related logic.
   - Use `vi.mock()` for module-level mocks.
   - Ensure `jsdom` is used if the code interacts with the DOM.

3. **Generate Initial Test Suite**
   - Create a corresponding test file (e.g., `src/path/to/file.test.ts`).
   - Implement "Happy Path" tests first.
   - Implement tests for each exported function/method.

4. **Iterate for 100% Coverage**
   - Run the tests with coverage enabled:
     ```bash
     npm run test:unit -- <file-path> --coverage
     ```
   - Analyze the coverage report (look for uncovered lines or branches).
   - Add specific test cases to trigger the uncovered branches (e.g., edge cases, error conditions, boundary values).
   - Repeat until 100% coverage is achieved.

5. **Testing Philosophy (The "SOP" approach)** 
   The following standards must be followed for every task involving code changes or test generation:
   - **Test-First Planning**: Define a testing strategy in the `[PLAN]` module before implementation.
   - **Core Testing Philosophy**:
     - **Logical Integrity First**: Always prioritize logic and robust mocking. Never delete valid code branches just to satisfy coverage tools.
     - **Refactor for Seams**: Hard-to-reach branches indicate complex coupling. Split functions into "Pure Logic" and "Impure I/O" to reach 100% coverage naturally.
     - **Document Intent**: High coverage is a means, not the end. If an edge case is truly unreachable in tests, achieve 99% coverage and document the rationale rather than forcing 100% via brittle refactors.
   - **Multi-Layered Verification**:
     - **Unit & Logic**: 100% coverage for core business logic, data transformations, and state changes.
     - **Integration**: Verify complex workflows and inter-module communication.
     - **External Boundaries**: Always mock external APIs, IndexedDB, and specialized browser APIs (PDF.js, Workers).
   - **State Integrity**: Verify the full lifecycle of persistent data (DB operations, IndexedDB state).
   - **"Self-Healing" Loop**: 
     - Execute tests immediately after any code modification.
     - Analyze logs and fix code autonomously if tests fail.
     - **Zero-Regression Policy**: A task is only "Done" if 100% of tests (new and existing) are green.
   - **Environment Safety**:
     - Use high-fidelity mocks (e.g., `fake-indexeddb`) for browser features.
     - Extract core algorithms into independent, pure functions to allow Node.js testing without DOM dependencies.
     - **Resource Cleanup**: Explicitly verify the cleanup of memory-intensive resources (`URL.revokeObjectURL`, heavy buffers).

6. **Verify and Finalize**
   - Ensure all tests pass.
   - Verify readability and adherence to the project's style guide.
   - Create a `walkthrough.md` summarizing test commands, results, and build status.

### Examples of Edge Cases to Cover
- Empty/Null/Undefined inputs.
- Error handling in async operations.
- Boundary conditions for loops or math logic.
- Mocking failed network or database responses.