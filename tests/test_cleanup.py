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
                executor=lambda args: executed.append(args),
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
            executor=lambda args: None,
            free_before_gb=6.0,
            free_after_gb=6.8,
        )
        self.assertEqual(result.closed, ["CommandCenterOsd"])
        self.assertAlmostEqual(result.free_gb_after - result.free_gb_before, 0.8)

    def test_unknown_category_key_is_ignored_not_an_error(self):
        result = cleanup(
            ["not-a-real-category"], live={}, executor=lambda args: None,
            free_before_gb=6.0, free_after_gb=6.0,
        )
        self.assertEqual(result.closed, [])

    def test_graceful_categories_omit_the_force_flag(self):
        seen = []
        cleanup(
            ["browsers"], live={"msedge": 50.0},
            executor=lambda args: seen.append(args),
            free_before_gb=6.0, free_after_gb=6.0,
        )
        self.assertEqual(seen, [["taskkill", "/IM", "msedge.exe"]])

    def test_force_categories_include_the_force_flag(self):
        seen = []
        cleanup(
            ["gamebar"], live={"gamebar": 113.0},
            executor=lambda args: seen.append(args),
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
        live = {"commandcenterosd": 100.0, "msedge": 50.0, "steamwebhelper": 25.0}
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
