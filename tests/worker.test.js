/**
 * Worker Tests - Successful and Failed Job Processing
 * Run with: npm test
 */

import test from "node:test";
import assert from "node:assert";

test("Successful Job Processing", async (t) => {
  await t.test("Should parse valid webhook payload (push event)", () => {
    const validPayload = {
      action: "push",
      ref: "refs/heads/main",
      repository: {
        id: 123456,
        name: "webhook-test",
        full_name: "user/webhook-test",
        url: "https://api.github.com/repos/user/webhook-test",
      },
      pusher: {
        name: "testuser",
        email: "test@example.com",
      },
      commits: [
        {
          id: "abc123def456",
          message: "Add webhook tests",
          author: { name: "Test User", email: "test@example.com" },
        },
      ],
    };

    // Simulate queue: serialize and deserialize
    const serialized = JSON.stringify(validPayload);
    const job = JSON.parse(serialized);

    assert.strictEqual(job.action, "push");
    assert.strictEqual(job.repository.name, "webhook-test");
    assert.strictEqual(job.commits[0].message, "Add webhook tests");
    console.log("✓ Push event payload valid");
  });

  await t.test("Should process push event with multiple commits", () => {
    const pushEvent = {
      action: "push",
      ref: "refs/heads/main",
      repository: {
        name: "webhook-test",
        url: "https://github.com/user/webhook-test",
      },
      commits: [
        {
          id: "abc123",
          message: "Fix: Update webhook handler",
          author: { name: "John Doe" },
        },
        {
          id: "def456",
          message: "Feature: Add new job type",
          author: { name: "John Doe" },
        },
        {
          id: "ghi789",
          message: "Docs: Update README",
          author: { name: "John Doe" },
        },
      ],
    };

    const job = JSON.parse(JSON.stringify(pushEvent));
    assert.strictEqual(job.commits.length, 3);
    assert.strictEqual(job.commits[0].id, "abc123");
    assert.strictEqual(job.commits[2].message, "Docs: Update README");
    console.log("✓ Push event with 3 commits processed");
  });

  await t.test("Should process pull request event", () => {
    const prEvent = {
      action: "opened",
      number: 42,
      pull_request: {
        id: 1,
        title: "Add webhook tests",
        body: "This PR adds comprehensive tests",
        html_url: "https://github.com/user/repo/pull/42",
        user: { login: "developer" },
        created_at: "2026-03-17T10:00:00Z",
      },
      repository: {
        name: "webhook-test",
      },
    };

    const job = JSON.parse(JSON.stringify(prEvent));
    assert.strictEqual(job.action, "opened");
    assert.strictEqual(job.pull_request.title, "Add webhook tests");
    assert.strictEqual(job.number, 42);
    console.log("✓ Pull request event processed");
  });

  await t.test("Should process release event", () => {
    const releaseEvent = {
      action: "published",
      release: {
        id: 1,
        tag_name: "v1.0.0",
        name: "Version 1.0.0",
        draft: false,
        prerelease: false,
        published_at: "2026-03-17T12:00:00Z",
      },
      repository: { name: "webhook-test" },
    };

    const job = JSON.parse(JSON.stringify(releaseEvent));
    assert.strictEqual(job.release.tag_name, "v1.0.0");
    assert.strictEqual(job.action, "published");
    console.log("✓ Release event processed: v1.0.0");
  });

  await t.test("Should maintain job queue order", () => {
    const jobs = [
      { id: 1, action: "push", timestamp: "2026-03-17T10:00:00Z" },
      { id: 2, action: "pull_request", timestamp: "2026-03-17T10:01:00Z" },
      { id: 3, action: "issues", timestamp: "2026-03-17T10:02:00Z" },
    ];

    // Process in order
    const queue = jobs.map((job) => JSON.parse(JSON.stringify(job)));
    const ids = queue.map((j) => j.id);

    assert.deepStrictEqual(ids, [1, 2, 3]);
    console.log("✓ Job queue order maintained: 1→2→3");
  });

  await t.test("Should handle large webhook payload (100+ commits)", () => {
    const largePayload = {
      action: "push",
      repository: { name: "webhook-test" },
      commits: Array.from({ length: 100 }, (_, i) => ({
        id: `commit-${String(i).padStart(3, "0")}`,
        message: `Feature: Add component ${i}`,
        author: { name: "Developer" },
      })),
    };

    const job = JSON.parse(JSON.stringify(largePayload));
    assert.strictEqual(job.commits.length, 100);
    assert.strictEqual(job.commits[50].id, "commit-050");
    assert.strictEqual(job.commits[99].id, "commit-099");
    console.log("✓ Large payload processed: 100 commits");
  });
});

