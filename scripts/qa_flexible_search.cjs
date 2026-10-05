// Isolated local-site acceptance checks. Never click affiliate or booking links.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const origin = process.env.QA_URL || 'http://127.0.0.1:8776/';
const output = path.resolve(process.env.QA_OUTPUT || 'artifacts/flexible-search');
const views = ['map', 'date', 'provider', 'campaign'];
const orders = [['map','date','provider'],['map','provider','date'],['date','map','provider'],['date','provider','map'],['provider','map','date'],['provider','date','map']];
const results = [];
async function main() {
  await fs.mkdir(output, {recursive:true});
  const browser = await chromium.launch({headless:true,...(process.env.QA_BROWSER_CHANNEL ? {channel:process.env.QA_BROWSER_CHANNEL} : {})});
  try {
    const context = await browser.newContext({viewport:{width:1440,height:900},locale:'ja-JP',timezoneId:'Asia/Tokyo'});
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    async function load(query='?month=2026-10&view=map') {
      await page.goto(origin+query,{waitUntil:'domcontentloaded'});
      await page.locator('#decision-main[aria-busy="false"]').waitFor();
      assert.equal(await page.locator('.load-error').count(),0);
    }
    async function tab(view) { await page.locator('#tab-'+view).click(); }
    async function metrics(width, view) {
      const value = await page.evaluate(() => {
        const visible = [...document.querySelectorAll('.decision-stage')].filter(p=>!p.hidden);
        const clipped = [...document.querySelectorAll('.step-tab')].filter(t=>t.scrollWidth>t.clientWidth+1).map(t=>t.id);
        const buttons = [...document.querySelectorAll('.region-button')].map(e=>({name:e.textContent,rect:e.getBoundingClientRect().toJSON()}));
        const overlaps=[];
        if(!document.querySelector('#panel-map').hidden) for(let i=0;i<buttons.length;i++) for(let j=i+1;j<buttons.length;j++) {
          const a=buttons[i].rect,b=buttons[j].rect;
          if(a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y) overlaps.push([buttons[i].name,buttons[j].name]);
        }
        return {width:window.innerWidth,overflow:document.documentElement.scrollWidth>window.innerWidth,visible:visible.length,clipped,overlaps};
      });
      assert.equal(value.overflow,false,JSON.stringify(value)); assert.equal(value.visible,1); assert.deepEqual(value.clipped,[]); assert.deepEqual(value.overlaps,[]);
      results.push({check:'responsive',width,view,...value});
    }
    for(const width of [1440,768,390,375,320]) {
      await page.setViewportSize({width,height:900}); await load();
      await page.evaluate(()=>document.fonts.ready);
      for(const view of views) {
        await tab(view); await metrics(width,view);
        if(width===1440||width===390) {
          await page.locator('#slide-pause').click(); // capture deterministic first slide; pause state irrelevant to layout
          await page.locator('[data-slide-to="0"]').click();
          await page.screenshot({path:path.join(output,view+'-'+width+'.png'),fullPage:true});
        }
      }
    }
    // Month-first discovery, period boundaries, and corresponding campaign popups.
    for(const width of [1440,768,390,375,320]) {
      await page.setViewportSize({width,height:900}); await load('?month=2026-12&view=date');
      assert.equal(await page.locator('#calendar-workspace').isVisible(),false);
      assert.equal(await page.locator('.month-offer-row').count(),6);
      assert.ok((await page.locator('[data-month="2026-12"]').innerText()).includes('最大60％'));
      await page.locator('[data-month="2026-12"]').click(); await metrics(width,'date-calendar');
      const controls=await page.evaluate(()=>{const a=document.querySelector('#month-prev').getBoundingClientRect(),b=document.querySelector('#calendar-month-label').getBoundingClientRect(),c=document.querySelector('#month-next').getBoundingClientRect();return {ordered:a.x<b.x&&b.x<c.x,centerGap:Math.abs(a.y+a.height/2-c.y-c.height/2),clipped:[...document.querySelectorAll('.day-cap')].some(e=>e.scrollWidth>e.clientWidth+1)}});
      assert.ok(controls.ordered && controls.centerGap<2 && !controls.clipped,JSON.stringify(controls));
      assert.ok((await page.locator('[data-date="2026-12-25"]').getAttribute('class')).includes('heat-high'));
      assert.ok((await page.locator('[data-date="2026-12-26"]').getAttribute('class')).includes('heat-medium'));
      assert.ok((await page.locator('[data-date="2026-12-26"]').innerText()).includes('20％例'));
      const hints = await page.locator('#booking-hints .hint-rate').allTextContents(); assert.deepEqual(hints,['最大60％','40％（例）','30％以上']);
      assert.ok((await page.locator('#booking-hints .booking-hint').first().innerText()).includes('20,000円／人'));
      assert.ok((await page.locator('#booking-hints .booking-hint').first().innerText()).includes('熊本県'));
      if(width===1440 || width===390) await page.screenshot({path:path.join(output,'calendar-'+width+'.png'),fullPage:true});
      await page.locator('#months-back').click(); assert.equal(await page.locator('#month-offers').isVisible(),true);
      results.push({check:'monthly-calendar-boundary-and-ranked-hints',width,passed:true});
    }
    await page.setViewportSize({width:1440,height:900});
    await load('?view=map'); assert.equal(await page.locator('#travel-month').count(),0);
    assert.equal(await page.locator('#destination option:checked').innerText(),'一番お得な場所');
    assert.equal(await page.locator('#travel-date').inputValue(),'');
    await page.locator('#search-conditions').click(); await page.locator('#offer-dialog[open]').waitFor();
    assert.equal(await page.locator('#tab-campaign').getAttribute('aria-selected'),'true');
    assert.equal(await page.locator('#dialog-title').innerText(),'九州ふっこう応援割');
    assert.ok(await page.locator('#kyushu-recovery.is-recommended').count());
    await page.screenshot({path:path.join(output,'best-campaign-1440.png'),fullPage:true});
    await page.locator('#dialog-close').click();
    results.push({check:'best-place-and-day-corresponding-popup',passed:true});
    await load('?view=map&destination=kyushu'); await page.locator('#search-conditions').click();
    assert.equal(await page.locator('#dialog-title').innerText(),'九州ふっこう応援割');
    assert.ok((await page.locator('#dialog-content').innerText()).includes('おすすめ宿泊日'));
    await page.locator('#dialog-close').click(); results.push({check:'specific-place-best-day',passed:true});
    await load('?view=map&date=2026-12-30'); await page.locator('#search-conditions').click();
    assert.equal(await page.locator('#dialog-title').innerText(),'海辺のリゾート特集');
    assert.equal(await page.locator('.campaign-pop-benefit').innerText(),'20％（例）');
    assert.equal(await page.locator('#travel-date').inputValue(),'2026-12-30');
    await page.locator('#dialog-close').click(); results.push({check:'specific-day-best-place-outside-kyushu-window',passed:true});
    await load('?view=map&date=2026-12-11&destination=kyushu'); await page.locator('#search-conditions').click();
    assert.equal(await page.locator('#tab-provider').getAttribute('aria-selected'),'true');
    assert.equal(await page.locator('#offer-dialog[open]').count(),0); results.push({check:'fixed-plans-search',passed:true});
    await load('?view=date&provider=Yahoo!トラベル');
    assert.ok((await page.locator('#month-offers').innerText()).includes('対象期間のデータなし'));
    await page.locator('#search-conditions').click();
    assert.equal(await page.locator('#offer-dialog[open]').count(),0);
    assert.ok((await page.locator('#best-search-result').innerText()).includes('宿泊対象期間が分かるキャンペーンがありません'));
    results.push({check:'unknown-stay-window-no-false-best-match',passed:true});
    await load('?view=date&provider=JTB&destination=chubu'); await page.locator('[data-month="2026-12"]').click();
    assert.equal(await page.locator('[data-date="2026-12-12"] .day-offers').innerText(),'3千円例');
    await page.locator('#search-conditions').click();
    assert.equal(await page.locator('#dialog-title').innerText(),'家族旅行の宿泊クーポン');
    assert.equal(await page.locator('#sample-family.is-recommended').count(),1);
    await page.locator('#dialog-close').click(); results.push({check:'fixed-coupon-calendar-and-featured-popup',passed:true});
    // Compact review requests: regional handoff, new-year months, and shared panel heights.
    await load('?view=map&destination=kyushu&children=1');
    assert.equal(await page.locator('.design-note').count(),0);
    assert.equal(await page.locator('#map-title,#calendar-title,.calendar-data-note').count(),0);
    assert.ok((await page.locator('#map-booking-hints').innerText()).includes('最大60％'));
    assert.ok((await page.locator('#map-booking-hints').innerText()).includes('熊本県'));
    await page.locator('#to-calendar').click();
    assert.equal(await page.locator('#tab-date').getAttribute('aria-selected'),'true');
    assert.equal(await page.locator('#calendar-workspace').isVisible(),true);
    assert.equal(await page.locator('#destination').inputValue(),'kyushu');
    assert.equal(await page.locator('#calendar-region-label').innerText(),'九州・沖縄');
    await page.reload(); await page.locator('#decision-main[aria-busy="false"]').waitFor();
    assert.equal(await page.locator('#calendar-workspace').isVisible(),true);
    const geometry=await page.evaluate(()=>({calendar:document.querySelector('.calendar-panel').getBoundingClientRect().height,hints:document.querySelector('.timing-panel').getBoundingClientRect().height,form:document.querySelector('#trip-form').getBoundingClientRect().height,adults:document.querySelector('#adult-count').getBoundingClientRect().y,children:document.querySelector('#child-count').getBoundingClientRect().y}));
    assert.ok(Math.abs(geometry.calendar-geometry.hints)<=2,JSON.stringify(geometry));
    assert.ok(geometry.form<=66,JSON.stringify(geometry)); assert.ok(Math.abs(geometry.adults-geometry.children)<2,JSON.stringify(geometry));
    assert.ok((await page.locator('[data-date="2026-10-08"] .day-cap').innerText()).includes('2万円'));
    assert.ok((await page.locator('[data-date="2026-10-08"] .day-count').innerText()).includes('件'));
    await page.locator('#booking-hints [data-campaign="kyushu-recovery"]').click();
    assert.equal(await page.locator('#dialog-content a').count(),1);
    assert.equal(await page.locator('#dialog-content a').getAttribute('href'),'https://fightkyushu.welcomekyushu.jp/');
    assert.ok((await page.locator('#dialog-content a').innerText()).includes('キャンペーンの詳細を見る'));
    await page.locator('#dialog-close').click();
    await page.locator('#calendar-region-label').click(); assert.equal(await page.locator('#tab-map').getAttribute('aria-selected'),'true');
    assert.equal(await page.locator('#destination').inputValue(),'kyushu');
    results.push({check:'compact-form-region-calendar-handoff-and-single-official-link',passed:true});
    await load('?view=date&month=2027-02');
    assert.ok((await page.locator('[data-month="2027-02"]').innerText()).includes('2027'));
    await page.locator('[data-month="2027-02"]').click();
    assert.equal(await page.locator('.calendar-day').count(),28);
    await page.locator('[data-date="2027-02-28"]').click(); assert.equal(await page.locator('#travel-date').inputValue(),'2027-02-28');
    await page.locator('#month-next').click(); assert.equal(await page.locator('#calendar-month-label').innerText(),'2027年3月');
    assert.equal(await page.locator('#month-next').isDisabled(),true);
    await page.reload(); await page.locator('#decision-main[aria-busy="false"]').waitFor();assert.equal(await page.locator('#calendar-month-label').innerText(),'2027年3月');
    await load('?view=date&date=2027-02-29');assert.equal(await page.locator('#travel-date').inputValue(),'');
    results.push({check:'six-month-year-boundary-and-valid-dates',passed:true});
    for(const order of orders) {
      await load('?month=2026-12&view=map');
      for(const view of order) {
        await tab(view);
        if(view==='map') await page.locator('.region-button[data-region="kyushu"]').click();
        if(view==='date') { await page.locator('[data-month="2026-12"]').click(); await page.locator('[data-date="2026-12-12"]').click(); }
        if(view==='provider') await page.locator('#provider-filters button[data-provider="楽天トラベル"]').click();
      }
      assert.equal(await page.locator('#destination').inputValue(),'kyushu');
      assert.equal(await page.locator('#travel-date').inputValue(),'2026-12-12');
      assert.equal(await page.locator('#provider-filters button[aria-pressed="true"]').getAttribute('data-provider'),'楽天トラベル');
      assert.equal(await page.locator('.step-tab[aria-selected="true"]').getAttribute('id'),'tab-'+order[2]);
      assert.equal(await page.locator('.offer-card').count(),1);
      results.push({check:'order',order,passed:true});
    }
    for(let i=0;i<6;i++) await page.locator('#child-plus').click();
    assert.equal(await page.locator('#child-plus').isDisabled(),true);
    assert.equal(await page.locator('#child-count').innerText(),'子供6人');
    await page.reload(); await page.locator('#decision-main[aria-busy="false"]').waitFor();
    assert.equal(await page.locator('#child-count').innerText(),'子供6人');
    for(let i=0;i<6;i++) await page.locator('#child-minus').click();
    assert.equal(await page.locator('#child-minus').isDisabled(),true);
    await page.locator('#adult-minus').click(); assert.equal(await page.locator('#adult-minus').isDisabled(),true);
    for(let i=0;i<8;i++) await page.locator('#adult-plus').click();
    assert.equal(await page.locator('#adult-plus').isDisabled(),true);
    results.push({check:'party-bounds-and-reload',passed:true});
    await load('?month=2026-12&destination=chubu&provider=じゃらん&view=provider');
    assert.equal(await page.locator('#panel-provider .empty-state').count(),1);
    await page.locator('#panel-provider .empty-state [data-clear-all]').click(); assert.ok(await page.locator('.offer-card').count()>0);
    await page.locator('#tab-map').focus(); await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('.step-tab[aria-selected="true"]').getAttribute('id'),'tab-date');
    results.push({check:'empty-recovery-and-keyboard-tabs',passed:true});
    await load('?view=provider&date=2026-12-99'); assert.equal(await page.locator('#travel-date').inputValue(),'');
    assert.equal(await page.locator('#destination').inputValue(),''); assert.equal(await page.locator('#adult-count').innerText(),'大人2人');
    results.push({check:'shared-url-isolation-and-invalid-date',passed:true});
    await load('?view=provider&provider=Yahoo!トラベル');
    await page.locator('.assumed-price-panel summary').click(); await page.locator('#assumed-price').fill('50000');
    assert.equal(await page.locator('.card-estimate').count(),3);
    for(const text of await page.locator('.card-estimate').allTextContents()) assert.ok(text.includes('未算出（ポイント型）'));
    await page.locator('.offer-card').first().getByRole('button').click();
    assert.equal(await page.locator('.dialog-links a').nth(1).getAttribute('href'),'https://travel.yahoo.co.jp/');
    await page.locator('#dialog-close').click();
    results.push({check:'confirmed-points-and-detail-contract',passed:true});
    await load('?view=campaign&children=2&date=2026-12-12');
    await page.locator('#sample-seaside a').click(); await page.locator('#campaign-detail[aria-busy="false"]').waitFor();
    assert.ok(page.url().includes('sample-campaign.html')); assert.ok(await page.locator('.sample-detail-note').isVisible());
    assert.equal(await page.locator('.sample-detail-benefit a').count(),1);
    await page.screenshot({path:path.join(output,'sample-detail-320.png'),fullPage:true});
    await page.locator('#back-to-search').click(); await page.locator('#decision-main[aria-busy="false"]').waitFor();
    assert.equal(await page.locator('#child-count').innerText(),'子供2人'); assert.equal(await page.locator('#travel-date').inputValue(),'2026-12-12');
    results.push({check:'campaign-page-and-return',passed:true});
    await page.setViewportSize({width:1440,height:900}); await load();
    await page.mouse.move(1,1);
    await page.waitForFunction(()=>document.querySelector('.campaign-slide:not([hidden])').dataset.slide==='1',{},{timeout:8500});
    await page.locator('#slide-pause').click(); await page.locator('#destination').focus(); await page.mouse.move(1,1);
    const paused = await page.locator('.campaign-slide:not([hidden])').getAttribute('data-slide');
    await page.waitForTimeout(6200); assert.equal(await page.locator('.campaign-slide:not([hidden])').getAttribute('data-slide'),paused);
    await page.locator('#slide-next').click(); assert.notEqual(await page.locator('.campaign-slide:not([hidden])').getAttribute('data-slide'),paused);
    results.push({check:'carousel-auto-pause-manual',passed:true});
    await page.emulateMedia({reducedMotion:'reduce'}); await load();
    await page.waitForTimeout(6200); assert.equal(await page.locator('.campaign-slide:not([hidden])').getAttribute('data-slide'),'0');
    results.push({check:'reduced-motion',passed:true});
    await page.route('**/design-samples.json',route=>route.fulfill({status:503,body:'Unavailable'}));
    await page.goto(origin+'?children=2&date=2026-12-12'); await page.locator('.load-error').waitFor();
    assert.equal(await page.locator('#child-count').innerText(),'子供2人'); assert.equal(await page.locator('#travel-date').inputValue(),'2026-12-12');
    await page.unroute('**/design-samples.json'); await page.getByRole('button',{name:'再読み込み',exact:true}).click();
    await page.locator('#decision-main[aria-busy="false"]').waitFor(); assert.equal(await page.locator('.load-error').count(),0);
    results.push({check:'load-error-preservation-and-retry',passed:true});
    assert.deepEqual(errors,[]);
    await fs.writeFile(path.join(output,'qa.json'),JSON.stringify(results,null,2)+'\n');
    console.log('Flexible search acceptance: PASS ('+results.length+' checks)');
    await context.close();
  } finally { await browser.close(); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
