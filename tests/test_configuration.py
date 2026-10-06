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
    _monitor_key,
)

INTERNAL = Display(
    device="DISPLAY1", name="TL070FVXS01-0", manufacturer="TMX",
    width=1920, height=1080, refresh_hz=120, primary=True, internal=True,
)

EXTERNAL = Display(
    device="DISPLAY2", name="AW3225DM", manufacturer="DEL",
    width=3840, height=2160, refresh_hz=60, primary=False, internal=False,
)

# Verified on this device, 2026-09-02: after Windows+P switched output to the
# internal panel, WmiMonitorID still enumerated the Alienware over its
# still-connected cable, purely by EDID -- width/height read 0 because nothing
# was actually being displayed there. "Detected" and "in use" are different
# facts, and only the second one should count as docked evidence.
EXTERNAL_CABLED_BUT_INACTIVE = Display(
    device="DISPLAY2", name="AW3225DM", manufacturer="DEL",
    width=0, height=0, refresh_hz=0, primary=False, internal=False,
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

    def test_cabled_but_inactive_external_does_not_block_handheld(self):
        """The exact bug found live: switching to the internal panel via
        Windows+P while the monitor's cable stays connected must still read
        as handheld, not 'undocked-external'. WmiMonitorID detects the
        monitor by EDID regardless of whether Windows is displaying anything
        on it -- 'detected' is not 'in use'."""
        got = classify_configuration(
            inv(displays=[INTERNAL, EXTERNAL_CABLED_BUT_INACTIVE])
        )
        self.assertEqual(got, "handheld")

    def test_cabled_but_inactive_external_does_not_block_docked(self):
        """The mirror case: a second, unused monitor cabled up while AC and
        the real external display are both active must not demote this to a
        mixed state."""
        got = classify_configuration(
            inv(on_ac=True, displays=[INTERNAL, EXTERNAL, EXTERNAL_CABLED_BUT_INACTIVE])
        )
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



class TestMonitorKey(unittest.TestCase):
    """Matching a display mode to the right panel.

    Two Windows APIs describe the same monitor differently. Both strings below
    are verbatim from this Ally X on 2026-08-30. Getting this wrong attached the
    Alienware's 1440p mode to the handheld's internal panel -- a confident wrong
    answer, and the configuration label depends on it.
    """

    WMI_ALIENWARE = r"DISPLAY\DELD1B1\5&1f28af72&0&UID261_0"
    DEV_ALIENWARE = r"MONITOR\DELD1B1\{4d36e96e-e325-11ce-bfc1-08002be10318}\0002"
    WMI_INTERNAL = r"DISPLAY\TMX0002\5&1f28af72&0&UID256_0"

    def test_both_apis_yield_the_same_key(self):
        self.assertEqual(_monitor_key(self.WMI_ALIENWARE),
                         _monitor_key(self.DEV_ALIENWARE))

    def test_key_is_the_edid_hardware_id(self):
        self.assertEqual(_monitor_key(self.WMI_ALIENWARE), "DELD1B1")
        self.assertEqual(_monitor_key(self.WMI_INTERNAL), "TMX0002")

    def test_different_panels_do_not_collide(self):
        self.assertNotEqual(_monitor_key(self.WMI_ALIENWARE),
                            _monitor_key(self.WMI_INTERNAL))

    def test_empty_input_is_safe(self):
        self.assertEqual(_monitor_key(""), "")
        self.assertEqual(_monitor_key(None or ""), "")

    def test_unrecognised_shape_does_not_raise(self):
        """Never throw on an unexpected id -- degrade to no match instead."""
        self.assertIsInstance(_monitor_key("something-unexpected"), str)

if __name__ == "__main__":
    unittest.main()
