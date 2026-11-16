import 'dotenv/config';
import { connect, close, getDb } from './db.js';
import { hashPassword } from './auth.js';

const DAY = 86400000;
const now = Date.now();
const daysAgo = (n) => new Date(now - n * DAY);

const MARKETERS = [
  { name: 'Rizky Pratama', email: 'rizky@entrymarket.id', phone: '0812-1100-2201', joinedAt: daysAgo(420) },
  { name: 'Siti Nurhaliza', email: 'siti@entrymarket.id', phone: '0813-2200-3311', joinedAt: daysAgo(365) },
  { name: 'Bagus Setiawan', email: 'bagus@entrymarket.id', phone: '0857-3300-4422', joinedAt: daysAgo(300) },
  { name: 'Dewi Lestari', email: 'dewi@entrymarket.id', phone: '0821-4400-5533', joinedAt: daysAgo(240) },
  { name: 'Andi Wijaya', email: 'andi@entrymarket.id', phone: '0819-5500-6644', joinedAt: daysAgo(180) },
  { name: 'Maya Anggraini', email: 'maya@entrymarket.id', phone: '0878-6600-7755', joinedAt: daysAgo(120) },
];

const CLIENTS = [
  'Hendra Kusuma', 'Linda Wijaya', 'Agus Salim', 'Rina Marlina', 'Bambang Sutrisno',
  'Fitri Handayani', 'Joko Susilo', 'Nadia Putri', 'Eko Prasetyo', 'Wulan Sari',
  'Doni Saputra', 'Ayu Permata', 'Rudi Hartono', 'Indah Cahyani', 'Yusuf Maulana',
  'Tari Wulandari', 'Fajar Nugroho', 'Sinta Dewi', 'Bayu Aditya', 'Ratna Kumala',
  'Iwan Setiadi', 'Lestari Ningsih', 'Galih Purnomo', 'Mega Safitri', 'Arif Budiman',
  'Nur Aisyah', 'Teguh Santoso', 'Vina Oktaviani', 'Hadi Gunawan', 'Sari Puspita',
];

function pick(arr, i) {
  return arr[i % arr.length];
}

function buildNmi() {
  const rows = [];
  let seed = 7;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  MARKETERS.forEach((m, mi) => {
    const count = 14 + mi * 2;
    for (let i = 0; i < count; i++) {
      const isDeposit = rnd() > 0.28;
      const amount = isDeposit
        ? Math.round((2000 + rnd() * 9000) / 100) * 100
        : Math.round((500 + rnd() * 3000) / 100) * 100;
      rows.push({
        marketingId: null,
        marketingEmail: m.email,
        clientName: pick(CLIENTS, mi * 5 + i),
        type: isDeposit ? 'in' : 'out',
        amount,
        lots: Math.round((0.5 + rnd() * 6) * 10) / 10,
        date: daysAgo(Math.floor(rnd() * 88) + 1),
        note: isDeposit ? 'Deposit / join trading' : 'Withdraw nasabah',
      });
    }
  });
  return rows;
}

