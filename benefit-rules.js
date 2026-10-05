(function (root) {
  'use strict';
  var VERSION = 'benefit-rules-v2.1', MAX_AGE = 48 * 60 * 60 * 1000;
  function scalar(v) { return v && typeof v === 'object' && 'value' in v ? v.value : v; }
  function values(v) { return v && Array.isArray(v.values) ? v.values : Array.isArray(v) ? v : [scalar(v)]; }
  function compare(actual, operator, expected) {
    if (actual == null) return null;
    var v=scalar(expected), list=values(expected);
    switch(operator) {
      case 'exists': return true;
      case 'not_exists': return false;
      case 'equals': return actual === v;
      case 'not_equals': return actual !== v;
      case 'in': return list.indexOf(actual)>=0;
      case 'not_in': return list.indexOf(actual)<0;
      case 'min': return v == null ? null : actual>=v;
      case 'max': return v == null ? null : actual<=v;
      case 'between':
        var lo=expected && expected.min, hi=expected && expected.max;
        if (Array.isArray(expected)) { lo=expected[0];hi=expected[1]; }
        return lo == null || hi == null ? null : actual>=lo && actual<=hi;
      case 'includes': return typeof actual.includes==='function' ? actual.includes(v) : null;
      case 'excludes': return typeof actual.includes==='function' ? !actual.includes(v) : null;
      default: return null;
    }
  }
  function condition(c, q) {
    var d=q.travel_date, n=q.nights;
    var day=d ? new Date(d+'T00:00:00Z') : null;
    var checkout=day && n != null ? new Date(day.getTime()+n*86400000).toISOString().slice(0,10) : null;
    var fields={party_size:q.adults == null || q.children == null ? null : q.adults+q.children,
      adult_count:q.adults,child_count:q.children,room_count:q.room_num,stay_length:n,
      booking_amount:q.booking_amount,destination_region:q.region,travel_date:d,checkin_date:d,
      checkout_date:checkout,travel_day_of_week:day ? (day.getUTCDay()+6)%7 : null};
    if(c.condition_type==='blackout_date') {
      var blocked=compare(d,'in',c.value_json);return blocked == null ? null : !blocked;
    }
    return compare(fields[c.condition_type],c.operator,c.value_json);
  }
  function evaluate(f,q,moment) {
    q=q||{};var now=moment == null ? Date.now() : new Date(moment).getTime();
    var failures=[], unknown=[], start=f.travel_start_date,end=f.travel_end_date;
    var minimum=f.minimum_spend;
    if(minimum != null) {
      if(q.booking_amount == null) unknown.push('booking_amount_required');
      else if(q.booking_amount < minimum) failures.push('below_minimum_spend');
    }
    if(f.members_only) unknown.push('membership_required');
    var products=f.applicable_product_types && f.applicable_product_types.length ? f.applicable_product_types : [f.product_type];
    if(q.product_type && products[0]!=null) {
      if(products.indexOf(q.product_type)<0 && products.indexOf('unknown')<0) failures.push('product_type_mismatch');
      else if(products.length===1 && products[0]==='unknown') unknown.push('product_type_unknown');
    }
    if(q.travel_date || q.travel_month) {
      var lo=q.travel_date || q.travel_month+'-01';
      var hi=q.travel_date;
      if(!hi) { var parts=q.travel_month.split('-').map(Number);hi=new Date(Date.UTC(parts[0],parts[1],0)).toISOString().slice(0,10); }
      if(start && start>hi) failures.push(q.travel_date ? 'before_travel_start':'travel_month_before_start');
      if(end && end<lo) failures.push(q.travel_date ? 'after_travel_end':'travel_month_after_end');
      if(!start && !end) unknown.push('travel_range_unknown');
      else if(!start) unknown.push('travel_start_unknown');
      else if(!end) unknown.push('travel_end_unknown');
    }
    var groups=f.condition_groups||[], conditions=f.conditions||[];
    conditions.forEach(function(c){if(!groups.some(function(g){return g.id===c.condition_group_id;}))unknown.push('condition_group_missing:'+c.condition_group_id);});
    groups.forEach(function(g){
      if(['all','any'].indexOf(g.match_mode||'all')<0){unknown.push('condition_group_mode_unknown:'+g.id);return;}
      var results=conditions.filter(function(c){return c.condition_group_id===g.id;}).map(function(c){return condition(c,q);});
      if(!results.length){unknown.push('condition_group_empty:'+g.id);return;}
      if(g.match_mode==='any') {
        if(results.some(function(r){return r===true;}))return;
        if(results.every(function(r){return r===false;}))failures.push('condition_group:'+g.id);
        else unknown.push('condition_group_unknown:'+g.id);
      } else {
        if(results.some(function(r){return r===false;}))failures.push('condition_group:'+g.id);
        else if(results.some(function(r){return r==null;}))unknown.push('condition_group_unknown:'+g.id);
      }
    });
    if(['ended','cancelled'].indexOf(f.offer_lifecycle_status)>=0)failures.push('offer_not_active');
    if(['sold_out','reopen_wait','paused'].indexOf(f.availability_status)>=0)failures.push('offer_not_available');
    else if(f.availability_status!=='available')unknown.push('availability_confirmation_required');
    ['booking','distribution'].forEach(function(prefix){
      var a=f[prefix+'_start_at'],b=f[prefix+'_end_at'];
      if(a && now<Date.parse(a))failures.push(prefix+'_not_started');
      if(b && now>Date.parse(b))failures.push(prefix+'_ended');
    });
    if(f.offer_lifecycle_status==='upcoming')failures.push('offer_not_started');
    if(!f.booking_start_at&&!f.booking_end_at&&!f.distribution_start_at&&!f.distribution_end_at)unknown.push('booking_window_unknown');
    var checked=Date.parse(f.last_verified_at),age=now-checked;
    if(!Number.isFinite(age)||age<0||age>MAX_AGE)unknown.push('fresh_confirmation_required');
    if(String(f.variant_name||'').indexOf('最大')>=0)unknown.push('maximum_benefit_requires_specific_coupon');
    var reasons=Array.from(new Set(failures.concat(unknown)));
    return {status:failures.length?'ineligible':unknown.length?'unknown':'eligible',reasons:reasons};
  }
  var api={version:VERSION,evaluate:evaluate};
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.TravelBenefits=api;
}(typeof globalThis!=='undefined'?globalThis:this));
