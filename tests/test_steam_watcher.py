"""Tests for the Steam-window-closer.

Safety is the same allowlist-first discipline as allytune.system.cleanup, so
it gets the same weight of testing: steam.exe must never be forceable, the
running game and system processes must never be misidentified as "a new
Steam game" worth acting on, and each detected launch gets at most one
close attempt.
"""

import unittest

from allytune.system.steam_watcher import (
    EXCLUDE_BASENAMES,
    STEAM_COMMON,
    VERIFY_DELAY_S,
    close_steam_window,
    find_new_game_processes,
    handle_new_games,
    is_probably_a_game,
)

U4 = r"C:\Program Files (x86)\Steam\steamapps\common\Uncharted Legacy of Thieves Collection\u4.exe"
RDR2 = r"C:\Program Files (x86)\Steam\steamapps\common\Red Dead Redemption 2\RDR2.exe"
UNCATALOGUED = r"C:\Program Files (x86)\Steam\steamapps\common\Some New Game\SomeNewGame.exe"
CRASH_HANDLER = r"C:\Program Files (x86)\Steam\steamapps\common\Red Dead Redemption 2\crashpad_handler.exe"
STEAM_ITSELF = r"C:\Program Files (x86)\Steam\steam.exe"
NOT_STEAM_AT_ALL = r"C:\Windows\System32\notepad.exe"


class TestIsProbablyAGame(unittest.TestCase):
    def test_catalogued_game_matches(self):
        self.assertTrue(is_probably_a_game("u4.exe", U4))

    def test_uncatalogued_game_under_steam_common_matches(self):
        """The whole point of the path fallback: 'every Steam game', not just
        the nine this project has looked at closely."""
        self.assertTrue(is_probably_a_game("SomeNewGame.exe", UNCATALOGUED))

    def test_crash_handler_under_steam_common_does_not_match(self):
        self.assertFalse(is_probably_a_game("crashpad_handler.exe", CRASH_HANDLER))

    def test_steam_itself_never_matches(self):
        """Belt and braces: steam.exe must never be treated as 'the game' to
        react to, even though its path is not under steamapps\\common."""
        self.assertFalse(is_probably_a_game("steam.exe", STEAM_ITSELF))

    def test_process_outside_steam_entirely_does_not_match(self):
        self.assertFalse(is_probably_a_game("notepad.exe", NOT_STEAM_AT_ALL))

    def test_empty_name_does_not_match(self):
        self.assertFalse(is_probably_a_game("", U4))

    def test_empty_path_does_not_match_for_uncatalogued_names(self):
        self.assertFalse(is_probably_a_game("SomeNewGame.exe", ""))

    def test_exclude_list_covers_common_installer_and_crash_shims(self):
        for base in ("vcredist", "dxsetup", "crashpad_handler", "crs-handler"):
            self.assertIn(base, EXCLUDE_BASENAMES)


class TestFindNewGameProcesses(unittest.TestCase):
    def test_only_processes_absent_from_before_are_candidates(self):
        before = {100: ("u4.exe", U4)}
        after = {100: ("u4.exe", U4), 200: ("RDR2.exe", RDR2)}
        found = find_new_game_processes(before, after)
        self.assertEqual([g.pid for g in found], [200])

    def test_new_non_game_process_is_not_returned(self):
        before = {}
        after = {300: ("notepad.exe", NOT_STEAM_AT_ALL)}
        self.assertEqual(find_new_game_processes(before, after), [])

    def test_nothing_new_returns_empty(self):
        before = {100: ("u4.exe", U4)}
        after = {100: ("u4.exe", U4)}
        self.assertEqual(find_new_game_processes(before, after), [])

    def test_multiple_new_games_all_returned(self):
        before = {}
        after = {100: ("u4.exe", U4), 200: ("RDR2.exe", RDR2)}
        found = find_new_game_processes(before, after)
        self.assertEqual(sorted(g.pid for g in found), [100, 200])


class TestCloseSteamWindow(unittest.TestCase):
    def test_never_passes_the_force_flag(self):
        """The one rule this entire module exists to enforce."""
        seen = []
        close_steam_window(executor=lambda args: seen.append(args) or (0, ""))
        self.assertEqual(seen, [["taskkill", "/IM", "steam.exe"]])
        self.assertNotIn("/F", seen[0])


