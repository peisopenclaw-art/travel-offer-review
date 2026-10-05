import io
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from publish_public_benefits import verify_public

class PublicReadbackTests(unittest.TestCase):
    def test_matching_bytes_finish_without_retry(self):
        with patch('publish_public_benefits.urlopen',return_value=io.BytesIO(b'expected')),patch('publish_public_benefits.time.sleep') as sleep:
            verify_public(b'expected');sleep.assert_not_called()

    def test_initial_404_is_retried_until_new_assets_propagate(self):
        error=HTTPError('https://travel.tokuerabi.com/decision-data.json',404,'Not Found',{},None)
        with patch('publish_public_benefits.urlopen',side_effect=[error,io.BytesIO(b'expected')]) as fetch,patch('publish_public_benefits.time.sleep') as sleep:
            verify_public(b'expected');self.assertEqual(fetch.call_count,2);sleep.assert_called_once_with(2)

    def test_old_snapshot_is_retried_and_never_accepted(self):
        with patch('publish_public_benefits.urlopen',side_effect=[io.BytesIO(b'old'),io.BytesIO(b'expected')]) as fetch,patch('publish_public_benefits.time.sleep'):
            verify_public(b'expected');self.assertEqual(fetch.call_count,2)

    def test_authorization_or_security_rejection_is_not_retried(self):
        error=HTTPError('https://travel.tokuerabi.com/decision-data.json',403,'Forbidden',{},None)
        with patch('publish_public_benefits.urlopen',side_effect=error),patch('publish_public_benefits.time.sleep') as sleep:
            with self.assertRaises(HTTPError):verify_public(b'expected')
            sleep.assert_not_called()

    def test_mismatched_bytes_stop_at_deadline(self):
        with patch('publish_public_benefits.urlopen',return_value=io.BytesIO(b'old')),patch('publish_public_benefits.time.monotonic',side_effect=[0,61]),patch('publish_public_benefits.time.sleep') as sleep:
            with self.assertRaises(RuntimeError):verify_public(b'expected')
            sleep.assert_not_called()

if __name__=='__main__':unittest.main()
