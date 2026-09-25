import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateSaft } from '../../src/lib/saft/generate.ts';
import { validateSaftXml } from '../../src/lib/saft/validate.ts';
const schema = readFileSync(new URL('../../src/lib/saft/Financial-1.40.xsd', import.meta.url), 'utf8');
const customerId = '12345678-1234-1234-1234-123456789012';
function fixture() {
  const accounts = [['bank','1920'], ['sales','3000'], ['vat','2700']].map(([id, account_number]) => ({ id, account_number, name: id, saft_grouping_category: 'test', saft_grouping_code: account_number }));
  const line = (account_id, debit, credit, extra = {}) => ({ account_id, debit, credit, ...extra });
  const entry = (voucher_number, entry_date, journal_lines) => ({ voucher_number, entry_date, journal_lines, description: 'Salg & <test> æøå', saft_journal_id: 'SALES', created_at: `${entry_date}T12:00:00Z` });
  return {
    profile: { company_name: 'Test & Sønner AS', org_number: '999999999', full_name: 'Ola Nordmann', saft_default_currency_code: 'NOK', saft_street_name: 'Gate', saft_street_number: '1', saft_city: 'Oslo', saft_postal_code: '0123', email: 'ola@example.com' },
    accounts,
    taxCodes: [{ id:'tax', code:'OUT25', description:'Utgående mva', rate:25, saft_standard_tax_code:'3', saft_tax_type:'MVA' }],
    customers: [{ id: customerId, name: 'Kunde & Co', org_number: '888888888' }], suppliers: [],
    entries: [
      entry(1, '2025-12-31', [line('bank',100,0), line('sales',0,100)]),
      entry(2, '2026-01-15', [line('bank',125,0,{customer_id:customerId}), line('sales',0,100,{tax_code_id:'tax',tax_base_amount:100,vat_rate:25}), line('vat',0,25,{tax_code_id:'tax',tax_amount:25,vat_rate:25})]),
      entry(3, '2026-02-01', [line('bank',0,125),line('sales',100,0),line('vat',25,0)]),
    ],
  };
}
const generate = (data = fixture(), start = '2026-01-01', end = '2026-01-31') => generateSaft(data,start,end,new Date('2026-02-01T00:00:00Z'));
test('generated 1.40 file validates against the official schema, with customers, VAT and escaped Unicode', () => {
  const xml = generate();
  validateSaftXml(xml,schema);
  assert.match(xml, /<AuditFileVersion>1.40<\/AuditFileVersion>/);
  assert.match(xml, /Salg &amp; &lt;test&gt; æøå/);
  assert.match(xml, /<CustomerID>12345678123412341234123456789012<\/CustomerID>/);
  assert.match(xml, /<NumberOfEntries>1<\/NumberOfEntries><TotalDebit>125.00<\/TotalDebit><TotalCredit>125.00<\/TotalCredit>/);
  assert.match(xml, /<OpeningDebitBalance>100.00<\/OpeningDebitBalance><ClosingDebitBalance>225.00<\/ClosingDebitBalance>/);
  assert.match(xml, /<CreditTaxAmount><Amount>25.00<\/Amount>/);
});
test('period boundaries include reversals and preserve both sides', () => {
  const xml = generate(fixture(),'2026-01-15','2026-02-01');
  validateSaftXml(xml,schema);
  assert.match(xml, /<NumberOfEntries>2<\/NumberOfEntries><TotalDebit>250.00<\/TotalDebit><TotalCredit>250.00<\/TotalCredit>/);
});
test('a period with no entries still exports reconciled balances', () => {
  const xml = generate(fixture(),'2026-03-01','2026-03-31');
  validateSaftXml(xml,schema);
  assert.match(xml, /<NumberOfEntries>0<\/NumberOfEntries>/);
});
test('missing company, mapping, referenced account, tax or customer stops generation', () => {
  for (const [change, pattern] of [
    [d => d.profile = null, /Selskapsprofil/],
    [d => d.profile.org_number = '', /Organisasjonsnummer/],
    [d => d.accounts[0].saft_grouping_code = null, /grupperingskode/],
    [d => d.accounts.shift(), /finnes ikke i kontoplanen/],
    [d => d.taxCodes[0].saft_standard_tax_code = null, /avgiftskode/],
    [d => d.customers = [], /mangler i registeret/],
    [d => d.profile.saft_default_currency_code = 'EUR', /NOK/],
  ]) { const d=fixture(); change(d); assert.throws(() => generate(d),pattern); }
});
test('unbalanced historical vouchers, invalid amounts and duplicate transactions stop generation', () => {
  for (const change of [
    d => d.entries[0].journal_lines[0].debit = 99,
    d => d.entries[1].journal_lines[0].debit = NaN,
    d => d.entries[1].journal_lines[0].credit = 1,
    d => d.entries.push(structuredClone(d.entries[1])),
  ]) { const d=fixture(); change(d); assert.throws(() => generate(d)); }
});
test('dates are validated including leap dates and year boundaries', () => {
  for (const [start,end] of [['2026-02-30','2026-03-01'],['2026-02-02','2026-02-01'],['2025-12-31','2026-01-01'],['','2026-01-31']]) assert.throws(() => generate(fixture(),start,end));
});
test('actual XSD validator rejects malformed documents and overlong fields', () => {
  assert.throws(() => validateSaftXml(generate().replace('<AuditFileVersion>1.40</AuditFileVersion>',''),schema));
  const d=fixture(); d.customers[0].saft_customer_id='x'.repeat(100);
  assert.throws(() => validateSaftXml(generate(d),schema));
  d.profile.company_name='bad\u0001value';
  assert.throws(() => validateSaftXml(generate(d),schema));
});
test('exports more than 1000 vouchers without dropping transactions', () => {
  const d=fixture(); const base=d.entries[1]; d.entries=Array.from({length:1005},(_,i)=>({...structuredClone(base),voucher_number:i+1}));
  const xml=generate(d); validateSaftXml(xml,schema);
  assert.match(xml,/<NumberOfEntries>1005<\/NumberOfEntries>/);
  assert.equal((xml.match(/<Transaction>/g)||[]).length,1005);
});
test('supplier balances, saved party IDs and VAT registration validate', () => {
  const d=fixture();
  d.profile.is_vat_registered=true;
  d.suppliers=[{id:customerId,name:'Leverandør AS',org_number:'888888888',saft_supplier_id:'LEV-1'}];
  d.entries[1].journal_lines[0].customer_id=null;
  d.entries[1].journal_lines[0].supplier_id=customerId;
  d.entries[1].saft_journal_id='PURCHASE';
  const xml=generate(d); validateSaftXml(xml,schema);
  assert.equal((xml.match(/<SupplierID>LEV-1<\/SupplierID>/g)||[]).length,2);
  assert.match(xml,/<TaxRegistrationNumber>999999999MVA<\/TaxRegistrationNumber>/);
});
test('decimal amounts sum in whole øre without floating point imbalance', () => {
  const d=fixture();
  d.entries=[{...d.entries[1],journal_lines:[{account_id:'bank',debit:0.1,credit:0},{account_id:'bank',debit:0.2,credit:0},{account_id:'sales',debit:0,credit:0.3}]}];
  const xml=generate(d); validateSaftXml(xml,schema);
  assert.match(xml,/<TotalDebit>0.30<\/TotalDebit><TotalCredit>0.30<\/TotalCredit>/);
});
test('export resolves standard mappings without stored codes and skips unused unknown accounts', () => {
 const d=fixture();
 d.accounts=[
  {id:'bank',account_number:'1920',name:'Bankinnskudd',category:'asset',system_key:'bank',is_system:true},
  {id:'sales',account_number:'3000',name:'Salgsinntekt, 25 % MVA',category:'revenue',system_key:'sales_25',is_system:true},
  {id:'vat',account_number:'2700',name:'Utgående MVA, 25 %',category:'liability',system_key:'output_vat_25',is_system:true},
  {id:'unused',account_number:'9999',name:'Unknown',category:'expense'},
 ];
 d.taxCodes=[{id:'tax',code:'OUTPUT_25',description:'Utgående MVA 25 %',direction:'output',rate:25,is_system:true}];
 const before=structuredClone(d);
 const xml=generate(d);validateSaftXml(xml,schema);
 assert.match(xml,/<GroupingCategory>salgsinntekt<\/GroupingCategory><GroupingCode>3000<\/GroupingCode>/);
 assert.match(xml,/<StandardTaxCode>3<\/StandardTaxCode>/);
 assert.doesNotMatch(xml,/<AccountID>9999<\/AccountID>/);
 assert.deepEqual(d,before);
});
