"""Headless browser automation via Playwright (Integration Directive §1).

Playwright's sync API is not thread-safe and must not run inside an asyncio
loop (both constraints verified against the official docs and empirically).
This service therefore owns ONE dedicated worker thread: the sync Playwright
instance, the chromium browser, and every page operation live there. The
public surface is thread-safe and synchronous.

Capabilities registered with the central orchestrator:
    browser.navigate   — load a URL → status, title, text length
    browser.screenshot — load a URL, save a PNG → path, size, title
    browser.links      — extract hyperlinks from a URL
"""
from __future__ import annotations

import logging
import os
import queue
import threading

logger = logging.getLogger("jarvis.integration.browser")


class BrowserError(Exception):
    """Any browser-side failure (launch, navigation, render, timeout)."""


class BrowserService:
    def __init__(self, headless: bool = True,
                 default_timeout_ms: int = 20000) -> None:
        self._headless = headless
        self._default_timeout_ms = default_timeout_ms
        self._thread: threading.Thread | None = None
        self._queue: "queue.Queue[tuple | None]" = queue.Queue()
        self._ready = threading.Event()
        self._launch_error: str | None = None
        self._closed = False

    # ----------------------------------------------------------- lifecycle
    def _ensure_started(self) -> None:
        if self._closed:
            raise BrowserError("browser service already closed")
        if self._thread is not None:
            if self._launch_error:
                raise BrowserError(
                    f"browser failed to launch: {self._launch_error}")
            return
        self._thread = threading.Thread(target=self._run, daemon=True,
                                        name="playwright-browser")
        self._thread.start()
        if not self._ready.wait(60.0):
            raise BrowserError("browser thread did not start within 60s")
        if self._launch_error:
            raise BrowserError(
                f"browser failed to launch: {self._launch_error}")

    def _run(self) -> None:  # worker thread — owns Playwright exclusively
        playwright = browser = None
        try:
            from playwright.sync_api import sync_playwright
            playwright = sync_playwright().start()
            browser = playwright.chromium.launch(headless=self._headless)
            self._ready.set()
            logger.info("browser.launched chromium headless")
            while True:
                item = self._queue.get()
                if item is None:
                    break
                fn, result, done = item
                try:
                    result["value"] = fn(browser)
                except Exception as exc:  # noqa: BLE001
                    result["error"] = f"{type(exc).__name__}: {exc}"
                finally:
                    done.set()
        except Exception as exc:  # noqa: BLE001
            self._launch_error = f"{type(exc).__name__}: {exc}"
            self._ready.set()
            logger.error("browser.launch_failed: %s", self._launch_error)
        finally:
            for closer in ((browser.close if browser else None),
                           (playwright.stop if playwright else None)):
                if closer:
                    try:
                        closer()
                    except Exception:  # noqa: BLE001
                        pass
            logger.info("browser.stopped")

    def _submit(self, fn, timeout_s: float = 30.0):
        self._ensure_started()
        result: dict = {}
        done = threading.Event()
        self._queue.put((fn, result, done))
        if not done.wait(timeout_s):
            raise BrowserError(
                f"browser operation timed out after {timeout_s}s")
        if "error" in result:
            raise BrowserError(result["error"])
        return result["value"]

    def close(self) -> None:
        if self._thread is not None and not self._closed:
            self._queue.put(None)
            self._thread.join(timeout=15.0)
            self._closed = True

    # ---------------------------------------------------------- operations
    def navigate(self, url: str, timeout_ms: int | None = None) -> dict:
        timeout_ms = timeout_ms or self._default_timeout_ms

        def _op(browser):
            page = browser.new_page()
            try:
                resp = page.goto(url, timeout=timeout_ms,
                                 wait_until="domcontentloaded")
                body = page.inner_text("body")
                return {"url": page.url,
                        "status": resp.status if resp else None,
                        "title": page.title(),
                        "text_chars": len(body),
                        "text_head": body[:200]}
            finally:
                page.close()

        out = self._submit(_op, timeout_ms / 1000.0 + 10.0)
        logger.info("browser.navigate url=%s status=%s",
                    out.get("url"), out.get("status"))
        return out

    def screenshot(self, url: str, path: str,
                   timeout_ms: int | None = None) -> dict:
        timeout_ms = timeout_ms or self._default_timeout_ms

        def _op(browser):
            page = browser.new_page()
            try:
                page.goto(url, timeout=timeout_ms, wait_until="load")
                page.screenshot(path=path, full_page=False)
                return {"path": os.path.abspath(path),
                        "bytes": os.path.getsize(path),
                        "title": page.title()}
            finally:
                page.close()

        return self._submit(_op, timeout_ms / 1000.0 + 10.0)

    def links(self, url: str, timeout_ms: int | None = None) -> dict:
        timeout_ms = timeout_ms or self._default_timeout_ms

        def _op(browser):
            page = browser.new_page()
            try:
                page.goto(url, timeout=timeout_ms,
                          wait_until="domcontentloaded")
                hrefs = page.eval_on_selector_all(
                    "a[href]", "els => els.map(e => e.href)")
                return {"url": page.url, "links": hrefs[:100]}
            finally:
                page.close()

        return self._submit(_op, timeout_ms / 1000.0 + 10.0)
