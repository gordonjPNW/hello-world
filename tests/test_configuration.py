"""Tests for configuration detection and the warning rules.

The two target profiles -- handheld on battery, docked on AC -- are different
measurement regimes, and mislabelling a run is how a data set quietly rots
months later. So the mixed states get tested as carefully as the targets.
"""

import unittest

from allytune.inventory.device import (
    Display,
    Inventory,
    build_warnings,
    classify_configuration,
)

INTERNAL = Display(
    device="DISPLAY1", name="TL070FVXS01-0", manufacturer="TMX",
    width=1920, height=1080, refresh_hz=120, primary=True, internal=True,
)

EXTERNAL = Display(
    device="DISPLAY2", name="AW3225DM", manufacturer="DEL",
    width=3840, height=2160, refresh_hz=60, primary=False, internal=False,
)


def inv(**kw) -> Inventory:
    base = dict(displays=[INTERNAL], on_ac=False, elevated=True,
                battery_charge_pct=80, ram_free_gb=8.0, processes_running=[])
    base.update(kw)
    return Inventory(**base)


class TestConfiguration(unittest.TestCase):
    def test_battery_plus_internal_panel_is_handheld(self):
        self.assertEqual(classify_configuration(inv()), "handheld")

    def test_ac_plus_external_display_is_docked(self):
        got = classify_configuration(inv(on_ac=True, displays=[INTERNAL, EXTERNAL]))
        self.assertEqual(got, "docked")

    def test_ac_with_no_external_display_is_not_docked(self):
        """Plugged in on the couch is not the docked profile.

        It raises the power ceiling without changing the display, so it matches
        neither target and must not be filed under either.
        """
        self.assertEqual(classify_configuration(inv(on_ac=True)), "handheld-charging")

    def test_battery_with_external_display_is_its_own_state(self):
        got = classify_configuration(inv(displays=[INTERNAL, EXTERNAL]))
        self.assertEqual(got, "undocked-external")

    def test_external_only_on_ac_still_reads_as_docked(self):
        """The Ally's lid can be closed with only the monitor active."""
        got = classify_configuration(inv(on_ac=True, displays=[EXTERNAL]))
        self.assertEqual(got, "docked")


class TestWarnings(unittest.TestCase):
    def _text(self, i):
        return " ".join(build_warnings(i))

    def test_unelevated_warns(self):
        self.assertIn("Administrator", self._text(inv(elevated=False)))

    def test_elevated_does_not_warn(self):
        self.assertNotIn("Administrator", self._text(inv(elevated=True)))

    def test_low_battery_on_battery_warns(self):
        self.assertIn("Battery at 25%", self._text(inv(battery_charge_pct=25)))

    def test_low_battery_on_ac_does_not_warn(self):
        """Charging at 25% is fine -- the pack is filling, not draining."""
        text = self._text(inv(battery_charge_pct=25, on_ac=True))
        self.assertNotIn("Battery at", text)

    def test_mixed_configuration_warns(self):
        self.assertIn("neither of the two target profiles",
                      self._text(inv(on_ac=True)))

    def test_clean_handheld_state_warns_about_nothing(self):
        self.assertEqual(build_warnings(inv()), [])

    def test_armoury_crate_warns(self):
        self.assertIn("Armoury Crate",
                      self._text(inv(processes_running=["ArmouryCrateSE"])))

    def test_memory_pressure_warns(self):
        self.assertIn("streaming hitches", self._text(inv(ram_free_gb=2.1)))


if __name__ == "__main__":
    unittest.main()
