import { db } from '../server/db';
import { sql } from 'drizzle-orm';

const families = [
  { first: 'Maria', last: 'Santos', email: 'maria.santos@example.com', deceased: 'Carlos Alberto Santos', dob: '1948-03-15', dod: '2026-01-28', ssn: '***-**-4821', certNum: 'FL-2026-18432', authority: 'Miami-Dade County, FL', status: 'verified' },
  { first: 'David', last: 'Chen', email: 'david.chen@example.com', deceased: 'Li Wei Chen', dob: '1935-11-02', dod: '2026-02-14', ssn: '***-**-7293', certNum: 'CA-2026-30291', authority: 'Los Angeles County, CA', status: 'verified' },
  { first: 'Sarah', last: 'Williams', email: 'sarah.williams@example.com', deceased: 'James Robert Williams', dob: '1952-07-22', dod: '2026-01-05', ssn: '***-**-5518', certNum: 'TX-2026-77810', authority: 'Harris County, TX', status: 'verified' },
  { first: 'Michael', last: 'OBrien', email: 'michael.obrien@example.com', deceased: 'Patrick Thomas OBrien', dob: '1940-09-08', dod: '2026-03-01', ssn: '***-**-3347', certNum: 'NY-2026-55123', authority: 'New York County, NY', status: 'processing' },
  { first: 'Aisha', last: 'Johnson', email: 'aisha.johnson@example.com', deceased: 'Ronald Eugene Johnson', dob: '1955-12-30', dod: '2026-02-22', ssn: '***-**-9901', certNum: 'GA-2026-41098', authority: 'Fulton County, GA', status: 'verified' },
  { first: 'Jennifer', last: 'Martinez', email: 'jennifer.martinez@example.com', deceased: 'Eduardo Luis Martinez', dob: '1960-04-18', dod: '2026-02-10', ssn: '***-**-6654', certNum: 'AZ-2026-29374', authority: 'Maricopa County, AZ', status: 'pending' },
  { first: 'Robert', last: 'Taylor', email: 'robert.taylor@example.com', deceased: 'Dorothy Mae Taylor', dob: '1938-01-25', dod: '2026-01-18', ssn: '***-**-2208', certNum: 'IL-2026-66291', authority: 'Cook County, IL', status: 'verified' },
  { first: 'Kim', last: 'Nguyen', email: 'kim.nguyen@example.com', deceased: 'Tran Van Nguyen', dob: '1945-06-11', dod: '2026-03-05', ssn: '***-**-8830', certNum: 'WA-2026-12847', authority: 'King County, WA', status: 'processing' },
  { first: 'Angela', last: 'Davis', email: 'angela.davis@example.com', deceased: 'William Henry Davis', dob: '1950-10-03', dod: '2026-02-28', ssn: '***-**-1145', certNum: 'OH-2026-93201', authority: 'Cuyahoga County, OH', status: 'verified' },
  { first: 'Thomas', last: 'Anderson', email: 'thomas.anderson@example.com', deceased: 'Margaret Louise Anderson', dob: '1942-08-19', dod: '2026-01-12', ssn: '***-**-7762', certNum: 'PA-2026-84510', authority: 'Philadelphia County, PA', status: 'verified' },
];

