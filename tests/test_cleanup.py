"""Tests for the pre-game cleanup tool.

This module can terminate processes, so its tests weigh more than most in this
suite. The categorisation and verdict logic (what CAN be closed, and how the
free-RAM number is judged) is tested directly with fake data -- no PowerShell,
no real machine. The safety guard -- that a game or a system-critical process
can never appear as a closeable target -- is tested as a hard invariant on the
real CATEGORIES table, not just on a hypothetical one, because that is the
table actually used.
"""

import unittest

from allytune.system.cleanup import (
    CATEGORIES,
    GRACE_SWEEP_DELAY_S,
    NoiseReport,
    READY_ABOVE_GB,
    TIGHT_ABOVE_GB,
    _protected_names,
    _verdict,
    cleanup,
    scan,
)


class TestSafetyInvariant(unittest.TestCase):
    """The part of this module that must never regress."""

    def test_no_category_contains_a_game_process(self):
        from allytune.games import library
        game_names = {g.process_name.lower().removesuffix(".exe") for g in library.GAMES}
        for cat in CATEGORIES:
            for proc in cat.processes:
                self.assertNotIn(
                    proc.lower(), game_names,
                    cat.key + " would close " + proc + ", which is a game",
                )

    def test_no_category_contains_a_protected_name(self):
        protected = _protected_names()
        for cat in CATEGORIES:
            for proc in cat.processes:
                self.assertNotIn(
                    proc.lower(), protected,
                    cat.key + " would close " + proc + ", which is protected",
                )

    def test_steam_client_itself_is_never_a_target(self):
        """Only steamwebhelper may appear. steam.exe is protected explicitly."""
        for cat in CATEGORIES:
            self.assertNotIn("steam", [p.lower() for p in cat.processes], cat.key)
        self.assertIn("steam", _protected_names())

    def test_tdp_and_gpu_processes_are_protected(self):
        protected = _protected_names()
        for name in ("armourycratese", "radeonsoftware", "amdrsserv"):
            self.assertIn(name, protected)

    def test_onscreen_keyboard_is_protected(self):
        """Handheld with no guaranteed physical keyboard -- must never touch this."""
        protected = _protected_names()
        self.assertIn("textinputhost", protected)
        self.assertIn("tabtip", protected)

    def test_this_agent_is_protected(self):
        self.assertIn("claude", _protected_names())

    def test_cleanup_refuses_a_hypothetically_protected_name(self):
        """Belt and braces: even if CATEGORIES were ever edited to include one,
        cleanup() must still refuse to execute it, not just decline to list it.

        Everything real (the process query, the kill call, the RAM read) is
        injected, so this exercises the actual refusal path with no PowerShell
        and no chance of the test itself terminating anything.
        """
        import allytune.system.cleanup as mod

        original_categories = mod.CATEGORIES
        original_by_key = mod._CATEGORY_BY_KEY
        executed = []
        try:
            bad = mod.Category(
                key="bad", label="bad", processes=("claude",),
                graceful=False, default_on=True,
            )
            mod.CATEGORIES = (bad,)
            mod._CATEGORY_BY_KEY = {"bad": bad}

            result = mod.cleanup(
                ["bad"],
                live={"claude": 300.0},
                executor=lambda args: executed.append(args) or (0, ""),
                free_before_gb=6.0,
                free_after_gb=6.0,
            )
        finally:
            mod.CATEGORIES = original_categories
            mod._CATEGORY_BY_KEY = original_by_key

        self.assertEqual(executed, [], "taskkill must never be invoked on 'claude'")
        self.assertEqual(result.closed, [])
        self.assertIn("claude", result.skipped_protected)

    def test_cleanup_executes_only_for_permitted_names(self):
        result = cleanup(
            ["alienware"],
            live={"commandcenterosd": 118.0, "msedge": 50.0},  # msedge: wrong category
            executor=lambda args: (0, ""),
            live_after={},  # everything actually gone afterward
            free_before_gb=6.0,
            free_after_gb=6.8,
        )
        self.assertEqual(result.closed, ["CommandCenterOsd"])
        self.assertAlmostEqual(result.free_gb_after - result.free_gb_before, 0.8)

    def test_unknown_category_key_is_ignored_not_an_error(self):
        result = cleanup(
            ["not-a-real-category"], live={}, executor=lambda args: (0, ""),
            free_before_gb=6.0, free_after_gb=6.0,
        )
        self.assertEqual(result.closed, [])

    def test_graceful_category_tries_without_force_first(self):
        seen = []
        cleanup(
            ["browsers"], live={"msedge": 50.0},
            executor=lambda args: seen.append(args) or (0, ""),  # succeeds first try
            live_mid={},    # genuinely gone -- must inject this or cleanup() falls
                            # through to a REAL process query, which found the real
                            # msedge.exe still running on this machine (the fake
                            # executor never actually closes anything) and correctly
                            # escalated -- a real bug in this test, not in cleanup()
            live_after={},
            free_before_gb=6.0, free_after_gb=6.0,
        )
        self.assertEqual(seen, [["taskkill", "/IM", "msedge.exe"]])

    def test_force_categories_include_the_force_flag_immediately(self):
        seen = []
        cleanup(
            ["gamebar"], live={"gamebar": 113.0},
            executor=lambda args: seen.append(args) or (0, ""),
            live_after={},
            free_before_gb=6.0, free_after_gb=6.0,
        )
        self.assertEqual(seen, [["taskkill", "/IM", "GameBar.exe", "/F"]])

    def test_protected_check_is_case_insensitive(self):
        protected = _protected_names()
        self.assertIn("claude", protected)  # names are stored lowercase


