import { TestBed } from '@angular/core/testing';
import { afterAll, afterEach, beforeEach } from 'vitest';
import { assertConsoleMessages, installConsoleCapture } from './console-policy';

// Capture module-import diagnostics as well as messages from test bodies.
installConsoleCapture();
beforeEach(installConsoleCapture);
afterEach(async () => {
  // Capture Angular service destruction before checking this test's diagnostics.
  installConsoleCapture();
  try {
    TestBed.resetTestingModule();
  } finally {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    assertConsoleMessages();
  }
});
afterAll(async () => {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  assertConsoleMessages();
});