function genBlockchain() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const len = 20 + Math.floor(Math.random() * 11);
  return Array.from({length: len}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

const accountsByCategory: Record<string, {name: string, type: string, isJoint?: boolean}[]> = {
  financial: [
    { name: 'Chase Bank', type: 'Checking Account', isJoint: true },
    { name: 'Bank of America', type: 'Savings Account' },
    { name: 'Wells Fargo', type: 'Credit Card' },
    { name: 'Fidelity', type: '401(k)' },
    { name: 'MetLife', type: 'Life Insurance' },
    { name: 'Charles Schwab', type: 'Brokerage Account' },
  ],
  memberships: [
    { name: 'Costco', type: 'Wholesale Membership' },
    { name: 'LA Fitness', type: 'Gym Membership' },
    { name: 'AARP', type: 'Organization Membership' },
  ],
  subscriptions: [
    { name: 'Netflix', type: 'Streaming Service' },
    { name: 'Spotify', type: 'Music Streaming' },
    { name: 'Amazon Prime', type: 'Delivery Service' },
    { name: 'New York Times', type: 'News Subscription' },
  ],
  real_estate: [
    { name: 'HOA - Pine Valley', type: 'Homeowners Association' },
    { name: 'Duke Energy', type: 'Electric Utility', isJoint: true },
    { name: 'AT&T', type: 'Internet Service' },
    { name: 'State Farm', type: 'Homeowners Insurance' },
  ],
  protected_information: [
    { name: 'State DMV', type: 'Drivers License' },
    { name: 'Blue Cross Blue Shield', type: 'Health Insurance' },
    { name: 'CVS Pharmacy', type: 'Pharmacy' },
    { name: 'Dr. Smith - Primary Care', type: 'Healthcare Provider' },
    { name: 'Equifax', type: 'Credit Bureau' },
  ],
  miscellaneous: [
    { name: 'Progressive', type: 'Auto Insurance' },
    { name: 'Verizon', type: 'Cell Phone' },
    { name: 'Facebook', type: 'Social Media' },
    { name: 'Extra Space Storage', type: 'Storage Unit' },
  ],
};

const statuses = ['active', 'pending_action', 'closed', 'suspended'];
const actions: (string|null)[] = [null, 'close', 'suspend', 'continue', 'transfer'];
const notifTypes = ['certificate_uploaded', 'account_notified', 'action_taken', 'verification_complete', 'healthcare_provider_notified'];

async function seed() {
  // Cleanup
  const certNums = families.map(f => `'${f.certNum}'`).join(',');
  const emails = families.map(f => `'${f.email}'`).join(',');
  await db.execute(sql.raw(`DELETE FROM notifications WHERE certificate_id IN (SELECT id FROM certificates WHERE certificate_number IN (${certNums}))`));
  await db.execute(sql.raw(`DELETE FROM connected_accounts WHERE certificate_id IN (SELECT id FROM certificates WHERE certificate_number IN (${certNums}))`));
  await db.execute(sql.raw(`DELETE FROM certificates WHERE certificate_number IN (${certNums})`));
  await db.execute(sql.raw(`DELETE FROM users WHERE email IN (${emails})`));
  console.log('Cleaned up existing demo data');

  for (const fam of families) {
    const userResult = await db.execute(sql.raw(`
      INSERT INTO users (email, first_name, last_name, role, phone_verified) 
      VALUES ('${fam.email}', '${fam.first}', '${fam.last}', 'user', true)
      RETURNING id
    `));
    const userId = userResult.rows[0].id as string;

    const blockchain = genBlockchain();
    const certResult = await db.execute(sql.raw(`
      INSERT INTO certificates (user_id, deceased_name, deceased_ssn, date_of_death, date_of_birth, certificate_number, issuing_authority, status, blockchain_hash${fam.status === 'verified' ? ', verified_at' : ''})
      VALUES ('${userId}', '${fam.deceased}', '${fam.ssn}', '${fam.dod}', '${fam.dob}', '${fam.certNum}', '${fam.authority}', '${fam.status}', '${blockchain}'${fam.status === 'verified' ? ', NOW()' : ''})
      RETURNING id
    `));
    const certId = certResult.rows[0].id as string;

    let acctCount = 0;
    for (const cat of Object.keys(accountsByCategory)) {
      const accts = accountsByCategory[cat];
      const numPick = 2 + Math.floor(Math.random() * Math.min(2, accts.length - 1));
      const shuffled = [...accts].sort(() => Math.random() - 0.5).slice(0, numPick);
      
      for (const acct of shuffled) {
        const status = statuses[Math.floor(Math.random() * statuses.length)];
        const action = status === 'closed' ? 'close' : status === 'suspended' ? 'suspend' : actions[Math.floor(Math.random() * actions.length)];
        const isJoint = acct.isJoint ? true : false;
        const acctNum = 'XXXX-' + Math.floor(1000 + Math.random() * 9000);
        
        await db.execute(sql.raw(`
          INSERT INTO connected_accounts (certificate_id, account_name, account_type, category, account_number, is_joint, status, selected_action)
          VALUES ('${certId}', '${acct.name}', '${acct.type}', '${cat}', '${acctNum}', ${isJoint}, '${status}', ${action ? "'" + action + "'" : 'NULL'})
        `));
        acctCount++;
      }
    }

    const notifMessages = [
      `Death certificate uploaded for ${fam.deceased}`,
      `Certificate verification ${fam.status === 'verified' ? 'completed' : 'in progress'} for ${fam.deceased}`,
      `Chase Bank notified of ${fam.deceased} passing`,
      `Account action requested for ${fam.deceased} Netflix subscription`,
      `Blue Cross Blue Shield notified for ${fam.deceased}`,
      `DMV notification sent for ${fam.deceased} drivers license`,
      `Credit protection requested for ${fam.deceased}`,
      `Fidelity 401(k) account flagged for review`,
    ];
    
    const numNotifs = 4 + Math.floor(Math.random() * 5);
    for (let i = 0; i < numNotifs; i++) {
      const msg = notifMessages[i % notifMessages.length].replace(/'/g, "''");
      const type = notifTypes[Math.floor(Math.random() * notifTypes.length)];
      const daysAgo = Math.floor(Math.random() * 30);
      await db.execute(sql.raw(`
        INSERT INTO notifications (certificate_id, message, type, sent_at)
        VALUES ('${certId}', '${msg}', '${type}', NOW() - INTERVAL '${daysAgo} days')
      `));
    }
    console.log(`Created: ${fam.first} ${fam.last} -> ${fam.deceased} (${acctCount} accounts, ${numNotifs} notifications)`);
  }
  
  console.log('\nDone seeding 10 demo families!');
  process.exit(0);
}

seed();
