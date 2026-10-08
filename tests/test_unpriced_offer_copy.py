from pathlib import Path
import unittest


class UnpricedOfferCopyTests(unittest.TestCase):
    def test_unresolved_coupon_amount_explains_booking_confirmation(self):
        script=(Path(__file__).resolve().parents[1]/'decision-ui.js').read_text(encoding='utf-8')
        self.assertEqual(script.count("label:'実際の割引額は予約先で確認'"),2)
        self.assertIn("estimate.label === '実際の割引額は予約先で確認' ? '' : '推定割引：'",script)
        self.assertIn("['postgresql','postgresql-public-snapshot'].includes(data.data_origin)",script)
        self.assertIn("slide.setAttribute('href','#search-tabs')",script)
        self.assertIn("slide.setAttribute('aria-label','地図から実際の旅行特典を探す')",script)
        self.assertIn("cta.textContent='地図で探す →'",script)
        self.assertIn("benefitVerdict(offer,state.travelDate,state.month).status!=='eligible'",script)
        self.assertIn("!Number.isFinite(state.assumedPrice)",script)
        self.assertIn("return estimateDiscountForBenefit(b,state.assumedPrice)",script)
        self.assertIn("if(b.kind==='coupon_rate' && (b.rounding!=='floor'||b.max_discount_amount==null))",script)


if __name__=='__main__':
    unittest.main()
