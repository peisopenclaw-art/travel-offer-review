// UI acceptance. Test-only fixtures never enter the deployable bundle.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const origin=process.env.QA_URL||'http://127.0.0.1:4173/';
const output=path.resolve(process.env.QA_OUTPUT||'artifacts/public-benefits');
const live=process.env.QA_REQUIRE_LIVE==='1';
const results=[];
function fixture(geography) {
  const now=new Date().toISOString();
  const month=now.slice(0,7),day=month+'-15';
  function offer(id,changes={}){
    const facts={product_type:'stay',applicable_product_types:['stay'],travel_start_date:month+'-01',travel_end_date:month+'-28',
      booking_start_at:'2020-01-01T00:00:00Z',booking_end_at:'2030-01-01T00:00:00Z',last_verified_at:now,
      availability_status:'available',offer_lifecycle_status:'active',condition_groups:[],conditions:[],minimum_spend:null,members_only:null,variant_name:'20%OFF',...changes};
    return {id,sample:false,provider:'楽天トラベル',providers:['楽天トラベル'],name:id,product:'宿泊',product_type:facts.product_type,applicable_product_types:facts.applicable_product_types,
      scope:'全国',geo_ids:[],excluded_geo_ids:[],booking_start:facts.booking_start_at,booking_end:facts.booking_end_at,
      stay_start:facts.travel_start_date,stay_end:facts.travel_end_date,eligibility_facts:facts,
      conditions:facts.conditions,match_requirements:[],benefit:{kind:'coupon_rate',display_label:'20％',rate_percent:20,max_discount_amount:5000,minimum_spend:facts.minimum_spend,currency:'JPY',calculation_base:'eligible_stay_amount',calculation_unit:'per_booking',rounding:'floor',includes_offer_ids:[]},
      stay_window:{label:'旅行対象期間'},property_scope:{mode:'unknown'},stacking:{note:'合算しません'},summary:'自動テスト専用の特典',condition_note:'自動テスト専用',source:{official_url:'https://travel.rakuten.co.jp/',checked_at:now},booking:{provider_url:'https://travel.rakuten.co.jp/',tracking_url:'https://affiliate.example.test/click?fixture=1',monetization:'affiliate'}};
  }
  return {schema_version:'public-offer-v2',rule_version:'benefit-rules-v2.1',data_origin:'postgresql-public-snapshot',as_of:now,expires_at:'2030-01-01T00:00:00Z',offer_count:5,record_count:5,regions:geography.nodes,highlights:[],coverage:[{provider:'JAL',offer_count:0,state:'公式条件の確認待ち'}],offers:[
    offer('test-minimum',{minimum_spend:25000}),
    offer('test-no-children',{condition_groups:[{id:1,match_mode:'all'}],conditions:[{condition_group_id:1,condition_type:'child_count',operator:'equals',value_json:{value:0},note:'子供同伴は対象外'}]}),
    offer('test-sold-out',{availability_status:'sold_out'}),
    offer('test-stale',{last_verified_at:'2020-01-01T00:00:00Z'}),
    offer('test-rail',{product_type:'rail_dp',applicable_product_types:['rail_dp']})]};
}
async function main(){
  await fs.mkdir(output,{recursive:true});
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'ja-JP',timezoneId:'Asia/Tokyo'});
  // Do not generate affiliate test impressions or open a reservation provider.
  await context.route(/(?:a8\.net|doubleclick|googletagmanager)/,route=>route.abort());
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  async function load(query='?view=map'){
    await page.goto(origin+query,{waitUntil:'domcontentloaded'});
    await page.locator('#decision-main[aria-busy="false"]').waitFor();
    assert.equal(await page.locator('body.decision-data-error').count(),0);
    await page.evaluate(()=>document.fonts.ready);
  }
  async function metrics(width,view){
    const info=await page.evaluate(()=>({width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,visible:[...document.querySelectorAll('.decision-stage')].filter(p=>!p.hidden).length,
      missingImages:[...document.images].filter(i=>!i.hidden&&i.getBoundingClientRect().width>100&&(!i.complete||i.naturalWidth===0)).map(i=>i.src)}));
    assert.equal(info.overflow,false,JSON.stringify(info));assert.equal(info.visible,1);
    results.push({check:'responsive',width,view,...info});
  }
  try{
    if(live){
      await load();
      const payload=await page.evaluate(async()=>await(await fetch('decision-data.json')).json());
      assert.equal(payload.data_origin,'postgresql-public-snapshot');assert.ok(payload.record_count>100);
      assert.ok(payload.offers.every(o=>!o.sample));
      results.push({check:'real-db-snapshot',count:payload.record_count,as_of:payload.as_of});
      for(const width of [1440,390,375,320]){
        await page.setViewportSize({width,height:1000});await load();
        for(const view of ['map','date','provider','campaign']){
          await page.locator('#tab-'+view).click();await metrics(width,view);
          if([1440,390,375].includes(width))await page.screenshot({path:path.join(output,'live-'+view+'-'+width+'.png'),fullPage:true});
        }
      }
      await page.setViewportSize({width:390,height:1000});await load('?view=provider&product=air_dp');
      await page.locator('[data-offer]').first().click();await page.locator('#offer-dialog[open]').waitFor();
      await page.screenshot({path:path.join(output,'live-detail-390.png'),fullPage:true});
      assert.ok((await page.locator('#dialog-content').innerText()).includes('個別の利用条件'));
    }
    const geography=JSON.parse(await fs.readFile(path.resolve(__dirname,'../search-geography.json'),'utf8'));
    const payload=fixture(geography),month=payload.as_of.slice(0,7),date=month+'-15';
    await context.route('**/decision-data.json',route=>route.fulfill({json:payload}));
    for(const width of [1440,768,390,375,320]){
      await page.setViewportSize({width,height:1000});await load('?view=provider&month='+month+'&date='+date);
      await metrics(width,'provider-fixture');
      const status=async id=>page.locator('.offer-card').filter({has:page.locator('h3',{hasText:id})}).locator('.card-condition').innerText();
      assert.equal(await status('test-minimum'),'追加条件を確認');
      assert.equal(await status('test-stale'),'追加条件を確認');
      assert.equal(await status('test-sold-out'),'この条件は対象外');
      await page.locator('#assumed-price').fill('25000');await page.locator('#assumed-price').dispatchEvent('change');
      assert.equal(await status('test-minimum'),'入力条件では候補');
      await page.locator('#child-plus').click();assert.equal(await status('test-no-children'),'この条件は対象外');
      await page.locator('#product-type').selectOption('rail_dp');
      assert.equal(await page.locator('.offer-card').count(),1);
      assert.ok((await page.locator('#trip-summary').innerText()).includes('1件'));
      assert.ok(new URL(page.url()).searchParams.get('product')==='rail_dp');
      await page.locator('[data-offer]').first().click();assert.ok(await page.locator('.structured-terms').isVisible());
      assert.ok((await page.locator('.structured-terms').innerText()).includes('全細則は確認できていません'));
      const bookingLink=page.locator('#dialog-content a',{hasText:'正式予約先を開く'});
      assert.equal(await bookingLink.getAttribute('href'),'https://affiliate.example.test/click?fixture=1');
      assert.ok((await bookingLink.getAttribute('rel')).split(/\s+/).includes('sponsored'));
      await page.locator('#dialog-close').click();
      if(!live&&[1440,390,375].includes(width))await page.screenshot({path:path.join(output,'test-only-provider-'+width+'.png'),fullPage:true});
      results.push({check:'minimum-child-product-unknown-and-dialog',width,passed:true});
    }
    await page.setViewportSize({width:390,height:1000});await load('?view=date&month='+month+'&provider=JAL');
    assert.ok((await page.locator('#month-offers').innerText()).includes('データなし'));
    await page.locator('.coverage-details summary').click();assert.ok((await page.locator('#source-coverage').innerText()).includes('公式条件の確認待ち'));
    await context.unroute('**/decision-data.json');
    const pendingPayload=JSON.parse(JSON.stringify(payload));
    pendingPayload.offers.forEach(o=>{o.eligibility_facts.availability_status='unknown';});
    await context.route('**/decision-data.json',route=>route.fulfill({json:pendingPayload}));
    await load('?view=map&month='+month);
    await page.locator('#search-conditions').click();
    assert.ok((await page.locator('#best-search-result').innerText()).includes('適用条件を確定できる特典は未確認'));
    assert.ok(await page.locator('.campaign-pick').count()>0);
    assert.ok((await page.locator('.campaign-pick').first().innerText()).includes('追加条件を確認'));
    await context.unroute('**/decision-data.json');
    await context.route('**/decision-data.json',route=>route.abort());await load().catch(()=>{});
    assert.ok(await page.locator('body.decision-data-error').count());
    assert.deepEqual(errors,[]);
    await fs.writeFile(path.join(output,'acceptance.json'),JSON.stringify({live,results,errors},null,2));
    console.log(JSON.stringify({passed:true,live,checks:results.length,errors}));
  }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
