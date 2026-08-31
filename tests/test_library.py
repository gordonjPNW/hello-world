"""Tests for the game library.

Two kinds of check here. The first are ordinary unit tests. The second enforce
the project's central discipline in code: that an unmeasured claim can never be
presented as a finding. That rule has been broken before by humans reading a
perf-per-watt curve derived from the wrong workload, so it is worth a test.
"""

import unittest

from allytune.games import library


class TestCatalogIntegrity(unittest.TestCase):
    def test_every_game_has_an_appid_and_exe(self):
        for g in library.GAMES:
            self.assertTrue(g.name, "game with no name")
            self.assertGreater(g.appid, 0, g.name)
            self.assertTrue(g.exe.endswith(".exe"), g.name)

    def test_process_names_are_unique(self):
        """by_process() must be unambiguous.

        The Uncharted collection ships two games from one appid, so this is a
        real collision risk rather than a theoretical one.
        """
        names = [g.process_name.lower() for g in library.GAMES]
        self.assertEqual(len(names), len(set(names)), "duplicate process name")

    def test_settings_format_is_a_known_constant(self):
        allowed = {library.PATCHABLE_XML, library.PATCHABLE_INI,
                   library.BINARY_SAVE, library.UNKNOWN_FORMAT}
        for g in library.GAMES:
            self.assertIn(g.settings, allowed, g.name)

    def test_benchmark_field_is_honest_about_uncertainty(self):
        """'likely' and 'unknown' are permitted values, and deliberately so.

        Recording a guess as 'yes' would send a future session hunting for a
        benchmark that does not exist.
        """
        for g in library.GAMES:
            self.assertIn(g.benchmark, {"yes", "no", "likely", "unknown"}, g.name)


class TestMeasurementDiscipline(unittest.TestCase):
    def test_only_measured_games_may_claim_a_bound(self):
        """The core rule, enforced mechanically.

        A game that has not been measured must read 'unmeasured'. Anything else
        is a prior dressed up as a result, which is exactly the failure this
        whole project exists to prevent.
        """
        for g in library.GAMES:
            if not g.measured:
                self.assertEqual(
                    g.bound, "unmeasured",
                    g.name + " claims bound=" + g.bound + " without measurement",
                )

    def test_measured_games_state_a_real_bound(self):
        for g in library.GAMES:
            if g.measured:
                self.assertNotEqual(g.bound, "unmeasured", g.name)

    def test_uncharted_4_is_the_measured_one(self):
        u4 = library.by_process("u4.exe")
        self.assertIsNotNone(u4)
        self.assertTrue(u4.measured)
        self.assertEqual(u4.bound, "GPU-bound")

    def test_lost_legacy_is_not_assumed_from_uncharted_4(self):
        """Same engine, same collection -- still not measured.

        The temptation to copy the sibling's result across is precisely the
        transfer-of-priors error this project has already been burned by.
        """
        tll = library.by_process("tll.exe")
        self.assertFalse(tll.measured)
        self.assertEqual(tll.bound, "unmeasured")


class TestLookup(unittest.TestCase):
    def test_by_process_is_case_insensitive(self):
        self.assertIsNotNone(library.by_process("U4.EXE"))
        self.assertIsNotNone(library.by_process("u4.exe"))

    def test_by_process_returns_none_for_unknown(self):
        self.assertIsNone(library.by_process("notagame.exe"))

    def test_find_matches_on_partial_name(self):
        self.assertIsNotNone(library.find("tsushima"))
        self.assertIsNotNone(library.find("RDR2"))

    def test_find_returns_none_for_nonsense(self):
        self.assertIsNone(library.find("zzzznotreal"))


class TestOnThisDevice(unittest.TestCase):
    """Checks that only make sense on the Ally X.

    Skipped elsewhere so the suite still passes off the device -- the analysis
    core is deliberately platform-independent and these tests must not break it.
    """

    def setUp(self):
        if not library.STEAM_COMMON.is_dir():
            self.skipTest("not on the Ally X (no Steam library at the known path)")

    def test_every_catalogued_game_is_actually_installed(self):
        for g in library.GAMES:
            self.assertTrue(g.installed(), g.name + " missing at " + str(g.full_exe))

    def test_patchable_settings_files_exist_where_claimed(self):
        for g in library.GAMES:
            if g.settings in (library.PATCHABLE_XML, library.PATCHABLE_INI):
                self.assertTrue(g.settings_path, g.name + " claims patchable but has no path")
                self.assertTrue((library.HOME / g.settings_path).exists(),
                                g.name + ": no file at ~\\" + g.settings_path)


if __name__ == "__main__":
    unittest.main()