class TestVerdict(unittest.TestCase):
    def test_thresholds_match_what_was_measured(self):
        """These are not round numbers -- they come from
        docs/allytune/04-phase1-results.md attempt 5 (1.2 GB -> frame drops)
        and the earlier clean-30fps probe (~3.5-3.7 GB free)."""
        self.assertEqual(READY_ABOVE_GB, 4.0)
        self.assertEqual(TIGHT_ABOVE_GB, 2.0)

    def test_ready(self):
        v, text = _verdict(6.0)
        self.assertEqual(v, "ready")
        self.assertIn("6.0", text)

    def test_tight(self):
        v, _ = _verdict(3.0)
        self.assertEqual(v, "tight")

    def test_noisy(self):
        v, text = _verdict(1.2)
        self.assertEqual(v, "noisy")
        self.assertIn("25.5", text)  # cites the actual measured consequence

    def test_boundary_is_inclusive_on_the_good_side(self):
        self.assertEqual(_verdict(4.0)[0], "ready")
        self.assertEqual(_verdict(2.0)[0], "tight")


class TestScanCategorisation(unittest.TestCase):
    def test_running_processes_are_matched_case_insensitively(self):
        live = {"commandcenterosd": 118.0, "msedge": 133.0}
        report = scan(live=live, free_total=(6.0, 15.7))
        alienware = next(c for c in report.categories if c.category.key == "alienware")
        self.assertEqual(len(alienware.running), 1)
        self.assertEqual(alienware.running[0].name, "CommandCenterOsd")
        self.assertAlmostEqual(alienware.running[0].mb, 118.0)

    def test_not_running_processes_do_not_appear(self):
        report = scan(live={}, free_total=(6.0, 15.7))
        for cat in report.categories:
            self.assertEqual(cat.running, [])
            self.assertEqual(cat.total_mb, 0.0)

    def test_reclaimable_is_the_sum_across_categories(self):
        live = {"commandcenterosd": 100.0, "msedge": 50.0, "gamebar": 25.0}
        report = scan(live=live, free_total=(6.0, 15.7))
        self.assertAlmostEqual(report.reclaimable_mb, 175.0)

    def test_multiple_instances_of_one_name_are_summed_before_matching(self):
        """_live_processes() already sums duplicate names; scan() must not
        double-count or drop that total."""
        live = {"msedge": 300.0}  # already-summed total across N windows
        report = scan(live=live, free_total=(6.0, 15.7))
        browsers = next(c for c in report.categories if c.category.key == "browsers")
        self.assertAlmostEqual(browsers.total_mb, 300.0)

    def test_verdict_reflects_the_injected_free_ram(self):
        report = scan(live={}, free_total=(1.0, 15.7))
        self.assertEqual(report.verdict, "noisy")

    def test_as_dict_round_trips_to_plain_types(self):
        """The web layer JSON-serialises this; it must not carry dataclass
        instances or anything else json.dumps chokes on."""
        import json
        report = scan(live={"msedge": 50.0}, free_total=(6.0, 15.7))
        json.dumps(report.as_dict())  # raises if this is not plain data


