"""Include synthetic investor-round graph/SQLite checks in normal discovery."""
from pathlib import Path
import importlib.util

_path = Path(__file__).resolve().parents[1] / "contracts/investor_rounds/test_legacy_parity.py"
_spec = importlib.util.spec_from_file_location("investor_round_contract_parity", _path)
_module = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_module)
LegacyFundingParityTests = _module.LegacyFundingParityTests