async function main() {
  await connect();
  const db = getDb();

  await Promise.all([
    'users', 'nmi', 'leads', 'appointments', 'rewards', 'announcements', 'claims',
  ].map((c) => db.collection(c).deleteMany({})));

  const adminPw = await hashPassword('admin123');
  const marketerPw = await hashPassword('marketing123');

  const admin = {
    name: 'Admin Entry Market',
    email: 'admin@entrymarket.id',
    password: adminPw,
    role: 'admin',
    phone: '0811-0000-1111',
    joinedAt: daysAgo(600),
    company: 'Doo Financial Futures',
    active: true,
  };
  const { insertedId: adminId } = await db.collection('users').insertOne(admin);

  const marketerDocs = MARKETERS.map((m) => ({
    ...m,
    password: marketerPw,
    role: 'marketing',
    company: 'Doo Financial Futures',
    active: true,
  }));
  const { insertedIds } = await db.collection('users').insertMany(marketerDocs);
  const marketerIds = Object.values(insertedIds);

  const nmiRows = buildNmi().map((r) => {
    const idx = MARKETERS.findIndex((m) => m.email === r.marketingEmail);
    return { ...r, marketingId: marketerIds[idx], marketingEmail: undefined };
  });
  await db.collection('nmi').insertMany(nmiRows);

  const leadStatuses = ['new', 'contacted', 'prospect', 'closing', 'lost'];
  const leads = [];
  for (let i = 0; i < 26; i++) {
    const mi = i % MARKETERS.length;
    leads.push({
      marketingId: marketerIds[mi],
      clientName: pick(CLIENTS, i * 3 + 1),
      phone: `08${(1200000000 + i * 7654321).toString().slice(0, 10)}`,
      source: pick(['Instagram', 'Referral', 'Seminar', 'Website', 'WhatsApp'], i),
      status: pick(leadStatuses, i),
      potential: Math.round((3000 + (i % 7) * 2500) / 100) * 100,
      note: 'Prospek dari ' + pick(['event trading', 'referral nasabah', 'iklan digital'], i),
      createdAt: daysAgo(30 - (i % 25)),
      updatedAt: daysAgo(i % 10),
    });
  }
  await db.collection('leads').insertMany(leads);

  const appointments = [];
  for (let i = 0; i < 12; i++) {
    const mi = i % MARKETERS.length;
    const offset = i < 6 ? i + 1 : -(i - 5);
    appointments.push({
      marketingId: marketerIds[mi],
      clientName: pick(CLIENTS, i * 4 + 2),
      location: pick(['Kantor Entry Market - Jakarta', 'Hotel Mulia Senayan', 'Coffee Bean Grand Indonesia', 'Zoom Meeting', 'Kantor Cabang Surabaya'], i),
      date: new Date(now + offset * DAY),
      time: pick(['09:00', '10:30', '13:00', '15:30', '19:00'], i),
      status: offset < 0 ? 'done' : 'scheduled',
      result: offset < 0 ? pick(['Nasabah tertarik, follow up minggu depan', 'Closing deposit $5.000', 'Belum ada keputusan', 'Reschedule'], i) : '',
      createdAt: daysAgo(5),
    });
  }
  await db.collection('appointments').insertMany(appointments);

  const rewards = [];
  for (let i = 0; i < 10; i++) {
    const mi = i % MARKETERS.length;
    const closing = [10000, 20000, 30000, 40000, 50000, 60000, 70000, 80000, 90000, 100000][i];
    rewards.push({
      marketingId: marketerIds[mi],
      type: 'cash',
      title: `Reward Closing $${closing.toLocaleString('en-US')}`,
      closingAmount: closing,
      cashValue: closing / 10000 * 500000,
      status: i % 3 === 0 ? 'claimed' : 'available',
      createdAt: daysAgo(20 - i),
      claimedAt: i % 3 === 0 ? daysAgo(10 - (i % 5)) : null,
    });
  }
  await db.collection('rewards').insertMany(rewards);

  await db.collection('announcements').insertMany([
    {
      title: 'Webinar Trading Plan Q4 2026',
      body: 'Webinar eksklusif bersama analis senior Entry Market. Materi: manajemen risiko & psikologi trading. Wajib diikuti seluruh marketing. Link zoom akan dibagikan H-1.',
      category: 'event',
      pinned: true,
      authorId: adminId,
      createdAt: daysAgo(2),
    },
    {
      title: 'Program Reward Traveling Bali Dibuka',
      body: 'Target NMI $25.000 dengan valid lot 250 lot dalam 30 hari. Reward: tiket pulang-pergi, akomodasi hotel/vila, dan uang saku Rp 1.000.000. Periode dimulai 1 Desember 2026.',
      category: 'reward',
      pinned: true,
      authorId: adminId,
      createdAt: daysAgo(5),
    },
    {
      title: 'Update Jam Sesi Pasar',
      body: 'Perhatikan perubahan jam sesi London & New York selama periode DST. Gunakan menu Tools Trading > Sesi Pasar untuk melihat status realtime.',
      category: 'info',
      pinned: false,
      authorId: adminId,
      createdAt: daysAgo(9),
    },
    {
      title: 'Maintenance Platform Sabtu 22.00 WIB',
      body: 'Akan dilakukan maintenance platform selama 2 jam. Mohon informasikan ke nasabah agar tidak melakukan transaksi pada jam tersebut.',
      category: 'info',
      pinned: false,
      authorId: adminId,
      createdAt: daysAgo(14),
    },
  ]);

  console.log('Seed selesai:');
  console.log(`  admin@entrymarket.id / admin123`);
  console.log(`  rizky@entrymarket.id / marketing123 (dan marketing lain)`);
  console.log(`  ${nmiRows.length} transaksi NMI, ${leads.length} leads, ${appointments.length} appointment`);
  await close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
