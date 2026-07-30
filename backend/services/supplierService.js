'use strict';
const dns = require('dns').promises;
const crypto = require('crypto');
const Supplier = require('../models/Supplier');
const SupplierProduct = require('../models/SupplierProduct');
const SupplierSyncLog = require('../models/SupplierSyncLog');
const Product = require('../models/Product');

const PRIVATE = /^(localhost|.*\.local$|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fc|fd|fe80)/i;
function safeUrl(input, base) {
  const u = new URL(input, base);
  if (!['http:','https:'].includes(u.protocol)) throw new Error('Only HTTP and HTTPS supplier URLs are allowed.');
  if (PRIVATE.test(u.hostname) || u.hostname === 'metadata.google.internal') throw new Error('Private or internal supplier addresses are not allowed.');
  u.username = ''; u.password = ''; u.hash = '';
  return u;
}
async function safeFetch(url, { timeout = 15000, domain, accept = 'text/html' } = {}) {
  const u = safeUrl(url); if (domain && u.hostname !== domain) throw new Error('External redirect blocked.');
  const addresses = await dns.lookup(u.hostname, { all: true });
  if (addresses.some(a => PRIVATE.test(a.address))) throw new Error('Supplier resolves to a private address.');
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), timeout);
  try {
    const res = await fetch(u, { signal: ctl.signal, redirect: 'manual', headers: { 'user-agent': 'ShopZen Supplier Sync/1.0', accept } });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      const next = safeUrl(res.headers.get('location'), u); if (next.hostname !== domain) throw new Error('External redirect blocked.');
      return safeFetch(next.href, { timeout, domain, accept });
    }
    return res;
  } finally { clearTimeout(timer); }
}
const clean = v => String(v || '').replace(/\s+/g, ' ').trim();
const norm = v => clean(v).toLowerCase().replace(/[^a-z0-9]+/g, '');
function text(html) { return html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&'); }
function jsonLd(html) {
  const out=[]; const re=/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi; let m;
  while ((m=re.exec(html))) { try { const v=JSON.parse(m[1].trim()); (Array.isArray(v)?v:[v,'@graph' in v?v['@graph']:null]).flat().filter(Boolean).forEach(x => { if (String(x['@type']||'').toLowerCase().includes('product')) out.push(x); }); } catch {} }
  return out[0] || null;
}
function extract(html, url) {
  const ld=jsonLd(html)||{}; const raw=text(html); const meta=(name) => (html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']+)`, 'i'))||[])[1] || '';
  const name=clean(ld.name || meta('og:title') || (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)||[])[1]);
  const offer=Array.isArray(ld.offers)?ld.offers[0]:(ld.offers||{}); const av=String(offer.availability||'').toLowerCase();
  let availability=av.includes('outofstock')?'out_of_stock':av.includes('instock')?'in_stock':'unknown'; let qty=null;
  const q=raw.match(/(?:only|stock\s*:?)\s*(\d+)\s*(?:left|available|in stock|units)?/i); if(q) qty=Number(q[1]);
  if (availability==='unknown') { if (/sold\s*out|out\s*of\s*stock|unavailable/i.test(raw)) availability='out_of_stock'; else if (/in\s*stock|available|add to cart/i.test(raw)) availability='in_stock'; }
  const sku=clean(ld.sku||''); const mpn=clean(ld.mpn||''); const brand=clean(ld.brand?.name||ld.brand||'');
  const productCode=(name.match(/\b([A-Z]{2,}\d{2,})\b/)||[])[1]||mpn;
  return { productUrl:url, normalizedUrl:url, productName:name, normalizedName:norm(name), brand, sku, mpn:mpn||productCode, modelNumber:productCode, gtin:clean(ld.gtin||ld.gtin13||ld.gtin12||''), price:Number(offer.price)||undefined, currency:offer.priceCurrency, availability, exactStockQuantity:qty, imageUrl:clean(typeof ld.image==='string'?ld.image:ld.image?.url||meta('og:image')), detectionMethod:ld.name?'json-ld':'html', extractionStatus:name?'success':'failed', identityFingerprint:crypto.createHash('sha1').update(`${norm(name)}|${norm(brand)}|${norm(sku)}|${norm(mpn)}`).digest('hex') };
}
async function createSupplier(data) { const u=safeUrl(data.websiteUrl); return Supplier.create({ ...data, websiteUrl:u.href, normalizedDomain:u.hostname, syncIntervalMinutes:Math.max(5, Number(data.syncIntervalMinutes||15)) }); }
async function testConnection(supplier) {
  const u=safeUrl(supplier.websiteUrl); const res=await safeFetch(u.href,{timeout:supplier.requestTimeoutMs,domain:u.hostname}); const html=(res.headers.get('content-type')||'').includes('html')?await res.text():''; const sample=extract(html,u.href); const platform=/woocommerce/i.test(html)?'WooCommerce':/shopify/i.test(html)?'Shopify':/magento/i.test(html)?'Magento':'Unknown'; const status=res.ok&&sample.productName?'Connected':res.ok?'Limited':'Failed';
  const result={status,platform,message:`Website reachable; HTTP ${res.status}; sample product ${sample.productName?'detected':'not detected'}; stock method ${sample.exactStockQuantity!==null?'exact quantity':sample.availability!=='unknown'?'availability only':'unknown'}.`};
  await Supplier.findByIdAndUpdate(supplier._id,{connectionStatus:status,platform,connectionMessage:result.message,lastConnectionTestAt:new Date()}); return result;
}
async function discover(supplier) {
  const base=safeUrl(supplier.websiteUrl); const urls=new Set([base.href]);
  for (const path of ['/robots.txt','/sitemap.xml','/sitemap_index.xml','/product-sitemap.xml']) { try { const r=await safeFetch(new URL(path,base).href,{timeout:supplier.requestTimeoutMs,domain:base.hostname,accept:'*/*'}); if(r.ok){ const body=await r.text(); [...body.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)].forEach(m=>{try{const x=safeUrl(m[1],base);if(x.hostname===base.hostname)urls.add(x.href)}catch{}}); } } catch {} }
  const excluded=/\/(cart|checkout|my-account|account|login|logout|register|wishlist|blog|news|tag|search|privacy|terms|contact|wp-admin|wp-json)(\/|$)/i;
  const candidates=[...urls].filter(u=>{try{const x=new URL(u);return x.hostname===base.hostname&&!excluded.test(x.pathname)&&!/\.(?:jpg|jpeg|png|gif|webp|css|js|pdf|xml)$/i.test(x.pathname)}catch{return false}}).slice(0,100); let count=0;
  for(const url of candidates){ try {const r=await safeFetch(url,{timeout:supplier.requestTimeoutMs,domain:base.hostname}); if(!r.ok)continue; const p=extract(await r.text(),url); if(!p.productName)continue; await SupplierProduct.findOneAndUpdate({supplier:supplier._id,normalizedUrl:url},{$set:{...p,lastCheckedAt:new Date(),lastSuccessfulCheckAt:new Date(),isActive:true,lastError:''}},{upsert:true,new:true,setDefaultsOnInsert:true});count++;}catch(e){ /* individual pages do not abort discovery */ } }
  await Supplier.findByIdAndUpdate(supplier._id,{discoveredProductCount:await SupplierProduct.countDocuments({supplier:supplier._id,isActive:true}),lastDiscoveryAt:new Date()}); return {discovered:count};
}
function similarity(a,b){const A=new Set(norm(a).match(/.{1,3}/g)||[]),B=new Set(norm(b).match(/.{1,3}/g)||[]);const inter=[...A].filter(x=>B.has(x)).length;return Math.round(100*(2*inter)/(A.size+B.size||1));}
function matchScore(p,s){ if(p.gtin&&s.gtin&&norm(p.gtin)===norm(s.gtin))return [100,'gtin']; if(p.sku&&s.sku&&norm(p.sku)===norm(s.sku))return [100,'sku']; if(p.mpn&&s.mpn&&norm(p.mpn)===norm(s.mpn)&&norm(p.brand)===norm(s.brand))return [98,'mpn+brand']; if(p.brand&&s.brand&&norm(p.brand)===norm(s.brand)){const score=similarity(p.name,s.productName);if(score>=70)return [Math.min(94,85+Math.round(score/10)),'brand+name'];} return [similarity(p.name,s.productName),'name']; }
async function generateMatches(supplier){const [products,suppliers]=await Promise.all([Product.find({isActive:true}).lean(),SupplierProduct.find({supplier: supplier._id,isActive:true}).lean()]);const results=[];for(const p of products){let best=null;for(const s of suppliers){const [score,method]=matchScore(p,s);if(!best||score>best.score)best={p,s,score,method};}if(best&&best.score>=80)results.push({product:best.p,supplierProduct:best.s,confidence:best.score,method:best.method});}return results;}
function calculateStock(supplier,sp){if(sp.availability==='out_of_stock')return 0;if(sp.availability!=='in_stock')return null;let n=sp.exactStockQuantity===null?supplier.defaultInStockQuantity:sp.exactStockQuantity;n=Math.max(0,n-supplier.safetyStock);return supplier.maximumSellableStock===null?n:Math.min(n,supplier.maximumSellableStock);}
async function syncMapping(product,supplierProduct,supplier,source='manual'){const start=Date.now();const old=product.stock;try{const r=await safeFetch(supplierProduct.productUrl,{timeout:supplier.requestTimeoutMs,domain:supplier.normalizedDomain});if(r.status===404)throw Object.assign(new Error('Supplier product no longer exists'),{category:'not_found'});if(!r.ok)throw Object.assign(new Error(`Supplier returned HTTP ${r.status}`),{category:'network'});const fresh=extract(await r.text(),supplierProduct.productUrl);if(!fresh.productName||fresh.identityFingerprint!==supplierProduct.identityFingerprint)throw Object.assign(new Error('Supplier product identity changed or could not be verified'),{category:'identity_mismatch'});const next=calculateStock(supplier,fresh);if(next===null)throw Object.assign(new Error('Supplier availability is unknown; previous stock preserved'),{category:'unknown'});product.stock=next;product.supplierInventory={...product.supplierInventory.toObject?.()||product.supplierInventory,supplierAvailability:fresh.availability,supplierStock:fresh.exactStockQuantity,calculatedStoreStock:next,syncStatus:next===0?'out_of_stock':'success',lastCheckedAt:new Date(),lastSuccessfulSyncAt:new Date(),lastSyncError:'',consecutiveFailures:0};await product.save();await SupplierSyncLog.create({supplier:supplier._id,product:product._id,supplierProduct:supplierProduct._id,triggerSource:source,previousStock:old,supplierAvailability:fresh.availability,supplierReportedStock:fresh.exactStockQuantity,calculatedStock:next,updatedStock:next,detectionMethod:fresh.detectionMethod,syncStatus:'success',httpStatus:r.status,durationMs:Date.now()-start});return {status:'success',stock:next};}catch(e){product.supplierInventory={...product.supplierInventory.toObject?.()||product.supplierInventory,syncStatus:e.category==='identity_mismatch'?'identity_mismatch':'stale',lastSyncError:e.message,consecutiveFailures:(product.supplierInventory?.consecutiveFailures||0)+1};await product.save();await SupplierSyncLog.create({supplier:supplier._id,product:product._id,supplierProduct:supplierProduct._id,triggerSource:source,previousStock:old,syncStatus:'failed',errorCategory:e.category||'temporary',errorMessage:e.message,durationMs:Date.now()-start});return {status:'failed',message:e.message};}}
module.exports={safeUrl,safeFetch,extract,normalize:norm,createSupplier,testConnection,discover,generateMatches,matchScore,calculateStock,syncMapping};