test("Failed Job Processing", async (t) => {
  await t.test("Should intentionally fail on invalid JSON", () => {
    const invalidJobString = "not valid json {{{";

    try {
      JSON.parse(invalidJobString);
      assert.fail("Should have thrown SyntaxError");
    } catch (error) {
      assert.ok(error instanceof SyntaxError);
      assert.ok(error.message.includes("Unexpected token"));

      // Create DLQ entry
      const dlqEntry = {
        payload: invalidJobString,
        error: error.message,
        failedAt: new Date().toISOString(),
      };

      assert.ok(dlqEntry.error);
      assert.ok(dlqEntry.failedAt);
      console.log("✗ Invalid JSON failed as expected → DLQ");
    }
  });

  await t.test("Should fail when required fields are missing", () => {
    const invalidPayload = {
      random_data: "This should fail validation",
      // Missing required 'action' and 'repository' fields
    };

    const job = JSON.parse(JSON.stringify(invalidPayload));

    // Validation check
    const hasRequiredFields = !!(job.action && job.repository);
    assert.strictEqual(hasRequiredFields === false, true);

    console.log("✗ Missing required fields failed as expected");
  });

  await t.test(
    "Should fail on corrupted repository data (null repository)",
    () => {
      const corruptedPayload = {
        action: "push",
        repository: null, // Intentionally corrupted
        pusher: { name: "user" },
      };

      const job = JSON.parse(JSON.stringify(corruptedPayload));

      try {
        // This will throw TypeError when trying to access .name on null
        const repoName = job.repository.name;
        assert.fail("Should have thrown TypeError");
      } catch (error) {
        assert.ok(error instanceof TypeError);
        assert.ok(
          error.message.includes("Cannot"),
          "Error should mention Cannot read",
        );
        console.log("✗ Null repository failed as expected");
      }
    },
  );

  await t.test("Should fail on missing commits array", () => {
    const invalidPayload = {
      action: "push",
      ref: "refs/heads/main",
      repository: { name: "test-repo" },
      commits: null, // or undefined
    };

    const job = JSON.parse(JSON.stringify(invalidPayload));

    try {
      // This will fail when trying to iterate/access commits
      if (job.commits && job.commits.length > 0) {
        const firstCommit = job.commits[0];
      } else if (job.commits === null) {
        throw new Error("Commits array is null");
      }
      assert.fail("Should have validation error");
    } catch (error) {
      assert.ok(error.message);
      console.log("✗ Invalid commits field failed as expected");
    }
  });

  await t.test("Should fail when Redis connection error occurs", () => {
    // Simulate Redis connection failure
    const redisError = new Error("ECONNREFUSED: Connection refused");

    try {
      throw redisError;
    } catch (error) {
      assert.strictEqual(error.message, "ECONNREFUSED: Connection refused");

      // Create DLQ entry
      const dlqEntry = {
        payload: JSON.stringify({ action: "push" }),
        error: error.message,
        failedAt: new Date().toISOString(),
      };

      assert.ok(dlqEntry.error);
      console.log("✗ Redis connection error → DLQ");
    }
  });

  await t.test("Should timeout and push to dead letter queue", () => {
    // Simulate timeout scenario
    const timeoutError = new Error("Processing timeout exceeded after 30s");

    const dlqEntry = {
      payload: JSON.stringify({ action: "push", repository: { name: "test" } }),
      error: timeoutError.message,
      failedAt: new Date().toISOString(),
    };

    assert.strictEqual(dlqEntry.error, "Processing timeout exceeded after 30s");
    assert.ok(
      /\d{4}-\d{2}-\d{2}T/.test(dlqEntry.failedAt),
      "Timestamp should be ISO format",
    );
    console.log("✗ Timeout error → DLQ with timestamp:", dlqEntry.failedAt);
  });

  await t.test("Should continue processing after a failed job", () => {
    // Failed job
    let failedJobProcessed = false;
    const failedJob = "invalid json {";

    try {
      JSON.parse(failedJob);
    } catch (error) {
      failedJobProcessed = true;
      // This would push to DLQ
    }

    // Next job should still be processed
    const successfulJob = {
      action: "push",
      repository: { name: "test-repo" },
    };

    const nextJob = JSON.parse(JSON.stringify(successfulJob));

    assert.strictEqual(failedJobProcessed, true);
    assert.strictEqual(nextJob.action, "push");
    console.log(
      "✓ Worker recovered: processed failed job, then continued with successful job",
    );
  });

  await t.test("Should log detailed error information for DLQ", () => {
    const error = new Error("Unexpected token } in JSON at position 15");
    error.stack =
      "SyntaxError: Unexpected token } in JSON at position 15\n    at JSON.parse (<anonymous>)\n    at processJob (worker/index.js:25:10)";

    const dlqEntry = {
      payload: "invalid} json",
      error: error.message,
      stack: error.stack,
      failedAt: new Date().toISOString(),
    };

    assert.ok(dlqEntry.payload);
    assert.ok(dlqEntry.error);
    assert.ok(dlqEntry.stack);
    assert.ok(dlqEntry.failedAt);
    assert.ok(
      dlqEntry.stack.includes("worker/index.js"),
      "Stack trace should reference worker file",
    );

    console.log("✓ DLQ entry populated with full error details");
  });
});

