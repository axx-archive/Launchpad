import { NextResponse } from "next/server";

let cachedScript: string | null = null;

/**
 * GET /api/analytics/script.js — serves the PitchApp analytics script.
 * Cached for 1 hour. Returns JavaScript with proper content type.
 */
export async function GET() {
  if (!cachedScript) {
    try {
      // In production, the script is bundled. Inline it here for reliability.
      cachedScript = getAnalyticsScript();
    } catch {
      return NextResponse.json({ error: "script not found" }, { status: 500 });
    }
  }

  return new NextResponse(cachedScript, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

/**
 * Inline the analytics script so it can be served without filesystem access.
 * This is the minified version of templates/analytics/pitchapp-analytics.js
 *
 * Tracks: page_view, scroll_depth, session_end, section_view (per-section dwell)
 * Section tracking uses IntersectionObserver on [data-section] and section[id] elements.
 */
function getAnalyticsScript(): string {
  return `(function(){'use strict';var s=document.querySelectorAll('script[data-project-id]');var t=s[s.length-1];if(!t)return;var p=t.getAttribute('data-project-id');if(!p)return;var e=t.src?t.src.replace(/\\/api\\/analytics\\/script\\.js.*$/,'/api/analytics'):'/api/analytics';var sid='ses_'+Math.random().toString(36).substring(2,15)+Date.now().toString(36);var st=Date.now();var mx=0;var tm=null;var snt={pv:false,se:false};var ls=null;var sen={};function dt(){var w=window.innerWidth;var c=window.matchMedia&&window.matchMedia('(pointer: coarse)').matches;if(c&&w<768)return'mobile';if(c||(w>=768&&w<1024))return'tablet';return'desktop'}function send(type,d){var payload=JSON.stringify({project_id:p,session_id:sid,event_type:type,data:d||{},device_type:dt(),referrer:document.referrer?document.referrer.substring(0,500):'',viewport_width:window.innerWidth});if(navigator.sendBeacon){navigator.sendBeacon(e,new Blob([payload],{type:'application/json'}))}else{var x=new XMLHttpRequest();x.open('POST',e,true);x.setRequestHeader('Content-Type','application/json');x.send(payload)}}function gsd(){var st2=window.pageYOffset||document.documentElement.scrollTop;var dh=Math.max(document.body.scrollHeight,document.documentElement.scrollHeight);var wh=window.innerHeight;var sc=dh-wh;if(sc<=0)return 100;return Math.min(Math.round((st2/sc)*100),100)}function onScroll(){var d=gsd();if(d>mx)mx=d;if(tm)return;tm=setTimeout(function(){tm=null;send('scroll_depth',{depth:mx,time_on_page:Math.round((Date.now()-st)/1000)})},2000)}function end(){if(snt.se)return;snt.se=true;for(var k in sen){if(sen.hasOwnProperty(k)){send('section_view',{section_id:k,dwell_ms:Date.now()-sen[k],index:-1})}}send('session_end',{duration:Math.round((Date.now()-st)/1000),max_scroll_depth:mx,last_section:ls})}function init(){if(snt.pv)return;snt.pv=true;send('page_view',{url:window.location.href.substring(0,500),title:document.title.substring(0,200)})}function initSec(){var secs=document.querySelectorAll('[data-section],section[id]');if(secs.length===0||!('IntersectionObserver' in window))return;var obs=new IntersectionObserver(function(ents){ents.forEach(function(en){var el=en.target;var si=el.getAttribute('data-section')||el.id||('s'+Array.prototype.indexOf.call(secs,el));if(en.isIntersecting){if(!sen[si])sen[si]=Date.now();ls=si}else if(sen[si]){var dw=Date.now()-sen[si];delete sen[si];send('section_view',{section_id:si,dwell_ms:dw,index:Array.prototype.indexOf.call(secs,el)})}})},{threshold:0.3});secs.forEach(function(sec){obs.observe(sec)})}window.addEventListener('scroll',onScroll,{passive:true});document.addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden')end()});window.addEventListener('beforeunload',end);if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',function(){init();initSec()})}else{init();initSec()}})();`;
}
