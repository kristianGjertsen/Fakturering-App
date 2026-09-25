import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveAccountMapping, resolveTaxMapping } from '../../src/lib/saft/mappings.ts';
const account = (number,name,category,key=null) => ({account_number:number,name,category,system_key:key,is_system:!!key});
const tax = (direction,rate) => ({code:`${direction.toUpperCase()}_${rate}`,direction,rate,is_system:true});
test('all seeded accounts except ambiguous zero-VAT sales map automatically', () => {
 const sql=readFileSync(new URL('../../supabase/migrations/20260817120000_test_app_baseline.sql',import.meta.url),'utf8');
 const block=sql.slice(sql.indexOf("(p_owner_user_id, '1500'"),sql.indexOf('on conflict (owner_user_id, account_number) do nothing;',sql.indexOf("(p_owner_user_id, '1500'")));
 const rows=[...block.matchAll(/\(p_owner_user_id, '(\d+)', '([^']+)', '([^']+)', (null|'[^']+'), (true|false)\)/g)];
 assert.equal(rows.length,31);
 for(const [,number,name,category,key] of rows) {
  const result=resolveAccountMapping(account(number,name,category,key==='null'?null:key.slice(1,-1)));
  if(number==='3220') assert.equal(result.saft_grouping_code,undefined);
  else assert.ok(result.saft_grouping_code,number);
 }
});
test('15% and 12% sales map by meaning, not misleading local account numbers', () => {
 for(const [number,rate] of [['3000',25],['3100',15],['3200',12]]) assert.equal(resolveAccountMapping(account(number,'Sales','revenue',`sales_${rate}`)).saft_grouping_code,'3000');
});
test('known system VAT maps automatically, custom taxes and ambiguous zero sales do not', () => {
 for(const [direction,rate,expected] of [['input',25,'1'],['input',15,'11'],['input',12,'13'],['output',25,'3'],['output',15,'31'],['output',12,'33'],['input',0,'0']]) assert.equal(resolveTaxMapping(tax(direction,rate)).saft_standard_tax_code,expected);
 assert.equal(resolveTaxMapping(tax('output',0)).saft_standard_tax_code,undefined);
 assert.equal(resolveTaxMapping({...tax('input',25),is_system:false}).saft_standard_tax_code,undefined);
});
test('manual/imported mappings and partial mappings are preserved; unknown accounts are not guessed', () => {
 const a={...account('1920','Bankinnskudd','asset','bank'),saft_grouping_category:'custom',saft_grouping_code:'123'};
 assert.deepEqual(resolveAccountMapping(a),a);
 const partial={...a,saft_grouping_code:null}; assert.deepEqual(resolveAccountMapping(partial),partial);
 const t={...tax('input',25),saft_standard_tax_code:'81',saft_tax_type:'MVA'};assert.deepEqual(resolveTaxMapping(t),t);
 assert.equal(resolveAccountMapping(account('6800','Something different','expense')).saft_grouping_code,undefined);
});
test('zero sales account follows explicit VAT treatment', () => {
 const a=account('3220','Salgsinntekt uten MVA','revenue','sales_0');
 for(const [code,group] of [['5','3100'],['52','3100'],['6','3200']]) assert.equal(resolveAccountMapping(a,[{...tax('output',0),saft_standard_tax_code:code}]).saft_grouping_code,group);
});