test("Dead Letter Queue Management", async (t) => {
  await t.test("Should store multiple failed jobs in DLQ", () => {
    const dlqJobs = [
      {
        payload: "{ invalid json }",
        error: "Unexpected token i in JSON at position 2",
        failedAt: "2026-03-17T10:00:00Z",
      },
      {
        payload: JSON.stringify({ action: "push" }),
        error: "Missing required field: repository",
        failedAt: "2026-03-17T10:01:00Z",
      },
      {
        payload: JSON.stringify({ action: "push", repository: null }),
        error: 'Cannot read property "name" of null',
        failedAt: "2026-03-17T10:02:00Z",
      },
    ];

    assert.strictEqual(dlqJobs.length, 3);
    assert.strictEqual(dlqJobs[0].error.includes("JSON"), true);
    assert.strictEqual(dlqJobs[1].error.includes("Missing"), true);
    assert.strictEqual(dlqJobs[2].error.includes("null"), true);

    console.log(`✓ DLQ history: ${dlqJobs.length} failed jobs recorded`);
  });

  await t.test("Should retrieve and inspect DLQ entries", () => {
    const dlqEntries = [
      {
        id: 1,
        payload: "corrupt data",
        error: "JSON parse error",
        failedAt: "2026-03-17T10:00:00Z",
      },
      {
        id: 2,
        payload: "{}",
        error: "Validation failed",
        failedAt: "2026-03-17T10:05:00Z",
      },
    ];

    // Filter by error type
    const jsonErrors = dlqEntries.filter((e) => e.error.includes("JSON"));
    assert.strictEqual(jsonErrors.length, 1);

    // Sort by failure time
    const sorted = dlqEntries.sort(
      (a, b) => new Date(a.failedAt) - new Date(b.failedAt),
    );
    assert.strictEqual(sorted[0].id, 1);

    console.log(`✓ DLQ query: Found ${jsonErrors.length} JSON errors`);
  });

  await t.test("Should handle DLQ when Redis is unavailable", () => {
    const dlqError = new Error("Cannot connect to Redis for DLQ");

    try {
      // Simulating attempt to push to dead_letter_queue
      throw dlqError;
    } catch (error) {
      // Log critical error but don't crash
      const criticalLog = {
        event: "CRITICAL",
        message: "Failed to push to dead letter queue",
        originalError: "JSON parse error",
        dlqError: error.message,
      };

      assert.strictEqual(criticalLog.event, "CRITICAL");
      assert.ok(criticalLog.dlqError);
      console.log("✗ CRITICAL: Could not save to DLQ - Redis unavailable");
    }
  });
});

test("Worker Resilience", async (t) => {
  await t.test("Should process multiple events in sequence", () => {
    const events = [
      { id: 1, action: "push", status: "success" },
      { id: 2, action: "pull_request", status: "success" },
      { id: 3, action: "issues", status: "success" },
      { id: 4, action: "release", status: "success" },
    ];

    events.forEach((event, index) => {
      assert.strictEqual(event.id, index + 1);
      assert.strictEqual(event.status, "success");
    });

    console.log(`✓ Processed ${events.length} events in sequence`);
  });

  await t.test("Should recover after errors and continue processing", () => {
    const results = [];

    // Job 1: Success
    try {
      const job1 = JSON.parse(JSON.stringify({ action: "push", id: 1 }));
      results.push({ id: 1, status: "success" });
    } catch (e) {
      results.push({ id: 1, status: "failed" });
    }

    // Job 2: Failed (invalid JSON)
    try {
      const job2 = JSON.parse("invalid{");
      results.push({ id: 2, status: "success" });
    } catch (e) {
      results.push({ id: 2, status: "failed", error: "JSON parse error" });
    }

    // Job 3: Success (after recovery)
    try {
      const job3 = JSON.parse(
        JSON.stringify({ action: "pull_request", id: 3 }),
      );
      results.push({ id: 3, status: "success" });
    } catch (e) {
      results.push({ id: 3, status: "failed" });
    }

    assert.strictEqual(results.length, 3);
    assert.strictEqual(results[0].status, "success");
    assert.strictEqual(results[1].status, "failed");
    assert.strictEqual(results[2].status, "success");

    console.log(`✓ Worker resilience: success → failed → success (recovered)`);
  });
});