class TestHandleNewGames(unittest.TestCase):
    def test_closes_steam_once_per_newly_detected_game(self):
        calls = []
        handled = handle_new_games(
            before={}, after={100: ("u4.exe", U4)}, handled_pids=frozenset(),
            executor=lambda args: calls.append(args) or (0, ""),
            sleep_fn=lambda s: None, close_delay=3.0, print_fn=lambda *a: None,
            window_check_fn=lambda: False,
        )
        self.assertEqual(len(calls), 1)
        self.assertEqual(handled, frozenset({100}))

    def test_already_handled_pid_is_not_acted_on_again(self):
        """A game that is still running on the next poll must not trigger a
        second close -- it is already in `after` every subsequent poll."""
        calls = []
        handled = handle_new_games(
            before={100: ("u4.exe", U4)}, after={100: ("u4.exe", U4)},
            handled_pids=frozenset({100}),
            executor=lambda args: calls.append(args) or (0, ""),
            sleep_fn=lambda s: None, print_fn=lambda *a: None,
        )
        self.assertEqual(calls, [])
        self.assertEqual(handled, frozenset({100}))

    def test_pauses_before_closing(self):
        slept = []
        handle_new_games(
            before={}, after={100: ("u4.exe", U4)}, handled_pids=frozenset(),
            executor=lambda args: (0, ""),
            sleep_fn=lambda s: slept.append(s), close_delay=3.0,
            print_fn=lambda *a: None, window_check_fn=lambda: False,
        )
        # 3.0 is the pre-close pause under test here; VERIFY_DELAY_S is the
        # separate post-close verification wait, unconditional on success.
        self.assertEqual(slept, [3.0, VERIFY_DELAY_S])

    def test_zero_delay_skips_the_pause(self):
        slept = []
        handle_new_games(
            before={}, after={100: ("u4.exe", U4)}, handled_pids=frozenset(),
            executor=lambda args: (0, ""),
            sleep_fn=lambda s: slept.append(s), close_delay=0,
            print_fn=lambda *a: None, window_check_fn=lambda: False,
        )
        # The pre-close pause is skipped; the post-close verification wait
        # still happens -- it is independent of close_delay.
        self.assertEqual(slept, [VERIFY_DELAY_S])

    def test_two_different_games_launching_together_both_get_closed_once(self):
        calls = []
        handled = handle_new_games(
            before={}, after={100: ("u4.exe", U4), 200: ("RDR2.exe", RDR2)},
            handled_pids=frozenset(),
            executor=lambda args: calls.append(args) or (0, ""),
            sleep_fn=lambda s: None, print_fn=lambda *a: None,
            window_check_fn=lambda: False,
        )
        self.assertEqual(len(calls), 2)
        self.assertEqual(handled, frozenset({100, 200}))

    def test_a_non_game_process_launching_triggers_nothing(self):
        calls = []
        handle_new_games(
            before={}, after={300: ("notepad.exe", NOT_STEAM_AT_ALL)},
            handled_pids=frozenset(),
            executor=lambda args: calls.append(args) or (0, ""),
            sleep_fn=lambda s: None, print_fn=lambda *a: None,
        )
        self.assertEqual(calls, [])


class TestHandleNewGamesVerifiesTheWindowActuallyClosed(unittest.TestCase):
    """Regression tests for a bug caught live, 2026-09-05: a graceful taskkill
    exiting 0 does not mean Steam's window actually closed. It was reported as
    "done" while the window stayed open the whole session -- the same shape
    of false-success bug already found twice in allytune.system.cleanup."""

    def test_success_message_only_prints_once_the_window_is_confirmed_gone(self):
        messages = []
        handle_new_games(
            before={}, after={100: ("u4.exe", U4)}, handled_pids=frozenset(),
            executor=lambda args: (0, ""),
            sleep_fn=lambda s: None, close_delay=0,
            print_fn=lambda *a: messages.append(" ".join(a)),
            window_check_fn=lambda: False,
        )
        self.assertTrue(any("done" in m for m in messages))
        self.assertFalse(any("still open" in m for m in messages))

    def test_still_open_message_prints_when_taskkill_succeeded_but_window_remains(self):
        """The exact bug as reported: taskkill exits 0, the window never
        actually goes away."""
        messages = []
        handle_new_games(
            before={}, after={100: ("u4.exe", U4)}, handled_pids=frozenset(),
            executor=lambda args: (0, ""),
            sleep_fn=lambda s: None, close_delay=0,
            print_fn=lambda *a: messages.append(" ".join(a)),
            window_check_fn=lambda: True,
        )
        self.assertTrue(any("still open" in m for m in messages))
        self.assertFalse(any("done" in m for m in messages))

    def test_window_is_not_checked_when_taskkill_itself_failed(self):
        """No point verifying a close that was never even accepted -- and the
        existing failure message already covers that case."""
        checked = []
        handle_new_games(
            before={}, after={100: ("u4.exe", U4)}, handled_pids=frozenset(),
            executor=lambda args: (1, "Access is denied."),
            sleep_fn=lambda s: None, close_delay=0,
            print_fn=lambda *a: None,
            window_check_fn=lambda: checked.append(True) or False,
        )
        self.assertEqual(checked, [])

    def test_verification_wait_happens_after_a_successful_taskkill(self):
        slept = []
        handle_new_games(
            before={}, after={100: ("u4.exe", U4)}, handled_pids=frozenset(),
            executor=lambda args: (0, ""),
            sleep_fn=lambda s: slept.append(s), close_delay=0,
            print_fn=lambda *a: None, window_check_fn=lambda: False,
        )
        self.assertIn(VERIFY_DELAY_S, slept)


if __name__ == "__main__":
    unittest.main()
