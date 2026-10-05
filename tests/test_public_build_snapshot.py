import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from public_build_snapshot import snapshot_body, PUBLIC_FEED, MAX_BYTES

class ProductionBuildTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / 'decision-data.json').write_bytes(b'{"offers":[]}')
        self.env = {'WORKERS_CI': '1', 'WORKERS_CI_BRANCH': 'main'}
        self.addCleanup(self.temp.cleanup)

    def test_production_uses_public_bytes_and_requires_live_validation(self):
        body = b'{"offers":[{"id":"formal"}]}'
        def opener(request, timeout):
            self.assertEqual(request.full_url, PUBLIC_FEED)
            self.assertEqual(timeout, 30)
            return io.BytesIO(body)
        with patch('public_build_snapshot.validate') as validator:
            self.assertEqual(snapshot_body(self.root, environ=self.env, opener=opener), body)
            validator.assert_called_once_with(json.loads(body), require_live=True)

    def test_production_failure_does_not_fall_back_to_empty_seed(self):
        def fail(*a, **k):
            raise OSError('unreachable')
        with self.assertRaises(OSError):
            snapshot_body(self.root, environ=self.env, opener=fail)

    def test_production_rejects_empty_or_invalid_feed(self):
        with self.assertRaises((AssertionError, KeyError)):
            snapshot_body(self.root, environ=self.env, opener=lambda *a, **k: io.BytesIO(b'{"offers":[]}'))

    def test_explicit_snapshot_is_validated_and_read_once(self):
        path = self.root / 'input.json'
        body = b'{"offers":[{"id":"formal"}]}'
        path.write_bytes(body)
        with patch('public_build_snapshot.validate') as validator:
            self.assertEqual(snapshot_body(self.root, path, {}), body)
            validator.assert_called_once_with(json.loads(body), require_live=True)

    def test_preview_keeps_seed_without_network(self):
        with patch('public_build_snapshot.validate') as validator:
            self.assertEqual(snapshot_body(self.root, environ={'WORKERS_CI':'1','WORKERS_CI_BRANCH':'review'}), b'{"offers":[]}')
            validator.assert_called_once_with({'offers':[]}, require_live=False)

    def test_oversized_feed_is_rejected(self):
        with self.assertRaises(ValueError):
            snapshot_body(self.root, environ=self.env, opener=lambda *a, **k: io.BytesIO(b' ' * (MAX_BYTES + 1)))

if __name__ == '__main__':
    unittest.main()