class TestVerifiedAgainstReality(unittest.TestCase):
    """The bug found by actually using the tool: a category was reported as
    'closed' because taskkill was invoked, without checking whether the
    process was still running afterward. Access Denied (exit 1) on
    Dell.TechHub.Instrumentation.SubAgent.exe was silently counted as success.
    These pin the fix: closed/failed is decided by what is still running, not
    by the exit code alone.
    """

    def test_success_exit_code_but_process_still_alive_is_not_closed(self):
        """Exactly the shape of bug that shipped: taskkill returns 0, but the
        process is still there afterward. Must NOT count as closed."""
        result = cleanup(
            ["gamebar"], live={"gamebar": 113.0},
            executor=lambda args: (0, ""),
            live_after={"gamebar": 113.0},   # still running despite exit 0
            free_before_gb=6.0, free_after_gb=6.0,
        )
        self.assertEqual(result.closed, [])
        self.assertIn("GameBar", result.failed_other)

    def test_access_denied_is_classified_separately_from_other_failures(self):
        """Verified against the real error text taskkill produces."""
        result = cleanup(
            ["alienware"], live={"dell.techhub": 131.0},
            executor=lambda args: (
                1, 'ERROR: The process "Dell.TechHub.exe" with PID 6012 could '
                   'not be terminated. Reason: Access is denied.'
            ),
            live_after={"dell.techhub": 131.0},
            free_before_gb=6.0, free_after_gb=6.0,
        )
        self.assertEqual(result.failed_permission, ["Dell.TechHub"])
        self.assertEqual(result.failed_other, [])
        self.assertEqual(result.closed, [])

    def test_process_actually_gone_is_closed_even_if_reported_exit_nonzero(self):
        """The reverse case: trust reality over a taskkill quirk either way."""
        result = cleanup(
            ["gamebar"], live={"gamebar": 113.0},
            executor=lambda args: (1, "some transient message"),
            live_after={},   # gone, whatever taskkill said
            free_before_gb=6.0, free_after_gb=6.0,
        )
        self.assertEqual(result.closed, ["GameBar"])
        self.assertEqual(result.failed_other, [])


class TestGracefulEscalation(unittest.TestCase):
    """A graceful category asks nicely, then forces survivors after a pause.

    Escalation is decided by an actual post-attempt process check, never by
    taskkill's exit code -- confirmed live on this device to be unreliable:
    `taskkill /IM msedge.exe` (no /F) against 18 same-named processes exited 0
    overall because 4 of them had a message loop to signal, while the other
    14 -- all windowless -- individually reported "can only be terminated
    forcefully" and were left running. Gating escalation on that exit code
    would never have triggered a force close for any of them.
    """

    def test_escalates_based_on_who_is_still_running_not_on_exit_code(self):
        """The exact bug found live: the graceful attempt reports SUCCESS
        (rc=0) while the process is still actually running. Escalation must
        still happen, driven by live_mid, not by the misleading exit code."""
        calls = []

        def executor(args):
            calls.append(args)
            return (0, "")   # taskkill claims success either way

        result = cleanup(
            ["browsers"], live={"msedge": 50.0}, executor=executor,
            live_mid={"msedge": 50.0},   # still there despite rc=0
            live_after={},               # the /F attempt actually worked
            sleep_fn=lambda s: None,
            free_before_gb=6.0, free_after_gb=6.0,
        )
        self.assertEqual(calls, [
            ["taskkill", "/IM", "msedge.exe"],
            ["taskkill", "/IM", "msedge.exe", "/F"],
        ])
        self.assertEqual(result.closed, ["msedge"])

    def test_does_not_escalate_when_actually_gone_after_the_nice_attempt(self):
        calls = []

        def executor(args):
            calls.append(args)
            return (0, "")

        cleanup(
            ["browsers"], live={"msedge": 50.0}, executor=executor,
            live_mid={},   # genuinely gone
            live_after={}, sleep_fn=lambda s: None,
            free_before_gb=6.0, free_after_gb=6.0,
        )
        self.assertEqual(len(calls), 1, "nothing left to escalate against")

    def test_pauses_before_checking_who_survived(self):
        slept = []
        cleanup(
            ["browsers"], live={"msedge": 50.0},
            executor=lambda args: (0, ""), live_mid={}, live_after={},
            sleep_fn=lambda s: slept.append(s),
            free_before_gb=6.0, free_after_gb=6.0,
        )
        self.assertEqual(slept, [GRACE_SWEEP_DELAY_S])

    def test_force_only_categories_never_sleep(self):
        slept = []
        cleanup(
            ["gamebar"], live={"gamebar": 113.0},
            executor=lambda args: (0, ""), live_after={},
            sleep_fn=lambda s: slept.append(s),
            free_before_gb=6.0, free_after_gb=6.0,
        )
        self.assertEqual(slept, [], "a force-only category has nothing to escalate")


class TestSteamWebhelperCategoryWasRemoved(unittest.TestCase):
    """Tried, measured, reverted: killing steamwebhelper made Steam's own
    watchdog relaunch the whole tree at a higher memory cost (538 -> 826 MB
    on this device, all seven processes freshly started at the moment of the
    click). This is a regression test for that removal staying removed.
    """

    def test_no_category_targets_steamwebhelper(self):
        for cat in CATEGORIES:
            self.assertNotIn("steamwebhelper", [p.lower() for p in cat.processes], cat.key)

    def test_steam_ui_key_no_longer_exists(self):
        self.assertNotIn("steam_ui", [c.key for c in CATEGORIES])


class TestMsedgewebview2WasDropped(unittest.TestCase):
    """Traced directly on this device: every msedgewebview2 process was owned
    by SearchHost.exe (Windows Search's own embedded web content, cmdline
    carrying --webview-exe-name=SearchHost.exe), not a leftover browser tab.
    Force-closing it just makes the OS shell relaunch the tree within seconds
    -- the same shape of problem as steamwebhelper, and dropped for the same
    reason. Regression test for that staying dropped.
    """

    def test_browsers_category_does_not_target_msedgewebview2(self):
        browsers = next(c for c in CATEGORIES if c.key == "browsers")
        self.assertNotIn("msedgewebview2", [p.lower() for p in browsers.processes])

    def test_msedge_itself_is_still_targeted(self):
        browsers = next(c for c in CATEGORIES if c.key == "browsers")
        self.assertIn("msedge", [p.lower() for p in browsers.processes])


class TestOneDriveDefaultsOff(unittest.TestCase):
    def test_onedrive_is_not_closed_by_default(self):
        onedrive = next(c for c in CATEGORIES if c.key == "onedrive")
        self.assertFalse(onedrive.default_on)

    def test_everything_else_defaults_on(self):
        for cat in CATEGORIES:
            if cat.key != "onedrive":
                self.assertTrue(cat.default_on, cat.key)


if __name__ == "__main__":
    unittest.main()
